use crate::{AppError, Result, new_id};
use datafusion::arrow::{
    array::{ArrayRef, Float64Array, StringArray},
    datatypes::{DataType, Field, Schema},
    record_batch::RecordBatch,
};
use parquet::{
    arrow::{ArrowWriter, arrow_reader::ParquetRecordBatchReaderBuilder},
    basic::Compression,
    file::properties::WriterProperties,
};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    fs::{self, File},
    path::Path,
    sync::Arc,
};

#[derive(Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Column {
    pub name: String,
    pub numeric: bool,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct Table {
    pub id: String,
    pub name: String,
    pub columns: Vec<Column>,
    pub rows: usize,
    #[serde(
        default,
        rename = "parquetTypes",
        skip_serializing_if = "Vec::is_empty"
    )]
    pub parquet_types: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source: Option<crate::live::Source>,
}

fn number(value: &str) -> Option<f64> {
    let s = value.trim();
    // Preserve identifiers with significant leading zeros or unsafe integer precision.
    if s.len() > 1 && s.starts_with('0') && s.as_bytes()[1].is_ascii_digit() {
        return None;
    }
    model_number(s)
}

fn decimal_signature(s: &str) -> Option<(bool, String, i64)> {
    let negative = s.starts_with('-');
    let unsigned = s.trim_start_matches(['-', '+']);
    let (digits, exponent) = if let Some((m, e)) = unsigned.split_once(['e', 'E']) {
        (m, e.parse::<i64>().ok()?)
    } else {
        (unsigned, 0)
    };
    let fraction = digits.split_once('.').map_or(0, |(_, right)| right.len());
    let digits = digits.replace('.', "");
    let significant = digits.trim_start_matches('0').trim_end_matches('0');
    if significant.is_empty() {
        return Some((false, String::new(), 0));
    }
    let trailing = digits.len() - digits.trim_end_matches('0').len();
    Some((
        negative,
        significant.to_owned(),
        exponent
            .checked_sub(fraction as i64)?
            .checked_add(trailing as i64)?,
    ))
}

pub fn model_number(s: &str) -> Option<f64> {
    let value = s.parse::<f64>().ok()?;
    if !value.is_finite() || value.abs() > 9_007_199_254_740_991.0 {
        return None;
    }
    // Up to 15 decimal digits round-trip through a normal binary64 value.
    // Near zero, even short scientific notation can lose significant digits.
    if (s.len() > 15 || (s.len() > 1 && value.abs() < f64::MIN_POSITIVE))
        && decimal_signature(s)? != decimal_signature(&value.to_string())?
    {
        return None;
    }
    Some(value)
}

#[derive(Clone, Copy, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum InputType {
    Auto,
    Text,
    Number,
}

#[derive(Clone, Deserialize)]
pub struct Preparation {
    index: usize,
    name: String,
    trim: bool,
    kind: InputType,
    #[serde(default)]
    unpivot: bool,
}
#[derive(Deserialize)]
pub struct Unpivot {
    attribute: String,
    value: String,
}

impl Preparation {
    pub fn workbook_column(index: usize, name: String, kind: InputType) -> Self {
        Self { index, name, trim: false, kind, unpivot: false }
    }

    fn value<'a>(&self, row: &'a csv::StringRecord) -> &'a str {
        let raw = &row[self.index];
        if self.trim { raw.trim() } else { raw }
    }
    fn numeric_value(&self, value: &str) -> Option<f64> {
        if self.kind == InputType::Number {
            model_number(value.trim())
        } else {
            number(value)
        }
    }
}

#[derive(Deserialize)]
pub struct Revision {
    table: String,
    mode: RevisionMode,
}
#[derive(Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
enum RevisionMode {
    Append,
    Replace,
}

