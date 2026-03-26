use axum::{
    body::Body,
    extract::{Multipart, Path, State},
    http::{header, StatusCode},
    response::Response,
    Extension, Json,
};
use chrono::NaiveDateTime;
use serde::Serialize;
use sqlx::SqlitePool;
use uuid::Uuid;

use crate::{
    auth::middleware::UserId,
    error::{AppError, Result},
    realtime::RealtimeHub,
    storage::Storage,
};

const MAX_FILE_SIZE: usize = 10 * 1024 * 1024; // 10 MB

/// 実行可能ファイルなど危険な MIME タイプをブロック
fn is_blocked_mime(data: &[u8]) -> bool {
    let kind = infer::get(data);
    match kind.map(|k| k.mime_type()) {
        Some(mime) => matches!(
            mime,
            "application/x-msdownload"
                | "application/x-executable"
                | "application/x-sharedlib"
                | "application/x-msdos-program"
                | "application/x-elf"
        ),
        None => false,
    }
}

/// シェルスクリプトなどテキスト系の危険パターンもブロック
fn has_dangerous_magic(data: &[u8]) -> bool {
    data.starts_with(b"\x7fELF")   // Linux ELF
        || data.starts_with(b"MZ") // Windows PE
        || data.starts_with(b"#!/") // shebang
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct Attachment {
    pub id: String,
    pub issue_id: String,
    pub uploaded_by: String,
    pub filename: String,
    pub content_type: String,
    pub size: i64,
    pub storage_key: String,
    pub created_at: NaiveDateTime,
}

#[derive(Debug, Serialize)]
pub struct AttachmentResponse {
    pub id: String,
    pub issue_id: String,
    pub uploaded_by: String,
    pub filename: String,
    pub content_type: String,
    pub size: i64,
    pub url: String,
    pub created_at: NaiveDateTime,
}

impl AttachmentResponse {
    fn from_row(a: Attachment) -> Self {
        let url = format!("/api/attachments/{}/download", a.id);
        Self {
            id: a.id,
            issue_id: a.issue_id,
            uploaded_by: a.uploaded_by,
            filename: a.filename,
            content_type: a.content_type,
            size: a.size,
            url,
            created_at: a.created_at,
        }
    }
}

async fn check_issue_access(pool: &SqlitePool, user_id: &str, issue_id: &str) -> Result<()> {
    let has_access: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM issues i JOIN projects p ON i.project_id = p.id JOIN workspace_members wm ON p.workspace_id = wm.workspace_id WHERE i.id = ? AND wm.user_id = ?)"
    )
    .bind(issue_id)
    .bind(user_id)
    .fetch_one(pool)
    .await?;

    if has_access {
        Ok(())
    } else {
        Err(AppError::Forbidden)
    }
}

pub async fn upload_attachment(
    State(pool): State<SqlitePool>,
    State(storage): State<Storage>,
    State(ws_tx): State<RealtimeHub>,
    Extension(user_id): Extension<UserId>,
    Path(issue_id): Path<String>,
    mut multipart: Multipart,
) -> Result<Json<AttachmentResponse>> {
    check_issue_access(&pool, &user_id.0, &issue_id).await?;

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(e.to_string()))?
    {
        let filename = field
            .file_name()
            .map(|s| s.to_string())
            .unwrap_or_else(|| "file".to_string());

        // Sanitize filename: keep only the base name
        let filename = std::path::Path::new(&filename)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("file")
            .to_string();

        let content_type = field
            .content_type()
            .unwrap_or("application/octet-stream")
            .to_string();

        let data = field
            .bytes()
            .await
            .map_err(|e| AppError::BadRequest(e.to_string()))?;

        if data.len() > MAX_FILE_SIZE {
            return Err(AppError::BadRequest(format!(
                "File too large. Maximum size is {} MB",
                MAX_FILE_SIZE / 1024 / 1024
            )));
        }

        if is_blocked_mime(&data) || has_dangerous_magic(&data) {
            return Err(AppError::BadRequest(
                "このファイルタイプはアップロードできません".to_string(),
            ));
        }

        let ext = std::path::Path::new(&filename)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("");

        let storage_key = if ext.is_empty() {
            format!("{}/{}", issue_id, Uuid::new_v4())
        } else {
            format!("{}/{}.{}", issue_id, Uuid::new_v4(), ext)
        };

        storage.put(&storage_key, data.clone()).await.map_err(|e| {
            tracing::error!("Storage put failed: {e}");
            AppError::Internal(e)
        })?;

        let attachment_id = Uuid::new_v4().to_string();
        let size = data.len() as i64;

        sqlx::query(
            "INSERT INTO attachments (id, issue_id, uploaded_by, filename, content_type, size, storage_key) VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&attachment_id)
        .bind(&issue_id)
        .bind(&user_id.0)
        .bind(&filename)
        .bind(&content_type)
        .bind(size)
        .bind(&storage_key)
        .execute(&pool)
        .await?;

        let attachment = sqlx::query_as::<_, Attachment>(
            "SELECT id, issue_id, uploaded_by, filename, content_type, size, storage_key, created_at FROM attachments WHERE id = ?",
        )
        .bind(&attachment_id)
        .fetch_one(&pool)
        .await?;

        // Notify watchers via WebSocket
        let project_id: Option<String> =
            sqlx::query_scalar("SELECT project_id FROM issues WHERE id = ?")
                .bind(&issue_id)
                .fetch_optional(&pool)
                .await?;
        if let Some(pid) = project_id {
            if let Some(workspace_id) = sqlx::query_scalar::<_, String>("SELECT workspace_id FROM projects WHERE id = ?")
                .bind(&pid)
                .fetch_optional(&pool)
                .await
                .ok()
                .flatten()
            {
                ws_tx
                    .publish_workspace(
                        &workspace_id,
                        serde_json::json!({
                            "type": "attachment.created",
                            "issue_id": issue_id,
                            "project_id": pid,
                            "workspace_id": workspace_id,
                        })
                        .to_string(),
                    )
                    .await;
            }
        }

        return Ok(Json(AttachmentResponse::from_row(attachment)));
    }

    Err(AppError::BadRequest("No file uploaded".to_string()))
}

