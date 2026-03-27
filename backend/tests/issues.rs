mod common;

use axum::http::StatusCode;
use serde_json::json;
use sqlx::SqlitePool;

async fn add_workspace_member(
    pool: &SqlitePool,
    workspace_id: &str,
    user_id: &str,
    name: &str,
    email: &str,
    role: &str,
) {
    sqlx::query(
        "INSERT INTO users (id, provider, provider_id, email, name, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, email = excluded.email, updated_at = excluded.updated_at",
    )
    .bind(user_id)
    .bind("test")
    .bind(format!("provider-{user_id}"))
    .bind(email)
    .bind(name)
    .bind("2026-01-01T00:00:00")
    .bind("2026-01-01T00:00:00")
    .execute(pool)
    .await
    .unwrap();

    sqlx::query(
        "INSERT INTO workspace_members (workspace_id, user_id, role, joined_at)
         VALUES (?, ?, ?, ?)",
    )
    .bind(workspace_id)
    .bind(user_id)
    .bind(role)
    .bind("2026-01-01T00:00:00")
    .execute(pool)
    .await
    .unwrap();
}

async fn count_notifications(pool: &SqlitePool, user_id: &str, notif_type: &str) -> i64 {
    sqlx::query_scalar("SELECT COUNT(*) FROM notifications WHERE user_id = ? AND type = ?")
        .bind(user_id)
        .bind(notif_type)
        .fetch_one(pool)
        .await
        .unwrap()
}

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
async fn list_issues_filter_by_overdue() {
    let app = common::setup_app().await;
    let pid = common::create_project(&app, "P", "PI").await;
    let overdue_date = (chrono::Utc::now().date_naive() - chrono::Duration::days(1)).to_string();
    let future_date = (chrono::Utc::now().date_naive() + chrono::Duration::days(2)).to_string();

    common::send(
        &app,
        common::post(
            &format!("/api/projects/{pid}/issues"),
            json!({ "title": "Overdue", "due_date": overdue_date }),
        ),
    )
    .await;
    common::send(
        &app,
        common::post(
            &format!("/api/projects/{pid}/issues"),
            json!({ "title": "Upcoming", "due_date": future_date }),
        ),
    )
    .await;
    let (_, done_issue) = common::send(
        &app,
        common::post(
            &format!("/api/projects/{pid}/issues"),
            json!({ "title": "Done overdue", "due_date": overdue_date }),
        ),
    )
    .await;
    let done_issue_id = done_issue["id"].as_str().unwrap();
    common::send(
        &app,
        common::patch(
            &format!("/api/issues/{done_issue_id}/status"),
            json!({ "status": "done" }),
        ),
    )
    .await;

    let (_, _, json) = common::send_with_headers(
        &app,
        common::get(&format!("/api/projects/{pid}/issues?due_state=overdue")),
    )
    .await;
    let items = json.as_array().unwrap();
    assert_eq!(items.len(), 1);
    assert_eq!(items[0]["title"], "Overdue");
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
async fn list_issues_filter_by_priority() {
    let app = common::setup_app().await;
    let pid = common::create_project(&app, "P", "PI").await;

    common::send(
        &app,
        common::post(
            &format!("/api/projects/{pid}/issues"),
            json!({ "title": "Critical issue", "priority": "critical" }),
        ),
    )
    .await;
    common::send(
        &app,
        common::post(
            &format!("/api/projects/{pid}/issues"),
            json!({ "title": "Low issue", "priority": "low" }),
        ),
    )
    .await;

    let (_, headers, json) = common::send_with_headers(
        &app,
        common::get(&format!("/api/projects/{pid}/issues?priority=critical")),
    )
    .await;
    let items = json.as_array().unwrap();
    assert_eq!(headers.get("x-total-count").unwrap(), "1");
    assert_eq!(items.len(), 1);
    assert_eq!(items[0]["title"], "Critical issue");
    assert_eq!(items[0]["priority"], "critical");
}

#[tokio::test]
async fn list_issues_orders_same_position_by_created_at_desc() {
    let (app, pool) = common::setup_app_with_pool().await;
    let pid = common::create_project(&app, "P", "PI").await;
    let first_id = common::create_issue(&app, &pid, "First").await;
    let second_id = common::create_issue(&app, &pid, "Second").await;
    let third_id = common::create_issue(&app, &pid, "Third").await;

    sqlx::query("UPDATE issues SET created_at = ? WHERE id = ?")
        .bind("2026-01-01T00:00:01")
        .bind(&first_id)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("UPDATE issues SET created_at = ? WHERE id = ?")
        .bind("2026-01-01T00:00:02")
        .bind(&second_id)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("UPDATE issues SET created_at = ? WHERE id = ?")
        .bind("2026-01-01T00:00:03")
        .bind(&third_id)
        .execute(&pool)
        .await
        .unwrap();

    let (_, _, json) =
        common::send_with_headers(&app, common::get(&format!("/api/projects/{pid}/issues"))).await;
    let titles: Vec<&str> = json
        .as_array()
        .unwrap()
        .iter()
        .map(|item| item["title"].as_str().unwrap())
        .collect();

    assert_eq!(titles, vec!["Third", "Second", "First"]);
}

#[tokio::test]
async fn reorder_issues_changes_subsequent_list_order() {
    let app = common::setup_app().await;
    let pid = common::create_project(&app, "P", "PI").await;
    let first_id = common::create_issue(&app, &pid, "First").await;
    let second_id = common::create_issue(&app, &pid, "Second").await;
    let third_id = common::create_issue(&app, &pid, "Third").await;

    let (status, json) = common::send(
        &app,
        common::put(
            &format!("/api/projects/{pid}/issues/reorder"),
            json!({ "ids": [third_id, first_id, second_id] }),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json["ok"], true);

    let (_, _, json) =
        common::send_with_headers(&app, common::get(&format!("/api/projects/{pid}/issues"))).await;
    let titles: Vec<&str> = json
        .as_array()
        .unwrap()
        .iter()
        .map(|item| item["title"].as_str().unwrap())
        .collect();

    assert_eq!(titles, vec!["Third", "First", "Second"]);
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

    let (_, logs) = common::send(&app, common::get(&format!("/api/issues/{iid}/activity"))).await;
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

    let (status, _) = common::send(&app, common::delete(&format!("/api/issues/{story_id}"))).await;
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
async fn viewer_can_get_issue_detail_but_cannot_update_issue() {
    let (app, pool) = common::setup_app_with_pool().await;
    common::insert_user_b(&pool).await;

    let pid = common::create_project(&app, "P", "PI").await;
    let workspace_id: String = sqlx::query_scalar("SELECT workspace_id FROM projects WHERE id = ?")
        .bind(&pid)
        .fetch_one(&pool)
        .await
        .unwrap();
    sqlx::query(
        "INSERT INTO workspace_members (workspace_id, user_id, role, joined_at)
         VALUES (?, ?, 'viewer', ?)",
    )
    .bind(&workspace_id)
    .bind(common::TEST_USER_B_ID)
    .bind("2026-01-01T00:00:00")
    .execute(&pool)
    .await
    .unwrap();

    let iid = common::create_issue(&app, &pid, "Viewer readable").await;
    let viewer_token = common::token_for(common::TEST_USER_B_ID);

    let (status, json) = common::send(
        &app,
        common::get_as(&format!("/api/issues/{iid}"), &viewer_token),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json["title"], "Viewer readable");

    let (status, _) = common::send(
        &app,
        common::put_as(
            &format!("/api/issues/{iid}"),
            json!({ "title": "Should fail" }),
            &viewer_token,
        ),
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN);
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
        common::put(
            &format!("/api/issues/{iid}"),
            json!({ "assignee_id": null }),
        ),
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
async fn mentions_only_notify_users_in_the_same_workspace() {
    let (app, pool) = common::setup_app_with_pool().await;
    let pid = common::create_project(&app, "P", "PI").await;
    let workspace_id: String = sqlx::query_scalar("SELECT workspace_id FROM projects WHERE id = ?")
        .bind(&pid)
        .fetch_one(&pool)
        .await
        .unwrap();

    add_workspace_member(
        &pool,
        &workspace_id,
        "workspace-mention-user",
        "Alex",
        "alex-in@example.com",
        "member",
    )
    .await;

    sqlx::query(
        "INSERT INTO users (id, provider, provider_id, email, name, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind("external-mention-user")
    .bind("test")
    .bind("provider-external")
    .bind("alex-out@example.com")
    .bind("Alex")
    .bind("2026-01-01T00:00:00")
    .bind("2026-01-01T00:00:00")
    .execute(&pool)
    .await
    .unwrap();

    let iid = common::create_issue(&app, &pid, "Mention issue").await;
    let (status, _) = common::send(
        &app,
        common::post(
            &format!("/api/issues/{iid}/comments"),
            json!({ "body": "@Alex 確認お願いします" }),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    let workspace_notifications: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM notifications WHERE user_id = ?")
            .bind("workspace-mention-user")
            .fetch_one(&pool)
            .await
            .unwrap();
    let external_notifications: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM notifications WHERE user_id = ?")
            .bind("external-mention-user")
            .fetch_one(&pool)
            .await
            .unwrap();

    assert_eq!(workspace_notifications, 1);
    assert_eq!(external_notifications, 0);
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
    .await;
    let story_id = story["id"].as_str().unwrap().to_string();

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
async fn create_issue_link_with_invalid_type_returns_generic_error() {
    let app = common::setup_app().await;
    let pid = common::create_project(&app, "P", "PI").await;
    let iid1 = common::create_issue(&app, &pid, "Issue A").await;
    let iid2 = common::create_issue(&app, &pid, "Issue B").await;

    let (status, json) = common::send(
        &app,
        common::post(
            &format!("/api/issues/{iid1}/links"),
            json!({ "target_issue_id": iid2, "link_type": "totally_custom" }),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(
        json["error"],
        "link_type must be one of: blocks, is_blocked_by, relates_to, duplicates"
    );
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

    let (_, links) = common::send(&app, common::get(&format!("/api/issues/{iid1}/links"))).await;
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
async fn bulk_update_can_change_priority_and_labels() {
    let app = common::setup_app().await;
    let pid = common::create_project(&app, "P", "PI").await;
    let iid = common::create_issue(&app, &pid, "Issue").await;

    let (status, json) = common::send(
        &app,
        common::patch(
            &format!("/api/projects/{pid}/issues/bulk"),
            json!({
                "issue_ids": [iid],
                "priority": "high",
                "labels": ["Frontend", "Backend"]
            }),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json["updated_count"], 1);
    assert_eq!(json["skipped_ids"], json!([]));
    let items = json["items"].as_array().unwrap();
    assert_eq!(items.len(), 1);
    assert_eq!(items[0]["priority"], "high");
    let labels = items[0]["labels"].as_array().unwrap();
    assert_eq!(labels.len(), 2);
    assert!(labels.iter().any(|label| label == "Frontend"));
    assert!(labels.iter().any(|label| label == "Backend"));
}

#[tokio::test]
async fn bulk_update_tracks_due_date_and_skipped_ids_in_result() {
    let app = common::setup_app().await;
    let pid = common::create_project(&app, "P", "PI").await;
    let iid = common::create_issue(&app, &pid, "Issue").await;

    let (status, json) = common::send(
        &app,
        common::patch(
            &format!("/api/projects/{pid}/issues/bulk"),
            json!({
                "issue_ids": [iid, "missing-id"],
                "status": "done",
                "due_date": "2026-03-10"
            }),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json["updated_count"], 1);
    assert_eq!(json["skipped_ids"], json!(["missing-id"]));
    let items = json["items"].as_array().unwrap();
    assert_eq!(items.len(), 1);
    assert_eq!(items[0]["status"], "done");
    assert_eq!(items[0]["due_date"], "2026-03-10");

    let (status, activity_json) =
        common::send(&app, common::get(&format!("/api/issues/{iid}/activity"))).await;
    assert_eq!(status, StatusCode::OK);
    let activity = activity_json.as_array().unwrap();
    assert_eq!(activity.len(), 2);
    assert!(activity.iter().any(|entry| {
        entry["field"] == "status" && entry["old_value"] == "todo" && entry["new_value"] == "done"
    }));
    assert!(activity.iter().any(|entry| {
        entry["field"] == "due_date"
            && entry["old_value"].is_null()
            && entry["new_value"] == "2026-03-10"
    }));
}

#[tokio::test]
async fn concurrent_issue_updates_leave_one_complete_last_write() {
    let app = common::setup_app().await;
    let pid = common::create_project(&app, "P", "PI").await;
    let iid = common::create_issue(&app, &pid, "Original").await;

    let app_a = app.clone();
    let app_b = app.clone();
    let req_a = common::put(
        &format!("/api/issues/{iid}"),
        json!({ "title": "Updated by A" }),
    );
    let req_b = common::put(
        &format!("/api/issues/{iid}"),
        json!({ "title": "Updated by B" }),
    );

    let ((status_a, _), (status_b, _)) =
        tokio::join!(common::send(&app_a, req_a), common::send(&app_b, req_b));
    assert_eq!(status_a, StatusCode::OK);
    assert_eq!(status_b, StatusCode::OK);

    let (status, json) = common::send(&app, common::get(&format!("/api/issues/{iid}"))).await;
    assert_eq!(status, StatusCode::OK);
    let title = json["title"].as_str().unwrap();
    assert!(title == "Updated by A" || title == "Updated by B");
}

#[tokio::test]
async fn create_issue_with_emoji_content_round_trips() {
    let app = common::setup_app().await;
    let pid = common::create_project(&app, "P", "PI").await;

    let (status, json) = common::send(
        &app,
        common::post(
            &format!("/api/projects/{pid}/issues"),
            json!({
                "title": "Fix 😀 regression",
                "description": "Investigate emoji 🧪 handling in comments",
            }),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json["title"], "Fix 😀 regression");
    assert_eq!(
        json["description"],
        "Investigate emoji 🧪 handling in comments"
    );
}

#[tokio::test]
async fn create_issue_title_length_is_enforced_by_bytes_for_unicode() {
    let app = common::setup_app().await;
    let pid = common::create_project(&app, "P", "PI").await;

    let max_title = "😀".repeat(125);
    let too_long_title = "😀".repeat(126);

    let (status, json) = common::send(
        &app,
        common::post(
            &format!("/api/projects/{pid}/issues"),
            json!({ "title": max_title }),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json["title"].as_str().unwrap().len(), 500);

    let (status, _) = common::send(
        &app,
        common::post(
            &format!("/api/projects/{pid}/issues"),
            json!({ "title": too_long_title }),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
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

#[tokio::test]
async fn update_issue_status_to_in_review_creates_review_ready_notification() {
    let (app, pool) = common::setup_app_with_pool().await;
    common::insert_user_b(&pool).await;

    let ws_id = common::create_workspace(&app).await;
    let pid = common::create_project_in(&app, "P", "PI", &ws_id).await;
    add_workspace_member(
        &pool,
        &ws_id,
        common::TEST_USER_B_ID,
        "Reviewer",
        "reviewer@example.com",
        "member",
    )
    .await;

    let (_, issue) = common::send(
        &app,
        common::post(
            &format!("/api/projects/{pid}/issues"),
            json!({
                "title": "Needs review",
                "assignee_id": common::TEST_USER_B_ID
            }),
        ),
    )
    .await;
    let issue_id = issue["id"].as_str().unwrap();

    let (status, json) = common::send(
        &app,
        common::patch(
            &format!("/api/issues/{issue_id}/status"),
            json!({ "status": "in_review" }),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{json}");
    assert_eq!(
        count_notifications(&pool, common::TEST_USER_B_ID, "review_ready").await,
        1
    );

    let (_, activity) = common::send(&app, common::get(&format!("/api/issues/{issue_id}/activity"))).await;
    let items = activity.as_array().unwrap();
    assert!(items.iter().any(|entry| {
        entry["field"] == "review_ready"
            && entry["old_value"] == "Test User"
            && entry["new_value"] == common::TEST_USER_B_ID
    }));
}

#[tokio::test]
async fn update_issue_assignment_respects_workspace_automation_toggle() {
    let (app, pool) = common::setup_app_with_pool().await;
    common::insert_user_b(&pool).await;

    let ws_id = common::create_workspace(&app).await;
    let pid = common::create_project_in(&app, "P", "PI", &ws_id).await;
    add_workspace_member(
        &pool,
        &ws_id,
        common::TEST_USER_B_ID,
        "Bob",
        "bob@example.com",
        "member",
    )
    .await;

    common::send(
        &app,
        common::patch(
            &format!("/api/workspaces/{ws_id}/automation"),
            json!({ "notify_on_assignee_change": false }),
        ),
    )
    .await;

    let issue_id = common::create_issue(&app, &pid, "Assignment toggle").await;

    let (status, json) = common::send(
        &app,
        common::put(
            &format!("/api/issues/{issue_id}"),
            json!({ "assignee_id": common::TEST_USER_B_ID }),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{json}");
    assert_eq!(
        count_notifications(&pool, common::TEST_USER_B_ID, "assigned").await,
        0
    );
}

#[tokio::test]
async fn update_issue_due_date_past_today_creates_overdue_notification() {
    let (app, pool) = common::setup_app_with_pool().await;
    common::insert_user_b(&pool).await;

    let ws_id = common::create_workspace(&app).await;
    let pid = common::create_project_in(&app, "P", "PI", &ws_id).await;
    add_workspace_member(
        &pool,
        &ws_id,
        common::TEST_USER_B_ID,
        "Bob",
        "bob@example.com",
        "member",
    )
    .await;

    let (_, issue) = common::send(
        &app,
        common::post(
            &format!("/api/projects/{pid}/issues"),
            json!({
                "title": "Overdue soon",
                "assignee_id": common::TEST_USER_B_ID
            }),
        ),
    )
    .await;
    let issue_id = issue["id"].as_str().unwrap();

    let overdue_date = (chrono::Utc::now().date_naive() - chrono::Duration::days(1)).to_string();
    let (status, json) = common::send(
        &app,
        common::put(
            &format!("/api/issues/{issue_id}"),
            json!({ "due_date": overdue_date }),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{json}");
    assert_eq!(
        count_notifications(&pool, common::TEST_USER_B_ID, "overdue").await,
        1
    );

    let (_, activity) = common::send(&app, common::get(&format!("/api/issues/{issue_id}/activity"))).await;
    let items = activity.as_array().unwrap();
    assert!(items.iter().any(|entry| {
        entry["field"] == "overdue" && entry["new_value"] == common::TEST_USER_B_ID
    }));
}
