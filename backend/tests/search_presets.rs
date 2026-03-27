mod common;

use axum::http::StatusCode;
use serde_json::json;

#[tokio::test]
async fn search_presets_can_be_created_listed_updated_and_deleted() {
    let app = common::setup_app().await;
    let pid = common::create_project(&app, "P", "SP").await;

    let (status, created) = common::send(
        &app,
        common::post(
            &format!("/api/projects/{pid}/search-presets"),
            json!({
                "name": "Overdue triage",
                "query": "",
                "filters": {
                    "status": "",
                    "type": "",
                    "priority": "",
                    "assignee_id": "",
                    "sprint_id": "",
                    "due_state": "overdue"
                }
            }),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let preset_id = created["id"].as_str().unwrap().to_string();
    assert_eq!(created["name"], "Overdue triage");

    let (status, listed) = common::send(
        &app,
        common::get(&format!("/api/projects/{pid}/search-presets")),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let items = listed.as_array().unwrap();
    assert_eq!(items.len(), 1);
    assert_eq!(items[0]["filters"]["due_state"], "overdue");

    let (status, updated) = common::send(
        &app,
        common::put(
            &format!("/api/search-presets/{preset_id}"),
            json!({ "name": "Review triage", "filters": { "status": "in_review" } }),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(updated["name"], "Review triage");
    assert_eq!(updated["filters"]["status"], "in_review");

    let (status, deleted) =
        common::send(&app, common::delete(&format!("/api/search-presets/{preset_id}"))).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(deleted["ok"], true);
}

#[tokio::test]
async fn viewers_can_list_but_not_create_search_presets() {
    let app = common::setup_app().await;
    let ws_id = common::create_workspace(&app).await;
    let pid = common::create_project_in(&app, "P", "SP", &ws_id).await;

    common::send(
        &app,
        common::patch(
            &format!("/api/projects/{pid}/members/{}", common::TEST_USER_ID),
            json!({ "role": "viewer" }),
        ),
    )
    .await;

    let (status, listed) = common::send(
        &app,
        common::get(&format!("/api/projects/{pid}/search-presets")),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert!(listed.as_array().unwrap().is_empty());

    let (status, _) = common::send(
        &app,
        common::post(
            &format!("/api/projects/{pid}/search-presets"),
            json!({ "name": "Viewer preset", "query": "", "filters": {} }),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN);
}
