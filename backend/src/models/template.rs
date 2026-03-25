use chrono::NaiveDateTime;
use serde::{Deserialize, Serialize};

#[derive(Debug, sqlx::FromRow)]
pub struct IssueTemplateRow {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub description: Option<String>,
    pub r#type: String,
    pub priority: String,
    pub labels: Option<String>, // JSON
    pub points: Option<i64>,
    pub created_at: NaiveDateTime,
}

#[derive(Debug, Serialize)]
pub struct IssueTemplate {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub description: Option<String>,
    pub r#type: String,
    pub priority: String,
    pub labels: Vec<String>,
    pub points: Option<i64>,
    pub created_at: NaiveDateTime,
}

impl From<IssueTemplateRow> for IssueTemplate {
    fn from(row: IssueTemplateRow) -> Self {
        let labels = row
            .labels
            .as_deref()
            .and_then(|s| serde_json::from_str(s).ok())
            .unwrap_or_default();
        Self {
            id: row.id,
            project_id: row.project_id,
            name: row.name,
            description: row.description,
            r#type: row.r#type,
            priority: row.priority,
            labels,
            points: row.points,
            created_at: row.created_at,
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct CreateTemplate {
    pub name: String,
    pub description: Option<String>,
    pub r#type: Option<String>,
    pub priority: Option<String>,
    pub labels: Option<Vec<String>>,
    pub points: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateTemplate {
    pub name: Option<String>,
    pub description: Option<String>,
    pub r#type: Option<String>,
    pub priority: Option<String>,
    pub labels: Option<Vec<String>>,
    pub points: Option<i64>,
}
