use crate::{AppError, Result, storage::Table};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet, VecDeque};

#[derive(Clone, Debug, PartialEq, Eq, Hash, Deserialize, Serialize)]
pub struct Field {
    pub t: String,
    pub c: usize,
}
#[derive(Clone, Debug, PartialEq, Eq, Hash, Deserialize, Serialize)]
pub struct Link {
    pub one: Field,
    pub many: Field,
}
#[derive(Clone, Deserialize)]
pub struct MemberGroup {
    pub name: String,
    pub members: Vec<Option<String>>,
}
#[derive(Clone, Deserialize)]
pub struct Calculation {
    pub field: Field,
    pub left: Field,
    pub op: String,
    pub right: Option<Field>,
    #[serde(rename = "binSize")]
    pub bin_size: Option<f64>,
    #[serde(rename = "timeBinMs")]
    pub time_bin_ms: Option<u64>,
    #[serde(rename = "calendarMonths")]
    pub calendar_months: Option<u32>,
    #[serde(rename = "weekStart")]
    pub week_start: Option<u8>,
    #[serde(default)]
    pub groups: Vec<MemberGroup>,
    #[serde(rename = "otherLabel")]
    pub other_label: Option<String>,
}
impl Calculation {
    fn valid_groups(&self) -> bool {
        let mut names = HashSet::new();
        let mut members = HashSet::new();
        let valid_label = |s: &str| !s.trim().is_empty() && s.chars().count() <= 160;
        if !(1..=100).contains(&self.groups.len()) { return false; }
        for group in &self.groups {
            if !valid_label(&group.name) || !names.insert(group.name.to_lowercase()) || group.members.is_empty() { return false; }
            for member in &group.members {
                if !members.insert(member) || members.len() > 1000 { return false; }
            }
        }
        self.other_label.as_deref().is_none_or(|label| valid_label(label) && !names.contains(&label.to_lowercase()))
    }
    pub fn validate(&self, table: &Table, calculations: &[Calculation]) -> Result<()> {
        let numeric = |f: &Field| {
            f.t == table.id && table.columns.get(f.c).is_some_and(|c| c.numeric)
        };
        let numeric_source = numeric(&self.left)
            || (self.op == "bin" && calculations.iter()
                .find(|c| c.field == self.left)
                .is_some_and(|c| matches!(c.op.as_str(), "+" | "-" | "*" | "/") && c.validate(table, &[]).is_ok()));
        let valid_width = match (self.time_bin_ms, self.calendar_months) {
            (Some(ms), None) => (1..=315537897600000).contains(&ms)
                && self.week_start.is_none_or(|day| (1..=7).contains(&day) && ms % 604800000 == 0),
            (None, Some(months)) => (1..=119988).contains(&months) && self.week_start.is_none(),
            _ => false,
        };
        let timeless = self.time_bin_ms.is_none() && self.calendar_months.is_none() && self.week_start.is_none();
        let valid = match self.op.as_str() {
            "memberGroups" => self.valid_groups() && timeless && self.right.is_none() && self.bin_size.is_none()
                && self.left.t == table.id && table.columns.get(self.left.c).is_some_and(|c| !c.numeric),
            "timeBin" => self.right.is_none() && self.bin_size.is_none()
                && valid_width
                && self.left.t == table.id && table.columns.get(self.left.c).is_some_and(|c| !c.numeric),
            "bin" => numeric_source && timeless && self.right.is_none()
                && self.bin_size.is_some_and(|size| size.is_finite() && size > 0.0),
            "+" | "-" | "*" | "/" => numeric_source && timeless && self.bin_size.is_none()
                && self.right.as_ref().is_some_and(numeric),
            _ => false,
        };
        if self.field.t != table.id || self.field.c < table.columns.len() || !valid {
            return Err(AppError("Invalid calculated column operands or bin size.".into()));
        }
        Ok(())
    }
}

fn sql_server_utc(source: &str) -> String {
    let iso = format!("CASE WHEN LEN({source})=7 THEN {source}+'-01' WHEN SUBSTRING({source},14,1)=':' AND SUBSTRING({source},17,1)<>':' THEN LEFT({source},16)+':00'+SUBSTRING({source},17,32) ELSE {source} END");
    format!("CAST(SWITCHOFFSET(CONVERT(datetimeoffset(7),{iso},126),'+00:00') AS datetime2)")
}

fn utc_milliseconds(source: &str, live: bool) -> String {
    if live {
        let utc = sql_server_utc(source);
        format!("DATEDIFF_BIG(millisecond,CAST('19700101' AS datetime2),{utc})")
    } else {
        format!("folio_utc_millis({source})")
    }
}

// 1970-01-01 was Thursday. Anchor multiweek bins to the chosen weekday
// at the beginning of the week containing the epoch.
fn week_shift(day: u8) -> i64 {
    (4 - i64::from(day)).rem_euclid(7) * 86400000
}

fn time_bin_bounds(calc: &Calculation, key: &str) -> Option<(i64, i64)> {
    if calc.op != "timeBin" { return None; }
    let instant = chrono::DateTime::parse_from_rfc3339(key).ok()?.to_utc();
    if instant.to_rfc3339_opts(chrono::SecondsFormat::Millis, true) != key {
        return None;
    }
    let lower = instant.timestamp_millis();
    if let Some(months) = calc.calendar_months {
        if crate::timestamp::calendar_start(lower, months)? != lower { return None; }
        return Some((lower, instant.checked_add_months(chrono::Months::new(months))?.timestamp_millis()));
    }
    let width = i64::try_from(calc.time_bin_ms?).ok()?;
    let relative = lower.checked_add(calc.week_start.map_or(0, week_shift))?;
    if relative.rem_euclid(width) != 0 {
        return None;
    }
    Some((lower, lower.checked_add(width)?))
}

fn calendar_bin_expression(source: &str, months: u32, live: bool) -> String {
    if live {
        let epoch = "CAST('19700101' AS datetime2)";
        let index = format!("DATEDIFF(month,{epoch},{})", sql_server_utc(source));
        let lower = format!("({index} - (({index} % {months} + {months}) % {months}))");
        let date = format!("DATEADD(month,{lower},{epoch})");
        format!("(REPLACE(CONVERT(char(23),{date},121),' ','T')+'Z')")
    } else {
        let lower = format!("folio_calendar_start(folio_utc_millis({source}),{months})");
        format!("to_char(arrow_cast({lower},'Timestamp(Millisecond, None)'),'%Y-%m-%dT%H:%M:%S%.3fZ')")
    }
}

fn time_bin_expression(source: &str, width: u64, week_start: Option<u8>, live: bool) -> String {
    // Euclidean remainders place pre-1970 times in the interval below them.
    let millis = utc_milliseconds(source,live);
    let relative = if let Some(day) = week_start {
        let shift = week_shift(day);
        format!("({millis}+{shift})")
    } else { millis.clone() };
    let start = format!("({millis} - (({relative} % {width} + {width}) % {width}))");
    if live {
        let epoch = "CAST('19700101' AS datetime2)";
        let day = format!("DATEADD(day,CAST({start}/86400000 AS int),{epoch})");
        let time = format!("DATEADD(millisecond,CAST({start}%86400000 AS int),{day})");
        format!("(REPLACE(CONVERT(char(23),{time},121),' ','T')+'Z')")
    } else {
        format!("to_char(arrow_cast({start},'Timestamp(Millisecond, None)'),'%Y-%m-%dT%H:%M:%S%.3fZ')")
    }
}

fn bin_expression(source: &str, size: f64) -> String {
    let width = format!("{size:e}");
    let (mantissa, exponent) = width.split_once('e').unwrap();
    let places = mantissa.split_once('.').map_or(0, |(_, digits)| digits.len() as i32)
        - exponent.parse::<i32>().unwrap();
    let nearest = format!("ROUND({source}/{width},0)");
    // Reconstruct decimal boundaries from an integer coefficient. For instance,
    // 3 / 10 compares equal to imported 0.3, while 3 * 0.1 rounds above it.
    let boundary = |index: &str| {
        if (1..=308).contains(&places) {
            let coefficient = mantissa.replace('.', "");
            format!("(({index})*{coefficient}e0/1e{places})")
        } else {
            format!("(({index})*{width})")
        }
    };
    let candidate = boundary(&nearest);
    let previous = boundary(&format!("{nearest}-1"));
    // If the entire interval is below half the spacing of adjacent f64s,
    // its lower edge rounds to the input. Avoid overflowing the quotient.
    format!("(CASE WHEN ABS({source})*5e-17 >= {width} THEN {source} WHEN {source} < {candidate} THEN {previous} ELSE {candidate} END)")
}
#[derive(Clone, PartialEq, Eq, Deserialize)]
pub struct MonthComparison {
    pub month: Field,
    pub mode: MonthMode,
}
#[derive(Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MonthMode {
    Previous,
    Change,
}
#[derive(Clone, PartialEq, Eq, Deserialize)]
pub struct Metric {
    pub field: Field,
    pub op: String,
    pub denominator: Option<Field>,
    pub comparison: Option<MonthComparison>,
    #[serde(default, rename = "removeFilters")]
    pub remove_filters: Vec<Field>,
    #[serde(default, rename = "denominatorRemoveFilters")]
    pub denominator_remove_filters: Vec<Field>,
    pub tree: Option<Box<MeasureExpression>>,
}
#[derive(Clone, PartialEq, Eq, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum MeasureExpression {
    Text { value: Option<String> },
    Selected { text: bool, fallback: Metric },
    Concat { left: Metric, right: Metric },
    Literal {
        number: Option<serde_json::Number>,
    },
    If {
        test: LogicalTest,
        yes: Metric,
        no: Metric,
    },
    Sumx {
        group: Field,
        value: Metric,
    },
    Rowsum {
        value: Metric,
    },
    Add {
        left: Metric,
        right: Metric,
    },
    Multiply {
        left: Metric,
        right: Metric,
    },
    Divide {
        left: Metric,
        right: Metric,
    },
    Subtract {
        left: Metric,
        right: Metric,
    },
    Value {
        value: Metric,
        #[serde(default)]
        filters: Vec<Filter>,
    },
}
#[derive(Clone, PartialEq, Eq, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum LogicalTest {
    Isblank {
        value: Metric,
    },
    Truthy {
        value: Metric,
    },
    Compare {
        left: Metric,
        right: Metric,
        op: ScalarComparison,
    },
}
#[derive(Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ScalarComparison {
    Eq,
    Strict,
    Ne,
    Gt,
    Lt,
    Gte,
    Lte,
}