pub async fn list_attachments(
    State(pool): State<SqlitePool>,
    Extension(user_id): Extension<UserId>,
    Path(issue_id): Path<String>,
) -> Result<Json<Vec<AttachmentResponse>>> {
    check_issue_access(&pool, &user_id.0, &issue_id).await?;

    let rows = sqlx::query_as::<_, Attachment>(
        "SELECT id, issue_id, uploaded_by, filename, content_type, size, storage_key, created_at FROM attachments WHERE issue_id = ? ORDER BY created_at ASC",
    )
    .bind(&issue_id)
    .fetch_all(&pool)
    .await?;

    Ok(Json(rows.into_iter().map(AttachmentResponse::from_row).collect()))
}

pub async fn download_attachment(
    State(pool): State<SqlitePool>,
    State(storage): State<Storage>,
    Extension(user_id): Extension<UserId>,
    Path(attachment_id): Path<String>,
) -> Result<Response> {
    let attachment = sqlx::query_as::<_, Attachment>(
        "SELECT id, issue_id, uploaded_by, filename, content_type, size, storage_key, created_at FROM attachments WHERE id = ?",
    )
    .bind(&attachment_id)
    .fetch_optional(&pool)
    .await?
    .ok_or(AppError::NotFound)?;

    check_issue_access(&pool, &user_id.0, &attachment.issue_id).await?;

    let data = storage.get(&attachment.storage_key).await.map_err(|e| {
        tracing::error!("Storage get failed: {e}");
        AppError::Internal(e)
    })?;

    let disposition = format!(
        "attachment; filename=\"{}\"",
        attachment.filename.replace('"', "\\\"")
    );

    let response = Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, attachment.content_type)
        .header(header::CONTENT_DISPOSITION, disposition)
        .header(header::CONTENT_LENGTH, data.len().to_string())
        .body(Body::from(data))
        .map_err(|e| AppError::Internal(anyhow::anyhow!(e)))?;

    Ok(response)
}

pub async fn delete_attachment(
    State(pool): State<SqlitePool>,
    State(storage): State<Storage>,
    Extension(user_id): Extension<UserId>,
    Path(attachment_id): Path<String>,
) -> Result<Json<serde_json::Value>> {
    let attachment = sqlx::query_as::<_, Attachment>(
        "SELECT id, issue_id, uploaded_by, filename, content_type, size, storage_key, created_at FROM attachments WHERE id = ?",
    )
    .bind(&attachment_id)
    .fetch_optional(&pool)
    .await?
    .ok_or(AppError::NotFound)?;

    check_issue_access(&pool, &user_id.0, &attachment.issue_id).await?;

    // Only uploader can delete
    if attachment.uploaded_by != user_id.0 {
        return Err(AppError::Forbidden);
    }

    sqlx::query("DELETE FROM attachments WHERE id = ?")
        .bind(&attachment_id)
        .execute(&pool)
        .await?;

    let _ = storage.delete(&attachment.storage_key).await;

    Ok(Json(serde_json::json!({ "ok": true })))
}
