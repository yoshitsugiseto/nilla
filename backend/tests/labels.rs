mod common;

use axum::http::StatusCode;
use serde_json::json;

#[tokio::test]
async fn list_labels_empty() {
    let app = common::setup_app().await;
    let pid = common::create_project(&app, "P", "PI").await;

    let (status, json) =
        common::send(&app, common::get(&format!("/api/projects/{pid}/labels"))).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json.as_array().unwrap().len(), 0);
}

#[tokio::test]
async fn create_label_success() {
    let app = common::setup_app().await;
    let pid = common::create_project(&app, "P", "PI").await;

    let (status, json) = common::send(
        &app,
        common::post(
            &format!("/api/projects/{pid}/labels"),
            json!({ "name": "Bug", "color": "#ef4444" }),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert!(json["id"].as_str().is_some());
    assert_eq!(json["project_id"], pid.as_str());
    assert_eq!(json["name"], "Bug");
    assert_eq!(json["color"], "#ef4444");
    assert!(json["created_at"].as_str().is_some());
}

#[tokio::test]
async fn create_label_default_color() {
    let app = common::setup_app().await;
    let pid = common::create_project(&app, "P", "PI").await;

    let (status, json) = common::send(
        &app,
        common::post(
            &format!("/api/projects/{pid}/labels"),
            json!({ "name": "Feature" }),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json["color"], "#6366f1");
}

#[tokio::test]
async fn create_label_empty_name_returns_400() {
    let app = common::setup_app().await;
    let pid = common::create_project(&app, "P", "PI").await;

    let (status, _) = common::send(
        &app,
        common::post(
            &format!("/api/projects/{pid}/labels"),
            json!({ "name": "" }),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn delete_label_success() {
    let app = common::setup_app().await;
    let pid = common::create_project(&app, "P", "PI").await;
    let lid = common::create_label(&app, &pid, "Bug").await;

    let (status, json) =
        common::send(&app, common::delete(&format!("/api/labels/{lid}"))).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json["ok"], true);
}

#[tokio::test]
async fn update_label_name_and_color() {
    let app = common::setup_app().await;
    let pid = common::create_project(&app, "P", "PI").await;
    let lid = common::create_label(&app, &pid, "OldName").await;

    let (status, json) = common::send(
        &app,
        common::put(
            &format!("/api/labels/{lid}"),
            json!({ "name": "NewName", "color": "#ff0000" }),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json["name"], "NewName");
    assert_eq!(json["color"], "#ff0000");
}

#[tokio::test]
async fn update_label_partial() {
    let app = common::setup_app().await;
    let pid = common::create_project(&app, "P", "PI").await;
    let lid = common::create_label(&app, &pid, "Feature").await;

    // Only update color, name should stay
    let (status, json) = common::send(
        &app,
        common::put(&format!("/api/labels/{lid}"), json!({ "color": "#00ff00" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json["name"], "Feature");
    assert_eq!(json["color"], "#00ff00");
}

#[tokio::test]
async fn update_label_empty_name_returns_400() {
    let app = common::setup_app().await;
    let pid = common::create_project(&app, "P", "PI").await;
    let lid = common::create_label(&app, &pid, "Label").await;

    let (status, _) = common::send(
        &app,
        common::put(&format!("/api/labels/{lid}"), json!({ "name": "" })),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn delete_label_not_found() {
    let app = common::setup_app().await;

    let (status, _) =
        common::send(&app, common::delete("/api/labels/nonexistent")).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}