impl MeasureExpression {
    pub fn operands(&self) -> Vec<&Metric> {
        match self {
            Self::Literal { .. } | Self::Text { .. } => vec![],
            Self::Selected { fallback, .. } => vec![fallback],
            Self::Value { value, .. } | Self::Sumx { value, .. } | Self::Rowsum { value } => vec![value],
            Self::Concat { left, right } | Self::Divide { left, right } | Self::Subtract { left, right }
            | Self::Add { left, right } | Self::Multiply { left, right } => vec![left, right],
            Self::If { test, yes, no } => match test {
                LogicalTest::Isblank { value } | LogicalTest::Truthy { value } => {
                    vec![value, yes, no]
                }
                LogicalTest::Compare { left, right, .. } => vec![left, right, yes, no],
            },
        }
    }
}
impl Metric {
    fn replacements(&self) -> &[Filter] {
        match self.tree.as_deref() {
            Some(MeasureExpression::Value { filters, .. }) => filters,
            _ => &[],
        }
    }
    fn modifies_scope(&self) -> bool {
        !self.remove_filters.is_empty() || !self.replacements().is_empty()
    }
}
#[derive(Clone, PartialEq, Eq, Deserialize)]
pub struct Filter {
    pub field: Field,
    pub value: Value,
    pub op: Option<String>,
    pub tuple: Option<String>,
}
#[derive(Clone, Deserialize)]
pub struct MeasureRule {
    metric: Metric,
    op: String,
    value: Option<f64>,
}
#[derive(Clone, Deserialize)]
pub struct MeasureScope {
    groups: Vec<Field>,
    metrics: Vec<Metric>,
    filters: Vec<Filter>,
    rules: Vec<MeasureRule>,
    #[serde(default, rename = "showEmpty")]
    show_empty: bool,
}
#[derive(Clone, Deserialize)]
pub struct ColumnOrder {
    pub column: usize,
    pub descending: bool,
}
#[derive(Clone, Deserialize)]
pub struct Visual {
    // Restrict the displayed grouping tuples after measure and calendar calculations.
    #[serde(default, rename = "visibleMembers")]
    visible_members: Option<Vec<Vec<Value>>>,
    #[serde(default, rename = "measureScope")]
    measure_scope: Option<MeasureScope>,
    #[serde(skip)]
    eligible: Option<(Vec<Field>, String)>,
    // Internal projection for grouping daily calendar rows into whole months.
    #[serde(skip)]
    month_bucket: Option<usize>,
    pub groups: Vec<Field>,
    #[serde(default, rename = "showEmpty")]
    pub show_empty: bool,
    pub metrics: Vec<Metric>,
    #[serde(default, rename = "formatMetrics")]
    format_metrics: Vec<Metric>,
    pub filters: Vec<Filter>,
    pub limit: usize,
    #[serde(default)]
    pub offset: usize,
    #[serde(default)]
    pub order: Option<String>,
    #[serde(default, rename = "sortColumn")]
    pub sort_column: Option<usize>,
    #[serde(default, rename = "rankBy")]
    rank_by: Option<Metric>,
    #[serde(default, rename = "rankCutoff")]
    rank_cutoff: Option<usize>,
    #[serde(default, rename = "thenBy")]
    pub then_by: Vec<ColumnOrder>,
    #[serde(default, rename = "utcSortColumns")]
    utc_sort_columns: BTreeSet<usize>,
}
#[derive(Deserialize)]
pub struct Request {
    pub tables: Vec<String>,
    pub links: Vec<Link>,
    #[serde(default)]
    pub calculations: Vec<Calculation>,
    pub visuals: Vec<Visual>,
}

pub fn column<'a>(
    tables: &'a HashMap<String, Table>,
    f: &Field,
) -> Result<&'a crate::storage::Column> {
    tables
        .get(&f.t)
        .and_then(|t| t.columns.get(f.c))
        .ok_or_else(|| AppError("The field is missing from the model.".into()))
}

pub fn raw(tables: &HashMap<String, Table>, f: &Field) -> Result<String> {
    column(tables, f)?;
    Ok(format!("{}.c{}", f.t, f.c))
}

fn filter_literal(value: &Value, numeric: bool, live: bool) -> Result<String> {
    match value {
        Value::Number(n) if numeric => Ok(n.to_string()),
        Value::String(v) if !numeric => Ok(format!(
            "{}'{}'",
            if live { "N" } else { "" },
            v.replace('\'', "''")
        )),
        _ => Err(AppError("Filter value has the wrong type.".into())),
    }
}

// Each column stores its values in selection order. Keeping the columns as
// ordinary field filters lets CALCULATE project away an individual column.
fn tuple_predicate(columns: &[Vec<String>]) -> Result<String> {
    let count = columns[0].len();
    if columns.iter().any(|values| values.len() != count) {
        return Err(AppError(
            "Category selections have different lengths.".into(),
        ));
    }
    if count == 0 {
        return Ok("1=0".into());
    }
    let mut alternatives = Vec::with_capacity(count);
    for i in 0..count {
        let terms:Vec<_>=columns.iter().map(|values|values[i].as_str()).collect();
        alternatives.push(format!("({})", terms.join(" AND ")));
    }
    Ok(format!("({})", alternatives.join(" OR ")))
}

fn dax_comparison(
    column: &str,
    numeric: bool,
    live: bool,
    op: &str,
    value: &Value,
) -> Result<String> {
    let operator = match op {
        "eq" | "strict" => "=",
        "ne" => "<>",
        "gt" => ">",
        "lt" => "<",
        "gte" => ">=",
        "lte" => "<=",
        _ => return Err(AppError("Unsupported comparison in measure filter.".into())),
    };
    if op == "strict" && value.is_null() {
        return Ok(format!("{column} IS NULL"));
    }
    let blank = if numeric { "0" } else { "''" };
    let left = if op == "strict" {
        column.to_owned()
    } else {
        format!("COALESCE({column},{blank})")
    };
    let right = if value.is_null() {
        blank.to_owned()
    } else {
        filter_literal(value, numeric, live)?
    };
    if numeric {
        Ok(format!("{left} {operator} {right}"))
    } else {
        Ok(format!("LOWER({left}) {operator} LOWER({right})"))
    }
}

fn expression(
    tables: &HashMap<String, Table>,
    calcs: &[Calculation],
    f: &Field,
) -> Result<(String, bool)> {
    if let Ok(c) = column(tables, f) {
        return Ok((raw(tables, f)?, c.numeric));
    }
    let c = calcs
        .iter()
        .find(|c| c.field == *f)
        .ok_or_else(|| AppError("Calculated field is missing.".into()))?;
    let table = tables.get(&f.t)
        .ok_or_else(|| AppError("Calculated column table is missing.".into()))?;
    c.validate(table, calcs)?;
    if let Some(months) = c.calendar_months {
        return Ok((calendar_bin_expression(&raw(tables, &c.left)?, months, table.source.is_some()), false));
    }
    if let Some(width) = c.time_bin_ms {
        return Ok((time_bin_expression(&raw(tables,&c.left)?, width, c.week_start, table.source.is_some()), false));
    }
    if let Some(size) = c.bin_size {
        let (a, _) = expression(tables, calcs, &c.left)?;
        return Ok((bin_expression(&a, size), true));
    }
    let a = raw(tables, &c.left)?;
    if c.op == "memberGroups" {
        let quote = |s: &String| filter_literal(&Value::String(s.clone()), false, table.source.is_some());
        let mut sql = "CASE".to_owned();
        for group in &c.groups {
            let values = group.members.iter().flatten().map(quote).collect::<Result<Vec<_>>>()?;
            let mut predicates = Vec::new();
            if !values.is_empty() { predicates.push(format!("{a} IN ({})",values.join(","))); }
            if group.members.contains(&None) { predicates.push(format!("{a} IS NULL")); }
            sql += &format!(" WHEN {} THEN {}", predicates.join(" OR "),quote(&group.name)?);
        }
        let other = c.other_label.as_ref().map(quote).transpose()?.unwrap_or(a);
        return Ok((format!("{sql} ELSE {other} END"),false));
    }
    let b = raw(tables, c.right.as_ref().unwrap())?;
    let expr = match c.op.as_str() {
        "+" | "-" | "*" => format!("({a} {} {b})", c.op),
        "/" => format!("({a}/NULLIF({b},0))"),
        _ => return Err(AppError("Unknown calculation.".into())),
    };
    Ok((expr, true))
}

