mod attachments;
mod issues;
mod labels;
mod notifications;
mod projects;
mod sprints;
mod templates;
mod workspaces;

use axum::{
    routing::{delete, get, patch, post, put},
    Router,
};

use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        // Projects
        .route(
            "/api/projects",
            get(projects::list_projects).post(projects::create_project),
        )
        .route(
            "/api/projects/{id}",
            get(projects::get_project)
                .put(projects::update_project)
                .delete(projects::delete_project),
        )
        // Project members (for assignee picker)
        .route(
            "/api/projects/{id}/members",
            get(workspaces::get_project_members),
        )
        .route(
            "/api/projects/{id}/members/{uid}",
            patch(workspaces::update_project_member_role)
                .delete(workspaces::clear_project_member_role),
        )
        // Sprints
        .route(
            "/api/projects/{id}/sprints",
            get(sprints::list_sprints).post(sprints::create_sprint),
        )
        .route(
            "/api/sprints/{id}",
            get(sprints::get_sprint)
                .put(sprints::update_sprint)
                .delete(sprints::delete_sprint),
        )
        .route("/api/sprints/{id}/start", post(sprints::start_sprint))
        .route("/api/sprints/{id}/complete", post(sprints::complete_sprint))
        .route("/api/sprints/{id}/burndown", get(sprints::get_burndown))
        .route("/api/projects/{id}/velocity", get(sprints::get_velocity))
        // Issues
        .route(
            "/api/projects/{id}/issues",
            get(issues::list_issues).post(issues::create_issue),
        )
        .route(
            "/api/issues/{id}",
            get(issues::get_issue)
                .put(issues::update_issue)
                .delete(issues::delete_issue),
        )
        .route(
            "/api/issues/{id}/status",
            patch(issues::update_issue_status),
        )
        .route(
            "/api/issues/{id}/sprint",
            patch(issues::update_issue_sprint),
        )
        .route("/api/issues/{id}/children", get(issues::list_children))
        .route(
            "/api/projects/{id}/issues/reorder",
            put(issues::reorder_issues),
        )
        .route(
            "/api/issues/{id}/comments",
            get(issues::list_comments).post(issues::create_comment),
        )
        .route("/api/issues/{id}/activity", get(issues::list_activity))
        .route(
            "/api/issues/{id}/links",
            get(issues::list_links).post(issues::create_link),
        )
        .route("/api/issue-links/{id}", delete(issues::delete_link))
        .route(
            "/api/projects/{id}/issues/bulk",
            patch(issues::bulk_update_issues),
        )
        // Labels
        .route(
            "/api/projects/{id}/labels",
            get(labels::list_labels).post(labels::create_label),
        )
        .route(
            "/api/labels/{id}",
            put(labels::update_label).delete(labels::delete_label),
        )
        // Templates
        .route(
            "/api/projects/{id}/templates",
            get(templates::list_templates).post(templates::create_template),
        )
        .route(
            "/api/templates/{id}",
            put(templates::update_template).delete(templates::delete_template),
        )
        // Workspaces
        .route(
            "/api/workspaces",
            get(workspaces::list_workspaces).post(workspaces::create_workspace),
        )
        .route(
            "/api/workspaces/{id}",
            get(workspaces::get_workspace).put(workspaces::update_workspace),
        )
        .route(
            "/api/workspaces/{id}/members",
            get(workspaces::list_members).post(workspaces::add_member),
        )
        .route(
            "/api/workspaces/{id}/members/{uid}",
            patch(workspaces::update_member_role).delete(workspaces::remove_member),
        )
        // Attachments
        .route(
            "/api/issues/{id}/attachments",
            get(attachments::list_attachments).post(attachments::upload_attachment),
        )
        .route(
            "/api/attachments/{id}/download",
            get(attachments::download_attachment),
        )
        .route(
            "/api/attachments/{id}",
            delete(attachments::delete_attachment),
        )
        // Notifications
        .route("/api/notifications", get(notifications::list_notifications))
        .route(
            "/api/notifications/{id}/read",
            patch(notifications::mark_read),
        )
        .route(
            "/api/notifications/{id}",
            delete(notifications::delete_notification),
        )
        .route(
            "/api/notifications/read-all",
            post(notifications::mark_all_read),
        )
        // Users
        .route("/api/users", get(workspaces::list_users))
}
