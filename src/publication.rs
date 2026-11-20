use crate::{App, AppError, Result, metadata::Store, new_id, valid_id};
use axum::{
    Json,
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{
    fs,
    io::Write,
    path::Path as DiskPath,
    time::{SystemTime, UNIX_EPOCH},
};

#[derive(Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Action {
    Publish,
    Withdraw,
}
#[derive(Deserialize)]
pub struct Change {
    action: Action,
    revision: i64,
    previous: Option<String>,
    page: Option<String>,
}
fn conflict() -> AppError {
    AppError("The draft or published version changed in another tab. Reopen the report before publishing.".into())
}
fn local(root: &DiskPath, id: &str) -> Result<Option<Value>> {
    match fs::read(
        root.with_file_name("publications")
            .join(format!("{id}.json")),
    ) {
        Ok(bytes) => Ok(Some(serde_json::from_slice(&bytes)?)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.into()),
    }
}
fn metadata(record: &Value) -> Value {
    json!({"id":record["id"],"release":record["release"],"revision":record["revision"],"published":record["published"],
        "page":record["page"],"title":record["title"],"pages":record["pages"],"tables":record["tables"]})
}

impl Store {
    async fn publication(&self, source: &str) -> Result<Option<Value>> {
        valid_id(source, 'r')?;
        match self {
            Self::Files { root, .. } => local(root, source),
            Self::Postgres(db) => Ok(db
                .query_opt(
                    "SELECT document FROM folio_publications WHERE source_id=$1",
                    &[&source],
                )
                .await?
                .map(|row| row.get(0))),
        }
    }
    async fn publications(&self) -> Result<Vec<Value>> {
        match self {
            Self::Files{root,..}=>{
                let mut list=Vec::new();
                for file in fs::read_dir(root.with_file_name("publications"))? {
                    let path=file?.path();
                    if path.extension().and_then(|s|s.to_str())==Some("json"){
                        list.push(metadata(&serde_json::from_slice(&fs::read(path)?)?));
                    }
                }
                list.sort_by_key(|r|std::cmp::Reverse(r["published"].as_u64().unwrap_or(0)));
                Ok(list)
            }
            Self::Postgres(db)=>Ok(db.query("SELECT document - 'report' FROM folio_publications ORDER BY (document->>'published')::bigint DESC",&[]).await?.into_iter().map(|row|row.get(0)).collect()),
        }
    }
    async fn change_publication(&self, source: &str, change: Change) -> Result<Option<Value>> {
        valid_id(source, 'r')?;
        let _guard = match self {
            Self::Files { lock, .. } => Some(lock.lock().await),
            _ => None,
        };
        let existing = self.publication(source).await?;
        let prior = existing.as_ref().and_then(|v| v["release"].as_str());
        if prior != change.previous.as_deref() {
            return Err(conflict());
        }
        let expected = change.previous.as_deref();
        if change.action == Action::Withdraw {
            if expected.is_some() {
                match self {
                    Self::Files{root,..}=>fs::remove_file(root.with_file_name("publications").join(format!("{source}.json")))?,
                    Self::Postgres(db)=>{
                        if db.execute("DELETE FROM folio_publications WHERE source_id=$1 AND document->>'release'=$2",&[&source,&expected]).await?!=1{return Err(conflict());}
                    }
                }
            }
            return Ok(None);
        }
        let mut report = self.get(source).await?;
        if change.revision <= 0 || report["revision"].as_i64() != Some(change.revision) {
            return Err(conflict());
        }
        let pages = report["pages"]
            .as_array()
            .ok_or_else(|| AppError("The report has no pages.".into()))?;
        let index = if let Some(page) = &change.page {
            pages
                .iter()
                .position(|p| p["id"].as_str() == Some(page))
                .ok_or_else(|| AppError("Choose a saved report page.".into()))?
        } else {
            report["active"].as_u64().unwrap_or(0) as usize
        };
        let page = pages
            .get(index)
            .ok_or_else(|| AppError("Choose a saved report page.".into()))?["id"]
            .clone();
        if existing
            .as_ref()
            .is_some_and(|last| last["revision"] == change.revision && last["page"] == page)
        {
            return Ok(existing.as_ref().map(metadata));
        }
        let id = format!("p{}", &source[1..]);
        report["id"] = json!(id);
        report["active"] = json!(index);
        let record = json!({"id":id,"release":new_id('v'),"revision":change.revision,"page":page,
            "published":SystemTime::now().duration_since(UNIX_EPOCH)?.as_millis(),"title":report["title"],
            "pages":report["pages"].as_array().map_or(0,Vec::len),"tables":report["tables"].as_array().map_or(0,Vec::len),"report":report});
        match self {
            Self::Files { root, .. } => {
                let dir = root.with_file_name("publications");
                let mut temp = tempfile::NamedTempFile::new_in(&dir)?;
                temp.write_all(&serde_json::to_vec(&record)?)?;
                temp.persist(dir.join(format!("{source}.json")))?;
            }
            Self::Postgres(db) => {
                let count = if expected.is_some() {
                    db.execute("UPDATE folio_publications p SET document=$3 FROM folio_reports r WHERE p.source_id=$1 AND r.id=p.source_id AND r.revision=$2 AND p.document->>'release'=$4",&[&source,&change.revision,&record,&expected]).await?
                } else {
                    db.execute("INSERT INTO folio_publications(source_id,document) SELECT id,$3 FROM folio_reports WHERE id=$1 AND revision=$2 ON CONFLICT DO NOTHING",&[&source,&change.revision,&record]).await?
                };
                if count != 1 {
                    return Err(conflict());
                }
            }
        }
        Ok(Some(metadata(&record)))
    }
}

