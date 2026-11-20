mod live;
mod metadata;
mod merge;
mod package;
mod parquet_input;
mod portfolio;
mod publication;
mod query;
mod report_image;
#[cfg(test)]
mod query_tests;
mod storage;
mod timestamp;
mod workbook;

use axum::{
    Json, Router,
    extract::{DefaultBodyLimit, Multipart, Path, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use datafusion::{
    arrow::{
        array::{Array, Float64Array, Int64Array, StringArray},
        record_batch::RecordBatch,
    },
    datasource::MemTable,
    prelude::SessionContext,
};
use query::{Link, Request};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{
    collections::{HashMap, HashSet},
    fs,
    path::PathBuf,
    sync::{
        Arc, Mutex,
        atomic::{AtomicU64, Ordering},
    },
    time::{Instant, SystemTime, UNIX_EPOCH},
};
use tokio::sync::Mutex as AsyncMutex;
use tower_http::{compression::CompressionLayer, services::ServeDir};

#[derive(Debug)]
pub struct AppError(pub String);
impl<E: std::error::Error> From<E> for AppError {
    fn from(e: E) -> Self {
        Self(e.to_string())
    }
}
impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        (StatusCode::BAD_REQUEST, Json(json!({"error":self.0}))).into_response()
    }
}
pub type Result<T> = std::result::Result<T, AppError>;
pub fn new_id(prefix: char) -> String {
    static SERIAL: AtomicU64 = AtomicU64::new(0);
    format!(
        "{prefix}{:x}{:x}",
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos(),
        SERIAL.fetch_add(1, Ordering::Relaxed)
    )
}
pub fn valid_id(id: &str, prefix: char) -> Result<()> {
    if id.len() > 1
        && id.len() < 60
        && id.starts_with(prefix)
        && id[1..].bytes().all(|c| c.is_ascii_hexdigit())
    {
        Ok(())
    } else {
        Err(AppError("Invalid object identifier.".into()))
    }
}

struct Studio {
    root: PathBuf,
    ctx: SessionContext,
    catalog: AsyncMutex<HashMap<String, storage::Table>>,
    checked: Mutex<HashSet<Link>>,
    cache: Mutex<HashMap<String, Vec<Vec<Value>>>>,
    reports: metadata::Store,
}
type App = Arc<Studio>;
impl Studio {
    async fn tables(&self, ids: &[String]) -> Result<HashMap<String, storage::Table>> {
        let mut catalog = self.catalog.lock().await;
        let mut tables = HashMap::new();
        for id in ids {
            if !catalog.contains_key(id) {
                let dir = self.root.join("tables");
                let key = id.clone();
                let (table, data) =
                    tokio::task::spawn_blocking(move || storage::load(&dir, &key)).await??;
                if let Some((schema, batches)) = data {
                    self.ctx.register_table(
                        id.as_str(),
                        Arc::new(MemTable::try_new(schema, vec![batches])?),
                    )?;
                }
                catalog.insert(id.clone(), table);
            }
            tables.insert(id.clone(), catalog[id].clone());
        }
        Ok(tables)
    }
    async fn validate(&self, tables: &HashMap<String, storage::Table>, link: &Link) -> Result<()> {
        let a = query::column(tables, &link.one)?;
        let b = query::column(tables, &link.many)?;
        if link.one.t == link.many.t || a.numeric != b.numeric {
            return Err(AppError(
                "Choose matching key types in two different tables.".into(),
            ));
        }
        let source = live::prefix(tables)?;
        if source.is_none() && self.checked.lock().unwrap().contains(link) {
            return Ok(());
        }
        let key = query::raw(tables, &link.one)?;
        let sql = format!(
            "SELECT COUNT(*) AS n, COUNT(DISTINCT {key}) AS u FROM {}",
            link.one.t
        );
        let rows = if let Some(prefix) = &source {
            live::run(&format!("{prefix}{sql}")).await?
        } else {
            values(&self.ctx.sql(&sql).await?.collect().await?)?
        };
        if rows[0][0] != rows[0][1] {
            return Err(AppError(
                "The one-side key contains duplicate or blank values.".into(),
            ));
        }
        if source.is_none() {
            self.checked.lock().unwrap().insert(link.clone());
        }
        Ok(())
    }
    async fn execute(&self, sql: String, limit: usize, source: Option<String>) -> Result<Value> {
        let start = Instant::now();
        let cached = if source.is_none() {
            self.cache.lock().unwrap().get(&sql).cloned()
        } else {
            None
        };
        let hit = cached.is_some();
        let mut rows = if let Some(prefix) = source {
            live::run(&format!("{prefix}{sql}")).await?
        } else if let Some(rows) = cached {
            rows
        } else {
            let batches = self.ctx.sql(&sql).await?.collect().await?;
            let data = values(&batches)?;
            let mut cache = self.cache.lock().unwrap();
            if cache.len() >= 256 {
                cache.clear();
            }
            cache.insert(sql, data.clone());
            data
        };
        let more = rows.len() > limit;
        rows.truncate(limit);
        Ok(json!({"rows":rows,"more":more,"cache":hit,"ms":start.elapsed().as_secs_f64()*1000.0}))
    }
}

