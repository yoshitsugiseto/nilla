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
            json!({ "title": "Issue", "type": "invalid_type" }),
        ),
    )
    .await;
    // Invalid enum variant is rejected at deserialization (422 Unprocessable Entity)
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
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
async fn list_issues_filter_by_unassigned() {
    let app = common::setup_app().await;
    let pid = common::create_project(&app, "P", "PI").await;

    common::send(
        &app,
        common::post(
            &format!("/api/projects/{pid}/issues"),
            json!({ "title": "Assigned", "assignee_id": common::TEST_USER_ID }),
        ),
    )
    .await;
    common::create_issue(&app, &pid, "Unassigned").await;

    let (_, _, json) = common::send_with_headers(
        &app,
        common::get(&format!(
            "/api/projects/{pid}/issues?assignee_id=__unassigned__"
        )),
    )
    .await;
    let items = json.as_array().unwrap();
    assert_eq!(items.len(), 1);
    assert_eq!(items[0]["title"], "Unassigned");
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
    // Invalid enum variant is rejected at deserialization (422 Unprocessable Entity)
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
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
async fn update_issue_fields() {
    let app = common::setup_app().await;
    let pid = common::create_project(&app, "P", "PI").await;
    let iid = common::create_issue(&app, &pid, "Original").await;

    let (status, json) = common::send(
        &app,
        common::put(
            &format!("/api/issues/{iid}"),
            json!({
                "title": "Updated Title",
                "description": "Some description",
                "priority": "critical",
                "points": 5
            }),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json["title"], "Updated Title");
    assert_eq!(json["description"], "Some description");
    assert_eq!(json["priority"], "critical");
    assert_eq!(json["points"], 5);
}

#[tokio::test]
async fn update_issue_can_clear_assignee() {
    let app = common::setup_app().await;
    let pid = common::create_project(&app, "P", "PI").await;

    let (_, created) = common::send(
        &app,
        common::post(
            &format!("/api/projects/{pid}/issues"),
            json!({ "title": "Assigned", "assignee_id": common::TEST_USER_ID }),
        ),
    )
    .await;
    let iid = created["id"].as_str().unwrap().to_string();

    let (status, json) = common::send(
        &app,
        common::put(&format!("/api/issues/{iid}"), json!({ "assignee_id": null })),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert!(json["assignee_id"].is_null());
}

#[tokio::test]
async fn create_issue_with_cross_project_sprint_returns_400() {
    let app = common::setup_app().await;
    let pid_a = common::create_project(&app, "P1", "P1").await;
    let pid_b = common::create_project(&app, "P2", "P2").await;
    let sid_b = common::create_sprint(&app, &pid_b, "Sprint B").await;

    let (status, _) = common::send(
        &app,
        common::post(
            &format!("/api/projects/{pid_a}/issues"),
            json!({ "title": "Cross sprint", "sprint_id": sid_b }),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn update_issue_parent_must_be_story() {
    let app = common::setup_app().await;
    let pid = common::create_project(&app, "P", "PI").await;
    let iid = common::create_issue(&app, &pid, "Child").await;
    let task_id = common::create_issue(&app, &pid, "Task").await;

    let (status, _) = common::send(
        &app,
        common::put(
            &format!("/api/issues/{iid}"),
            json!({ "parent_id": task_id }),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn update_issue_epic_must_be_epic() {
    let app = common::setup_app().await;
    let pid = common::create_project(&app, "P", "PI").await;
    let iid = common::create_issue(&app, &pid, "Task").await;
    let (_, story) = common::send(
        &app,
        common::post(
            &format!("/api/projects/{pid}/issues"),
            json!({ "title": "Story", "type": "story" }),
        ),
    )
    .await
    ;
    let story_id = story["id"]
        .as_str()
        .unwrap()
        .to_string();

    let (status, _) = common::send(
        &app,
        common::put(
            &format!("/api/issues/{iid}"),
            json!({ "epic_id": story_id }),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn update_issue_empty_title_returns_400() {
    let app = common::setup_app().await;
    let pid = common::create_project(&app, "P", "PI").await;
    let iid = common::create_issue(&app, &pid, "Issue").await;

    let (status, _) = common::send(
        &app,
        common::put(&format!("/api/issues/{iid}"), json!({ "title": "" })),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn create_issue_with_labels() {
    let app = common::setup_app().await;
    let pid = common::create_project(&app, "P", "PI").await;

    let (status, json) = common::send(
        &app,
        common::post(
            &format!("/api/projects/{pid}/issues"),
            json!({ "title": "Labeled", "labels": ["frontend", "bug"] }),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let labels = json["labels"].as_array().unwrap();
    assert_eq!(labels.len(), 2);
    assert!(labels.iter().any(|l| l == "frontend"));
    assert!(labels.iter().any(|l| l == "bug"));
}

#[tokio::test]
async fn create_epic_success() {
    let app = common::setup_app().await;
    let pid = common::create_project(&app, "P", "PI").await;

    let (status, json) = common::send(
        &app,
        common::post(
            &format!("/api/projects/{pid}/issues"),
            json!({ "title": "Big Feature Epic", "type": "epic" }),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json["type"], "epic");
    assert!(json["epic_id"].is_null());
}

#[tokio::test]
async fn create_issue_with_valid_epic_id() {
    let app = common::setup_app().await;
    let pid = common::create_project(&app, "P", "PI").await;

    // create epic first
    let (_, epic) = common::send(
        &app,
        common::post(
            &format!("/api/projects/{pid}/issues"),
            json!({ "title": "Epic", "type": "epic" }),
        ),
    )
    .await;
    let epic_id = epic["id"].as_str().unwrap().to_string();

    let (status, json) = common::send(
        &app,
        common::post(
            &format!("/api/projects/{pid}/issues"),
            json!({ "title": "Story under epic", "type": "story", "epic_id": epic_id }),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json["epic_id"], epic_id);
    assert_eq!(json["epic_title"], "Epic");
}

#[tokio::test]
async fn create_issue_non_epic_as_epic_id_returns_400() {
    let app = common::setup_app().await;
    let pid = common::create_project(&app, "P", "PI").await;
    let task_id = common::create_issue(&app, &pid, "Task").await;

    let (status, _) = common::send(
        &app,
        common::post(
            &format!("/api/projects/{pid}/issues"),
            json!({ "title": "Story", "epic_id": task_id }),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn create_and_list_issue_links() {
    let app = common::setup_app().await;
    let pid = common::create_project(&app, "P", "PI").await;
    let iid1 = common::create_issue(&app, &pid, "Issue A").await;
    let iid2 = common::create_issue(&app, &pid, "Issue B").await;

    let (status, json) = common::send(
        &app,
        common::post(
            &format!("/api/issues/{iid1}/links"),
            json!({ "target_issue_id": iid2, "link_type": "blocks" }),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json["link_type"], "blocks");
    assert_eq!(json["linked_issue_title"], "Issue B");

    let (status, links) =
        common::send(&app, common::get(&format!("/api/issues/{iid1}/links"))).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(links.as_array().unwrap().len(), 1);
}

#[tokio::test]
async fn delete_issue_link() {
    let app = common::setup_app().await;
    let pid = common::create_project(&app, "P", "PI").await;
    let iid1 = common::create_issue(&app, &pid, "Issue A").await;
    let iid2 = common::create_issue(&app, &pid, "Issue B").await;

    let (_, link) = common::send(
        &app,
        common::post(
            &format!("/api/issues/{iid1}/links"),
            json!({ "target_issue_id": iid2, "link_type": "relates_to" }),
        ),
    )
    .await;
    let link_id = link["id"].as_str().unwrap().to_string();

    let (status, json) =
        common::send(&app, common::delete(&format!("/api/issue-links/{link_id}"))).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json["ok"], true);

    let (_, links) =
        common::send(&app, common::get(&format!("/api/issues/{iid1}/links"))).await;
    assert_eq!(links.as_array().unwrap().len(), 0);
}

#[tokio::test]
async fn update_issue_sprint() {
    let app = common::setup_app().await;
    let pid = common::create_project(&app, "P", "PI").await;
    let iid = common::create_issue(&app, &pid, "Issue").await;
    let sid = common::create_sprint(&app, &pid, "Sprint 1").await;

    let (status, json) = common::send(
        &app,
        common::patch(
            &format!("/api/issues/{iid}/sprint"),
            json!({ "sprint_id": sid }),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json["sprint_id"], sid);

    // Move back to backlog
    let (status, json) = common::send(
        &app,
        common::patch(
            &format!("/api/issues/{iid}/sprint"),
            json!({ "sprint_id": null }),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert!(json["sprint_id"].is_null());
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
