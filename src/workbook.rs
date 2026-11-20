use crate::{AppError, Result, storage};
use calamine::{DataRef, Reader, SheetType, SheetVisible, Xlsx};
use serde::{Deserialize, Serialize};
use std::{collections::HashSet, io::Cursor, path::Path};
mod named_table;
use named_table::NamedTable;

type Book<'a> = Xlsx<Cursor<&'a [u8]>>;

fn open(bytes: &[u8]) -> Result<Book<'_>> {
    let container = zip::ZipArchive::new(Cursor::new(bytes))
        .map_err(|_| AppError("Choose an unencrypted .xlsx workbook.".into()))?;
    if container
        .decompressed_size()
        .is_none_or(|n| n > 1024 * 1024 * 1024)
    {
        return Err(AppError(
            "This workbook expands beyond the 1 GiB import limit.".into(),
        ));
    }
    Ok(Xlsx::new(Cursor::new(bytes))?)
}

struct Value {
    content: String,
    text: bool,
}

fn value(cell: DataRef<'_>) -> Result<Option<Value>> {
    let text = !matches!(cell, DataRef::Int(_) | DataRef::Float(_));
    let content = match cell {
        DataRef::Empty => return Ok(None),
        DataRef::String(s) | DataRef::DateTimeIso(s) | DataRef::DurationIso(s) => s,
        DataRef::SharedString(s) => s.to_owned(),
        DataRef::Int(n) => n.to_string(),
        DataRef::Float(n) if n.is_finite() => n.to_string(),
        DataRef::Float(_) => return Err(AppError("Non-finite numeric value.".into())),
        DataRef::Bool(b) => if b { "TRUE" } else { "FALSE" }.into(),
        DataRef::Error(e) => return Err(AppError(format!("Excel cell error {e}."))),
        DataRef::DateTime(d) if d.is_duration() => d
            .as_duration()
            .ok_or_else(|| AppError("Invalid Excel duration.".into()))?
            .to_string(),
        DataRef::DateTime(d) => {
            let time = d
                .as_datetime()
                .ok_or_else(|| AppError("Invalid Excel date.".into()))?;
            if time.time() == chrono::NaiveTime::MIN {
                time.date().to_string()
            } else {
                time.format("%Y-%m-%dT%H:%M:%S%.f").to_string()
            }
        }
    };
    Ok((!content.is_empty()).then_some(Value { content, text }))
}

struct SheetRows {
    first_column: u32,
    headers: Vec<String>,
    text_columns: Vec<bool>,
    rows: usize,
    csv: csv::Writer<Vec<u8>>,
}
impl SheetRows {
    fn append(&mut self, cells: &[(u32, Value)]) -> Result<()> {
        if cells.is_empty() {
            return Ok(());
        }
        if self.headers.is_empty() {
            self.first_column = cells[0].0;
            let mut distinct = HashSet::new();
            for (i, (column, val)) in cells.iter().enumerate() {
                let name = val.content.trim();
                if *column != self.first_column + i as u32
                    || name.is_empty()
                    || !distinct.insert(name.to_lowercase())
                {
                    return Err(AppError(
                        "Use distinct, nonempty headers across the first populated row.".into(),
                    ));
                }
                self.headers.push(name.to_owned());
            }
            self.text_columns = vec![false; self.headers.len()];
            self.csv.write_record(&self.headers)?;
            return Ok(());
        }
        let mut row = vec![""; self.headers.len()];
        for (column, val) in cells {
            let index = column
                .checked_sub(self.first_column)
                .map(|n| n as usize)
                .filter(|&i| i < row.len())
                .ok_or_else(|| AppError("A data column has no header.".into()))?;
            row[index] = &val.content;
            self.text_columns[index] |= val.text;
        }
        self.csv.write_record(row)?;
        self.rows += 1;
        if self.csv.get_ref().len() > 256 * 1024 * 1024 {
            return Err(AppError(
                "The selected worksheet exceeds the 256 MiB table limit.".into(),
            ));
        }
        Ok(())
    }
}

fn read_rows(
    book: &mut Book<'_>,
    sheet: &str,
    table: Option<&NamedTable>,
    limit: usize,
) -> Result<SheetRows> {
    let mut reader = book.worksheet_cells_reader(sheet)?;
    let mut result = SheetRows {
        first_column: 0,
        headers: Vec::new(),
        text_columns: Vec::new(),
        rows: 0,
        csv: csv::Writer::from_writer(Vec::new()),
    };
    let mut cells = Vec::new();
    let mut current = None;
    if let Some(table) = table {
        result.first_column = table.first_column;
        result.headers = table.columns.clone();
        result.text_columns = vec![false; result.headers.len()];
        result.csv.write_record(&result.headers)?;
    }
    while let Some(cell) = reader.next_cell_with_formula_metadata()? {
        let (r, c) = cell.pos;
        if let Some(table) = table {
            if r >= table.end_row {
                break;
            }
            if r < table.first_row
                || c < table.first_column
                || c >= table.first_column + table.columns.len() as u32
            {
                continue;
            }
        }
        if current != Some(r) {
            result.append(&cells)?;
            if result.rows >= limit {
                return Ok(result);
            }
            cells.clear();
            current = Some(r);
        }
        if cell.formula.is_some() && matches!(cell.value, DataRef::Empty) {
            return Err(AppError(format!(
                "Row {}, column {} has a formula without a saved result. Recalculate and save the workbook.",
                r + 1,
                c + 1
            )));
        }
        if let Some(val) = value(cell.value)
            .map_err(|e| AppError(format!("Row {}, column {}. {}", r + 1, c + 1, e.0)))?
        {
            cells.push((c, val));
        }
    }
    result.append(&cells)?;
    if result.headers.is_empty() {
        return Err(AppError("This worksheet is empty.".into()));
    }
    Ok(result)
}

