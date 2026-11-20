use crate::{
    AppError, Result, new_id,
    storage::{self, Column, Table},
};
use axum::body::Bytes;
use datafusion::arrow::{
    array::{Array, ArrayRef, AsArray, Float64Array, Int64Array, UInt64Array},
    compute::{CastOptions, cast_with_options, is_null, nullif},
    datatypes::{DataType, Fields},
    record_batch::RecordBatch,
};
use parquet::arrow::arrow_reader::{ArrowReaderMetadata, ParquetRecordBatchReaderBuilder};
use std::{
    collections::{HashMap, HashSet},
    fs::{self, File},
    path::Path,
};

const SAFE_INTEGER: u64 = 9_007_199_254_740_991;

struct Leaf {
    name: String,
    path: Vec<usize>,
    kind: DataType,
    numeric: bool,
    check_precision: bool,
}
fn logical_type(kind: &DataType) -> &DataType {
    match kind {
        DataType::Dictionary(_, value) => logical_type(value),
        _ => kind,
    }
}
fn fields(
    schema: &Fields,
    prefix: &str,
    path: &mut Vec<usize>,
    leaves: &mut Vec<Leaf>,
) -> Result<()> {
    use DataType::*;
    for (i, field) in schema.iter().enumerate() {
        let part = field.name().trim();
        if part.is_empty() {
            return Err(AppError("Parquet field names must be nonempty.".into()));
        }
        let name = if prefix.is_empty() {
            part.to_owned()
        } else {
            format!("{prefix}.{part}")
        };
        path.push(i);
        if let Struct(children) = field.data_type() {
            if children.is_empty() {
                return Err(AppError(format!(
                    "Parquet struct {name} has no scalar fields."
                )));
            }
            fields(children, &name, path, leaves)?;
        } else {
            let kind = logical_type(field.data_type());
            let (numeric, check_precision) = match kind {
                Int8 | Int16 | Int32 | UInt8 | UInt16 | UInt32 | Float16 | Float32 | Float64 => {
                    (true, false)
                }
                Int64 | UInt64 => (true, true),
                Decimal128(p, s) | Decimal256(p, s) => (true, *p > 15 || *s < 0),
                Boolean
                | Utf8
                | LargeUtf8
                | Utf8View
                | Date32
                | Date64
                | Timestamp(_, _)
                | Time32(_)
                | Time64(_)
                | Null => (false, false),
                _ => {
                    return Err(AppError(format!(
                        "Parquet field {name} has unsupported type {kind}. Export a scalar field or expand repeated values into rows."
                    )));
                }
            };
            leaves.push(Leaf {
                name,
                path: path.clone(),
                kind: kind.clone(),
                numeric,
                check_precision,
            });
        }
        path.pop();
    }
    Ok(())
}
fn cast(array: &ArrayRef, target: &DataType) -> Result<ArrayRef> {
    Ok(cast_with_options(
        array,
        target,
        &CastOptions {
            safe: false,
            ..Default::default()
        },
    )?)
}
impl Leaf {
    fn array(&self, batch: &RecordBatch) -> Result<ArrayRef> {
        let mut array = batch.column(self.path[0]).clone();
        for &i in &self.path[1..] {
            let child = array.as_struct().column(i);
            array = if array.null_count() == 0 {
                child.clone()
            } else {
                nullif(child, &is_null(array.as_ref())?)?
            };
        }
        if array.data_type() != &self.kind {
            array = cast(&array, &self.kind)?;
        }
        Ok(array)
    }
    fn safe_as_number(&self, array: &ArrayRef) -> Result<bool> {
        match self.kind {
            DataType::Int64 => Ok(array
                .as_any()
                .downcast_ref::<Int64Array>()
                .unwrap()
                .iter()
                .flatten()
                .all(|v| v.unsigned_abs() <= SAFE_INTEGER)),
            DataType::UInt64 => Ok(array
                .as_any()
                .downcast_ref::<UInt64Array>()
                .unwrap()
                .iter()
                .flatten()
                .all(|v| v <= SAFE_INTEGER)),
            _ => {
                let text = cast(array, &DataType::Utf8)?;
                Ok(text
                    .as_string::<i32>()
                    .iter()
                    .flatten()
                    .all(|s| storage::model_number(s).is_some()))
            }
        }
    }
    fn convert(&self, batch: &RecordBatch, offset: usize) -> Result<ArrayRef> {
        let mut input = self.array(batch)?;
        if self.kind == DataType::Date64 {
            input = cast(&input, &DataType::Date32)?;
        }
        if !self.numeric {
            return cast(&input, &DataType::Utf8);
        }
        if matches!(
            self.kind,
            DataType::Decimal128(_, _) | DataType::Decimal256(_, _)
        ) {
            input = cast(&input, &DataType::Utf8)?;
        }
        let values = cast(&input, &DataType::Float64)?;
        if self.kind.is_floating()
            && let Some(i) = values
                .as_any()
                .downcast_ref::<Float64Array>()
                .unwrap()
                .iter()
                .position(|v| v.is_some_and(|x| !x.is_finite()))
        {
            return Err(AppError(format!(
                "Parquet field {} contains a non-finite number at record {}.",
                self.name,
                offset + i + 1
            )));
        }
        Ok(values)
    }
}
fn leaves(meta: &ArrowReaderMetadata) -> Result<Vec<Leaf>> {
    let mut leaves = Vec::new();
    fields(meta.schema().fields(), "", &mut Vec::new(), &mut leaves)?;
    let mut names = HashSet::new();
    if leaves.is_empty() || !leaves.iter().all(|l| names.insert(l.name.to_lowercase())) {
        return Err(AppError(
            "Parquet must have distinct, nonempty field names after expanding structs.".into(),
        ));
    }
    Ok(leaves)
}

