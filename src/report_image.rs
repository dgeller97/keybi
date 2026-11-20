use crate::{App, AppError, Result};
use axum::{
    Json,
    body::Bytes,
    extract::{Path, State},
    response::{IntoResponse, Response},
};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{collections::BTreeSet, io::Write, path::Path as DiskPath};

pub const LIMIT: usize = 32 * 1024 * 1024;

pub fn valid_key(key: &str) -> bool {
    key.len() == 64
        && key
            .bytes()
            .all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c))
}
fn format(bytes: &[u8]) -> Result<&'static str> {
    if bytes.len() > LIMIT {
        return Err(AppError("Choose an image under 32 MiB.".into()));
    }
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") && bytes.get(12..16) == Some(b"IHDR") {
        return Ok("image/png");
    }
    if bytes.starts_with(&[0xff, 0xd8, 0xff]) && bytes.len() >= 12 {
        return Ok("image/jpeg");
    }
    if bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP") {
        return Ok("image/webp");
    }
    Err(AppError("Choose a PNG, JPEG or WebP image.".into()))
}
pub fn keys(report: &Value) -> Result<BTreeSet<String>> {
    let mut keys = BTreeSet::new();
    for page in report["pages"].as_array().into_iter().flatten() {
        for visual in page["visuals"].as_array().into_iter().flatten() {
            if visual["kind"] != "image" {
                continue;
            }
            let mut add = |entry: &Value| -> Result<()> {
                if entry.is_null() {
                    return Ok(());
                }
                let key = entry["key"]
                    .as_str()
                    .filter(|key| valid_key(key))
                    .ok_or_else(|| AppError("Invalid report image reference.".into()))?;
                if !entry["name"].is_string()
                    || ["width", "height"].iter().any(|k| {
                        entry[k]
                            .as_u64()
                            .is_none_or(|n| n == 0 || n > u32::MAX as u64)
                    })
                {
                    return Err(AppError(
                        "Invalid report image dimensions or filename.".into(),
                    ));
                }
                keys.insert(key.to_string());
                Ok(())
            };
            add(&visual["image"])?;
            if let Some(mappings) = visual.get("imageMappings") {
                for entry in mappings
                    .as_array()
                    .ok_or_else(|| AppError("Invalid report image mappings.".into()))?
                {
                    if entry["image"].is_null()
                        || entry.get("value").is_none()
                        || !(entry["value"].is_null()
                            || entry["value"].is_string()
                            || entry["value"].is_number())
                    {
                        return Err(AppError("Invalid mapped image or field value.".into()));
                    }
                    add(&entry["image"])?;
                }
            }
        }
    }
    Ok(keys)
}
pub fn store(dir: &DiskPath, bytes: &[u8], expected: Option<&str>) -> Result<String> {
    format(bytes)?;
    let key: String = Sha256::digest(bytes)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect();
    if expected.is_some_and(|id| id != key) {
        return Err(AppError("Report image checksum mismatch.".into()));
    }
    let path = dir.join(format!("{key}.img"));
    if !path.is_file() {
        let mut file = tempfile::NamedTempFile::new_in(dir)?;
        file.write_all(bytes)?;
        match file.persist_noclobber(path) {
            Ok(_) => {}
            Err(e) if e.error.kind() == std::io::ErrorKind::AlreadyExists => {}
            Err(e) => return Err(e.into()),
        }
    }
    Ok(key)
}
pub async fn upload(State(app): State<App>, data: Bytes) -> Result<Json<Value>> {
    let dir = app.root.join("images");
    let key = tokio::task::spawn_blocking(move || store(&dir, &data, None)).await??;
    Ok(Json(json!({"key":key})))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stores_one_copy_and_checks_transferred_image_bytes() -> Result<()> {
        let dir = tempfile::tempdir()?;
        let bytes = include_bytes!("../web/datasets/budget/P-01-voucher.png");
        let key = store(dir.path(), bytes, None)?;
        assert_eq!(store(dir.path(), bytes, Some(&key))?, key);
        assert_eq!(std::fs::read_dir(dir.path())?.count(), 1);
        assert!(store(dir.path(), bytes, Some(&"0".repeat(64))).is_err());
        assert!(store(dir.path(), b"unrecognized image", None).is_err());
        assert_eq!(std::fs::read_dir(dir.path())?.count(), 1);
        Ok(())
    }
}
pub async fn get(State(app): State<App>, Path(key): Path<String>) -> Result<Response> {
    if !valid_key(&key) {
        return Err(AppError("Invalid report image key.".into()));
    }
    let bytes = tokio::fs::read(app.root.join("images").join(format!("{key}.img"))).await?;
    let mime = format(&bytes)?;
    Ok((
        [
            ("content-type", mime),
            ("x-content-type-options", "nosniff"),
            ("cache-control", "private, max-age=31536000, immutable"),
        ],
        bytes,
    )
        .into_response())
}
