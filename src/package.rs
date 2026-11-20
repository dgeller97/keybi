use crate::{AppError, Result, new_id, storage::Table, valid_id};
use datafusion::arrow::datatypes::DataType;
use parquet::arrow::arrow_reader::ParquetRecordBatchReaderBuilder;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    collections::HashSet,
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
};

const MAGIC: &[u8; 8] = b"KEYBI\0\x01\n";
const LEGACY_MAGIC: &[u8; 8] = b"FOLIO\0\x01\n";
const LIMIT: usize = 256 * 1024 * 1024;
fn invalid(reason: &str) -> AppError {
    AppError(format!("Invalid KeyBI report package. {reason}"))
}
fn array<'a>(object: &'a Value, name: &str) -> Result<&'a Vec<Value>> {
    object[name]
        .as_array()
        .ok_or_else(|| invalid(&format!("Expected a {name} list.")))
}
fn frame_header(out: &mut Vec<u8>, len: usize) -> Result<()> {
    if len > LIMIT || out.len() + len + 4 + 32 > LIMIT {
        return Err(AppError("The report package exceeds 256 MiB.".into()));
    }
    out.extend_from_slice(&(len as u32).to_le_bytes());
    Ok(())
}
fn frame<'a>(remaining: &mut &'a [u8]) -> Result<&'a [u8]> {
    let (size, rest) = remaining
        .split_at_checked(4)
        .ok_or_else(|| invalid("Missing section."))?;
    let len = u32::from_le_bytes(size.try_into().unwrap()) as usize;
    let (section, rest) = rest
        .split_at_checked(len)
        .ok_or_else(|| invalid("Incomplete section."))?;
    *remaining = rest;
    Ok(section)
}
pub fn export(dir: &Path, mut report: Value) -> Result<Vec<u8>> {
    let images=crate::report_image::keys(&report)?;
    let tables = report["tables"]
        .as_array_mut()
        .ok_or_else(|| invalid("Missing tables."))?;
    let mut files = Vec::new();
    for t in tables {
        let id = t
            .get("storageId")
            .unwrap_or(&t["id"])
            .as_str()
            .ok_or_else(|| invalid("Missing table ID."))?;
        valid_id(id, 't')?;
        let schema: Table = serde_json::from_slice(&fs::read(dir.join(format!("{id}.json")))?)?;
        if schema.source.is_some() {
            return Err(AppError(
                "Report packages support imported tables. This report uses a live connection."
                    .into(),
            ));
        }
        files.push(dir.join(format!("{id}.parquet")));
        t.as_object_mut().unwrap().remove("storageId");
    }
    let mut out = MAGIC.to_vec();
    for key in images {
        files.push(dir.with_file_name("images").join(format!("{key}.img")));
    }
    let meta = serde_json::to_vec(&report)?;
    frame_header(&mut out, meta.len())?;
    out.extend_from_slice(&meta);
    for path in files {
        let mut file = fs::File::open(path)?;
        frame_header(&mut out, usize::try_from(file.metadata()?.len())?)?;
        file.read_to_end(&mut out)?;
    }
    let digest = Sha256::digest(&out);
    out.extend_from_slice(&digest);
    Ok(out)
}

fn safe_id(v: &Value) -> bool {
    v.as_str().is_some_and(|s| {
        s.len() == 36
            && s.bytes().enumerate().all(|(i, b)| {
                if [8, 13, 18, 23].contains(&i) {
                    b == b'-'
                } else {
                    b.is_ascii_hexdigit()
                }
            })
    })
}

fn color(v: &Value) -> bool {
    v.as_str().is_some_and(|s| {
        s.len() == 7 && s.starts_with('#') && s[1..].bytes().all(|b| b.is_ascii_hexdigit())
    })
}
fn validate_measure_dependencies(measures: &[Value]) -> Result<()> {
    let mut ids = std::collections::HashMap::new();
    for (index, m) in measures.iter().enumerate() {
        let id = m["id"].as_str().filter(|id| !id.is_empty())
            .ok_or_else(|| invalid("Missing measure ID."))?;
        if ids.insert(id, index).is_some() {
            return Err(invalid("Duplicate measure ID."));
        }
    }
    let mut remaining = vec![0; measures.len()];
    let mut dependents = vec![Vec::new(); measures.len()];
    for (index, m) in measures.iter().enumerate() {
        let refs = m.get("measureRefs").map(|_| array(m, "measureRefs")).transpose()?;
        for dep in m.get("baseMeasure").into_iter().chain(refs.into_iter().flatten()) {
            let parent = dep.as_str().and_then(|id| ids.get(id))
                .ok_or_else(|| invalid("Missing referenced measure."))?;
            remaining[index] += 1;
            dependents[*parent].push(index);
        }
    }
    let mut ready: Vec<_> = (0..measures.len()).filter(|&i| remaining[i] == 0).collect();
    let mut processed = 0;
    while let Some(index) = ready.pop() {
        processed += 1;
        for &child in &dependents[index] {
            remaining[child] -= 1;
            if remaining[child] == 0 { ready.push(child); }
        }
    }
    if processed != measures.len() {
        return Err(invalid("Circular measure reference."));
    }
    Ok(())
}

