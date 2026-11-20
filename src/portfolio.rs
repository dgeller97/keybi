use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    fs, io,
    path::{Path, PathBuf},
};

#[derive(Deserialize)]
struct Manifest {
    files: BTreeMap<String, String>,
}

pub fn project_root() -> io::Result<PathBuf> {
    let cwd = std::env::current_dir()?;
    if cwd.join("web/studio.js").is_file() {
        return Ok(cwd);
    }
    let exe = std::env::current_exe()?;
    exe.ancestors()
        .find(|p| p.join("web/studio.js").is_file())
        .map(Path::to_path_buf)
        .ok_or_else(|| {
            io::Error::new(
                io::ErrorKind::NotFound,
                "Could not locate the KeyBI web directory.",
            )
        })
}

// Publish a complete pristine workspace in one rename. An existing workspace
// is authoritative, including changes an author has made to an example.
pub fn initialize(root: &Path, archive: &Path) -> io::Result<()> {
    if root.exists() || !archive.join("manifest.json").is_file() {
        return Ok(());
    }
    let manifest: Manifest = serde_json::from_slice(&fs::read(archive.join("manifest.json"))?)?;
    let stage = tempfile::Builder::new()
        .prefix(".keybi-install-")
        .tempdir_in(root.parent().unwrap_or(Path::new(".")))?;
    for sub in ["tables", "reports", "images", "publications"] {
        fs::create_dir(stage.path().join(sub))?;
    }
    for (relative, expected) in manifest.files {
        let (folder, name) = relative
            .split_once('/')
            .ok_or_else(|| io::Error::other("Invalid archive path"))?;
        let (id, ext) = name
            .rsplit_once('.')
            .ok_or_else(|| io::Error::other("Invalid archive filename"))?;
        match (folder, ext) {
            ("reports" | "publications", "json") => {
                crate::valid_id(id, 'r').map_err(|e| io::Error::other(e.0))?
            }
            ("tables", "json" | "parquet") => {
                crate::valid_id(id, 't').map_err(|e| io::Error::other(e.0))?
            }
            ("images", "img") if crate::report_image::valid_key(id) && id == expected => {}
            _ => return Err(io::Error::other("Unexpected archive file")),
        };
        let data = fs::read(archive.join(&relative))?;
        let digest: String = Sha256::digest(&data)
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect();
        if digest != expected {
            return Err(io::Error::other(format!(
                "Portfolio checksum mismatch for {relative}"
            )));
        }
        fs::write(stage.path().join(relative), data)?;
    }
    match fs::rename(stage.path(), root) {
        Ok(()) => Ok(()),
        Err(_) if root.is_dir() => Ok(()),
        Err(e) => Err(e),
    }
}