// Choose the closest common fact table. Follow only many-to-one edges so a dimension
// lookup cannot multiply fact rows. Unmatched keys contribute to the blank group.
fn joins(
    tables: &HashMap<String, Table>,
    links: &[Link],
    needed: &BTreeSet<String>,
    grain: Option<&str>,
) -> Result<String> {
    let mut choices = Vec::new();
    for root in tables.keys() {
        if grain.is_some_and(|t| t != root) {
            continue;
        }
        let mut parents = HashMap::new();
        let mut queue = vec![root.as_str()];
        while let Some(next) = queue.pop() {
            for link in links.iter().filter(|l| l.many.t == next) {
                if &link.one.t == root || parents.insert(link.one.t.as_str(), link).is_some() {
                    return Err(AppError(
                        "Model contains an ambiguous relationship path.".into(),
                    ));
                }
                queue.push(&link.one.t);
            }
        }
        if !needed
            .iter()
            .all(|t| t == root || parents.contains_key(t.as_str()))
        {
            continue;
        }
        let mut active = HashSet::new();
        let mut sql = root.clone();
        for target in needed {
            let mut path = Vec::new();
            let mut cur = target.as_str();
            while let Some(link) = parents.get(cur) {
                path.push(*link);
                cur = &link.many.t;
            }
            for link in path.into_iter().rev() {
                if active.insert(&link.one.t) {
                    sql += &format!(
                        " LEFT JOIN {} ON {} = {}",
                        link.one.t,
                        raw(tables, &link.one)?,
                        raw(tables, &link.many)?
                    );
                }
            }
        }
        choices.push((active.len(), sql));
    }
    choices.sort();
    if choices.len() > 1 && choices[0].0 == choices[1].0 {
        return Err(AppError(
            "Choose a field from the fact table to disambiguate this visual.".into(),
        ));
    }
    choices
        .into_iter()
        .next()
        .map(|(_, s)| s)
        .ok_or_else(|| AppError("Connect these tables in Model view.".into()))
}

fn aggregate(
    tables: &HashMap<String, Table>,
    links: &[Link],
    calcs: &[Calculation],
    v: &Visual,
    member_joins: Option<String>,
) -> Result<String> {
    let live = tables.values().any(|t| t.source.is_some());
    let mut fields = BTreeSet::new();
    let mut select = Vec::new();
    let mut groups = Vec::new();
    for (index, f) in v.groups.iter().enumerate() {
        let (mut s, _) = expression(tables, calcs, f)?;
        if v.month_bucket == Some(index) {
            s = if live {
                format!(
                    "CONVERT(char(7),TRY_CONVERT(date,CASE WHEN LEN({s})=7 THEN CONCAT({s},'-01') ELSE {s} END,23),126)"
                )
            } else {
                format!(
                    "to_char(TRY_CAST(CASE WHEN character_length({s})=7 THEN concat({s},'-01') ELSE {s} END AS DATE),'%Y-%m')"
                )
            };
        }
        fields.insert(f.t.clone());
        groups.push(s.clone());
        select.push(s);
    }
    for m in &v.metrics {
        fields.insert(m.field.t.clone());
        let (s, numeric) = expression(tables, calcs, &m.field)?;
        let expr = match m.op.as_str() {
            "rowsum" => {
                let Some(MeasureExpression::Rowsum { value })=m.tree.as_deref() else {
                    return Err(AppError("Missing SUMX row expression.".into()));
                };
                let float=if live { "FLOAT" } else { "DOUBLE" };
                format!("SUM({})",row_value_sql(value,&m.field.t,tables,calcs,float)?)
            }
            "count" => format!("COUNT({s})"),
            "selectedtext" if !numeric => format!("MIN({s})"),
            "selectednumber" if numeric => format!("MIN({s})"),
            "countrows" => "NULLIF(COUNT(*),0)".into(),
            "distinctcount" => format!(
                "CASE WHEN COUNT(*)=0 THEN NULL ELSE COUNT(DISTINCT {s}) + CASE WHEN COUNT(*)>COUNT({s}) THEN 1 ELSE 0 END END"
            ),
            "sum" | "avg" | "min" | "max" if numeric => format!("{}({s})", m.op),
            "median" | "p90" if numeric => s,
            "ratio" if numeric => {
                let f = m
                    .denominator
                    .as_ref()
                    .ok_or_else(|| AppError("Choose a denominator.".into()))?;
                if f.t != m.field.t {
                    return Err(AppError("Ratio components must share a fact table.".into()));
                }
                let (d, num) = expression(tables, calcs, f)?;
                if !num {
                    return Err(AppError("Denominator must be numeric.".into()));
                }
                format!("SUM({s})/NULLIF(SUM({d}),0)")
            }
            _ => {
                return Err(AppError(
                    "Choose an aggregation supported by this field.".into(),
                ));
            }
        };
        select.push(expr);
    }
    if select.is_empty() {
        return Err(AppError("Add a field to this visual.".into()));
    }
    let mut predicates = Vec::new();
    let mut tuples = BTreeMap::<&str, Vec<Vec<String>>>::new();
    for filter in &v.filters {
        fields.insert(filter.field.t.clone());
        let (s, num) = expression(tables, calcs, &filter.field)?;
        if matches!(filter.op.as_deref(), None | Some("eq"))
            && let Some(key) = filter.value.as_str()
            && column(tables, &filter.field).is_err()
            && let Some(calc) = calcs.iter().find(|c| c.field == filter.field)
            && let Some((lower, upper)) = time_bin_bounds(calc, key)
        {
            let stamp = utc_milliseconds(&raw(tables, &calc.left)?, live);
            predicates.push(format!("({stamp} >= {lower} AND {stamp} < {upper})"));
            continue;
        }
        if filter.op.as_deref() == Some("tuple") {
            let id = filter
                .tuple
                .as_deref()
                .ok_or_else(|| AppError("Missing category selection ID.".into()))?;
            let values = filter
                .value
                .as_array()
                .ok_or_else(|| AppError("Choose category values.".into()))?;
            let bin=calcs.iter().find(|c| c.field==filter.field && c.op=="timeBin");
            let mut terms=Vec::with_capacity(values.len());
            for value in values {
                let term=if value.is_null() {
                    format!("{s} IS NULL")
                } else if let Some(calc)=bin
                    && let Some((lower,upper))=value.as_str().and_then(|key|time_bin_bounds(calc,key)) {
                    let stamp=utc_milliseconds(&raw(tables,&calc.left)?,live);
                    format!("({stamp}>={lower} AND {stamp}<{upper})")
                } else {
                    format!("{s}={}",filter_literal(value,num,live)?)
                };
                terms.push(term);
            }
            // The exact tuple expression below can span multiple tables. Expose
            // its date range separately so the engine can prune the calendar
            // before joining it to a large fact table.
            if bin.is_some() && !terms.is_empty() {
                let ranges=terms.iter().map(String::as_str).collect::<BTreeSet<_>>().into_iter().collect::<Vec<_>>();
                predicates.push(format!("({})",ranges.join(" OR ")));
            }
            tuples.entry(id).or_default().push(terms);
            continue;
        }
        if let Some(operator) = filter.op.as_deref().and_then(|op| op.strip_prefix("dax_")) {
            predicates.push(dax_comparison(&s, num, live, operator, &filter.value)?);
            continue;
        }
        let scalar = |value: &Value| filter_literal(value, num, live);
        if filter.op.as_deref() == Some("contains") {
            if num {
                return Err(AppError("Choose a text column to search.".into()));
            }
            let needle = scalar(&filter.value)?;
            let matches = if live {
                format!("CHARINDEX(LOWER({needle}),LOWER({s})) > 0")
            } else {
                format!("contains(LOWER({s}),LOWER({needle}))")
            };
            let term=filter.value.as_str().unwrap_or_default().to_lowercase();
            predicates.push(if "(blank)".contains(&term) {
                format!("({matches} OR {s} IS NULL)")
            } else { matches });
            continue;
        }
        if filter.op.as_deref() == Some("in") {
            let values = filter
                .value
                .as_array()
                .ok_or_else(|| AppError("Choose filter values.".into()))?;
            let literals = values
                .iter()
                .filter(|v| !v.is_null())
                .map(scalar)
                .collect::<Result<Vec<_>>>()?;
            let mut clauses = Vec::new();
            if !literals.is_empty() {
                clauses.push(format!("{s} IN ({})", literals.join(",")));
            }
            if values.iter().any(Value::is_null) {
                clauses.push(format!("{s} IS NULL"));
            }
            predicates.push(if clauses.is_empty() {
                "1=0".into()
            } else {
                format!("({})", clauses.join(" OR "))
            });
            continue;
        }
        let operator = match filter.op.as_deref() {
            None | Some("eq") => "=",
            Some("gt") => ">",
            Some("lt") => "<",
            Some("gte") => ">=",
            Some("lte") => "<=",
            _ => return Err(AppError("Unsupported filter operator.".into())),
        };
        let literal = match &filter.value {
            Value::Null => {
                predicates.push(format!("{s} IS NULL"));
                continue;
            }
            v => scalar(v)?,
        };
        predicates.push(format!("{s} {operator} {literal}"));
    }
    for columns in tuples.values() {
        predicates.push(tuple_predicate(columns)?);
    }
    let grain = v.metrics.first().map(|m| m.field.t.as_str());
    if v.metrics.iter().any(|m| Some(m.field.t.as_str()) != grain) {
        return Err(AppError(
            "Use values from one fact table per visual.".into(),
        ));
    }
    if member_joins.is_none()
        && let Some((keys, _)) = &v.eligible
    {
        fields.extend(keys.iter().map(|f| f.t.clone()));
    }
    let from = match member_joins {
        Some(from) => from,
        None => {
            let mut from = joins(tables, links, &fields, grain)?;
            if let Some((keys, eligible)) = &v.eligible {
                let mut conditions = Vec::new();
                for (i, field) in keys.iter().enumerate() {
                    let (key, _) = expression(tables, calcs, field)?;
                    conditions.push(format!(
                        "({key} = allowed.v{i} OR ({key} IS NULL AND allowed.v{i} IS NULL))"
                    ));
                }
                let condition = if keys.is_empty() {
                    "1=1".into()
                } else {
                    conditions.join(" AND ")
                };
                from += &format!(" INNER JOIN ({eligible}) allowed ON {condition}");
            }
            from
        }
    };
    let cols = select
        .iter()
        .enumerate()
        .map(|(i, s)| format!("{s} AS v{i}"))
        .collect::<Vec<_>>()
        .join(", ");
    let clause = if predicates.is_empty() {
        String::new()
    } else {
        format!(" WHERE {}", predicates.join(" AND "))
    };
    if v.metrics.len() == 1 && matches!(v.metrics[0].op.as_str(), "median" | "p90") {
        let q = if v.metrics[0].op == "median" {
            "0.5"
        } else {
            "0.9"
        };
        let keys = (0..groups.len())
            .map(|i| format!("v{i}"))
            .collect::<Vec<_>>()
            .join(",");
        let prefix = if keys.is_empty() {
            String::new()
        } else {
            format!("{keys},")
        };
        let partition = if keys.is_empty() {
            String::new()
        } else {
            format!("PARTITION BY {keys}")
        };
        let group_by = if keys.is_empty() {
            String::new()
        } else {
            format!(" GROUP BY {keys}")
        };
        let n = groups.len();
        let raw = format!("SELECT {cols} FROM {from}{clause}");
        let rank = format!(
            "SELECT {prefix}v{n} AS x,ROW_NUMBER() OVER ({partition} ORDER BY v{n}) AS rn, COUNT(*) OVER ({partition}) AS cnt FROM ({raw}) src WHERE v{n} IS NOT NULL"
        );
        let position = format!("(cnt-1)*{q}");
        let lower = format!("MAX(CASE WHEN rn=1+FLOOR({position}) THEN x END)");
        let ceiling = if live { "CEILING" } else { "CEIL" };
        let upper = format!("MAX(CASE WHEN rn=1+{ceiling}({position}) THEN x END)");
        return Ok(format!(
            "SELECT {prefix}{lower}+({upper}-{lower})*MAX({position}-FLOOR({position})) AS v{n} FROM ({rank}) ranked{group_by}"
        ));
    }
    let mut sql = format!("SELECT {cols} FROM {from}{clause}");
    if !groups.is_empty() {
        sql += &format!(" GROUP BY {}", groups.join(","));
    }
    Ok(sql)
}