fn validate_bindings(report: &Value, tables: &[Table]) -> Result<()> {
    let columns: HashSet<_> = tables
        .iter()
        .flat_map(|t| (0..t.columns.len()).map(|c| (t.id.as_str(), c)))
        .collect();
    let mut fields = columns.clone();
    let field =
        |v: &Value| -> Result<crate::query::Field> { Ok(serde_json::from_value(v.clone())?) };
    let definitions = array(report, "calculations")?;
    let calculations = definitions.iter().map(|calc| serde_json::from_value(calc.clone()))
        .collect::<std::result::Result<Vec<crate::query::Calculation>, _>>()?;
    for (calc,c) in definitions.iter().zip(&calculations) {
        let table = calc["field"]["t"].as_str().unwrap();
        if !calc["name"].is_string()
            || !tables.iter().any(|t| t.id == table && c.validate(t,&calculations).is_ok())
            || !fields.insert((table, c.field.c))
        {
            return Err(invalid("Invalid calculated column."));
        }
    }
    let check_field = |v: &Value| -> Result<()> {
        let f = field(v)?;
        if fields.contains(&(f.t.as_str(), f.c)) {
            Ok(())
        } else {
            Err(invalid("Unknown bound field."))
        }
    };
    let measures = array(report, "measures")?;
    validate_measure_dependencies(measures)?;
    for m in measures {
        if !m["name"].is_string() {
            return Err(invalid("Missing measure name."));
        }
        if let Some(base) = m.get("baseMeasure") {
            if !measures
                .iter()
                .any(|b| b["id"] == *base && b.get("baseMeasure").is_none())
            {
                return Err(invalid("Missing monthly base measure."));
            }
            let _: crate::query::MonthComparison = serde_json::from_value(m["comparison"].clone())?;
            check_field(&m["comparison"]["month"])?;
        } else {
            use crate::query::{MeasureExpression, Metric};
            let metric: Metric = serde_json::from_value(m.clone())?;
            let mut pending = vec![&metric];
            while let Some(node) = pending.pop() {
                for f in std::iter::once(&node.field)
                    .chain(node.denominator.as_ref())
                    .chain(&node.remove_filters)
                    .chain(&node.denominator_remove_filters)
                    .chain(node.comparison.as_ref().map(|c| &c.month))
                {
                    if !fields.contains(&(f.t.as_str(), f.c)) {
                        return Err(invalid("Unknown bound field in measure."));
                    }
                }
                if let Some(tree) = node.tree.as_deref() {
                    if let MeasureExpression::Sumx { group, .. } = tree
                        && !fields.contains(&(group.t.as_str(), group.c)) {
                        return Err(invalid("Unknown iterator column in measure."));
                    }
                    if let MeasureExpression::Value { filters, .. } = tree {
                        for filter in filters {
                            if !fields.contains(&(filter.field.t.as_str(), filter.field.c)) {
                                return Err(invalid("Unknown field in measure filter."));
                            }
                        }
                    }
                    pending.extend(tree.operands());
                }
            }
        }
    }
    let mut parameter_ids = HashSet::new();
    let mut dimensions = std::collections::HashMap::new();
    if report.get("parameters").is_some() {
        for parameter in array(report, "parameters")? {
            let mut choices = HashSet::new();
            let dimension = parameter["kind"] == "dimension";
            for member in array(parameter, "members")? {
                let key = member.as_str().ok_or_else(|| invalid("Invalid parameter member."))?;
                let known = if dimension {
                    key.rsplit_once('.').is_some_and(|(t,c)| c.parse::<usize>()
                        .is_ok_and(|i| fields.contains(&(t,i)) && i.to_string() == c))
                } else {
                    measures.iter().any(|m| m["id"] == *member)
                };
                if !known || !choices.insert(key) {
                    return Err(invalid("Unknown or duplicate parameter member."));
                }
            }
            let multiple = parameter["multiple"] == true;
            let valid_current = parameter.get("current").is_none_or(|current| {
                if let Some(items) = current.as_array() {
                    let mut seen = HashSet::new();
                    multiple && !items.is_empty() && items.iter().all(|v| {
                        v.as_str().is_some_and(|id| choices.contains(id) && seen.insert(id))
                    })
                } else {
                    current.as_str().is_some_and(|id| choices.contains(id))
                }
            });
            if choices.len() < 2 || !valid_current
                || parameter["name"]
                    .as_str()
                    .is_none_or(|n| n.trim().is_empty())
                || !parameter["default"]
                    .as_str()
                    .is_some_and(|id| choices.contains(id))
            {
                return Err(invalid("Invalid field parameter."));
            }
            let id = parameter["id"].as_str().ok_or_else(|| invalid("Missing parameter ID."))?;
            parameter_ids.insert(id);
            if dimension {
                let current = parameter.get("current").unwrap_or(&parameter["default"]);
                dimensions.insert(id, current.as_array().and_then(|items| items.first()).unwrap_or(current));
            }
        }
    }
    for page in array(report, "pages")? {
        for v in array(page, "visuals")? {
            if v["kind"] == "parameterSlicer"
                && v.get("parameter")
                    .is_some_and(|p| p.as_str().is_none_or(|id| !parameter_ids.contains(id)))
            {
                return Err(invalid("Unknown slicer parameter."));
            }
            for key in [
                "groups",
                "columns",
                "legendFields",
                "startFields",
                "endFields",
                "phaseFields",
                "smallMultiples",
            ] {
                if v.get(key).is_some() {
                    for f in array(v, key)? {
                        check_field(f)?;
                        if let Some(id) = f.get("parameter") {
                            let active = id.as_str().and_then(|id| dimensions.get(id))
                                .and_then(|member| member.as_str());
                            let bound = field(f)?;
                            if active != Some(format!("{}.{}", bound.t, bound.c).as_str()) {
                                return Err(invalid("Invalid column parameter binding."));
                            }
                        }
                    }
                }
            }
            if v.get("utcSortFields").is_some() {
                for f in array(v, "utcSortFields")? { check_field(f)?; }
            }
            if v.get("smallMultiples").is_some() && array(v, "smallMultiples")?.len()>1 {
                return Err(invalid("Choose one field to split the chart into panels."));
            }
            for key in ["titleBinding","subtitleBinding"] {
                if let Some(binding) = v.get(key)
                    && !measures.iter().any(|m| binding["measure"].is_string() && m["id"] == binding["measure"]) {
                    return Err(invalid("Unknown visual heading measure."));
                }
            }
            if v.get("sparklines").is_some() {
                let trends = array(v, "sparklines")?;
                if trends.len() > 5 { return Err(invalid("A visual supports up to five sparklines.")); }
                let mut ids = HashSet::new();
                for trend in trends {
                    if !safe_id(&trend["id"]) || !ids.insert(trend["id"].as_str())
                        || trend["name"].as_str().is_none_or(|s| s.trim().is_empty() || s.encode_utf16().count()>100)
                        || !matches!(trend["type"].as_str(),Some("line" | "columns")) {
                        return Err(invalid("Invalid sparkline definition."));
                    }
                    check_field(&trend["axis"])?;
                    let binding = &trend["binding"];
                    if let Some(id)=binding.get("measure") {
                        if !measures.iter().any(|m| m["id"]==*id) { return Err(invalid("Unknown sparkline measure.")); }
                    } else {
                        check_field(&binding["field"])?;
                        if !matches!(binding["op"].as_str(),Some("sum" | "count" | "distinctcount" | "avg" | "median" | "p90" | "min" | "max")) {
                            return Err(invalid("Unknown sparkline aggregation."));
                        }
                    }
                }
            }
            if v["kind"]=="image" {
                if array(v,"groups")?.len()>1 {return Err(invalid("Choose one field for each image."));}
                if v.get("imageMappings").is_some() {
                    for entry in array(v,"imageMappings")? {check_field(&entry["field"])?;}
                }
            }
            for key in ["metrics", "other", "size", "tooltipFields", "references"] {
                if v.get(key).is_some() {
                    for metric in array(v, key)? {
                        if let Some(id) = metric.get("measure") {
                            if !measures.iter().any(|m| m["id"] == *id)
                                && !id.as_str().is_some_and(|id| parameter_ids.contains(id) && !dimensions.contains_key(id))
                            {
                                return Err(invalid("Unknown measure in field well."));
                            }
                        } else {
                            check_field(&metric["field"])?;
                        }
                    }
                }
            }
            for rules in ["cellIcons","cellRules","calloutRules"].into_iter().filter_map(|key| v[key].as_object()) {
                for source in rules.values().filter_map(|rule| rule.get("source")) {
                    if let Some(id) = source.get("measure") {
                        if !measures.iter().any(|m| &m["id"] == id) {
                            return Err(invalid("Unknown formatting source measure."));
                        }
                    } else {
                        check_field(&source["field"])?;
                    }
                }
            }
            if !v["accent"].is_null() && !color(&v["accent"])
                || v.get("colors")
                    .is_some_and(|cs| cs.as_object().is_none_or(|m| m.values().any(|c| !color(c))))
            {
                return Err(invalid("Invalid series color."));
            }
        }
    }
    if let Some(theme) = report.get("theme") {
        if !theme.is_null() && array(theme, "dataColors")?.iter().any(|c| !color(c)) {
            return Err(invalid("Invalid theme palette."));
        }
    }
    Ok(())
}
fn validate_document(report: &Value, tables: &[Table]) -> Result<()> {
    for (doc,table) in array(report,"tables")?.iter().zip(tables) {
        if let Some(spec)=doc.get("merge") {
            crate::merge::validate_saved(spec,table,tables)?;
        }
    }
    let pages = array(report, "pages")?;
    if report["version"] != 1
        || !report["title"].is_string()
        || pages.is_empty()
        || report["active"]
            .as_u64()
            .is_none_or(|index| index >= pages.len() as u64)
    {
        return Err(invalid("Unsupported version or invalid active page."));
    }
    let mut ids = HashSet::new();
    let mut register = |v: &Value| -> Result<()> {
        if !safe_id(&v["id"]) || !ids.insert(v["id"].as_str().unwrap().to_owned()) {
            return Err(invalid("Invalid or duplicate object ID."));
        }
        Ok(())
    };
    for page in pages {
        register(page)?;
        if !page["name"].is_string() {
            return Err(invalid("Missing page name."));
        }
        array(page, "filters")?;
        for v in array(page, "visuals")? {
            register(v)?;
            if !v["kind"].as_str().is_some_and(|s| {
                matches!(
                    s,
                    "bar"
                        | "table"
                        | "matrix"
                        | "card"
                        | "slicer"
                        | "parameterSlicer"
                        | "clusteredBar"
                        | "stackedBar"
                        | "percentBar"
                        | "clusteredColumn"
                        | "stackedColumn"
                        | "percentColumn"
                        | "line"
                        | "area"
                        | "stackedArea"
                        | "percentArea"
                        | "combo"
                        | "dot"
                        | "scatter"
                        | "bubble"
                        | "pie"
                        | "donut"
                        | "indicator"
                        | "list"
                        | "dropdown"
                        | "dateRange"
                        | "waterfall"
                        | "gantt"
                        | "ribbon"
                        | "funnel"
                        | "treemap"
                        | "gauge"
                        | "map"
                        | "decomposition"
                        | "textBox"
                        | "narrative"
                        | "shape"
                        | "image"
                        | "actionButton"
                        | "navigator"
                )
            }) || ["x", "y", "w", "h"].iter().any(|key| !v[key].is_number())
                || (!v["top"].is_null() && !v["top"].is_u64())
            {
                return Err(invalid("Unknown visual type or invalid layout."));
            }
            for key in ["filters", "groups", "metrics"] {
                array(v, key)?;
            }
            if v["kind"] == "narrative" {
                let bindings = array(v, "metrics")?;
                let mut names = HashSet::new();
                if bindings.len() > 32 || v.get("narrativeText").is_some_and(|text| text.as_str().is_none_or(|s| s.encode_utf16().count() > 16000)) {
                    return Err(invalid("Invalid narrative text or value count."));
                }
                for binding in bindings {
                    let label = binding["narrativeLabel"].as_str().unwrap_or("");
                    if label.trim().is_empty() || label.encode_utf16().count() > 80 || label.contains(['{','}','\r','\n']) || !names.insert(label) {
                        return Err(invalid("Invalid or duplicate narrative value name."));
                    }
                }
            }
        }
    }
    for m in array(report, "measures")? {
        register(m)?;
    }
    if report.get("parameters").is_some() {
        for p in array(report, "parameters")? {
            register(p)?;
        }
    }
    if let Some(bookmarks) = report.get("bookmarks") {
        for b in bookmarks
            .as_array()
            .ok_or_else(|| invalid("Invalid bookmarks."))?
        {
            register(b)?;
            array(b, "visuals")?;
            array(b, "filters")?;
            array(b, "pageFilters")?;
        }
    }
    let links: Vec<crate::query::Link> = serde_json::from_value(report["links"].clone())?;
    for field in links.iter().flat_map(|l| [&l.one, &l.many]) {
        if !tables
            .iter()
            .any(|t| t.id == field.t && field.c < t.columns.len())
        {
            return Err(invalid("Missing relationship key."));
        }
    }
    array(report, "filters")?;
    validate_bindings(report, tables)
}