pub async fn list(State(app): State<App>) -> Result<Json<Vec<Value>>> {
    Ok(Json(app.reports.publications().await?))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::sync::Mutex;

    #[tokio::test]
    async fn a_stale_draft_or_withdrawal_cannot_replace_a_new_publication() -> Result<()> {
        let dir = tempfile::tempdir()?;
        let reports = dir.path().join("reports");
        fs::create_dir(&reports)?;
        fs::create_dir(dir.path().join("publications"))?;
        let store = Store::Files {
            root: reports.clone(),
            lock: Mutex::new(()),
        };
        let mut draft=store.save(json!({"title":"Purchases","active":0,"tables":[],"pages":[{"id":"overview"},{"id":"ledger"}]})).await?;
        let id = draft["id"].as_str().unwrap().to_owned();
        let publish = |revision, previous| Change {
            action: Action::Publish,
            revision,
            previous,
            page: Some("ledger".into()),
        };
        let first = store
            .change_publication(&id, publish(1, None))
            .await?
            .unwrap();
        let first_key = first["release"].as_str().unwrap().to_owned();
        draft["title"] = json!("Revised purchases");
        store.save(draft).await?;
        assert!(
            store
                .change_publication(&id, publish(1, Some(first_key.clone())))
                .await
                .is_err()
        );
        let second = store
            .change_publication(&id, publish(2, Some(first_key.clone())))
            .await?
            .unwrap();
        assert_eq!(first["id"], second["id"]);
        assert_ne!(first["release"], second["release"]);
        let stale = Change {
            action: Action::Withdraw,
            revision: 2,
            previous: Some(first_key),
            page: None,
        };
        assert!(store.change_publication(&id, stale).await.is_err());
        let reopen = Store::Files {
            root: reports,
            lock: Mutex::new(()),
        };
        let restored = reopen.publication(&id).await?.unwrap();
        assert_eq!(restored["report"]["active"], 1);
        assert_eq!(restored["title"], "Revised purchases");
        assert_eq!(reopen.publications().await?.len(), 1);
        Ok(())
    }
}
pub async fn status(State(app): State<App>, Path(source): Path<String>) -> Result<Json<Value>> {
    Ok(Json(
        json!({"publication":app.reports.publication(&source).await?.as_ref().map(metadata)}),
    ))
}
pub async fn change(
    State(app): State<App>,
    Path(source): Path<String>,
    Json(request): Json<Change>,
) -> Result<Json<Value>> {
    Ok(Json(
        json!({"publication":app.reports.change_publication(&source,request).await?}),
    ))
}
pub async fn read(State(app): State<App>, Path(id): Path<String>) -> Result<Response> {
    valid_id(&id, 'p')?;
    let source = format!("r{}", &id[1..]);
    Ok(match app.reports.publication(&source).await? {
        Some(mut record) => {
            let mut report = record["report"].take();
            report["publication"] = metadata(&record);
            ([("cache-control", "no-store")], Json(report)).into_response()
        }
        None => (
            StatusCode::NOT_FOUND,
            [("cache-control", "no-store")],
            Json(json!({"error":"This report is no longer published in this workspace."})),
        )
            .into_response(),
    })
}