fn previous_month(live: bool, month: &str) -> String {
    if live {
        format!("CONVERT(char(7),DATEADD(month,-1,TRY_CONVERT(date,CONCAT({month},'-01'),23)),126)")
    } else {
        format!("to_char(TRY_CAST(concat({month},'-01') AS DATE) - INTERVAL '1 month','%Y-%m')")
    }
}

// Shift the calendar part of each eligible tuple along with its other keys.
// Two months can qualify different sites even within the same matrix subtotal.
fn historical_eligibility(
    tables: &HashMap<String, Table>,
    links: &[Link],
    calcs: &[Calculation],
    v: &Visual,
    month: &Field,
) -> Result<Option<(Vec<Field>, String)>> {
    let Some((keys, eligible)) = &v.eligible else {
        return Ok(None);
    };
    if !keys.iter().any(|f| f.t == month.t) {
        return Ok(v.eligible.clone());
    }
    let mut dates = v.clone();
    dates.eligible = None;
    dates.metrics.clear();
    dates.filters.retain(|f| f.field.t == month.t);
    dates.groups.clear();
    let mut on = Vec::new();
    let mut kept = Vec::new();
    let mut columns = Vec::new();
    for (i, key) in keys.iter().enumerate() {
        if key.t == month.t {
            let j = dates.groups.len();
            on.push(format!(
                "(allowed.v{i}=dates.v{j} OR (allowed.v{i} IS NULL AND dates.v{j} IS NULL))"
            ));
            dates.groups.push(key.clone());
        } else {
            columns.push(format!("allowed.v{i} AS v{}", kept.len()));
            kept.push(key.clone());
        }
    }
    let n = dates.groups.len();
    dates.groups.push(month.clone());
    dates.month_bucket = Some(n);
    let current_dates = aggregate(tables, links, calcs, &dates, None)?;
    dates.groups = vec![month.clone(), month.clone()];
    dates.filters.clear();
    dates.month_bucket = Some(1);
    let past_dates = aggregate(tables, links, calcs, &dates, None)?;
    columns.push(format!("past_dates.v0 AS v{}", kept.len()));
    kept.push(month.clone());
    let shifted = previous_month(tables[&month.t].source.is_some(), &format!("dates.v{n}"));
    let sql = format!(
        "SELECT DISTINCT {} FROM ({eligible}) allowed INNER JOIN ({current_dates}) dates ON {} INNER JOIN ({past_dates}) past_dates ON past_dates.v1={shifted}",
        columns.join(","),
        on.join(" AND ")
    );
    Ok(Some((kept, sql)))
}

// Resolve the visible month from the calendar independently of fact availability.
fn monthly(
    tables: &HashMap<String, Table>,
    links: &[Link],
    calcs: &[Calculation],
    v: &Visual,
    comparison: &MonthComparison,
) -> Result<String> {
    let month = &comparison.month;
    if column(tables, month)?.numeric || !links.iter().any(|link| link.one.t == month.t) {
        return Err(AppError(
            "Choose an ISO date or month field from a related calendar table.".into(),
        ));
    }
    let mut current = v.clone();
    current.metrics[0].comparison = None;
    let current_sql = unpaged(tables, links, calcs, &current)?;
    let mut calendar = current.clone();
    calendar.eligible = projected_eligibility(v, |f| f.t == month.t);
    calendar.metrics.clear();
    calendar.groups.retain(|f| f.t == month.t);
    calendar.filters.retain(|f| f.field.t == month.t);
    let calendar_groups = calendar.groups.clone();
    let month_index = calendar.groups.len();
    calendar.groups.push(month.clone());
    calendar.month_bucket = Some(month_index);
    let distinct = aggregate(tables, links, calcs, &calendar, None)?;
    let keys = |n: usize| (0..n).map(|i| format!("v{i}")).collect::<Vec<_>>();
    let calendar_keys = keys(calendar_groups.len());
    let mut scope_columns = calendar_keys.clone();
    scope_columns.push(format!("MIN(v{month_index}) AS anchor_month"));
    let scope = format!(
        "SELECT {} FROM ({distinct}) distinct_months{} HAVING COUNT(*)=1",
        scope_columns.join(","),
        group_by(&calendar_keys)
    );
    let mut history = current.clone();
    history.eligible = historical_eligibility(tables, links, calcs, v, month)?;
    history.groups.retain(|f| f.t != month.t);
    history.filters.retain(|f| f.field.t != month.t);
    let noncalendar = history.groups.clone();
    history.month_bucket = Some(history.groups.len());
    history.groups.push(month.clone());
    let past = unpaged(tables, links, calcs, &history)?;
    let shifted = previous_month(tables[&month.t].source.is_some(), "scope.anchor_month");
    let mut columns = Vec::new();
    for (i, f) in v.groups.iter().enumerate() {
        let (side, fields) = if f.t == month.t {
            ("scope", &calendar_groups)
        } else {
            ("past", &noncalendar)
        };
        let j = fields
            .iter()
            .position(|key| key == f)
            .ok_or_else(|| AppError("Missing comparison group.".into()))?;
        columns.push(format!("{side}.v{j} AS v{i}"));
    }
    let n = v.groups.len();
    columns.push("NULL AS current_value".into());
    columns.push(format!("past.v{} AS previous_value", history.groups.len()));
    let previous = format!(
        "SELECT {} FROM ({scope}) scope JOIN ({past}) past ON past.v{}={shifted}",
        columns.join(","),
        noncalendar.len()
    );
    let output_keys = keys(n);
    let mut now = output_keys.clone();
    now.extend([
        format!("v{n} AS current_value"),
        "NULL AS previous_value".into(),
    ]);
    let expr = match comparison.mode {
        MonthMode::Previous => "MAX(previous_value)",
        MonthMode::Change => "MAX(current_value)-MAX(previous_value)",
    };
    let mut output = output_keys.clone();
    output.push(format!("{expr} AS v{n}"));
    Ok(format!(
        "SELECT {} FROM (SELECT {} FROM ({current_sql}) current_rows UNION ALL {previous}) periods{}",
        output.join(","),
        now.join(","),
        group_by(&output_keys)
    ))
}

