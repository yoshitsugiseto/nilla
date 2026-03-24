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
                if let Some(parent) = p.parent() {
                    tokio::fs::create_dir_all(parent).await?;
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
                let data = tokio::fs::read(p).await?;
                Ok(Bytes::from(data))
            }
        }
    }

    pub async fn delete(&self, key: &str) -> anyhow::Result<()> {
        match &self.inner {
            StorageInner::Local { base_path } => {
                let p = base_path.join(key);
                let _ = tokio::fs::remove_file(p).await;
                Ok(())
            }
        }
    }
}