pub fn preview(bytes: Bytes) -> Result<serde_json::Value> {
    use serde_json::json;
    let meta = ArrowReaderMetadata::load(&bytes, Default::default())?;
    let fields = leaves(&meta)?;
    let columns: Vec<_> = fields
        .iter()
        .map(|l| json!({"name":l.name,"type":l.kind.to_string()}))
        .collect();
    let count = meta.metadata().file_metadata().num_rows();
    let mut rows = Vec::new();
    for batch in ParquetRecordBatchReaderBuilder::new_with_metadata(bytes, meta)
        .with_limit(5)
        .build()?
    {
        let batch = batch?;
        let text = fields
            .iter()
            .map(|l| {
                let mut a = l.array(&batch)?;
                if l.kind == DataType::Date64 {
                    a = cast(&a, &DataType::Date32)?;
                }
                cast(&a, &DataType::Utf8)
            })
            .collect::<Result<Vec<_>>>()?;
        for r in 0..batch.num_rows() {
            rows.push(
                text.iter()
                    .map(|col| {
                        let col = col.as_string::<i32>();
                        (!col.is_null(r)).then(|| col.value(r).to_owned())
                    })
                    .collect::<Vec<_>>(),
            );
        }
    }
    Ok(json!({"columns":columns,"rows":rows,"count":count}))
}

fn compatible(old: &DataType, new: &DataType) -> bool {
    use DataType::*;
    old == new
        || *new == Null
        || *old == Null
        || (old.is_integer() && new.is_integer())
        || (old.is_floating() && new.is_floating())
        || matches!(
            (old, new),
            (Utf8 | LargeUtf8 | Utf8View, Utf8 | LargeUtf8 | Utf8View)
                | (Date32 | Date64, Date32 | Date64)
        )
        || matches!((old,new),(Decimal128(_,a)|Decimal256(_,a),Decimal128(_,b)|Decimal256(_,b)) if a==b)
}

fn align(fields: Vec<Leaf>, old: &Table) -> Result<Vec<Leaf>> {
    let mut incoming: HashMap<_, _> = fields
        .into_iter()
        .map(|f| (f.name.to_lowercase(), f))
        .collect();
    let mut aligned = Vec::new();
    for (i, col) in old.columns.iter().enumerate() {
        let mut field = incoming
            .remove(&col.name.to_lowercase())
            .ok_or_else(|| AppError(format!("Missing Parquet field {}.", col.name)))?;
        if let Some(prior) = old.parquet_types.get(i) {
            let prior = prior.parse::<DataType>()?;
            if !compatible(&prior, &field.kind) {
                return Err(AppError(format!(
                    "Parquet field {} is {}. The existing source type is {}.",
                    col.name, field.kind, prior
                )));
            }
        }
        if col.numeric && !field.numeric && field.kind != DataType::Null {
            return Err(AppError(format!(
                "Parquet field {} must contain numbers for the existing model column.",
                col.name
            )));
        }
        field.name = col.name.clone();
        field.numeric = col.numeric;
        field.check_precision &= col.numeric;
        aligned.push(field);
    }
    if !incoming.is_empty() {
        let mut names: Vec<_> = incoming.values().map(|f| f.name.as_str()).collect();
        names.sort_unstable();
        return Err(AppError(format!(
            "Unexpected Parquet fields: {}.",
            names.join(", ")
        )));
    }
    Ok(aligned)
}