// The outer visual determines which labels are visible. Evaluate the operand
// at the remaining grouping grain, then attach it to each visible tuple.
fn cleared_aggregate(
    tables: &HashMap<String, Table>,
    links: &[Link],
    calcs: &[Calculation],
    v: &Visual,
) -> Result<String> {
    let removed = &v.metrics[0].remove_filters;
    for field in removed {
        expression(tables, calcs, field)?;
    }
    let replacements = v.metrics[0].replacements();
    let keep = |f: &Field| !removed.contains(f) && !replacements.iter().any(|p| p.field == *f);
    let mut scope = v.clone();
    scope.filters.retain(|f| keep(&f.field));
    scope.filters.extend_from_slice(replacements);
    scope.groups.retain(keep);
    scope.month_bucket = v.month_bucket.and_then(|month| {
        keep(&v.groups[month]).then(|| v.groups[..month].iter().filter(|f| keep(f)).count())
    });
    if v.eligible
        .as_ref()
        .is_some_and(|(keys, _)| keys.iter().any(|f| !keep(f)))
    {
        scope.eligible = projected_eligibility(v, keep);
    }
    let values = if let Some(MeasureExpression::Value { value, .. }) = v.metrics[0].tree.as_deref()
    {
        scope.metrics = vec![value.clone()];
        unpaged(tables, links, calcs, &scope)?
    } else {
        aggregate(tables, links, calcs, &scope, None)?
    };
    if v.groups.is_empty()
        || (scope.filters == v.filters && scope.groups == v.groups && scope.eligible == v.eligible)
    {
        return Ok(format!(
            "SELECT calculated.*,1 AS observed FROM ({values}) calculated"
        ));
    }
    let n = v.groups.len();
    let keys = (0..n)
        .map(|i| format!("v{i}"))
        .collect::<Vec<_>>()
        .join(",");
    let mut domain = v.clone();
    domain.metrics[0].op = "countrows".into();
    let facts = aggregate(tables, links, calcs, &domain, None)?;
    let mut members = format!("SELECT {keys},1 AS observed FROM ({facts}) current_facts");
    if v.eligible.is_none()
        && let Some(related) = member_domain(tables, links, calcs, v, true)?
    {
        members = format!(
            "SELECT {keys},MAX(observed) AS observed FROM ({members} UNION ALL SELECT {keys},0 AS observed FROM ({related}) dimension_members) tuples GROUP BY {keys}"
        );
    }
    let mut on = Vec::new();
    for (i, _) in v.groups.iter().enumerate().filter(|(_, f)| keep(f)) {
        let j = on.len();
        on.push(format!(
            "(scope_rows.v{i}=revalued.v{j} OR (scope_rows.v{i} IS NULL AND revalued.v{j} IS NULL))"
        ));
    }
    let join = if on.is_empty() {
        "1=1".into()
    } else {
        on.join(" AND ")
    };
    Ok(format!(
        "SELECT {},revalued.v{} AS v{n},scope_rows.observed FROM ({members}) scope_rows LEFT JOIN ({values}) revalued ON {join}",
        (0..n)
            .map(|i| format!("scope_rows.v{i}"))
            .collect::<Vec<_>>()
            .join(","),
        scope.groups.len()
    ))
}

#[derive(Default, Clone)]
struct FilterContext {
    removed: Vec<Field>,
    filters: Vec<Filter>,
}

impl FilterContext {
    // Inner CALCULATE arguments override the outer context on their columns.
    // Predicates in a single call are applied together.
    fn enter(&self, removed: &[Field], filters: &[Filter]) -> Self {
        let keep = |f: &Field| !removed.contains(f) && !filters.iter().any(|p| p.field == *f);
        Self {
            removed: self
                .removed
                .iter()
                .filter(|f| keep(f))
                .chain(removed)
                .cloned()
                .collect(),
            filters: self
                .filters
                .iter()
                .filter(|p| keep(&p.field))
                .chain(filters)
                .cloned()
                .collect(),
        }
    }

    fn apply(&self, mut metric: Metric) -> Metric {
        if self.filters.is_empty() && self.removed.is_empty() {
            return metric;
        }
        if self.filters.is_empty() && metric.comparison.is_none() && metric.tree.is_none() {
            metric.remove_filters = self.removed.clone();
            return metric;
        }
        Metric {
            field: metric.field.clone(),
            op: "formula".into(),
            denominator: None,
            comparison: None,
            remove_filters: self.removed.clone(),
            denominator_remove_filters: Vec::new(),
            tree: Some(Box::new(MeasureExpression::Value {
                value: metric,
                filters: self.filters.clone(),
            })),
        }
    }
}

fn binary_value_sql(tree:&MeasureExpression,a:&str,b:&str,float_type:&str)->Result<String> {
    if a.len()+b.len()>256*1024 {return Err(AppError("The arithmetic expression is too large to evaluate.".into()));}
    Ok(match tree {
        MeasureExpression::Divide {..}=>format!("(CAST({a} AS {float_type})/NULLIF({b},0))"),
        MeasureExpression::Multiply {..}=>format!("(CAST({a} AS {float_type})*CAST({b} AS {float_type}))"),
        MeasureExpression::Add {..}=>format!("COALESCE(CAST({a} AS {float_type})+CAST({b} AS {float_type}),{a},{b})"),
        MeasureExpression::Subtract {..}=>format!("COALESCE(CAST({a} AS {float_type})-CAST({b} AS {float_type}),{a},-CAST({b} AS {float_type}))"),
        _=>return Err(AppError("Unknown binary arithmetic operator.".into())),
    })
}

fn condition_sql<'a>(test:&'a LogicalTest,mut sql:impl FnMut(&'a Metric)->Result<String>)->Result<String>{
    Ok(match test {
        LogicalTest::Isblank { value } => format!("{} IS NULL",sql(value)?),
        LogicalTest::Truthy { value } => format!("{} <> 0",sql(value)?),
        LogicalTest::Compare { left,right,op } => {
            let a=sql(left)?;
            let b=sql(right)?;
            let operator=match op {
                ScalarComparison::Strict=>return Ok(format!("({a}={b} OR ({a} IS NULL AND {b} IS NULL))")),
                ScalarComparison::Eq=>"=",ScalarComparison::Ne=>"<>",ScalarComparison::Gt=>">",
                ScalarComparison::Lt=>"<",ScalarComparison::Gte=>">=",ScalarComparison::Lte=>"<=",
            };
            format!("COALESCE({a},0){operator}COALESCE({b},0)")
        }
    })
}

fn row_value_sql(m:&Metric,table:&str,tables:&HashMap<String,Table>,calcs:&[Calculation],float_type:&str)->Result<String> {
    let operand=|value:&Metric| row_value_sql(value,table,tables,calcs,float_type);
    match m.tree.as_deref() {
        None if m.op=="row" && m.field.t==table=>{
            let (value,numeric)=expression(tables,calcs,&m.field)?;
            if !numeric {return Err(AppError("SUMX requires a numeric row column.".into()));}
            Ok(format!("CAST({value} AS {float_type})"))
        }
        Some(MeasureExpression::Literal{number})=>Ok(format!("CAST({} AS {float_type})",number.as_ref().map_or_else(||"NULL".into(),ToString::to_string))),
        Some(MeasureExpression::If{test,yes,no})=>{
            let condition=condition_sql(test,operand)?;
            Ok(format!("(CASE WHEN {condition} THEN {} ELSE {} END)",operand(yes)?,operand(no)?))
        }
        Some(tree @ (MeasureExpression::Add{left,right}|MeasureExpression::Subtract{left,right}|
            MeasureExpression::Multiply{left,right}|MeasureExpression::Divide{left,right}))=>{
            binary_value_sql(tree,&operand(left)?,&operand(right)?,float_type)
        }
        _=>Err(AppError("Choose numeric columns from the SUMX iterator table.".into())),
    }
}

