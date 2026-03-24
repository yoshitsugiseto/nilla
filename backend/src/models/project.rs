use chrono::NaiveDateTime;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub key: String,
    pub description: Option<String>,
    pub workspace_id: Option<String>,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

#[derive(Debug, Deserialize)]
pub struct CreateProject {
    pub name: String,
    pub key: String,
    pub description: Option<String>,
    pub workspace_id: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateProject {
    pub name: Option<String>,
    pub description: Option<String>,
}
