use std::fmt;
use std::str::FromStr;

use chrono::{NaiveDate, NaiveDateTime};
use serde::{Deserialize, Deserializer, Serialize};

// ─── Issue Status Enum ───────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum IssueStatus {
    Todo,
    InProgress,
    InReview,
    Done,
}

impl fmt::Display for IssueStatus {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            IssueStatus::Todo => write!(f, "todo"),
            IssueStatus::InProgress => write!(f, "in_progress"),
            IssueStatus::InReview => write!(f, "in_review"),
            IssueStatus::Done => write!(f, "done"),
        }
    }
}

impl FromStr for IssueStatus {
    type Err = String;

    fn from_str(s: &str) -> std::result::Result<Self, Self::Err> {
        match s {
            "todo" => Ok(IssueStatus::Todo),
            "in_progress" => Ok(IssueStatus::InProgress),
            "in_review" => Ok(IssueStatus::InReview),
            "done" => Ok(IssueStatus::Done),
            _ => Err(
                "Invalid status. Must be one of: todo, in_progress, in_review, done".to_string(),
            ),
        }
    }
}

impl IssueStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            IssueStatus::Todo => "todo",
            IssueStatus::InProgress => "in_progress",
            IssueStatus::InReview => "in_review",
            IssueStatus::Done => "done",
        }
    }
}

// ─── Issue Type Enum ─────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum IssueType {
    Story,
    Task,
    Bug,
    Spike,
    Epic,
}

impl fmt::Display for IssueType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

impl FromStr for IssueType {
    type Err = String;

    fn from_str(s: &str) -> std::result::Result<Self, Self::Err> {
        match s {
            "story" => Ok(IssueType::Story),
            "task" => Ok(IssueType::Task),
            "bug" => Ok(IssueType::Bug),
            "spike" => Ok(IssueType::Spike),
            "epic" => Ok(IssueType::Epic),
            _ => {
                Err("Invalid issue type. Must be one of: story, task, bug, spike, epic".to_string())
            }
        }
    }
}

impl IssueType {
    pub fn as_str(&self) -> &'static str {
        match self {
            IssueType::Story => "story",
            IssueType::Task => "task",
            IssueType::Bug => "bug",
            IssueType::Spike => "spike",
            IssueType::Epic => "epic",
        }
    }
}

// ─── Issue Priority Enum ─────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum IssuePriority {
    Critical,
    High,
    Medium,
    Low,
}

impl fmt::Display for IssuePriority {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

impl FromStr for IssuePriority {
    type Err = String;

    fn from_str(s: &str) -> std::result::Result<Self, Self::Err> {
        match s {
            "critical" => Ok(IssuePriority::Critical),
            "high" => Ok(IssuePriority::High),
            "medium" => Ok(IssuePriority::Medium),
            "low" => Ok(IssuePriority::Low),
            _ => Err("Invalid priority. Must be one of: critical, high, medium, low".to_string()),
        }
    }
}

impl IssuePriority {
    pub fn as_str(&self) -> &'static str {
        match self {
            IssuePriority::Critical => "critical",
            IssuePriority::High => "high",
            IssuePriority::Medium => "medium",
            IssuePriority::Low => "low",
        }
    }
}

// ─── Models ──────────────────────────────────────────────────────────────────

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
    pub r#type: IssueType,
    pub status: IssueStatus,
    pub priority: IssuePriority,
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
                    .map_err(
                        |e| tracing::warn!(issue_id = %row.id, "Failed to parse labels JSON: {e}"),
                    )
                    .ok()
            })
            .unwrap_or_default();
        let issue_type = row.r#type.parse::<IssueType>().unwrap_or(IssueType::Task);
        let status = row
            .status
            .parse::<IssueStatus>()
            .unwrap_or(IssueStatus::Todo);
        let priority = row
            .priority
            .parse::<IssuePriority>()
            .unwrap_or(IssuePriority::Medium);
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
            r#type: issue_type,
            status,
            priority,
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
    pub r#type: Option<IssueType>,
    pub priority: Option<IssuePriority>,
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
    pub r#type: Option<IssueType>,
    pub status: Option<IssueStatus>,
    pub priority: Option<IssuePriority>,
    pub points: Option<i64>,
    #[serde(default, deserialize_with = "deserialize_nullable_field")]
    pub assignee_id: Option<Option<String>>,
    pub labels: Option<Vec<String>>,
    #[serde(default, deserialize_with = "deserialize_nullable_field")]
    pub sprint_id: Option<Option<String>>,
    #[serde(default, deserialize_with = "deserialize_nullable_field")]
    pub parent_id: Option<Option<String>>,
    #[serde(default, deserialize_with = "deserialize_nullable_field")]
    pub epic_id: Option<Option<String>>,
    #[serde(default, deserialize_with = "deserialize_nullable_field")]
    pub due_date: Option<Option<NaiveDate>>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateIssueStatus {
    pub status: IssueStatus,
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
    pub status: Option<IssueStatus>,
    pub sprint_id: Option<String>,   // "backlog" = set NULL
    pub assignee_id: Option<String>, // "" = clear
}

fn deserialize_nullable_field<'de, D, T>(
    deserializer: D,
) -> std::result::Result<Option<Option<T>>, D::Error>
where
    D: Deserializer<'de>,
    T: Deserialize<'de>,
{
    Ok(Some(Option::<T>::deserialize(deserializer)?))
}
