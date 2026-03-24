mod common;

use axum::http::StatusCode;
use serde_json::json;

#[tokio::test]
async fn list_projects_empty() {
    let app = common::setup_app().await;
    let (status, json) = common::send(&app, common::get("/api/projects")).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json, json!([]));
}

#[tokio::test]
async fn create_project_success() {
    let app = common::setup_app().await;
    let ws_id = common::create_workspace(&app).await;
    let (status, json) = common::send(
        &app,
        common::post("/api/projects", json!({ "name": "My Project", "key": "MP", "workspace_id": ws_id })),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json["name"], "My Project");
    assert_eq!(json["key"], "MP");
    assert!(json["id"].is_string());
}

#[tokio::test]
async fn create_project_empty_name_returns_400() {
    let app = common::setup_app().await;
    let ws_id = common::create_workspace(&app).await;
    let (status, _) = common::send(
        &app,
        common::post("/api/projects", json!({ "name": "  ", "key": "MP", "workspace_id": ws_id })),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn create_project_non_alphanumeric_key_returns_400() {
    let app = common::setup_app().await;
    let ws_id = common::create_workspace(&app).await;
    let (status, _) = common::send(
        &app,
        common::post("/api/projects", json!({ "name": "Project", "key": "MY-KEY", "workspace_id": ws_id })),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn create_project_duplicate_key_returns_conflict() {
    let app = common::setup_app().await;
    let ws_id = common::create_workspace(&app).await;
    common::create_project_in(&app, "Project A", "PA", &ws_id).await;
    let (status, _) = common::send(
        &app,
        common::post("/api/projects", json!({ "name": "Project B", "key": "PA", "workspace_id": ws_id })),
    )
    .await;
    assert_eq!(status, StatusCode::CONFLICT);
}

#[tokio::test]
async fn get_project_returns_correct_data() {
    let app = common::setup_app().await;
    let id = common::create_project(&app, "My Project", "MP").await;
    let (status, json) = common::send(&app, common::get(&format!("/api/projects/{id}"))).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json["id"], id);
    assert_eq!(json["name"], "My Project");
}

#[tokio::test]
async fn get_project_not_found_returns_forbidden() {
    // Non-existent project: check_project_access returns 403 (user is not a member)
    // This is intentional — prevents leaking whether a resource exists.
    let app = common::setup_app().await;
    let (status, _) = common::send(&app, common::get("/api/projects/nonexistent")).await;
    assert_eq!(status, StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn update_project_name() {
    let app = common::setup_app().await;
    let id = common::create_project(&app, "Original", "OG").await;
    let (status, json) = common::send(
        &app,
        common::put(&format!("/api/projects/{id}"), json!({ "name": "Updated" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json["name"], "Updated");
    // key should be unchanged
    assert_eq!(json["key"], "OG");
}

#[tokio::test]
async fn delete_project_cascades_issues_and_sprints() {
    let app = common::setup_app().await;
    let pid = common::create_project(&app, "P", "PC").await;
    let sid = common::create_sprint(&app, &pid, "Sprint 1").await;
    let iid = common::create_issue(&app, &pid, "Issue 1").await;

    let (status, json) =
        common::send(&app, common::delete(&format!("/api/projects/{pid}"))).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json["ok"], true);

    // project gone — user no longer has membership → 403
    let (status, _) = common::send(&app, common::get(&format!("/api/projects/{pid}"))).await;
    assert_eq!(status, StatusCode::FORBIDDEN);

    // issue cascade-deleted → 404
    let (status, _) = common::send(&app, common::get(&format!("/api/issues/{iid}"))).await;
    assert_eq!(status, StatusCode::NOT_FOUND);

    // sprint cascade-deleted → 404
    let (status, _) = common::send(&app, common::get(&format!("/api/sprints/{sid}"))).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}