#[derive(Serialize)]
pub struct SheetPreview {
    name: String,
    sheet: String,
    kind: &'static str,
    headers: Vec<String>,
    rows: Vec<Vec<String>>,
    error: Option<String>,
}
fn sheets(book: &Book<'_>) -> Vec<String> {
    book.sheets_metadata()
        .iter()
        .filter(|s| s.typ == SheetType::WorkSheet && s.visible == SheetVisible::Visible)
        .map(|s| s.name.clone())
        .collect()
}
pub fn preview(bytes: &[u8]) -> Result<Vec<SheetPreview>> {
    let mut book = open(bytes)?;
    let mut result = Vec::new();
    let names = sheets(&book);
    let tables = named_table::discover(&mut book, bytes);
    let sources = names.iter().map(|sheet| (sheet.as_str(), None)).chain(
        tables
            .as_ref()
            .ok()
            .into_iter()
            .flatten()
            .map(|t| (t.sheet.as_str(), Some(t))),
    );
    for (sheet, table) in sources {
        let name = table.map_or(sheet, |t| t.name.as_str());
        let mut preview = SheetPreview {
            name: name.to_owned(),
            sheet: sheet.to_owned(),
            kind: if table.is_some() {
                "table"
            } else {
                "worksheet"
            },
            headers: vec![],
            rows: vec![],
            error: None,
        };
        match read_rows(&mut book, sheet, table, 5) {
            Ok(data) => {
                preview.headers = data.headers;
                let bytes = data.csv.into_inner()?;
                for row in csv::Reader::from_reader(bytes.as_slice()).records() {
                    preview.rows.push(row?.iter().map(str::to_owned).collect());
                }
            }
            Err(err) => preview.error = Some(err.0),
        }
        result.push(preview);
    }
    if let Err(error) = tables {
        result.push(SheetPreview {
            name: "Excel tables".into(),
            sheet: String::new(),
            kind: "table",
            headers: vec![],
            rows: vec![],
            error: Some(error.0),
        });
    }
    Ok(result)
}
fn columns(
    data: &SheetRows,
    previous: Option<&storage::Table>,
) -> Result<Vec<storage::Preparation>> {
    use storage::{InputType, Preparation};
    if let Some(table) = previous {
        return table
            .columns
            .iter()
            .map(|column| {
                let index = data
                    .headers
                    .iter()
                    .position(|h| h == &column.name)
                    .ok_or_else(|| {
                        AppError(format!(
                            "Missing model column {} in the selected worksheet.",
                            column.name
                        ))
                    })?;
                let kind = if column.numeric {
                    InputType::Number
                } else {
                    InputType::Text
                };
                Ok(Preparation::workbook_column(
                    index,
                    column.name.clone(),
                    kind,
                ))
            })
            .collect();
    }
    Ok(data
        .headers
        .iter()
        .enumerate()
        .map(|(i, name)| {
            let kind = if data.text_columns[i] {
                InputType::Text
            } else {
                InputType::Auto
            };
            Preparation::workbook_column(i, name.clone(), kind)
        })
        .collect())
}
#[derive(Deserialize, Eq, PartialEq, Hash)]
#[serde(untagged)]
pub enum Selection {
    Worksheet(String),
    Table { table: String, sheet: String },
}
impl From<&str> for Selection {
    fn from(name: &str) -> Self {
        Self::Worksheet(name.to_owned())
    }
}
pub fn import(
    dir: &Path,
    bytes: &[u8],
    selected: &[Selection],
    mut revision: Option<(&Path, storage::Revision)>,
) -> Result<Vec<storage::Table>> {
    let mut book = open(bytes)?;
    let available = sheets(&book);
    let named = if selected
        .iter()
        .any(|s| matches!(s, Selection::Table { .. }))
    {
        named_table::discover(&mut book, bytes)?
    } else {
        Vec::new()
    };
    let mut seen = HashSet::new();
    if selected.is_empty() || selected.iter().any(|item| !seen.insert(item)) {
        return Err(AppError(
            "Choose one or more distinct worksheets or Excel tables.".into(),
        ));
    }
    let mut tables = Vec::new();
    if revision.is_some() && selected.len() != 1 {
        return Err(AppError(
            "Choose one workbook item to update this table.".into(),
        ));
    }
    let previous = revision
        .as_ref()
        .map(|(catalog, update)| update.previous(catalog))
        .transpose()?;
    for item in selected {
        let (sheet, name, table) = match item {
            Selection::Worksheet(sheet) if available.contains(sheet) => (sheet, sheet, None),
            Selection::Table { table, sheet } => {
                let source = named
                    .iter()
                    .find(|t| t.name == *table && t.sheet == *sheet)
                    .ok_or_else(|| {
                        AppError(format!("Excel table {table} is unavailable on {sheet}."))
                    })?;
                (sheet, table, Some(source))
            }
            Selection::Worksheet(sheet) => {
                return Err(AppError(format!("Worksheet {sheet} is unavailable.")));
            }
        };
        let data = read_rows(&mut book, sheet, table, usize::MAX)
            .map_err(|e| AppError(format!("{name}. {}", e.0)))?;
        let plan = columns(&data, previous.as_ref())?;
        tables.push(storage::import(
            dir,
            name.clone(),
            &data.csv.into_inner()?,
            Some(plan),
            revision.take(),
            None,
        )?);
    }
    Ok(tables)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};

    const SOURCE: &[u8] = include_bytes!("../web/datasets/budget/PurchaseReview.xlsx");

    fn replace_cell(from: &str, to: &str) -> Vec<u8> {
        let mut input = zip::ZipArchive::new(Cursor::new(SOURCE)).unwrap();
        let mut output = zip::ZipWriter::new(Cursor::new(Vec::new()));
        for index in 0..input.len() {
            let mut file = input.by_index(index).unwrap();
            let name = file.name().unwrap().into_owned();
            output
                .start_file(&name, zip::write::SimpleFileOptions::default())
                .unwrap();
            if name == "xl/worksheets/sheet1.xml" {
                let mut xml = String::new();
                file.read_to_string(&mut xml).unwrap();
                assert!(xml.contains(from));
                output
                    .write_all(xml.replacen(from, to, 1).as_bytes())
                    .unwrap();
            } else {
                std::io::copy(&mut file, &mut output).unwrap();
            }
        }
        output.finish().unwrap().into_inner()
    }

    #[test]
    fn absent_formula_cache_is_reported_with_location() {
        let bytes = replace_cell("<f>D2*E2</f><v>124.5</v>", "<f>D2*E2</f>");
        let catalog = preview(&bytes).unwrap();
        assert!(
            catalog[0]
                .error
                .as_ref()
                .unwrap()
                .contains("Row 2, column 6")
        );
        let dir = tempfile::tempdir().unwrap();
        let error = import(dir.path(), &bytes, &["Purchase lines".into()], None)
            .err()
            .unwrap();
        assert!(error.0.contains("without a saved result"));
        assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 0);
    }

    #[test]
    fn text_cells_remain_text_even_when_they_look_numeric() {
        let bytes = replace_cell(
            r#"<c r="E2" s="2"><v>41.5</v></c>"#,
            r#"<c r="E2" t="inlineStr"><is><t>123</t></is></c>"#,
        );
        let dir = tempfile::tempdir().unwrap();
        let tables = import(dir.path(), &bytes, &["Purchase lines".into()], None).unwrap();
        assert_eq!(tables[0].rows, 5);
        assert!(!tables[0].columns[4].numeric);
        assert!(tables[0].columns[5].numeric);
    }

    #[test]
    fn selected_excel_table_uses_its_own_headers_and_data_bounds() {
        let mut book = open(SOURCE).unwrap();
        let catalog = named_table::discover(&mut book, SOURCE).unwrap();
        let limits = catalog
            .iter()
            .find(|t| t.name == "AuthorizationLimits")
            .unwrap();
        let data = read_rows(&mut book, &limits.sheet, Some(limits), usize::MAX).unwrap();
        assert_eq!(
            data.headers,
            ["Center", "Single order limit", "Approval owner"]
        );
        assert_eq!(data.rows, 3);
        assert_eq!(data.text_columns, [true, false, true]);
        let content = String::from_utf8(data.csv.into_inner().unwrap()).unwrap();
        assert!(content.contains("001,100,Facilities lead"));
        assert!(!content.contains("Total") && !content.contains("Review required"));
    }

    #[test]
    fn named_table_rejects_a_missing_formula_result_in_its_range() {
        let bytes = replace_cell("<f>D2*E2</f><v>124.5</v>", "<f>D2*E2</f>");
        let catalog = preview(&bytes).unwrap();
        let purchases = catalog.iter().find(|p| p.name == "PurchaseLines").unwrap();
        assert!(
            purchases
                .error
                .as_deref()
                .unwrap()
                .contains("Row 2, column 6")
        );
        let limits = catalog
            .iter()
            .find(|p| p.name == "AuthorizationLimits")
            .unwrap();
        assert!(limits.error.is_none());
        assert_eq!(limits.rows.len(), 3);
    }
}
