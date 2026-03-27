use serde::{Deserialize, Serialize};

#[derive(Debug, Default, Deserialize, Serialize, Clone)]
pub struct SearchPresetFilters {
    #[serde(default)]
    pub status: String,
    #[serde(default)]
    pub r#type: String,
    #[serde(default)]
    pub priority: String,
    #[serde(default)]
    pub assignee_id: String,
    #[serde(default)]
    pub sprint_id: String,
    #[serde(default)]
    pub due_state: String,
}

#[derive(Debug, sqlx::FromRow)]
pub struct SearchPresetRow {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub query: String,
    pub filters: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize)]
pub struct SearchPreset {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub query: String,
    pub filters: SearchPresetFilters,
    pub created_at: String,
    pub updated_at: String,
}

impl From<SearchPresetRow> for SearchPreset {
    fn from(row: SearchPresetRow) -> Self {
        let filters = serde_json::from_str::<SearchPresetFilters>(&row.filters).unwrap_or_default();
        Self {
            id: row.id,
            project_id: row.project_id,
            name: row.name,
            query: row.query,
            filters,
            created_at: row.created_at,
            updated_at: row.updated_at,
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct CreateSearchPreset {
    pub name: String,
    #[serde(default)]
    pub query: String,
    #[serde(default)]
    pub filters: SearchPresetFilters,
}

#[derive(Debug, Deserialize)]
pub struct UpdateSearchPreset {
    pub name: Option<String>,
    pub query: Option<String>,
    pub filters: Option<SearchPresetFilters>,
}
