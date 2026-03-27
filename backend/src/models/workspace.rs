use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct Workspace {
    pub id: String,
    pub name: String,
    pub created_by: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct WorkspaceMember {
    pub workspace_id: String,
    pub user_id: String,
    pub name: String,
    pub email: Option<String>,
    pub avatar_url: Option<String>,
    pub role: String,
    pub joined_at: String,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct ProjectMember {
    pub workspace_id: String,
    pub project_id: String,
    pub user_id: String,
    pub name: String,
    pub email: Option<String>,
    pub avatar_url: Option<String>,
    pub role: String,
    pub workspace_role: String,
    pub inherited: bool,
    pub joined_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateWorkspace {
    pub name: String,
}

#[derive(Debug, Deserialize)]
pub struct AddMember {
    pub user_id: String,
    pub role: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateWorkspace {
    pub name: Option<String>,
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct WorkspaceAutomationSettings {
    pub workspace_id: String,
    pub notify_on_assignee_change: bool,
    pub notify_on_review_ready: bool,
    pub notify_on_overdue_transition: bool,
    pub sprint_carryover_mode: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateWorkspaceAutomationSettings {
    pub notify_on_assignee_change: Option<bool>,
    pub notify_on_review_ready: Option<bool>,
    pub notify_on_overdue_transition: Option<bool>,
    pub sprint_carryover_mode: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateMemberRole {
    pub role: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateProjectMemberRole {
    pub role: String,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct UserInfo {
    pub id: String,
    pub name: String,
    pub email: Option<String>,
    pub avatar_url: Option<String>,
    pub provider: String,
}
