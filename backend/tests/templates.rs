mod common;

use axum::http::StatusCode;
use serde_json::json;

#[tokio::test]
async fn list_templates_empty() {
    let app = common::setup_app().await;
    let pid = common::create_project(&app, "P", "PI").await;

    let (status, json) =
        common::send(&app, common::get(&format!("/api/projects/{pid}/templates"))).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json.as_array().unwrap().len(), 0);
}

#[tokio::test]
async fn create_template_success() {
    let app = common::setup_app().await;
    let pid = common::create_project(&app, "P", "PI").await;

    let (status, json) = common::send(
        &app,
        common::post(
            &format!("/api/projects/{pid}/templates"),
            json!({ "name": "Standard Bug", "type": "bug", "priority": "high" }),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert!(json["id"].as_str().is_some());
    assert_eq!(json["project_id"], pid.as_str());
    assert_eq!(json["name"], "Standard Bug");
    assert_eq!(json["type"], "bug");
    assert_eq!(json["priority"], "high");
    assert!(json["created_at"].as_str().is_some());
}

#[tokio::test]
async fn create_template_defaults() {
    let app = common::setup_app().await;
    let pid = common::create_project(&app, "P", "PI").await;

    let (status, json) = common::send(
        &app,
        common::post(
            &format!("/api/projects/{pid}/templates"),
            json!({ "name": "Quick Task" }),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json["type"], "task");
    assert_eq!(json["priority"], "medium");
}

#[tokio::test]
async fn create_template_empty_name_returns_400() {
    let app = common::setup_app().await;
    let pid = common::create_project(&app, "P", "PI").await;

    let (status, _) = common::send(
        &app,
        common::post(
            &format!("/api/projects/{pid}/templates"),
            json!({ "name": "" }),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn delete_template_success() {
    let app = common::setup_app().await;
    let pid = common::create_project(&app, "P", "PI").await;
    let tid = common::create_template(&app, &pid, "My Template").await;

    let (status, json) = common::send(&app, common::delete(&format!("/api/templates/{tid}"))).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json["ok"], true);
}

#[tokio::test]
async fn update_template_fields() {
    let app = common::setup_app().await;
    let pid = common::create_project(&app, "P", "PI").await;
    let tid = common::create_template(&app, &pid, "Old Name").await;

    let (status, json) = common::send(
        &app,
        common::put(
            &format!("/api/templates/{tid}"),
            json!({ "name": "New Name", "type": "bug", "priority": "high", "points": 3 }),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json["name"], "New Name");
    assert_eq!(json["type"], "bug");
    assert_eq!(json["priority"], "high");
    assert_eq!(json["points"], 3);
}

#[tokio::test]
async fn update_template_partial() {
    let app = common::setup_app().await;
    let pid = common::create_project(&app, "P", "PI").await;
    let tid = common::create_template(&app, &pid, "My Template").await;

    // Only update priority, other fields should stay
    let (status, json) = common::send(
        &app,
        common::put(
            &format!("/api/templates/{tid}"),
            json!({ "priority": "critical" }),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json["name"], "My Template");
    assert_eq!(json["priority"], "critical");
    assert_eq!(json["type"], "task"); // default unchanged
}

#[tokio::test]
async fn update_template_empty_name_returns_400() {
    let app = common::setup_app().await;
    let pid = common::create_project(&app, "P", "PI").await;
    let tid = common::create_template(&app, &pid, "Template").await;

    let (status, _) = common::send(
        &app,
        common::put(&format!("/api/templates/{tid}"), json!({ "name": "" })),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn delete_template_not_found() {
    let app = common::setup_app().await;

    let (status, _) = common::send(&app, common::delete("/api/templates/nonexistent")).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}