impl Revision {
    pub fn previous(&self, catalog: &Path) -> Result<Table> {
        crate::valid_id(&self.table, 't')?;
        let old: Table =
            serde_json::from_slice(&fs::read(catalog.join(format!("{}.json", self.table)))?)?;
        if old.source.is_some() || old.id != self.table {
            return Err(AppError("Choose an imported table to update.".into()));
        }
        Ok(old)
    }
    pub fn copy_existing(&self, catalog: &Path, writer: &mut ArrowWriter<File>) -> Result<usize> {
        let mut rows = 0;
        if self.mode == RevisionMode::Append {
            let input = File::open(catalog.join(format!("{}.parquet", self.table)))?;
            for batch in ParquetRecordBatchReaderBuilder::try_new(input)?
                .with_batch_size(16384)
                .build()?
            {
                let batch = batch?;
                writer.write(&batch)?;
                rows += batch.num_rows();
            }
        }
        Ok(rows)
    }
}
pub fn import(
    path: &Path,
    name: String,
    bytes: &[u8],
    prepared: Option<Vec<Preparation>>,
    revision: Option<(&Path, Revision)>,
    unpivot: Option<Unpivot>,
) -> Result<Table> {
    let headers = csv::Reader::from_reader(bytes).headers()?.clone();
    let records = || {
        csv::Reader::from_reader(bytes)
            .into_records()
            .map(|r| r.map_err(AppError::from))
    };
    let plan = prepared.unwrap_or_else(|| {
        headers
            .iter()
            .enumerate()
            .map(|(index, name)| Preparation {
                index,
                name: name.into(),
                trim: false,
                kind: InputType::Auto,
                unpivot: false,
            })
            .collect()
    });
    let mut indices = HashSet::new();
    let mut names = HashSet::new();
    for c in &plan {
        if c.index >= headers.len() || !indices.insert(c.index) {
            return Err(AppError("Invalid source column.".into()));
        }
        let name = c.name.trim_start_matches('\u{feff}').trim();
        if name.is_empty() || !names.insert(name.to_lowercase()) {
            return Err(AppError(
                "Column headers must be distinct and nonempty.".into(),
            ));
        }
    }
    if let Some(step) = unpivot {
        let (attributes, keys): (Vec<_>, Vec<_>) = plan.iter().partition(|p| p.unpivot);
        if attributes.is_empty() {
            return Err(AppError("Choose one or more columns to unpivot.".into()));
        }
        let kind = if attributes.iter().any(|p| p.kind == InputType::Text) {
            InputType::Text
        } else if attributes.iter().all(|p| p.kind == InputType::Number) {
            InputType::Number
        } else {
            InputType::Auto
        };
        let mut output: Vec<Preparation> = keys
            .iter()
            .enumerate()
            .map(|(i, c)| Preparation {
                index: i,
                ..(*c).clone()
            })
            .collect();
        for (name, kind) in [(step.attribute, InputType::Text), (step.value, kind)] {
            output.push(Preparation {
                index: output.len(),
                name,
                kind,
                trim: false,
                unpivot: false,
            });
        }
        let expanded = || {
            let mut records = records();
            let attributes = attributes.as_slice();
            let keys = keys.as_slice();
            let mut current = csv::StringRecord::new();
            let mut at = attributes.len();
            let mut source_row = 1;
            std::iter::from_fn(move || {
                loop {
                    if at == attributes.len() {
                        match records.next()? {
                            Ok(row) => current = row,
                            Err(error) => return Some(Err(error)),
                        }
                        source_row += 1;
                        at = 0;
                    }
                    let attr = attributes[at];
                    at += 1;
                    let raw = attr.value(&current);
                    if raw.is_empty() {
                        continue;
                    }
                    let mut row = csv::StringRecord::new();
                    for key in keys {
                        row.push_field(&current[key.index]);
                    }
                    row.push_field(attr.name.trim());
                    if attr.kind == InputType::Number {
                        let Some(n) = attr.numeric_value(raw) else {
                            return Some(Err(AppError(format!(
                                "Row {source_row}, column {} cannot be converted to a finite number within model precision.",
                                attr.name
                            ))));
                        };
                        row.push_field(&n.to_string());
                    } else {
                        row.push_field(raw);
                    }
                    return Some(Ok(row));
                }
            })
        };
        return import_rows(path, name, output, revision, expanded);
    }
    import_rows(path, name, plan, revision, records)
}