fn measure_sql(
    m: &Metric,
    leaves: &mut Vec<Metric>,
    float_type: &str,
    outer: &FilterContext,
) -> Result<String> {
    let mut intern = |metric: Metric| {
        let i = leaves.iter().position(|m| m == &metric).unwrap_or_else(|| {
            leaves.push(metric);
            leaves.len() - 1
        });
        format!("MAX(a{i})")
    };
    if m.comparison.is_none()
        && let Some(tree) = m.tree.as_deref()
    {
        let context = outer.enter(&m.remove_filters, m.replacements());
        let live = float_type == "FLOAT";
        let text_type = if live { "NVARCHAR(MAX)" } else { "VARCHAR" };
        let (left, right) = match tree {
            MeasureExpression::Text { value } => {
                let text = match value {
                    Some(s) => filter_literal(&Value::String(s.clone()), false, live)?,
                    None => "NULL".to_owned(),
                };
                return Ok(format!("CAST({text} AS {text_type})"));
            }
            MeasureExpression::Selected { text, fallback } => {
                let mut leaf = m.clone();
                leaf.tree = None;
                leaf.remove_filters.clear();
                leaf.op = "distinctcount".into();
                let count = intern(context.apply(leaf.clone()));
                leaf.op = if *text { "selectedtext" } else { "selectednumber" }.into();
                let member = intern(context.apply(leaf));
                let alternate = measure_sql(fallback, leaves, float_type, &context)?;
                let dtype = if *text { text_type } else { float_type };
                return Ok(format!("(CASE WHEN {count}=1 THEN {member} ELSE CAST({alternate} AS {dtype}) END)"));
            }
            MeasureExpression::Concat { left, right } => {
                let a = measure_sql(left, leaves, float_type, &context)?;
                let b = measure_sql(right, leaves, float_type, &context)?;
                if a.len()+b.len() > 256*1024 {return Err(AppError("The caption expression is too large.".into()));}
                return Ok(format!("CONCAT(COALESCE({a},''),COALESCE({b},''))"));
            }
            MeasureExpression::Sumx { .. } | MeasureExpression::Rowsum { .. } => {
                let mut leaf = m.clone();
                leaf.remove_filters.clear();
                return Ok(intern(context.apply(leaf)));
            }
            MeasureExpression::Literal { number } => {
                let literal = number
                    .as_ref()
                    .map_or_else(|| "NULL".to_owned(), ToString::to_string);
                return Ok(format!("CAST({literal} AS {float_type})"));
            }
            MeasureExpression::If { test, yes, no } => {
                let mut sql = |operand| measure_sql(operand, leaves, float_type, &context);
                let condition = condition_sql(test, |m| sql(m))?;
                return Ok(format!(
                    "(CASE WHEN {condition} THEN {} ELSE {} END)",
                    sql(yes)?,
                    sql(no)?
                ));
            }
            MeasureExpression::Value { value, .. } => {
                return measure_sql(value, leaves, float_type, &context);
            }
            MeasureExpression::Divide { left, right }
            | MeasureExpression::Add { left, right }
            | MeasureExpression::Multiply { left, right }
            | MeasureExpression::Subtract { left, right } => (left, right),
        };
        let a = measure_sql(left, leaves, float_type, &context)?;
        let b = measure_sql(right, leaves, float_type, &context)?;
        return binary_value_sql(tree,&a,&b,float_type);
    }
    let sql = if m.comparison.is_none()
        && matches!(m.op.as_str(), "ratio" | "difference" | "variance_pct")
    {
        let rhs = m
            .denominator
            .clone()
            .ok_or_else(|| AppError("Choose a comparison field.".into()))?;
        let mut sum = |field: Field, removed: &[Field]| {
            intern(outer.enter(removed, &[]).apply(Metric {
                field,
                op: "sum".into(),
                denominator: None,
                comparison: None,
                remove_filters: Vec::new(),
                denominator_remove_filters: Vec::new(),
                tree: None,
            }))
        };
        let a = sum(m.field.clone(), &m.remove_filters);
        let b = sum(rhs, &m.denominator_remove_filters);
        let delta = format!(
            "(CASE WHEN {a} IS NULL AND {b} IS NULL THEN NULL ELSE COALESCE({a},0)-COALESCE({b},0) END)"
        );
        match m.op.as_str() {
            "ratio" => format!("{a}/NULLIF({b},0)"),
            "difference" => delta,
            _ => format!("{delta}/NULLIF({b},0)"),
        }
    } else {
        if m.comparison.is_some() {
            intern(outer.apply(m.clone()))
        } else {
            let mut leaf = m.clone();
            leaf.remove_filters.clear();
            intern(outer.enter(&m.remove_filters, &[]).apply(leaf))
        }
    };
    Ok(sql)
}

fn changes_filter_context(m: &Metric) -> bool {
    if m.modifies_scope() || !m.denominator_remove_filters.is_empty() {
        return true;
    }
    m.tree
        .as_deref()
        .is_some_and(|tree| tree.operands().into_iter().any(changes_filter_context))
}

fn uses_scalar_branch(m: &Metric) -> bool {
    m.tree.as_deref().is_some_and(|tree| {
        if matches!(tree,MeasureExpression::Rowsum { .. }) {return false;}
        matches!(
            tree,
            MeasureExpression::If { .. } | MeasureExpression::Literal { .. } | MeasureExpression::Text { .. } | MeasureExpression::Selected { .. }
        ) || tree.operands().into_iter().any(uses_scalar_branch)
    })
}

fn group_by(keys: &[String]) -> String {
    if keys.is_empty() {
        String::new()
    } else {
        format!(" GROUP BY {}", keys.join(","))
    }
}

// Aggregate each operand at its native grain, then align aggregate rows by
// shared dimension keys. A one-sided group survives the union.
fn combine(
    tables: &HashMap<String, Table>,
    links: &[Link],
    calcs: &[Calculation],
    v: &Visual,
) -> Result<String> {
    let n = v.groups.len();
    let keys = (0..n).map(|i| format!("v{i}")).collect::<Vec<_>>();
    let mut leaves = Vec::new();
    let mut columns = keys.clone();
    let scalar = v.metrics.iter().any(uses_scalar_branch);
    let check_empty =
        n > 0 && !v.show_empty && (scalar || v.metrics.iter().any(changes_filter_context));
    let mut visible = vec!["MAX(observed)=1".to_owned()];
    for (i, m) in v.metrics.iter().enumerate() {
        let float_type = if tables.get(&m.field.t).is_some_and(|t| t.source.is_some()) {
            "FLOAT"
        } else {
            "DOUBLE"
        };
        let expr = measure_sql(m, &mut leaves, float_type, &FilterContext::default())?;
        columns.push(format!("{expr} AS v{}", n + i));
        if check_empty {
            visible.push(format!("{expr} IS NOT NULL"));
        }
    }
    let mut parts = Vec::new();
    // Constants and blank tests may return a value for a lookup member with no fact rows.
    if scalar
        && n > 0
        && let Some(domain) = scalar_member_domain(tables, links, calcs, v)?
    {
        let mut cols = keys.clone();
        if check_empty {
            cols.push("0 AS observed".into());
        }
        cols.extend((0..leaves.len()).map(|i| format!("NULL AS a{i}")));
        parts.push(format!("SELECT {} FROM ({domain}) members", cols.join(",")));
    }
    if leaves.is_empty() && n == 0 {
        return Ok(format!("SELECT {}", columns.join(",")));
    }
    for (idx, leaf) in leaves.iter().enumerate() {
        let mut spec = v.clone();
        spec.metrics = vec![leaf.clone()];
        let sub = if let Some(comparison) = &leaf.comparison {
            monthly(tables, links, calcs, &spec, comparison)?
        } else if leaf.modifies_scope() {
            cleared_aggregate(tables, links, calcs, &spec)?
        } else if let Some(MeasureExpression::Sumx { group, value }) = leaf.tree.as_deref() {
            spec.metrics = vec![value.clone()];
            if spec.groups.contains(group)
                && !spec.month_bucket.is_some_and(|i| spec.groups[i] == *group)
            {
                unpaged(tables, links, calcs, &spec)?
            } else {
                spec.groups.push(group.clone());
                let at_member = unpaged(tables, links, calcs, &spec)?;
                let mut columns = keys.clone();
                columns.push(format!("SUM(v{}) AS v{n}", n + 1));
                format!(
                    "SELECT {} FROM ({at_member}) iterator_rows{}",
                    columns.join(","),
                    group_by(&keys)
                )
            }
        } else {
            aggregate(tables, links, calcs, &spec, None)?
        };
        let mut cols = keys.clone();
        if check_empty {
            cols.push(if leaf.comparison.is_none() && leaf.modifies_scope() {
                "observed".into()
            } else {
                "1 AS observed".into()
            });
        }
        for j in 0..leaves.len() {
            cols.push(if j == idx {
                format!("v{n} AS a{j}")
            } else {
                format!("NULL AS a{j}")
            });
        }
        parts.push(format!("SELECT {} FROM ({sub}) operand", cols.join(",")));
    }
    let group = group_by(&keys);
    // An unobserved tuple is visible only when a final measure has a value.
    // A nonblank denominator alone cannot make a blank ratio visible.
    let having = if check_empty {
        format!(" HAVING {}", visible.join(" OR "))
    } else {
        String::new()
    };
    Ok(format!(
        "SELECT {} FROM ({}) aligned{group}{having}",
        columns.join(","),
        parts.join(" UNION ALL ")
    ))
}

