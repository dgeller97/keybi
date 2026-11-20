use crate::{AppError, Result, new_id, valid_id};
use serde_json::{Value, json};
use std::{
    fs,
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};
use tokio::sync::Mutex;
use tokio_postgres::Client;

pub enum Store {
    Files { root: PathBuf, lock: Mutex<()> },
    Postgres(Client),
}

impl Store {
    pub async fn open(root: PathBuf) -> std::result::Result<Self, Box<dyn std::error::Error>> {
        let Ok(url) = std::env::var("FOLIO_POSTGRES") else {
            return Ok(Self::Files {
                root,
                lock: Mutex::new(()),
            });
        };
        let tls = postgres_native_tls::MakeTlsConnector::new(native_tls::TlsConnector::new()?);
        let (db, connection) = tokio_postgres::connect(&url, tls).await?;
        tokio::spawn(async move {
            if connection.await.is_err() {
                eprintln!("PostgreSQL metadata connection closed.");
            }
        });
        db.batch_execute("CREATE TABLE IF NOT EXISTS folio_reports (id text PRIMARY KEY, revision bigint NOT NULL, document jsonb NOT NULL);
            CREATE TABLE IF NOT EXISTS folio_publications (source_id text PRIMARY KEY REFERENCES folio_reports(id), document jsonb NOT NULL)").await?;
        Ok(Self::Postgres(db))
    }
    pub async fn list(&self) -> Result<Vec<Value>> {
        if let Self::Postgres(db) = self {
            let rows=db.query("SELECT jsonb_build_object('id', id, 'title', document->'title', 'updated', document->'updated', 'kind', document->'kind','preview',document->'preview','question',document->'question','pages',jsonb_array_length(document->'pages'),'tables',jsonb_array_length(document->'tables')) FROM folio_reports ORDER BY (document->>'updated')::bigint DESC",&[]).await?;
            return Ok(rows.iter().map(|r| r.get(0)).collect());
        }
        let Self::Files { root, .. } = self else {
            unreachable!()
        };
        let mut list = Vec::new();
        for entry in fs::read_dir(root)? {
            let path = entry?.path();
            if path.extension().and_then(|s| s.to_str()) != Some("json") {
                continue;
            }
            let r: Value = serde_json::from_slice(&fs::read(path)?)?;
            list.push(
                json!({"id":r["id"],"title":r["title"],"updated":r["updated"],"kind":r["kind"],"preview":r["preview"],"question":r["question"],"pages":r["pages"].as_array().map_or(0,Vec::len),"tables":r["tables"].as_array().map_or(0,Vec::len)}),
            );
        }
        list.sort_by_key(|r| std::cmp::Reverse(r["updated"].as_u64().unwrap_or(0)));
        Ok(list)
    }
    pub async fn get(&self, id: &str) -> Result<Value> {
        valid_id(id, 'r')?;
        match self {
            Self::Files { root, .. } => Ok(serde_json::from_slice(&fs::read(
                root.join(format!("{id}.json")),
            )?)?),
            Self::Postgres(db) => db
                .query_opt("SELECT document FROM folio_reports WHERE id=$1", &[&id])
                .await?
                .map(|r| r.get(0))
                .ok_or_else(|| AppError("Report not found.".into())),
        }
    }
    pub async fn save(&self, mut report: Value) -> Result<Value> {
        if !report["title"].is_string() || report["pages"].as_array().is_none_or(Vec::is_empty) {
            return Err(AppError("Invalid report.".into()));
        }
        let id = report["id"]
            .as_str()
            .map(String::from)
            .unwrap_or_else(|| new_id('r'));
        valid_id(&id, 'r')?;
        let old = report["revision"].as_i64().unwrap_or(0);
        let next = old
            .checked_add(1)
            .filter(|n| *n > 0)
            .ok_or_else(|| AppError("Invalid revision.".into()))?;
        report["id"] = json!(id);
        report["revision"] = json!(next);
        report["updated"] = json!(SystemTime::now().duration_since(UNIX_EPOCH)?.as_millis());
        let conflict = || {
            AppError(
                "Another tab saved a newer revision. Open that revision or save a copy.".into(),
            )
        };
        match self {
            Self::Files { root, lock } => {
                let _guard = lock.lock().await;
                let file = root.join(format!("{id}.json"));
                if file.exists() {
                    let saved: Value = serde_json::from_slice(&fs::read(&file)?)?;
                    if saved["revision"].as_i64() != Some(old) {
                        return Err(conflict());
                    }
                } else if old != 0 {
                    return Err(conflict());
                }
                let tmp = file.with_extension("part");
                fs::write(&tmp, serde_json::to_vec(&report)?)?;
                fs::rename(tmp, file)?;
            }
            Self::Postgres(db) => {
                let changed = if old == 0 {
                    db.execute("INSERT INTO folio_reports (id,revision,document) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING",&[&id,&next,&report]).await?
                } else {
                    db.execute("UPDATE folio_reports SET revision=$2,document=$3 WHERE id=$1 AND revision=$4",&[&id,&next,&report,&old]).await?
                };
                if changed != 1 {
                    return Err(conflict());
                }
            }
        }
        Ok(report)
    }
}