fn import_rows<I: Iterator<Item = Result<csv::StringRecord>>>(
    path: &Path,
    name: String,
    plan: Vec<Preparation>,
    revision: Option<(&Path, Revision)>,
    records: impl Fn() -> I,
) -> Result<Table> {
    let previous = revision
        .as_ref()
        .map(|(catalog, r)| r.previous(catalog))
        .transpose()?;
    let mut seen = HashSet::new();
    let mut columns = Vec::new();
    for column in &plan {
        let name = column.name.trim_start_matches('\u{feff}').trim().to_owned();
        if name.is_empty() || !seen.insert(name.to_lowercase()) {
            return Err(AppError(
                "Column headers must be distinct and nonempty.".into(),
            ));
        }
        columns.push(Column {
            name,
            numeric: true,
        });
    }
    if columns.is_empty() {
        return Err(AppError("Choose at least one CSV column.".into()));
    }
    let mut present = vec![false; columns.len()];
    let mut rows = 0;
    for row in records() {
        let row = row?;
        for (i, column) in plan.iter().enumerate() {
            let v = column.value(&row);
            if !v.is_empty() {
                present[i] = true;
                if column.kind == InputType::Text {
                    columns[i].numeric = false;
                } else if columns[i].numeric && column.numeric_value(v).is_none() {
                    if column.kind == InputType::Number {
                        return Err(AppError(format!(
                            "Row {}, column {} cannot be converted to a finite number within model precision.",
                            rows + 2,
                            column.name
                        )));
                    }
                    columns[i].numeric = false;
                }
            }
        }
        rows += 1;
    }
    for (i, c) in columns.iter_mut().enumerate() {
        c.numeric &= present[i] || plan[i].kind == InputType::Number;
    }
    if previous.as_ref().is_some_and(|old| old.columns != columns) {
        return Err(AppError(
            "Keep the existing column names, order and types when updating a table.".into(),
        ));
    }
    let id = new_id('t');
    let schema = model_schema(&columns);
    let temp = tempfile::NamedTempFile::new_in(path)?;
    let mut writer = model_writer(temp.reopen()?, schema.clone())?;
    if let Some((catalog, update)) = &revision {
        rows += update.copy_existing(catalog, &mut writer)?;
    }
    let mut records = records();
    loop {
        let batch = records
            .by_ref()
            .take(16384)
            .collect::<std::result::Result<Vec<_>, _>>()?;
        if batch.is_empty() {
            break;
        }
        let data = columns
            .iter()
            .enumerate()
            .map(|(i, c)| -> ArrayRef {
                if c.numeric {
                    Arc::new(Float64Array::from_iter(
                        batch
                            .iter()
                            .map(|row| plan[i].numeric_value(plan[i].value(row))),
                    ))
                } else {
                    Arc::new(StringArray::from_iter(
                        batch
                            .iter()
                            .map(|row| plan[i].value(row))
                            .map(|value| (!value.is_empty()).then_some(value)),
                    ))
                }
            })
            .collect();
        writer.write(&RecordBatch::try_new(schema.clone(), data)?)?;
    }
    writer.close()?;
    temp.persist(path.join(format!("{id}.parquet")))?;
    let table = Table {
        id,
        name: previous.map(|old| old.name).unwrap_or(name),
        columns,
        rows,
        parquet_types: Vec::new(),
        source: None,
    };
    fs::write(
        path.join(format!("{}.json", table.id)),
        serde_json::to_vec(&table)?,
    )?;
    Ok(table)
}

pub fn model_schema(columns: &[Column]) -> Arc<Schema> {
    Arc::new(Schema::new(
        columns
            .iter()
            .enumerate()
            .map(|(i, c)| {
                Field::new(
                    format!("c{i}"),
                    if c.numeric {
                        DataType::Float64
                    } else {
                        DataType::Utf8
                    },
                    true,
                )
            })
            .collect::<Vec<_>>(),
    ))
}

pub fn model_writer(file: File, schema: Arc<Schema>) -> Result<ArrowWriter<File>> {
    let props = WriterProperties::builder()
        .set_compression(Compression::SNAPPY)
        .build();
    Ok(ArrowWriter::try_new(file, schema, Some(props))?)
}

pub fn load(path: &Path, id: &str) -> Result<(Table, Option<(Arc<Schema>, Vec<RecordBatch>)>)> {
    crate::valid_id(id, 't')?;
    let table: Table = serde_json::from_slice(&fs::read(path.join(format!("{id}.json")))?)?;
    if table.source.is_some() {
        return Ok((table, None));
    }
    let builder =
        ParquetRecordBatchReaderBuilder::try_new(File::open(path.join(format!("{id}.parquet")))?)?;
    let schema = builder.schema().clone();
    let batches = builder
        .with_batch_size(16384)
        .build()?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    Ok((table, Some((schema, batches))))
}