fn unpaged(
    tables: &HashMap<String, Table>,
    links: &[Link],
    calcs: &[Calculation],
    v: &Visual,
) -> Result<String> {
    let combined = v.metrics.iter().any(|m| {
        m.tree.is_some()
            || m.comparison.is_some()
            || !m.remove_filters.is_empty()
            || !m.denominator_remove_filters.is_empty()
            || matches!(m.op.as_str(), "difference" | "variance_pct")
            || m.denominator.as_ref().is_some_and(|f| f.t != m.field.t)
    }) || v.metrics.windows(2).any(|m| m[0].field.t != m[1].field.t)
        || (v.metrics.len() > 1
            && v.metrics
                .iter()
                .any(|m| matches!(m.op.as_str(), "median" | "p90")));
    if combined {
        combine(tables, links, calcs, v)
    } else {
        aggregate(tables, links, calcs, v, None)
    }
}

// Start with the first grouping table. Subsequent lookup or detail tables
// extend the existing rows. Never use an unrequested fact as a bridge.
fn member_domain(
    tables: &HashMap<String, Table>,
    links: &[Link],
    calcs: &[Calculation],
    v: &Visual,
    cross_independent: bool,
) -> Result<Option<String>> {
    let mut domain = v.clone();
    domain.metrics.clear();
    let mut allowed = HashSet::new();
    let mut pending: Vec<_> = v.groups.iter().map(|f| f.t.as_str()).collect();
    while let Some(table) = pending.pop() {
        if allowed.insert(table) {
            pending.extend(
                links
                    .iter()
                    .filter(|l| l.many.t == table)
                    .map(|l| l.one.t.as_str()),
            );
        }
    }
    domain
        .filters
        .retain(|f| allowed.contains(f.field.t.as_str()));
    let first = v.groups[0].t.as_str();
    let mut joined = HashSet::from([first]);
    let mut from = first.to_string();
    for target in domain
        .groups
        .iter()
        .chain(domain.filters.iter().map(|f| &f.field))
    {
        if joined.contains(target.t.as_str()) {
            continue;
        }
        let mut queue = VecDeque::from([target.t.as_str()]);
        let mut seen = HashSet::from([target.t.as_str()]);
        let mut back = HashMap::new();
        let mut member = loop {
            let Some(current) = queue.pop_front() else {
                if cross_independent {
                    from += &format!(" CROSS JOIN {}", target.t);
                    joined.insert(target.t.as_str());
                    break target.t.as_str();
                }
                return Ok(None);
            };
            if joined.contains(current) {
                break current;
            }
            for link in links {
                let next = if current == link.one.t {
                    &link.many.t
                } else if current == link.many.t {
                    &link.one.t
                } else {
                    continue;
                };
                if allowed.contains(next.as_str()) && seen.insert(next.as_str()) {
                    back.insert(next.as_str(), (current, link));
                    queue.push_back(next);
                }
            }
        };
        while let Some(&(next, link)) = back.get(member) {
            from += &format!(
                " LEFT JOIN {next} ON {} = {}",
                raw(tables, &link.one)?,
                raw(tables, &link.many)?
            );
            joined.insert(next);
            member = next;
        }
    }
    aggregate(tables, links, calcs, &domain, Some(from)).map(Some)
}

fn scalar_member_domain(
    tables: &HashMap<String, Table>,
    links: &[Link],
    calcs: &[Calculation],
    v: &Visual,
) -> Result<Option<String>> {
    let Some((eligible_keys, eligible)) = &v.eligible else {
        return member_domain(tables, links, calcs, v, true);
    };
    let mut expanded = v.clone();
    let mut on = Vec::new();
    for (j, key) in eligible_keys.iter().enumerate() {
        let i = expanded
            .groups
            .iter()
            .position(|f| f == key)
            .unwrap_or_else(|| {
                expanded.groups.push(key.clone());
                expanded.groups.len() - 1
            });
        on.push(format!(
            "(members.v{i}=allowed.v{j} OR (members.v{i} IS NULL AND allowed.v{j} IS NULL))"
        ));
    }
    let columns = (0..v.groups.len())
        .map(|i| format!("members.v{i}"))
        .collect::<Vec<_>>()
        .join(",");
    let condition = if on.is_empty() {
        "1=1".into()
    } else {
        on.join(" AND ")
    };
    Ok(member_domain(tables,links,calcs,&expanded,true)?.map(|members|
        format!("SELECT DISTINCT {columns} FROM ({members}) members INNER JOIN ({eligible}) allowed ON {condition}")))
}

fn grouped(
    tables: &HashMap<String, Table>,
    links: &[Link],
    calcs: &[Calculation],
    v: &Visual,
) -> Result<String> {
    let mut sql = unpaged(tables, links, calcs, v)?;
    if v.show_empty
        && !v.groups.is_empty()
        && !v.metrics.is_empty()
        && let Some(members) = member_domain(tables, links, calcs, v, false)?
    {
        let keys = (0..v.groups.len())
            .map(|i| format!("v{i}"))
            .collect::<Vec<_>>();
        let members = if let Some((allowed, eligible)) = &v.eligible
            && let Some(columns) = v
                .groups
                .iter()
                .enumerate()
                .map(|(i, f)| {
                    allowed
                        .iter()
                        .position(|key| key == f)
                        .map(|j| format!("v{j} AS v{i}"))
                })
                .collect::<Option<Vec<_>>>()
        {
            format!(
                "SELECT DISTINCT {} FROM ({eligible}) allowed_members",
                columns.join(",")
            )
        } else {
            members
        };
        let mut padding = keys.clone();
        let mut output = keys.clone();
        for i in v.groups.len()..v.groups.len() + v.metrics.len() {
            padding.push(format!("NULL AS v{i}"));
            output.push(format!("MAX(v{i}) AS v{i}"));
        }
        // Union keeps actuals whose missing lookup key produced a blank member.
        sql = format!(
            "SELECT {} FROM (SELECT * FROM ({sql}) facts UNION ALL SELECT {} FROM ({members}) members) padded GROUP BY {}",
            output.join(","),
            padding.join(","),
            keys.join(",")
        );
    }
    Ok(sql)
}

fn filtered_groups(
    tables: &HashMap<String, Table>,
    links: &[Link],
    calcs: &[Calculation],
    v: &Visual,
    scope: &MeasureScope,
    direct: bool,
) -> Result<String> {
    let mut base = v.clone();
    base.groups = scope.groups.clone();
    base.metrics = if direct {
        v.metrics.clone()
    } else {
        scope.metrics.clone()
    };
    base.filters = scope.filters.clone();
    base.show_empty = scope.show_empty;
    let visible = base.groups.len() + if direct { base.metrics.len() } else { 0 };
    let mut tests = Vec::new();
    for rule in &scope.rules {
        let index = base
            .metrics
            .iter()
            .position(|m| m == &rule.metric)
            .unwrap_or_else(|| {
                base.metrics.push(rule.metric.clone());
                base.metrics.len() - 1
            });
        let col = format!("v{}", base.groups.len() + index);
        let test = match rule.op.as_str() {
            "blank" => format!("{col} IS NULL"),
            "present" => format!("{col} IS NOT NULL"),
            op => {
                let operator = match op {
                    "eq" => "=",
                    "ne" => "<>",
                    "lt" => "<",
                    "lte" => "<=",
                    "gt" => ">",
                    "gte" => ">=",
                    _ => return Err(AppError("Unknown measure comparison.".into())),
                };
                let value = rule
                    .value
                    .filter(|n| n.is_finite())
                    .ok_or_else(|| AppError("Enter a finite measure threshold.".into()))?;
                format!("{col} {operator} {value}")
            }
        };
        tests.push(test);
    }
    let projection = if visible == 0 {
        "1 AS qualifies".into()
    } else {
        (0..visible)
            .map(|i| format!("v{i}"))
            .collect::<Vec<_>>()
            .join(",")
    };
    let sql = grouped(tables, links, calcs, &base)?;
    Ok(format!(
        "SELECT {projection} FROM ({sql}) measured WHERE {}",
        tests.join(" AND ")
    ))
}