fn values(batches: &[RecordBatch]) -> Result<Vec<Vec<Value>>> {
    let mut rows = Vec::new();
    for batch in batches {
        for i in 0..batch.num_rows() {
            let mut row = Vec::new();
            for a in batch.columns() {
                row.push(if a.is_null(i) {
                    Value::Null
                } else if let Some(nums) = a.as_any().downcast_ref::<Float64Array>() {
                    let value = nums.value(i);
                    if !value.is_finite() {
                        return Err(AppError("A numeric result exceeds the supported range. Adjust the calculation or filter the source values.".into()));
                    }
                    json!(value)
                } else if let Some(nums) = a.as_any().downcast_ref::<Int64Array>() {
                    json!(nums.value(i))
                } else if let Some(text) = a.as_any().downcast_ref::<StringArray>() {
                    json!(text.value(i))
                } else {
                    json!(datafusion::arrow::util::display::array_value_to_string(
                        a, i
                    )?)
                });
            }
            rows.push(row);
        }
    }
    Ok(rows)
}

async fn parquet_preview(bytes: axum::body::Bytes) -> Result<Json<Value>> {
    Ok(Json(
        tokio::task::spawn_blocking(move || parquet_input::preview(bytes)).await??,
    ))
}
async fn csv_preview(bytes: axum::body::Bytes) -> Result<Json<Value>> {
    tokio::task::spawn_blocking(move || {
        let mut reader = csv::Reader::from_reader(bytes.as_ref());
        let headers: Vec<_> = reader.headers()?.iter().map(str::to_owned).collect();
        let rows: Vec<Vec<String>> = reader
            .deserialize()
            .take(8)
            .collect::<std::result::Result<_, _>>()?;
        let numeric_rows: Vec<Vec<_>> = rows
            .iter()
            .map(|row| {
                row.iter()
                    .map(|s| storage::model_number(s.trim()))
                    .collect()
            })
            .collect();
        Ok(Json(
            json!({"headers":headers,"rows":rows,"numericRows":numeric_rows}),
        ))
    })
    .await?
}
async fn workbook_preview(bytes: axum::body::Bytes) -> Result<Json<Vec<workbook::SheetPreview>>> {
    Ok(Json(tokio::task::spawn_blocking(move || workbook::preview(&bytes)).await??))
}
async fn import(State(app): State<App>, mut files: Multipart) -> Result<Json<Vec<storage::Table>>> {
    let mut tables = Vec::new();
    let dir = app.root.join("tables");
    let stage = Arc::new(tempfile::tempdir_in(&dir)?);
    let mut plan: Option<Vec<storage::Preparation>> = None;
    let mut revision: Option<storage::Revision> = None;
    let mut unpivot: Option<storage::Unpivot> = None;
    let mut worksheets: Option<Vec<workbook::Selection>> = None;
    while let Some(file) = files.next_field().await? {
        if file.name() == Some("worksheets") {
            worksheets = Some(serde_json::from_slice(&file.bytes().await?)?);
            continue;
        }
        if file.name() == Some("preparation") {
            plan = Some(serde_json::from_slice(&file.bytes().await?)?);
            continue;
        }
        if file.name() == Some("unpivot") {
            unpivot = Some(serde_json::from_slice(&file.bytes().await?)?);
            continue;
        }
        if file.name() == Some("revision") {
            revision = Some(serde_json::from_slice(&file.bytes().await?)?);
            continue;
        }
        let preparation = plan.take();
        let update = revision.take();
        let reshape = unpivot.take();
        let name = file
            .file_name()
            .unwrap_or("Table.csv")
            .rsplit(['/', '\\'])
            .next()
            .unwrap_or("Table")
            .to_owned();
        let (stem, extension) = name.rsplit_once('.').unwrap_or((&name, ""));
        let selected = worksheets.take();
        if extension.eq_ignore_ascii_case("xlsx") {
            if preparation.is_some() || reshape.is_some() {
                return Err(AppError("CSV preparation steps require a CSV source.".into()));
            }
            let selected = selected.ok_or_else(|| AppError("Select worksheets before importing this workbook.".into()))?;
            let bytes = file.bytes().await?;
            let output = stage.clone();
            let root = dir.clone();
            tables.extend(tokio::task::spawn_blocking(move || workbook::import(output.path(), &bytes, &selected,update.map(|r|(root.as_path(),r)))).await??);
            continue;
        } else if selected.is_some() {
            return Err(AppError("Worksheet selections require an .xlsx file.".into()));
        }
        let parquet = extension.eq_ignore_ascii_case("parquet");
        let name = if parquet || extension.eq_ignore_ascii_case("csv") {
            stem
        } else {
            &name
        }
        .to_owned();
        let bytes = file.bytes().await?;
        let root = dir.clone();
        let output = stage.clone();
        tables.push(
            tokio::task::spawn_blocking(move || {
                if parquet {
                    if preparation.is_some() || reshape.is_some() {
                        return Err(AppError(
                            "CSV preparation steps require a CSV source.".into(),
                        ));
                    }
                    parquet_input::import(
                        output.path(),
                        name,
                        bytes,
                        update.map(|r| (root.as_path(), r)),
                    )
                } else {
                    storage::import(
                        output.path(),
                        name,
                        &bytes,
                        preparation,
                        update.map(|r| (root.as_path(), r)),
                        reshape,
                    )
                }
            })
            .await??,
        );
    }
    if tables.is_empty() {
        return Err(AppError("Choose a CSV, Parquet file or Excel workbook.".into()));
    }
    publish_tables(stage.path(), &dir, &tables)?;
    Ok(Json(tables))
}
fn publish_tables(stage: &std::path::Path, dir: &std::path::Path, tables: &[storage::Table]) -> Result<()> {
    let mut published = Vec::new();
    for table in tables {
        for ext in ["parquet", "json"] {
            let file = format!("{}.{ext}", table.id);
            let target = dir.join(&file);
            if let Err(error) = fs::rename(stage.join(file), &target) {
                for file in published {
                    let _ = fs::remove_file(file);
                }
                return Err(error.into());
            }
            published.push(target);
        }
    }
    Ok(())
}
async fn relationship(State(app): State<App>, Json(link): Json<Link>) -> Result<Json<Value>> {
    let tables = app
        .tables(&[link.one.t.clone(), link.many.t.clone()])
        .await?;
    app.validate(&tables, &link).await?;
    Ok(Json(json!({"valid":true})))
}
async fn query(State(app): State<App>, Json(req): Json<Request>) -> Result<Json<Value>> {
    let tables = app.tables(&req.tables).await?;
    let source = live::prefix(&tables)?;
    for link in &req.links {
        app.validate(&tables, link).await?;
    }
    let mut jobs = tokio::task::JoinSet::new();
    let mut results = vec![Value::Null; req.visuals.len()];
    for (idx, v) in req.visuals.iter().enumerate() {
        match query::plan(&tables, &req.links, &req.calculations, v) {
            Ok(sql) => {
                let app = app.clone();
                let limit = v.limit.clamp(1, 500);
                let prefix = source.clone();
                jobs.spawn(async move { (idx, app.execute(sql, limit, prefix).await) });
            }
            Err(e) => results[idx] = json!({"error":e.0}),
        }
    }
    while let Some(job) = jobs.join_next().await {
        let (i, result) = job?;
        results[i] = result.unwrap_or_else(|e| json!({"error":e.0}));
    }
    Ok(Json(json!(results)))
}

