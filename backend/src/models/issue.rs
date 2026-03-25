use chrono::{NaiveDate, NaiveDateTime};
use serde::{Deserialize, Serialize};

#[derive(Debug, sqlx::FromRow)]
pub struct IssueRow {
    pub id: String,
    pub project_id: String,
    pub sprint_id: Option<String>,
    pub parent_id: Option<String>,
    pub epic_id: Option<String>,
    pub epic_title: Option<String>,
    pub number: i64,
    pub title: String,
    pub description: Option<String>,
    pub r#type: String,
    pub status: String,
    pub priority: String,
    pub points: Option<i64>,
    pub assignee_id: Option<String>,
    pub assignee_name: Option<String>,
    pub assignee_avatar_url: Option<String>,
    pub labels: Option<String>, // JSON string
    pub position: i64,
    pub due_date: Option<NaiveDate>,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

#[derive(Debug, Serialize)]
pub struct Issue {
    pub id: String,
    pub project_id: String,
    pub sprint_id: Option<String>,
    pub parent_id: Option<String>,
    pub epic_id: Option<String>,
    pub epic_title: Option<String>,
    pub number: i64,
    pub title: String,
    pub description: Option<String>,
    pub r#type: String,
    pub status: String,
    pub priority: String,
    pub points: Option<i64>,
    pub assignee_id: Option<String>,
    pub assignee_name: Option<String>,
    pub assignee_avatar_url: Option<String>,
    pub labels: Vec<String>,
    pub position: i64,
    pub due_date: Option<NaiveDate>,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

impl From<IssueRow> for Issue {
    fn from(row: IssueRow) -> Self {
        let labels = row
            .labels
            .as_deref()
            .and_then(|s| {
                serde_json::from_str(s)
                    .map_err(|e| tracing::warn!(issue_id = %row.id, "Failed to parse labels JSON: {e}"))
                    .ok()
            })
            .unwrap_or_default();
        Self {
            id: row.id,
            project_id: row.project_id,
            sprint_id: row.sprint_id,
            parent_id: row.parent_id,
            epic_id: row.epic_id,
            epic_title: row.epic_title,
            number: row.number,
            title: row.title,
            description: row.description,
            r#type: row.r#type,
            status: row.status,
            priority: row.priority,
            points: row.points,
            assignee_id: row.assignee_id,
            assignee_name: row.assignee_name,
            assignee_avatar_url: row.assignee_avatar_url,
            labels,
            position: row.position,
            due_date: row.due_date,
            created_at: row.created_at,
            updated_at: row.updated_at,
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct CreateIssue {
    pub title: String,
    pub description: Option<String>,
    pub r#type: Option<String>,
    pub priority: Option<String>,
    pub points: Option<i64>,
    pub assignee_id: Option<String>,
    pub labels: Option<Vec<String>>,
    pub sprint_id: Option<String>,
    pub parent_id: Option<String>,
    pub epic_id: Option<String>,
    pub due_date: Option<NaiveDate>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateIssue {
    pub title: Option<String>,
    pub description: Option<String>,
    pub r#type: Option<String>,
    pub status: Option<String>,
    pub priority: Option<String>,
    pub points: Option<i64>,
    pub assignee_id: Option<String>,
    pub labels: Option<Vec<String>>,
    pub sprint_id: Option<String>,
    pub parent_id: Option<String>,
    pub epic_id: Option<String>,
    pub due_date: Option<NaiveDate>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateIssueStatus {
    pub status: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateIssueSprint {
    pub sprint_id: Option<String>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct IssueLink {
    pub id: String,
    pub source_issue_id: String,
    pub target_issue_id: String,
    pub link_type: String,
    pub linked_issue_id: String,
    pub linked_issue_number: i64,
    pub linked_issue_title: String,
    pub linked_issue_status: String,
    pub linked_issue_type: String,
    pub created_at: NaiveDateTime,
}

#[derive(Debug, Deserialize)]
pub struct CreateIssueLink {
    pub target_issue_id: String,
    pub link_type: String,
}

#[derive(Debug, Deserialize, Default)]
pub struct IssueFilters {
    pub sprint_id: Option<String>,
    pub status: Option<String>,
    pub r#type: Option<String>,
    pub priority: Option<String>,
    pub assignee_id: Option<String>,
    pub q: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct BulkUpdateIssues {
    pub issue_ids: Vec<String>,
    pub status: Option<String>,
    pub sprint_id: Option<String>, // "backlog" = set NULL
    pub assignee_id: Option<String>, // "" = clear
}
