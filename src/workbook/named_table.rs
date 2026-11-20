use super::{Book, sheets};
use crate::{AppError, Result};
use quick_xml::{
    Reader, XmlVersion,
    events::{BytesStart, Event},
};
use std::{
    collections::{HashMap, HashSet},
    io::{BufRead, BufReader, Cursor},
};

pub(super) struct NamedTable {
    pub name: String,
    pub sheet: String,
    pub columns: Vec<String>,
    pub first_column: u32,
    pub first_row: u32,
    pub end_row: u32,
}

fn attribute(tag: &BytesStart<'_>, key: &str) -> Result<Option<String>> {
    tag.try_get_attribute(key)?
        .map(|attr| Ok(attr.normalized_value(XmlVersion::Implicit1_0)?.into_owned()))
        .transpose()
}

fn table_parts(input: impl BufRead) -> Result<Vec<String>> {
    let mut xml = Reader::from_reader(input);
    let mut buf = Vec::new();
    let mut parts = Vec::new();
    loop {
        match xml.read_event_into(&mut buf)? {
            Event::Start(tag) | Event::Empty(tag) if tag.local_name().as_ref() == "Override" => {
                let kind = attribute(&tag, "ContentType")?;
                if kind.as_deref()
                    == Some("application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml")
                {
                    let path = attribute(&tag, "PartName")?
                        .ok_or_else(|| AppError("An Excel table has no part name.".into()))?;
                    parts.push(path.trim_start_matches('/').to_owned());
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buf.clear();
    }
    Ok(parts)
}

fn address(value: &str) -> Option<(u32, u32)> {
    let cell = value.trim_start_matches('$');
    let split = cell.bytes().take_while(u8::is_ascii_alphabetic).count();
    let (letters, digits) = cell.split_at(split);
    let mut column = 0_u32;
    for byte in letters.bytes() {
        column = column
            .checked_mul(26)?
            .checked_add(u32::from(byte.to_ascii_uppercase() - b'A' + 1))?;
    }
    let row = digits.trim_start_matches('$').parse::<u32>().ok()?;
    ((1..=16_384).contains(&column) && (1..=1_048_576).contains(&row))
        .then(|| (row - 1, column - 1))
}

fn read_table(input: impl BufRead, owners: &HashMap<String, String>) -> Result<Option<NamedTable>> {
    let mut xml = Reader::from_reader(input);
    let mut buf = Vec::new();
    let mut name = String::new();
    let mut range = String::new();
    let mut header = 1;
    let mut totals = 0;
    let mut columns = Vec::new();
    loop {
        match xml.read_event_into(&mut buf)? {
            Event::Start(tag) | Event::Empty(tag) => match tag.local_name().as_ref() {
                "table" => {
                    let get = |key| attribute(&tag, key);
                    name = get("displayName")?.unwrap_or_default();
                    if !owners.contains_key(&name) {
                        return Ok(None);
                    }
                    range = get("ref")?.unwrap_or_default();
                    header = get("headerRowCount")?
                        .map(|s| s.parse::<u32>())
                        .transpose()?
                        .unwrap_or(1);
                    totals = get("totalsRowCount")?
                        .map(|s| s.parse::<u32>())
                        .transpose()?
                        .unwrap_or(0);
                }
                "tableColumn" => {
                    let label = attribute(&tag, "name")?.unwrap_or_default();
                    columns.push(label.trim().to_owned());
                }
                _ => {}
            },
            Event::Eof => break,
            _ => {}
        }
        buf.clear();
    }
    let invalid = || {
        AppError(format!(
            "Excel table {name} has an invalid range or column definition."
        ))
    };
    let (first, last) = range.split_once(':').unwrap_or((&range, &range));
    let (row, column) = address(first).ok_or_else(invalid)?;
    let (last_row, last_column) = address(last).ok_or_else(invalid)?;
    let mut distinct = HashSet::new();
    if last_column < column
        || last_row < row
        || (last_column - column + 1) as usize != columns.len()
        || header > 1
        || totals > 1
        || header + totals > last_row - row + 1
        || columns
            .iter()
            .any(|label| label.is_empty() || !distinct.insert(label.to_lowercase()))
    {
        return Err(invalid());
    }
    let sheet = owners.get(&name).ok_or_else(invalid)?.clone();
    Ok(Some(NamedTable {
        name,
        sheet,
        columns,
        first_column: column,
        first_row: row + header,
        end_row: last_row + 1 - totals,
    }))
}

pub(super) fn discover(book: &mut Book<'_>, bytes: &[u8]) -> Result<Vec<NamedTable>> {
    book.load_tables()?;
    let mut owners = HashMap::new();
    for sheet in sheets(book) {
        for name in book.table_names_in_sheet(&sheet) {
            if owners.insert(name.clone(), sheet.clone()).is_some() {
                return Err(AppError(format!(
                    "Excel table {name} has more than one source."
                )));
            }
        }
    }
    if owners.is_empty() {
        return Ok(Vec::new());
    }
    // Calamine's table-by-name API first materializes a dense parent worksheet.
    // Read the declared bounds instead, then use the same streaming cell reader
    // for named tables and sheets, including cached-formula validation.
    let mut zip = zip::ZipArchive::new(Cursor::new(bytes))?;
    let parts = table_parts(BufReader::new(zip.by_name("[Content_Types].xml")?))?;
    let mut tables = Vec::new();
    for part in parts {
        if let Some(table) = read_table(BufReader::new(zip.by_name(&part)?), &owners)? {
            tables.push(table);
        }
    }
    tables.sort_by(|a, b| a.name.cmp(&b.name));
    if tables.len() != owners.len() || tables.windows(2).any(|t| t[0].name == t[1].name) {
        return Err(AppError(
            "Could not resolve the named table ranges in this workbook.".into(),
        ));
    }
    Ok(tables)
}