async fn sources() -> Result<Json<Value>> {
    let catalog = live::catalog().await?;
    Ok(Json(json!(
        catalog
            .iter()
            .filter_map(|t| t.source.as_ref())
            .map(|s| json!({"schema":s.schema,"table":s.table}))
            .collect::<Vec<_>>()
    )))
}
async fn connect_source(
    State(app): State<App>,
    Json(choices): Json<Vec<live::Choice>>,
) -> Result<Json<Vec<storage::Table>>> {
    let catalog = live::catalog().await?;
    let mut selected = Vec::new();
    for choice in choices {
        let table = catalog
            .iter()
            .find(|t| {
                t.source
                    .as_ref()
                    .is_some_and(|s| s.schema == choice.schema && s.table == choice.table)
            })
            .ok_or_else(|| AppError("Unknown source table.".into()))?;
        fs::write(
            app.root.join("tables").join(format!("{}.json", table.id)),
            serde_json::to_vec(table)?,
        )?;
        selected.push(table.clone());
    }
    Ok(Json(selected))
}
async fn reports(State(app): State<App>) -> Result<Json<Value>> {
    Ok(Json(json!(app.reports.list().await?)))
}
async fn open_report(State(app): State<App>, Path(id): Path<String>) -> Result<Json<Value>> {
    Ok(Json(app.reports.get(&id).await?))
}
async fn export_package(State(app): State<App>, Path(id): Path<String>) -> Result<Response> {
    let report = app.reports.get(&id).await?;
    let dir = app.root.join("tables");
    let data = tokio::task::spawn_blocking(move || package::export(&dir, report)).await??;
    Ok((
        [
            ("content-type", "application/octet-stream"),
            ("content-disposition", "attachment; filename=report.keybi"),
        ],
        data,
    )
        .into_response())
}
async fn import_package(State(app): State<App>, data: axum::body::Bytes) -> Result<Json<Value>> {
    let dir = app.root.join("tables");
    let mut install = tokio::task::spawn_blocking(move || package::install(&dir, &data)).await??;
    let saved = app
        .reports
        .save(std::mem::take(&mut install.report))
        .await?;
    install.commit();
    Ok(Json(json!({"id":saved["id"],"title":saved["title"]})))
}
#[derive(Deserialize)]
struct Save {
    report: Value,
}
async fn save(State(app): State<App>, Json(body): Json<Save>) -> Result<Json<Value>> {
    Ok(Json(app.reports.save(body.report).await?))
}
async fn local_only(req: axum::extract::Request, next: axum::middleware::Next) -> Response {
    let headers: &HeaderMap = req.headers();
    let host = headers
        .get("host")
        .and_then(|h| h.to_str().ok())
        .unwrap_or("");
    if !matches!(host.split(':').next(), Some("127.0.0.1" | "localhost"))
        || headers
            .get("origin")
            .is_some_and(|h| h.to_str().ok() != Some(&format!("http://{host}")))
    {
        return StatusCode::FORBIDDEN.into_response();
    }
    next.run(req).await
}
#[tokio::main]
async fn main() -> std::result::Result<(), Box<dyn std::error::Error>> {
    let project = portfolio::project_root()?;
    let root = std::env::var_os("FOLIO_DATA")
        .map(PathBuf::from)
        .unwrap_or_else(|| project.join(".studio"));
    if std::env::var_os("FOLIO_DATA").is_none() && std::env::var_os("FOLIO_POSTGRES").is_none() {
        portfolio::initialize(&root, &project.join("portfolio"))?;
    }
    for sub in ["tables", "reports", "images", "publications"] {
        fs::create_dir_all(root.join(sub))?;
    }
    let port: u16 = std::env::var("FOLIO_PORT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(4317);
    let metadata = metadata::Store::open(root.join("reports")).await?;
    let state = Arc::new(Studio {
        root,
        ctx: {
            let ctx = SessionContext::new();
            timestamp::register(&ctx);
            ctx
        },
        catalog: Default::default(),
        checked: Default::default(),
        cache: Default::default(),
        reports: metadata,
    });
    let routes = Router::new()
        .route("/api/csv-preview", post(csv_preview))
        .route("/api/parquet-preview", post(parquet_preview))
        .route("/api/import", post(import))
        .route("/api/workbook", post(workbook_preview))
        .route("/api/merge", post(merge::run))
        .route("/api/images", post(report_image::upload).layer(DefaultBodyLimit::max(report_image::LIMIT)))
        .route("/api/images/{key}", get(report_image::get))
        .route("/api/relationship", post(relationship))
        .route("/api/query", post(query))
        .route("/api/reports", get(reports).post(save))
        .route("/api/reports/{id}", get(open_report))
        .route("/api/reports/{id}/publication", get(publication::status).post(publication::change))
        .route("/api/publications", get(publication::list))
        .route("/api/publications/{id}", get(publication::read))
        .route("/api/reports/{id}/package", get(export_package))
        .route("/api/packages", post(import_package))
        .route("/api/sqlserver", get(sources).post(connect_source))
        .fallback_service(ServeDir::new(project.join("web")))
        .layer(DefaultBodyLimit::max(256 * 1024 * 1024))
        .layer(CompressionLayer::new())
        .layer(axum::middleware::from_fn(local_only))
        .with_state(state);
    let listener = tokio::net::TcpListener::bind(("127.0.0.1", port)).await?;
    println!("KeyBI · http://127.0.0.1:{port}");
    axum::serve(listener, routes).await?;
    Ok(())
}
