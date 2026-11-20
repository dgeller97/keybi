use crate::{App, AppError, Result, new_id, publish_tables, storage, valid_id, values};
use axum::{Json, extract::State};
use futures_util::StreamExt;
use serde::Deserialize;
use serde_json::{Value, json};
use std::{collections::HashSet, fs};

#[derive(Deserialize, Clone, Copy, PartialEq)]
#[serde(rename_all = "lowercase")]
enum Join {
    Left,
    Right,
    Full,
    Inner,
    Anti,
    RightAnti,
}

#[derive(Deserialize)]
pub struct Request {
    left: String,
    right: String,
    keys: Vec<[usize; 2]>,
    kind: Join,
    expand: Vec<usize>,
    prefix: bool,
    name: String,
    #[serde(default)]
    preview: bool,
}

fn plan(
    req: &Request,
    left: &storage::Table,
    right: &storage::Table,
) -> Result<(String, Vec<storage::Column>)> {
    if left.source.is_some() || right.source.is_some() {
        return Err(AppError("Choose imported tables for this merge.".into()));
    }
    if req.keys.is_empty() {
        return Err(AppError("Select a matching column in each table.".into()));
    }
    let mut conditions = Vec::new();
    let (mut left_keys, mut right_keys) = (HashSet::new(), HashSet::new());
    for &[a, b] in &req.keys {
        let pair = left.columns.get(a).zip(right.columns.get(b));
        if !pair.is_some_and(|(a, b)| a.numeric == b.numeric) {
            return Err(AppError(
                "Each pair of match columns must have the same data type.".into(),
            ));
        }
        if !left_keys.insert(a) || !right_keys.insert(b) {
            return Err(AppError("Use each match column once on each side.".into()));
        }
        conditions.push(format!("(l.c{a} IS NOT DISTINCT FROM r.c{b})"));
    }
    let mut columns = left.columns.clone();
    let mut projection: Vec<_> = columns.iter().enumerate()
        .map(|(i,column)| if req.kind == Join::RightAnti {
            let dtype = if column.numeric { "DOUBLE" } else { "VARCHAR" };
            format!("CAST(NULL AS {dtype}) AS c{i}")
        } else { format!("l.c{i} AS c{i}") })
        .collect();
    let mut names: HashSet<_> = columns.iter().map(|c| c.name.to_lowercase()).collect();
    if req.kind != Join::Anti && req.expand.is_empty() {
        return Err(AppError(
            "Choose at least one right-hand column to expand.".into(),
        ));
    }
    if req.kind != Join::Anti {
        for &index in &req.expand {
            let mut column = right
                .columns
                .get(index)
                .ok_or_else(|| AppError("Missing expanded column.".into()))?
                .clone();
            if req.prefix {
                column.name = format!("{}.{}", right.name, column.name);
            }
            if !names.insert(column.name.to_lowercase()) {
                return Err(AppError(format!(
                    "The output already contains '{}'. Change the expanded columns or their prefix.",
                    column.name
                )));
            }
            projection.push(format!("r.c{index} AS c{}", columns.len()));
            columns.push(column);
        }
    }
    let join = match req.kind {
        Join::Left => "LEFT",
        Join::Right => "RIGHT",
        Join::Full => "FULL OUTER",
        Join::Inner => "INNER",
        Join::Anti => "LEFT ANTI",
        Join::RightAnti => "RIGHT ANTI",
    };
    Ok((
        format!(
            "SELECT {} FROM {} l {join} JOIN {} r ON {}",
            projection.join(", "),
            req.left,
            req.right,
            conditions.join(" AND ")
        ),
        columns,
    ))
}

pub fn validate_saved(
    doc: &Value,
    output: &storage::Table,
    tables: &[storage::Table],
) -> Result<()> {
    let mut spec = doc.clone();
    let object = spec
        .as_object_mut()
        .ok_or_else(|| AppError("Invalid saved merge.".into()))?;
    object.insert("name".into(), json!(output.name));
    let req: Request = serde_json::from_value(spec)?;
    let source = |id: &str| {
        tables
            .iter()
            .find(|t| t.id == id && id != output.id)
            .ok_or_else(|| AppError("Missing saved merge source.".into()))
    };
    let revisions = doc["revisions"]
        .as_array()
        .filter(|r| r.len() == 2)
        .ok_or_else(|| AppError("Missing saved merge revisions.".into()))?;
    for id in revisions {
        valid_id(id.as_str().unwrap_or(""), 't')?;
    }
    if plan(&req, source(&req.left)?, source(&req.right)?)?.1 != output.columns {
        return Err(AppError(
            "Saved merge columns differ from the model.".into(),
        ));
    }
    Ok(())
}