pub fn import(
    dir: &Path,
    name: String,
    bytes: Bytes,
    revision: Option<(&Path, storage::Revision)>,
) -> Result<Table> {
    let meta = ArrowReaderMetadata::load(&bytes, Default::default())?;
    let previous = revision
        .as_ref()
        .map(|(catalog, r)| r.previous(catalog))
        .transpose()?;
    let mut leaves = leaves(&meta)?;
    if let Some(old) = &previous {
        leaves = align(leaves, old)?;
    }
    let reader = || {
        ParquetRecordBatchReaderBuilder::new_with_metadata(bytes.clone(), meta.clone())
            .with_batch_size(16_384)
            .build()
    };
    if leaves.iter().any(|l| l.check_precision) {
        for batch in reader()? {
            let batch = batch?;
            for leaf in leaves.iter_mut().filter(|l| l.check_precision) {
                if !leaf.safe_as_number(&leaf.array(&batch)?)? {
                    if previous.is_some() {
                        return Err(AppError(format!(
                            "Parquet field {} exceeds the precision of the existing numeric column.",
                            leaf.name
                        )));
                    }
                    leaf.numeric = false;
                    leaf.check_precision = false;
                }
            }
            if !leaves.iter().any(|l| l.check_precision) {
                break;
            }
        }
    }
    let columns: Vec<_> = leaves
        .iter()
        .map(|l| Column {
            name: l.name.clone(),
            numeric: l.numeric,
        })
        .collect();
    let schema = storage::model_schema(&columns);
    let id = new_id('t');
    let mut writer = storage::model_writer(
        File::create(dir.join(format!("{id}.parquet")))?,
        schema.clone(),
    )?;
    let existing_rows = match &revision {
        Some((catalog, update)) => update.copy_existing(catalog, &mut writer)?,
        None => 0,
    };
    let mut rows = 0;
    for batch in reader()? {
        let batch = batch?;
        let data = leaves
            .iter()
            .map(|l| l.convert(&batch, rows))
            .collect::<Result<Vec<_>>>()?;
        writer.write(&RecordBatch::try_new(schema.clone(), data)?)?;
        rows += batch.num_rows();
    }
    writer.close()?;
    let table = Table {
        id,
        name: previous.as_ref().map(|o| o.name.clone()).unwrap_or(name),
        columns,
        rows: rows + existing_rows,
        source: None,
        parquet_types: leaves
            .iter()
            .enumerate()
            .map(|(i, l)| {
                if l.kind == DataType::Null
                    && let Some(kind) = previous.as_ref().and_then(|o| o.parquet_types.get(i))
                {
                    return kind.clone();
                }
                l.kind.to_string()
            })
            .collect(),
    };
    fs::write(
        dir.join(format!("{}.json", table.id)),
        serde_json::to_vec(&table)?,
    )?;
    Ok(table)
}

#[cfg(test)]
mod tests {
    use super::*;
    use datafusion::arrow::{
        array::{BinaryArray, TimestampMillisecondArray},
        datatypes::{Field, Schema},
    };
    use parquet::arrow::ArrowWriter;
    use std::sync::Arc;

    fn encode(name: &str, array: ArrayRef) -> Bytes {
        let schema = Arc::new(Schema::new(vec![Field::new(
            name,
            array.data_type().clone(),
            true,
        )]));
        let batch = RecordBatch::try_new(schema.clone(), vec![array]).unwrap();
        let mut writer = ArrowWriter::try_new(Vec::new(), schema, None).unwrap();
        writer.write(&batch).unwrap();
        Bytes::from(writer.into_inner().unwrap())
    }

    #[test]
    fn preserve_epoch_and_numeric_nulls() {
        let dir = tempfile::tempdir().unwrap();
        for (name, array, numeric) in [
            (
                "Instant",
                Arc::new(TimestampMillisecondArray::from(vec![Some(0), None]).with_timezone("UTC"))
                    as ArrayRef,
                false,
            ),
            (
                "Amount",
                Arc::new(Float64Array::from(vec![None, None])) as ArrayRef,
                true,
            ),
        ] {
            let table = import(dir.path(), name.into(), encode(name, array), None).unwrap();
            assert_eq!(table.columns[0].numeric, numeric);
            let file = File::open(dir.path().join(format!("{}.parquet", table.id))).unwrap();
            let batch = ParquetRecordBatchReaderBuilder::try_new(file)
                .unwrap()
                .build()
                .unwrap()
                .next()
                .unwrap()
                .unwrap();
            let col = batch.column(0);
            if numeric {
                assert_eq!(col.null_count(), 2);
            } else {
                assert!(
                    col.as_string::<i32>()
                        .value(0)
                        .starts_with("1970-01-01T00:00:00")
                );
                assert!(col.is_null(1));
            }
        }
    }

