use std::fmt;
use std::str::FromStr;

use chrono::{NaiveDate, NaiveDateTime};
use serde::{Deserialize, Serialize};

// ─── Sprint Status Enum ─────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SprintStatus {
    Planning,
    Active,
    Completed,
}

impl fmt::Display for SprintStatus {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

impl FromStr for SprintStatus {
    type Err = String;

    fn from_str(s: &str) -> std::result::Result<Self, Self::Err> {
        match s {
            "planning" => Ok(SprintStatus::Planning),
            "active" => Ok(SprintStatus::Active),
            "completed" => Ok(SprintStatus::Completed),
            _ => Err(format!(
                "Invalid sprint status '{}'. Must be one of: planning, active, completed",
                s
            )),
        }
    }
}

impl SprintStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            SprintStatus::Planning => "planning",
            SprintStatus::Active => "active",
            SprintStatus::Completed => "completed",
        }
    }
}

// ─── Models ──────────────────────────────────────────────────────────────────

/// Row type for sqlx (reads TEXT column as String)
#[derive(Debug, sqlx::FromRow)]
pub struct SprintRow {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub goal: Option<String>,
    pub status: String,
    pub start_date: Option<NaiveDate>,
    pub end_date: Option<NaiveDate>,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

/// API response type with typed status enum
#[derive(Debug, Serialize)]
pub struct Sprint {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub goal: Option<String>,
    pub status: SprintStatus,
    pub start_date: Option<NaiveDate>,
    pub end_date: Option<NaiveDate>,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

impl From<SprintRow> for Sprint {
    fn from(row: SprintRow) -> Self {
        let status = row.status.parse::<SprintStatus>().unwrap_or(SprintStatus::Planning);
        Self {
            id: row.id,
            project_id: row.project_id,
            name: row.name,
            goal: row.goal,
            status,
            start_date: row.start_date,
            end_date: row.end_date,
            created_at: row.created_at,
            updated_at: row.updated_at,
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct CreateSprint {
    pub name: String,
    pub goal: Option<String>,
    pub start_date: Option<NaiveDate>,
    pub end_date: Option<NaiveDate>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateSprint {
    pub name: Option<String>,
    pub goal: Option<String>,
    pub start_date: Option<NaiveDate>,
    pub end_date: Option<NaiveDate>,
}
