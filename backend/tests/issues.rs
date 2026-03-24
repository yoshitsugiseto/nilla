mod common;

use axum::http::StatusCode;
use serde_json::json;

#[tokio::test]
async fn create_issue_success() {
    let app = common::setup_app().await;
    let pid = common::create_project(&app, "P", "PI").await;

    let (status, json) = common::send(
        &app,
        common::post(
            &format!("/api/projects/{pid}/issues"),
            json!({ "title": "My Issue", "type": "task", "priority": "high", "points": 3 }),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json["title"], "My Issue");
    assert_eq!(json["status"], "todo");
    assert_eq!(json["type"], "task");
    assert_eq!(json["priority"], "high");
    assert_eq!(json["points"], 3);
    assert_eq!(json["number"], 1);
}

#[tokio::test]
async fn create_issue_auto_increments_number() {
    let app = common::setup_app().await;
    let pid = common::create_project(&app, "P", "PI").await;

    common::create_issue(&app, &pid, "Issue 1").await;
    let (_, json) = common::send(
        &app,
        common::post(
            &format!("/api/projects/{pid}/issues"),
            json!({ "title": "Issue 2" }),
        ),
    )
    .await;
    assert_eq!(json["number"], 2);
}

#[tokio::test]
async fn create_issue_empty_title_returns_400() {
    let app = common::setup_app().await;
    let pid = common::create_project(&app, "P", "PI").await;

    let (status, json) = common::send(
        &app,
        common::post(
            &format!("/api/projects/{pid}/issues"),
            json!({ "title": "" }),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert!(json["error"].as_str().unwrap().contains("title"));
}

#[tokio::test]
async fn create_issue_invalid_type_returns_400() {
    let app = common::setup_app().await;
    let pid = common::create_project(&app, "P", "PI").await;

    let (status, _) = common::send(
        &app,
        common::post(
            &format!("/api/projects/{pid}/issues"),
            json!({ "title": "Issue", "type": "epic" }),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn create_issue_points_over_999_returns_400() {
    let app = common::setup_app().await;
    let pid = common::create_project(&app, "P", "PI").await;

    let (status, _) = common::send(
        &app,
        common::post(
            &format!("/api/projects/{pid}/issues"),
            json!({ "title": "Issue", "points": 1000 }),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn create_issue_negative_points_returns_400() {
    let app = common::setup_app().await;
    let pid = common::create_project(&app, "P", "PI").await;

    let (status, _) = common::send(
        &app,
        common::post(
            &format!("/api/projects/{pid}/issues"),
            json!({ "title": "Issue", "points": -1 }),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn create_issue_parent_must_be_story() {
    let app = common::setup_app().await;
    let pid = common::create_project(&app, "P", "PI").await;
    let task_id = common::create_issue(&app, &pid, "Task").await;

    let (status, _) = common::send(
        &app,
        common::post(
            &format!("/api/projects/{pid}/issues"),
            json!({ "title": "Child", "parent_id": task_id }),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn list_issues_returns_x_total_count_header() {
    let app = common::setup_app().await;
    let pid = common::create_project(&app, "P", "PI").await;
    common::create_issue(&app, &pid, "Issue 1").await;
    common::create_issue(&app, &pid, "Issue 2").await;

    let (status, headers, json) =
        common::send_with_headers(&app, common::get(&format!("/api/projects/{pid}/issues"))).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(headers.get("x-total-count").unwrap(), "2");
    assert_eq!(json.as_array().unwrap().len(), 2);
}

#[tokio::test]
async fn list_issues_pagination_limit_offset() {
    let app = common::setup_app().await;
    let pid = common::create_project(&app, "P", "PI").await;
    for i in 1..=5 {
        common::create_issue(&app, &pid, &format!("Issue {i}")).await;
    }

    let (_, headers, json) = common::send_with_headers(
        &app,
        common::get(&format!("/api/projects/{pid}/issues?limit=2&offset=0")),
    )
    .await;
    assert_eq!(headers.get("x-total-count").unwrap(), "5");
    assert_eq!(json.as_array().unwrap().len(), 2);

    let (_, _, page2) = common::send_with_headers(
        &app,
        common::get(&format!("/api/projects/{pid}/issues?limit=2&offset=4")),
    )
    .await;
    assert_eq!(page2.as_array().unwrap().len(), 1);
}

#[tokio::test]
async fn list_issues_filter_by_backlog() {
    let app = common::setup_app().await;
    let pid = common::create_project(&app, "P", "PI").await;
    let sid = common::create_sprint(&app, &pid, "Sprint 1").await;

    // issue in sprint
    common::send(
        &app,
        common::post(
            &format!("/api/projects/{pid}/issues"),
            json!({ "title": "Sprinted", "sprint_id": sid }),
        ),
    )
    .await;
    // issue in backlog
    common::create_issue(&app, &pid, "Backlog item").await;

    let (_, _, json) = common::send_with_headers(
        &app,
        common::get(&format!("/api/projects/{pid}/issues?sprint_id=backlog")),
    )
    .await;
    let items = json.as_array().unwrap();
    assert_eq!(items.len(), 1);
    assert_eq!(items[0]["title"], "Backlog item");
}

#[tokio::test]
async fn list_issues_search_query() {
    let app = common::setup_app().await;
    let pid = common::create_project(&app, "P", "PI").await;
    common::create_issue(&app, &pid, "Login bug fix").await;
    common::create_issue(&app, &pid, "Dashboard redesign").await;

    let (_, headers, json) = common::send_with_headers(
        &app,
        common::get(&format!("/api/projects/{pid}/issues?q=login")),
    )
    .await;
    assert_eq!(headers.get("x-total-count").unwrap(), "1");
    assert_eq!(json.as_array().unwrap()[0]["title"], "Login bug fix");
}

#[tokio::test]
async fn get_issue_not_found() {
    let app = common::setup_app().await;
    let (status, _) = common::send(&app, common::get("/api/issues/nonexistent")).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn update_issue_status_creates_activity_log() {
    let app = common::setup_app().await;
    let pid = common::create_project(&app, "P", "PI").await;
    let iid = common::create_issue(&app, &pid, "Issue").await;

    let (status, json) = common::send(
        &app,
        common::patch(
            &format!("/api/issues/{iid}/status"),
            json!({ "status": "in_progress" }),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json["status"], "in_progress");

    let (_, logs) =
        common::send(&app, common::get(&format!("/api/issues/{iid}/activity"))).await;
    let logs = logs.as_array().unwrap();
    assert_eq!(logs.len(), 1);
    assert_eq!(logs[0]["field"], "status");
    assert_eq!(logs[0]["old_value"], "todo");
    assert_eq!(logs[0]["new_value"], "in_progress");
}

#[tokio::test]
async fn update_issue_status_invalid_returns_400() {
    let app = common::setup_app().await;
    let pid = common::create_project(&app, "P", "PI").await;
    let iid = common::create_issue(&app, &pid, "Issue").await;

    let (status, _) = common::send(
        &app,
        common::patch(
            &format!("/api/issues/{iid}/status"),
            json!({ "status": "wont_do" }),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn delete_issue_cascades_subtasks() {
    let app = common::setup_app().await;
    let pid = common::create_project(&app, "P", "PI").await;

    let (_, story) = common::send(
        &app,
        common::post(
            &format!("/api/projects/{pid}/issues"),
            json!({ "title": "Story", "type": "story" }),
        ),
    )
    .await;
    let story_id = story["id"].as_str().unwrap().to_string();

    let (_, child) = common::send(
        &app,
        common::post(
            &format!("/api/projects/{pid}/issues"),
            json!({ "title": "Child task", "parent_id": story_id }),
        ),
    )
    .await;
    let child_id = child["id"].as_str().unwrap().to_string();

    let (status, _) =
        common::send(&app, common::delete(&format!("/api/issues/{story_id}"))).await;
    assert_eq!(status, StatusCode::OK);

    // child should be gone
    let (status, _) = common::send(&app, common::get(&format!("/api/issues/{child_id}"))).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn add_and_list_comments() {
    let app = common::setup_app().await;
    let pid = common::create_project(&app, "P", "PI").await;
    let iid = common::create_issue(&app, &pid, "Issue").await;

    // author is derived from JWT user, not request body
    let (status, json) = common::send(
        &app,
        common::post(
            &format!("/api/issues/{iid}/comments"),
            json!({ "body": "LGTM!" }),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json["author_name"], "Test User");

    let (_, comments) =
        common::send(&app, common::get(&format!("/api/issues/{iid}/comments"))).await;
    assert_eq!(comments.as_array().unwrap().len(), 1);
}
