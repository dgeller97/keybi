//! Rebuild the typed purchase-order example from the independently readable CSV.
use datafusion::arrow::{
    array::{ArrayRef, StringArray, StructArray},
    buffer::NullBuffer,
    compute::cast,
    datatypes::{DataType, Field, Fields, Schema},
    record_batch::RecordBatch,
};
use parquet::{arrow::ArrowWriter, basic::Compression, file::properties::WriterProperties};
use std::{error::Error, fs::File, sync::Arc};

fn main() -> Result<(), Box<dyn Error>> {
    for name in ["Commitments", "CommitmentChanges"] {
        write_extract(name)?;
    }
    Ok(())
}
fn write_extract(name: &str) -> Result<(), Box<dyn Error>> {
    let rows = csv::Reader::from_path(format!("web/datasets/budget/{name}.csv"))?
        .records()
        .collect::<Result<Vec<_>, _>>()?;
    let strings =
        |i: usize| StringArray::from_iter(rows.iter().map(|r| r.get(i).filter(|v| !v.is_empty())));
    let mut columns: Vec<(String, ArrayRef)> = Vec::new();
    for (name, i, kind) in [
        ("PeriodKey", 0, DataType::Int32),
        ("DepartmentKey", 1, DataType::Int64),
        ("PurchaseOrder", 2, DataType::UInt64),
        ("OrderedOn", 3, DataType::Date32),
        ("LineAmount", 4, DataType::Decimal128(18, 2)),
        ("Approved", 5, DataType::Boolean),
    ] {
        columns.push((name.to_owned(), cast(&strings(i), &kind)?));
    }
    let vendor = Fields::from(vec![
        Field::new("Name", DataType::Utf8, true),
        Field::new("Ref", DataType::Utf8, true),
    ]);
    let valid = NullBuffer::from(rows.iter().map(|r| !r[6].is_empty()).collect::<Vec<_>>());
    columns.push((
        "Vendor".into(),
        Arc::new(StructArray::new(
            vendor,
            vec![Arc::new(strings(6)), Arc::new(strings(7))],
            Some(valid),
        )),
    ));
    columns.push((
        "AuditValue".into(),
        cast(&strings(8), &DataType::Decimal128(20, 2))?,
    ));
    if name == "CommitmentChanges" {
        columns.reverse();
    }
    let schema = Arc::new(Schema::new(
        columns
            .iter()
            .map(|(name, a)| Field::new(name, a.data_type().clone(), true))
            .collect::<Vec<_>>(),
    ));
    let batch = RecordBatch::try_new(
        schema.clone(),
        columns.into_iter().map(|(_, a)| a).collect(),
    )?;
    let output = File::create(format!("web/datasets/budget/{name}.parquet"))?;
    let props = WriterProperties::builder()
        .set_compression(Compression::ZSTD(Default::default()))
        .set_max_row_group_size(3)
        .build();
    let mut writer = ArrowWriter::try_new(output, schema, Some(props))?;
    writer.write(&batch)?;
    writer.close()?;
    println!(
        "Wrote {} purchase-order lines to {name}.parquet.",
        batch.num_rows()
    );
    Ok(())
}