    #[test]
    fn a_late_wide_identifier_preserves_the_whole_column_as_text() {
        let dir = tempfile::tempdir().unwrap();
        let mut ids = vec![1u64; 16_384];
        ids.push(u64::MAX);
        let bytes = encode("Order", Arc::new(UInt64Array::from(ids)));
        let table = import(dir.path(), "Orders".into(), bytes, None).unwrap();
        assert!(!table.columns[0].numeric);
        let file = File::open(dir.path().join(format!("{}.parquet", table.id))).unwrap();
        let batches = ParquetRecordBatchReaderBuilder::try_new(file)
            .unwrap()
            .with_batch_size(16_384)
            .build()
            .unwrap()
            .collect::<std::result::Result<Vec<_>, _>>()
            .unwrap();
        assert_eq!(batches[0].column(0).as_string::<i32>().value(0), "1");
        assert_eq!(
            batches[1].column(0).as_string::<i32>().value(0),
            "18446744073709551615"
        );
    }

    #[test]
    fn revisions_preserve_numeric_bindings_across_schema_changes() {
        use datafusion::arrow::array::{NullArray, StringArray};
        let catalog = tempfile::tempdir().unwrap();
        let output = tempfile::tempdir().unwrap();
        let first = encode("Key", Arc::new(Int64Array::from(vec![1, 2])));
        let old = import(catalog.path(), "Orders".into(), first, None).unwrap();
        let update = |array: ArrayRef| {
            let revision =
                serde_json::from_value(serde_json::json!({"table":old.id,"mode":"append"}))
                    .unwrap();
            import(
                output.path(),
                "Latest".into(),
                encode("Key", array),
                Some((catalog.path(), revision)),
            )
        };
        for (array, message) in [
            (
                Arc::new(UInt64Array::from(vec![u64::MAX])) as ArrayRef,
                "exceeds the precision",
            ),
            (
                Arc::new(StringArray::from(vec!["1"])) as ArrayRef,
                "existing source type is Int64",
            ),
        ] {
            assert!(update(array).err().unwrap().0.contains(message));
        }
        let next = update(Arc::new(NullArray::new(1))).unwrap();
        assert_eq!(next.name, "Orders");
        assert_eq!(next.rows, 3);
        assert!(next.columns[0].numeric);
        assert_eq!(next.parquet_types, vec!["Int64"]);
        let file = File::open(output.path().join(format!("{}.parquet", next.id))).unwrap();
        let values: Vec<_> = ParquetRecordBatchReaderBuilder::try_new(file)
            .unwrap()
            .build()
            .unwrap()
            .flat_map(|b| {
                b.unwrap()
                    .column(0)
                    .as_any()
                    .downcast_ref::<Float64Array>()
                    .unwrap()
                    .iter()
                    .collect::<Vec<_>>()
            })
            .collect();
        assert_eq!(values, vec![Some(1.0), Some(2.0), None]);
    }

    #[test]
    fn invalid_fields_report_the_source() {
        let dir = tempfile::tempdir().unwrap();
        for (name, array, message) in [
            (
                "Blob",
                Arc::new(BinaryArray::from(vec![b"abc".as_slice()])) as ArrayRef,
                "Blob has unsupported type",
            ),
            (
                "Rate",
                Arc::new(Float64Array::from(vec![1.0, f64::NAN])) as ArrayRef,
                "Rate contains a non-finite number at record 2",
            ),
        ] {
            let error = import(dir.path(), name.into(), encode(name, array), None)
                .err()
                .unwrap();
            assert!(error.0.contains(message), "{}", error.0);
        }
    }

    #[test]
    fn decimals_round_trip_before_numeric_inference() {
        for s in [
            "1.23",
            "9007199254740991",
            "-1.230000000000000000e+2",
            "0.0000000000000000000000",
        ] {
            assert_eq!(storage::model_number(s), s.parse().ok());
        }
        for s in [
            "1234567890123456.12",
            "9007199254740992",
            "1e-900",
            "8e-324",
            "Infinity",
            "NaN",
        ] {
            assert!(storage::model_number(s).is_none(), "{s}");
        }
    }
}