pub async fn run(State(app): State<App>, Json(req): Json<Request>) -> Result<Json<Value>> {
    valid_id(&req.left, 't')?;
    valid_id(&req.right, 't')?;
    let name = req.name.trim();
    if name.is_empty() || name.chars().count() > 160 {
        return Err(AppError("Use a table name of 1–160 characters.".into()));
    }
    let tables = app.tables(&[req.left.clone(), req.right.clone()]).await?;
    let (sql, columns) = plan(&req, &tables[&req.left], &tables[&req.right])?;
    if req.preview {
        let batches = app
            .ctx
            .sql(&format!("{sql} LIMIT 6"))
            .await?
            .collect()
            .await?;
        let mut rows = values(&batches)?;
        let more = rows.len() > 5;
        rows.truncate(5);
        return Ok(Json(json!({"columns":columns,"rows":rows,"more":more})));
    }
    let mut stream = app.ctx.sql(&sql).await?.execute_stream().await?;
    let dir = app.root.join("tables");
    let stage = tempfile::tempdir_in(&dir)?;
    let id = new_id('t');
    let file = fs::File::create_new(stage.path().join(format!("{id}.parquet")))?;
    let mut writer = storage::model_writer(file, storage::model_schema(&columns))?;
    let mut rows = 0;
    while let Some(batch) = stream.next().await {
        let batch = batch?;
        rows += batch.num_rows();
        writer.write(&batch)?;
    }
    writer.close()?;
    let table = storage::Table {
        id,
        name: name.to_owned(),
        columns,
        rows,
        parquet_types: vec![],
        source: None,
    };
    fs::write(
        stage.path().join(format!("{}.json", table.id)),
        serde_json::to_vec(&table)?,
    )?;
    publish_tables(stage.path(), &dir, std::slice::from_ref(&table))?;
    Ok(Json(json!(table)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use datafusion::prelude::SessionContext;

    #[tokio::test]
    async fn composite_merge_matches_nulls_and_preserves_right_multiplicity() -> Result<()> {
        let ctx = SessionContext::new();
        for (id, rows) in [
            ("ta", "('001','N'),('001','S'),('009','N'),(NULL,'N')"),
            ("tb", "('001','N'),('001','N'),('001','S'),(NULL,'N'),('004','S')"),
        ] {
            ctx.sql(&format!(
                "CREATE TABLE {id} AS SELECT * FROM (VALUES {rows}) AS t(c0,c1)"
            ))
            .await?
            .collect()
            .await?;
        }
        let table = |id: &str| storage::Table {
            id: id.into(),
            name: id.into(),
            columns: ["Site", "Area"]
                .map(|n| storage::Column {
                    name: n.into(),
                    numeric: false,
                })
                .into(),
            rows: 4,
            parquet_types: vec![],
            source: None,
        };
        let left = table("ta");
        let mut right = table("tb");
        right.rows=5;
        for (kind, expected) in [(Join::Left, 5), (Join::Inner, 4), (Join::Anti, 1),
            (Join::Right,5), (Join::Full,6), (Join::RightAnti,1)] {
            let spec = Request {
                left: left.id.clone(),
                right: right.id.clone(),
                keys: vec![[0, 0], [1, 1]],
                kind,
                expand: vec![0],
                prefix: true,
                name: "Joined".into(),
                preview: false,
            };
            let (sql, _) = plan(&spec, &left, &right)?;
            let batches = ctx.sql(&sql).await?.collect().await?;
            if kind == Join::RightAnti {
                assert_eq!(json!(values(&batches)?),json!([[null,null,"004"]]));
            }
            assert_eq!(
                batches.iter().map(|b| b.num_rows()).sum::<usize>(),
                expected
            );
        }
        Ok(())
    }
}
