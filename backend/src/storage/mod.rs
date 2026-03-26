use std::path::PathBuf;

use bytes::Bytes;

/// Generic file storage abstraction.
/// Currently supports local filesystem; S3/compatible backends
/// can be added as additional enum variants.
#[derive(Clone)]
pub struct Storage {
    inner: StorageInner,
}

#[derive(Clone)]
enum StorageInner {
    Local { base_path: PathBuf },
}

impl Storage {
    pub fn local(path: &str) -> anyhow::Result<Self> {
        std::fs::create_dir_all(path)?;
        Ok(Self {
            inner: StorageInner::Local {
                base_path: PathBuf::from(path),
            },
        })
    }

    pub async fn put(&self, key: &str, data: Bytes) -> anyhow::Result<()> {
        match &self.inner {
            StorageInner::Local { base_path } => {
                let p = base_path.join(key);
                // Path traversal check: canonicalize parent since the file may not exist yet
                let parent = p.parent().unwrap_or(&p);
                if let Some(parent_dir) = p.parent() {
                    tokio::fs::create_dir_all(parent_dir).await?;
                }
                let canonical_parent = parent.canonicalize().unwrap_or(parent.to_path_buf());
                let canonical_base = base_path.canonicalize().unwrap_or(base_path.clone());
                if !canonical_parent.starts_with(&canonical_base) {
                    anyhow::bail!("path traversal detected");
                }
                tokio::fs::write(p, data).await?;
                Ok(())
            }
        }
    }

    pub async fn get(&self, key: &str) -> anyhow::Result<Bytes> {
        match &self.inner {
            StorageInner::Local { base_path } => {
                let p = base_path.join(key);
                let canonical = p.canonicalize().unwrap_or(p.clone());
                let canonical_base = base_path.canonicalize().unwrap_or(base_path.clone());
                if !canonical.starts_with(&canonical_base) {
                    anyhow::bail!("path traversal detected");
                }
                let data = tokio::fs::read(p).await?;
                Ok(Bytes::from(data))
            }
        }
    }

    pub async fn delete(&self, key: &str) -> anyhow::Result<()> {
        match &self.inner {
            StorageInner::Local { base_path } => {
                let p = base_path.join(key);
                let canonical = p.canonicalize().unwrap_or(p.clone());
                let canonical_base = base_path.canonicalize().unwrap_or(base_path.clone());
                if !canonical.starts_with(&canonical_base) {
                    anyhow::bail!("path traversal detected");
                }
                let _ = tokio::fs::remove_file(p).await;
                Ok(())
            }
        }
    }
}