pub struct Installation {
    pub report: Value,
    files: Vec<PathBuf>,
}
impl Drop for Installation {
    fn drop(&mut self) {
        for path in &self.files {
            let _ = fs::remove_file(path);
        }
    }
}
impl Installation {
    pub fn commit(mut self) {
        self.files.clear();
    }
}
pub fn install(dir: &Path, data: &[u8]) -> Result<Installation> {
    if data.len() > LIMIT || data.len() < MAGIC.len() + 32
        || !(data.starts_with(MAGIC) || data.starts_with(LEGACY_MAGIC)) {
        return Err(invalid("Choose a KeyBI report (.keybi) or a legacy .folio report."));
    }
    let (body, checksum) = data.split_at(data.len() - 32);
    if &Sha256::digest(body)[..] != checksum {
        return Err(invalid("Checksum mismatch."));
    }
    let mut rest = &body[MAGIC.len()..];
    let mut report: Value = serde_json::from_slice(frame(&mut rest)?)?;
    let tables: Vec<Table> = serde_json::from_value(report["tables"].clone())?;
    validate_document(&report, &tables)?;
    let mut logical_ids = HashSet::new();
    let mut files = Installation {
        report: Value::Null,
        files: vec![],
    };
    for (i, mut table) in tables.into_iter().enumerate() {
        valid_id(&table.id, 't')?;
        if table.source.is_some()
            || !logical_ids.insert(table.id.clone())
            || table.columns.is_empty()
        {
            return Err(invalid("Expected distinct imported tables."));
        }
        let mut file = tempfile::NamedTempFile::new_in(dir)?;
        file.write_all(frame(&mut rest)?)?;
        let builder = ParquetRecordBatchReaderBuilder::try_new(file.reopen()?)?;
        let schema = builder.schema();
        if schema.fields().len() != table.columns.len()
            || schema
                .fields()
                .iter()
                .zip(&table.columns)
                .enumerate()
                .any(|(j, (field, col))| {
                    field.name() != &format!("c{j}")
                        || field.data_type()
                            != if col.numeric {
                                &DataType::Float64
                            } else {
                                &DataType::Utf8
                            }
                })
        {
            return Err(invalid("Parquet columns do not match the report model."));
        }
        let mut count = 0;
        for batch in builder.with_batch_size(16384).build()? {
            count += batch?.num_rows();
        }
        if count != table.rows {
            return Err(invalid(
                "Parquet row count does not match the report model.",
            ));
        }
        table.id = new_id('t');
        report["tables"][i]["storageId"] = json!(table.id);
        let parquet = dir.join(format!("{}.parquet", table.id));
        file.persist_noclobber(&parquet)?;
        files.files.push(parquet);
        let schema = dir.join(format!("{}.json", table.id));
        let mut file = fs::File::create_new(&schema)?;
        files.files.push(schema);
        file.write_all(&serde_json::to_vec(&table)?)?;
    }
    let mut images=Vec::new();
    for key in crate::report_image::keys(&report)? {
        let bytes=frame(&mut rest)?;
        images.push((key,bytes));
    }
    if !rest.is_empty() {
        return Err(invalid("Unexpected trailing sections."));
    }
    for (key,bytes) in images {
        crate::report_image::store(&dir.with_file_name("images"),bytes,Some(&key))?;
    }
    let doc = report.as_object_mut().unwrap();
    for key in ["id", "revision", "updated"] {
        doc.remove(key);
    }
    files.report = report;
    Ok(files)
}