fn projected_eligibility(
    v: &Visual,
    keep: impl Fn(&Field) -> bool,
) -> Option<(Vec<Field>, String)> {
    let (keys, sql) = v.eligible.as_ref()?;
    let mut fields = Vec::new();
    let mut columns = Vec::new();
    for (i, f) in keys.iter().enumerate().filter(|(_, f)| keep(f)) {
        columns.push(format!("v{i} AS v{}", fields.len()));
        fields.push(f.clone());
    }
    if columns.is_empty() {
        columns.push("1 AS qualifies".into());
    }
    Some((
        fields,
        format!(
            "SELECT DISTINCT {} FROM ({sql}) qualifying",
            columns.join(",")
        ),
    ))
}

fn scoped_groups(
    tables: &HashMap<String, Table>,
    links: &[Link],
    calcs: &[Calculation],
    v: &Visual,
) -> Result<String> {
    let sql = if let Some(scope) = v.measure_scope.as_ref().filter(|s| !s.rules.is_empty()) {
        if v.groups == scope.groups && v.filters == scope.filters {
            filtered_groups(tables, links, calcs, v, scope, true)?
        } else {
            let allowed = filtered_groups(tables, links, calcs, v, scope, false)?;
            let shared = scope
                .groups
                .iter()
                .map(|f| v.groups.iter().position(|g| g == f))
                .collect::<Option<Vec<_>>>();
            if let Some(shared) = shared {
                let sql = grouped(tables, links, calcs, v)?;
                let mut on = shared.iter().enumerate().map(|(i, j)| format!(
                    "(shown.v{j}=allowed.v{i} OR (shown.v{j} IS NULL AND allowed.v{i} IS NULL))"
                )).collect::<Vec<_>>();
                if on.is_empty() {
                    on.push("1=1".into());
                }
                format!(
                    "SELECT shown.* FROM ({sql}) shown INNER JOIN ({allowed}) allowed ON {}",
                    on.join(" AND ")
                )
            } else {
                let mut scoped = v.clone();
                scoped.eligible = Some((scope.groups.clone(), allowed));
                grouped(tables, links, calcs, &scoped)?
            }
        }
    } else {
        grouped(tables, links, calcs, v)?
    };
    Ok(sql)
}

pub fn plan(
    tables: &HashMap<String, Table>,
    links: &[Link],
    calcs: &[Calculation],
    v: &Visual,
) -> Result<String> {
    let live = tables.values().any(|t| t.source.is_some());
    let mut sql = scoped_groups(tables, links, calcs, v)?;
    let hidden_rank = v.rank_by.as_ref();
    if let Some(n) = v.rank_cutoff
        && (!(1..=500).contains(&n)
            || v.groups.is_empty()
            || !matches!(v.order.as_deref(), Some("asc" | "desc")))
    {
        return Err(AppError(
            "Choose a grouped value order and a cutoff from 1 to 500.".into(),
        ));
    }
    if hidden_rank.is_some()
        && (v.groups.is_empty()
            || !matches!(v.order.as_deref(), Some("asc" | "desc"))
            || v.sort_column.is_some())
    {
        return Err(AppError(
            "Choose a ranking direction and grouped data for this measure.".into(),
        ));
    }
    if !v.format_metrics.is_empty() || hidden_rank.is_some() {
        // Displayed metrics establish the eligible categories. Other facts may
        // supply formatting and ranking values without introducing extra rows.
        let mut source = v.clone();
        source.metrics = std::mem::take(&mut source.format_metrics);
        let rank_index = hidden_rank.map(|rank| {
            source
                .metrics
                .iter()
                .position(|m| m == rank)
                .unwrap_or_else(|| {
                    source.metrics.push(rank.clone());
                    source.metrics.len() - 1
                })
        });
        let basis = scoped_groups(tables, links, calcs, &source)?;
        let groups = v.groups.len();
        let metrics = v.metrics.len();
        let mut projection = vec!["shown.*".to_owned()];
        projection.extend(
            (0..v.format_metrics.len())
                .map(|i| format!("basis.v{} AS v{}", groups + i, groups + metrics + i)),
        );
        if let Some(i) = rank_index {
            projection.push(format!("basis.v{} AS rank_value", groups + i));
        }
        let keys = (0..groups)
            .map(|i| {
                format!("(shown.v{i}=basis.v{i} OR (shown.v{i} IS NULL AND basis.v{i} IS NULL))")
            })
            .collect::<Vec<_>>();
        let on = if keys.is_empty() {
            "1=1".into()
        } else {
            keys.join(" AND ")
        };
        sql = format!(
            "SELECT * FROM (SELECT {} FROM ({sql}) shown LEFT JOIN ({basis}) basis ON {on}) formatted",
            projection.join(",")
        );
    }
    if let Some(rows) = &v.visible_members {
        let width = rows.first().map(Vec::len).unwrap_or(0);
        if rows.len() > 500 || width > v.groups.len() || (!rows.is_empty() && width == 0) {
            return Err(AppError("Invalid visible category list.".into()));
        }
        let numeric = v
            .groups
            .iter()
            .take(width)
            .map(|f| expression(tables, calcs, f).map(|(_, n)| n))
            .collect::<Result<Vec<_>>>()?;
        let mut members = Vec::new();
        for row in rows {
            if row.len() != width {
                return Err(AppError("Inconsistent category depth.".into()));
            }
            let mut terms = Vec::new();
            for (i, value) in row.iter().enumerate() {
                terms.push(if value.is_null() {
                    format!("v{i} IS NULL")
                } else {
                    format!("v{i}={}", filter_literal(value, numeric[i], live)?)
                });
            }
            members.push(format!("({})", terms.join(" AND ")));
        }
        let predicate = if members.is_empty() {
            "1=0".into()
        } else {
            members.join(" OR ")
        };
        sql = format!("SELECT * FROM ({sql}) visible_groups WHERE {predicate}");
    }
    if !v.groups.is_empty() {
        let mut terms = Vec::new();
        let mut ranked = HashSet::new();
        match (v.order.as_deref(), v.sort_column) {
            (None | Some("category"), None) if v.then_by.is_empty() => {}
            (Some(direction @ ("desc" | "asc")), column) => {
                let projected = if hidden_rank.is_some() || v.rank_cutoff.is_some() {
                    (0..v.groups.len() + v.metrics.len() + v.format_metrics.len())
                        .map(|i| format!("v{i}"))
                        .collect::<Vec<_>>()
                        .join(",")
                } else {
                    "*".into()
                };
                let primary = (column.unwrap_or(v.groups.len()), direction);
                if hidden_rank.is_some() {
                    terms.push("CASE WHEN rank_value IS NULL THEN 1 ELSE 0 END".into());
                    terms.push(format!("rank_value {direction}"));
                }
                let secondary = v
                    .then_by
                    .iter()
                    .map(|s| (s.column, if s.descending { "desc" } else { "asc" }));
                for (idx, order) in std::iter::once(primary)
                    .filter(|_| hidden_rank.is_none())
                    .chain(secondary)
                {
                    if idx >= v.groups.len() + v.metrics.len() || !ranked.insert(idx) {
                        return Err(AppError(
                            "Select distinct columns on this visual to sort.".into(),
                        ));
                    }
                    terms.push(format!("CASE WHEN v{idx} IS NULL THEN 1 ELSE 0 END"));
                    let column = format!("v{idx}");
                    let sort_key = if v.utc_sort_columns.contains(&idx) {
                        let field = v.groups.get(idx).ok_or_else(|| AppError("Choose a timestamp column to sort.".into()))?;
                        if expression(tables,calcs,field)?.1 {
                            return Err(AppError("Choose a date or timestamp column to sort.".into()));
                        }
                        utc_milliseconds(&column,live)
                    } else { column };
                    terms.push(format!("{sort_key} {order}"));
                }
                if let Some(n) = v.rank_cutoff {
                    // Membership uses only the requested value order. The category
                    // keys below make the display order deterministic within ties.
                    let order_by = terms.join(",");
                    sql = format!(
                        "SELECT {projected} FROM (SELECT scores.*, RANK() OVER (ORDER BY {order_by}) AS cutoff_rank FROM ({sql}) scores) ranked_groups WHERE cutoff_rank <= {n}"
                    );
                } else {
                    sql = format!("SELECT {projected} FROM ({sql}) ranked_groups");
                }
            }
            _ => return Err(AppError("Unsupported visual sort order.".into())),
        }
        terms.extend(
            (0..v.groups.len())
                .filter(|i| !ranked.contains(i))
                .map(|i| format!("v{i}")),
        );
        // Two distinct source strings can identify the same instant. Let the
        // author's secondary keys sort first, then break ties across pages.
        for idx in &v.utc_sort_columns {
            if !ranked.contains(idx) {
                return Err(AppError("Choose an active timestamp sort column.".into()));
            }
            terms.push(format!("v{idx}"));
        }
        sql += &format!(" ORDER BY {}", terms.join(","));
    }
    let n = v.limit.clamp(1, 500) + 1;
    if live {
        if v.groups.is_empty() {
            sql += " ORDER BY (SELECT NULL)";
        }
        Ok(format!(
            "{sql} OFFSET {} ROWS FETCH NEXT {n} ROWS ONLY",
            v.offset
        ))
    } else {
        Ok(format!("{sql} LIMIT {n} OFFSET {}", v.offset))
    }
}
