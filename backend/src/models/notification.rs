use chrono::NaiveDateTime;
use serde::Serialize;

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct Notification {
    pub id: String,
    pub user_id: String,
    pub issue_id: Option<String>,
    pub r#type: String,
    pub message: String,
    pub read: bool,
    pub created_at: NaiveDateTime,
}
