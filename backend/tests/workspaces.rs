mod common;

use axum::body::Body;
use axum::http::{Request, StatusCode};
use serde_json::json;
use tower::ServiceExt;

// ---------------------------------------------------------------
// Create workspace
// ---------------------------------------------------------------

#[tokio::test]
async fn test_create_workspace_authenticated_returns_ok() {
    let app = common::setup_app().await;
    let (status, json) = common::send(
        &app,
        common::post("/api/workspaces", json!({ "name": "My Workspace" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json["name"], "My Workspace");
    assert!(json["id"].is_string());
    assert_eq!(json["created_by"], common::TEST_USER_ID);
}

#[tokio::test]
async fn test_create_workspace_unauthenticated_returns_401() {
    let app = common::setup_app().await;
    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/workspaces")
                .header("content-type", "application/json")
                .body(Body::from(
                    serde_json::to_vec(&json!({ "name": "Test" })).unwrap(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_create_workspace_empty_name_returns_400() {
    let app = common::setup_app().await;
    let (status, _) = common::send(
        &app,
        common::post("/api/workspaces", json!({ "name": "  " })),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn test_create_workspace_creator_is_owner() {
    let app = common::setup_app().await;
    let ws_id = common::create_workspace(&app).await;

    let (status, json) = common::send(
        &app,
        common::get(&format!("/api/workspaces/{ws_id}/members")),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let members = json.as_array().unwrap();
    assert_eq!(members.len(), 1);
    assert_eq!(members[0]["user_id"], common::TEST_USER_ID);
    assert_eq!(members[0]["role"], "owner");
}

// ---------------------------------------------------------------
// Cross-workspace isolation
// ---------------------------------------------------------------

#[tokio::test]
async fn test_cross_workspace_user_b_cannot_access_workspace_a() {
    let (app, pool) = common::setup_app_with_pool().await;
    common::insert_user_b(&pool).await;

    // User A creates a workspace
    let ws_id = common::create_workspace(&app).await;

    // User B tries to access workspace A
    let token_b = common::token_for(common::TEST_USER_B_ID);
    let (status, _) = common::send(
        &app,
        common::get_as(&format!("/api/workspaces/{ws_id}"), &token_b),
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn test_cross_workspace_user_b_cannot_list_workspace_a_members() {
    let (app, pool) = common::setup_app_with_pool().await;
    common::insert_user_b(&pool).await;

    let ws_id = common::create_workspace(&app).await;

    let token_b = common::token_for(common::TEST_USER_B_ID);
    let (status, _) = common::send(
        &app,
        common::get_as(&format!("/api/workspaces/{ws_id}/members"), &token_b),
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn test_cross_workspace_user_b_cannot_access_workspace_a_project() {
    let (app, pool) = common::setup_app_with_pool().await;
    common::insert_user_b(&pool).await;

    let ws_id = common::create_workspace(&app).await;
    let pid = common::create_project_in(&app, "Proj", "PR", &ws_id).await;

    // User B tries to access the project
    let token_b = common::token_for(common::TEST_USER_B_ID);
    let (status, _) = common::send(
        &app,
        common::get_as(&format!("/api/projects/{pid}"), &token_b),
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn test_cross_workspace_isolation_each_user_sees_own_workspaces() {
    let (app, pool) = common::setup_app_with_pool().await;
    common::insert_user_b(&pool).await;

    // User A creates workspace
    common::create_workspace(&app).await;

    // User B creates workspace
    let token_b = common::token_for(common::TEST_USER_B_ID);
    let (status, json_b) = common::send(
        &app,
        common::post_as(
            "/api/workspaces",
            json!({ "name": "B Workspace" }),
            &token_b,
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json_b["created_by"], common::TEST_USER_B_ID);

    // User A lists workspaces — should not see B's workspace
    let (status, json_a) = common::send(&app, common::get("/api/workspaces")).await;
    assert_eq!(status, StatusCode::OK);
    let workspaces_a = json_a.as_array().unwrap();
    assert!(workspaces_a.iter().all(|w| w["name"] != "B Workspace"));

    // User B lists workspaces — should not see A's workspace
    let (status, json_b_list) =
        common::send(&app, common::get_as("/api/workspaces", &token_b)).await;
    assert_eq!(status, StatusCode::OK);
    let workspaces_b = json_b_list.as_array().unwrap();
    assert!(workspaces_b.iter().all(|w| w["name"] != "Test Workspace"));
}

// ---------------------------------------------------------------
// Role-based access
// ---------------------------------------------------------------

#[tokio::test]
async fn test_owner_can_update_workspace() {
    let app = common::setup_app().await;
    let ws_id = common::create_workspace(&app).await;

    let (status, json) = common::send(
        &app,
        common::put(
            &format!("/api/workspaces/{ws_id}"),
            json!({ "name": "Updated Name" }),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json["name"], "Updated Name");
}

#[tokio::test]
async fn test_owner_can_add_member() {
    let (app, pool) = common::setup_app_with_pool().await;
    common::insert_user_b(&pool).await;

    let ws_id = common::create_workspace(&app).await;

    let (status, json) = common::send(
        &app,
        common::post(
            &format!("/api/workspaces/{ws_id}/members"),
            json!({ "user_id": common::TEST_USER_B_ID }),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json["user_id"], common::TEST_USER_B_ID);
    assert_eq!(json["role"], "member"); // default role
}

#[tokio::test]
async fn test_owner_can_add_member_with_specific_role() {
    let (app, pool) = common::setup_app_with_pool().await;
    common::insert_user_b(&pool).await;

    let ws_id = common::create_workspace(&app).await;

    let (status, json) = common::send(
        &app,
        common::post(
            &format!("/api/workspaces/{ws_id}/members"),
            json!({ "user_id": common::TEST_USER_B_ID, "role": "admin" }),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json["role"], "admin");
}

#[tokio::test]
async fn test_workspace_automation_defaults_are_returned() {
    let app = common::setup_app().await;
    let ws_id = common::create_workspace(&app).await;

    let (status, json) = common::send(
        &app,
        common::get(&format!("/api/workspaces/{ws_id}/automation")),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json["workspace_id"], ws_id);
    assert_eq!(json["notify_on_assignee_change"], true);
    assert_eq!(json["notify_on_review_ready"], true);
    assert_eq!(json["notify_on_overdue_transition"], true);
    assert_eq!(json["sprint_carryover_mode"], "prompt");
}

#[tokio::test]
async fn test_workspace_admin_can_update_automation_settings() {
    let app = common::setup_app().await;
    let ws_id = common::create_workspace(&app).await;

    let (status, json) = common::send(
        &app,
        common::patch(
            &format!("/api/workspaces/{ws_id}/automation"),
            json!({
                "notify_on_assignee_change": false,
                "notify_on_review_ready": false,
                "notify_on_overdue_transition": false,
                "sprint_carryover_mode": "next_sprint"
            }),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json["notify_on_assignee_change"], false);
    assert_eq!(json["notify_on_review_ready"], false);
    assert_eq!(json["notify_on_overdue_transition"], false);
    assert_eq!(json["sprint_carryover_mode"], "next_sprint");
}

#[tokio::test]
async fn test_workspace_automation_logs_are_listed() {
    let (app, pool) = common::setup_app_with_pool().await;
    common::insert_user_b(&pool).await;

    let ws_id = common::create_workspace(&app).await;
    let pid = common::create_project_in(&app, "P", "PI", &ws_id).await;

    common::send(
        &app,
        common::post(
            &format!("/api/workspaces/{ws_id}/members"),
            json!({ "user_id": common::TEST_USER_B_ID }),
        ),
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

    let (status, _) = common::send(
        &app,
        common::patch(
            &format!("/api/issues/{issue_id}/status"),
            json!({ "status": "in_review" }),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    let (status, json) = common::send(
        &app,
        common::get(&format!("/api/workspaces/{ws_id}/automation/logs")),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let items = json.as_array().unwrap();
    assert!(!items.is_empty());
    assert!(items.iter().any(|entry| {
        entry["rule_type"] == "review_ready"
            && entry["status"] == "sent"
            && entry["issue_title"] == "Needs review"
    }));
}

#[tokio::test]
async fn test_workspace_automation_logs_support_limit_and_offset() {
    let (app, pool) = common::setup_app_with_pool().await;
    common::insert_user_b(&pool).await;

    let ws_id = common::create_workspace(&app).await;
    let pid = common::create_project_in(&app, "Project A", "PA", &ws_id).await;

    let (status, _) = common::send(
        &app,
        common::post(
            &format!("/api/workspaces/{ws_id}/members"),
            json!({ "user_id": common::TEST_USER_B_ID }),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    for title in ["Issue A", "Issue B", "Issue C"] {
        let (_, issue) = common::send(
            &app,
            common::post(
                &format!("/api/projects/{pid}/issues"),
                json!({
                    "title": title,
                    "assignee_id": common::TEST_USER_B_ID
                }),
            ),
        )
        .await;
        let issue_id = issue["id"].as_str().unwrap();

        let (status, _) = common::send(
            &app,
            common::patch(
                &format!("/api/issues/{issue_id}/status"),
                json!({ "status": "in_review" }),
            ),
        )
        .await;
        assert_eq!(status, StatusCode::OK);
    }

    let (status, first_page) = common::send(
        &app,
        common::get(&format!("/api/workspaces/{ws_id}/automation/logs?limit=2")),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let first_items = first_page.as_array().unwrap();
    assert_eq!(first_items.len(), 2);

    let skipped_title = first_items[1]["issue_title"].as_str().unwrap().to_string();

    let (status, second_page) = common::send(
        &app,
        common::get(&format!(
            "/api/workspaces/{ws_id}/automation/logs?limit=2&offset=2"
        )),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let second_items = second_page.as_array().unwrap();
    assert!(!second_items.is_empty());
    assert_ne!(second_items[0]["issue_title"].as_str().unwrap(), skipped_title);
}

#[tokio::test]
async fn test_owner_can_remove_member() {
    let (app, pool) = common::setup_app_with_pool().await;
    common::insert_user_b(&pool).await;

    let ws_id = common::create_workspace(&app).await;

    // Add user B
    let (status, _) = common::send(
        &app,
        common::post(
            &format!("/api/workspaces/{ws_id}/members"),
            json!({ "user_id": common::TEST_USER_B_ID }),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    // Remove user B
    let (status, json) = common::send(
        &app,
        common::delete(&format!(
            "/api/workspaces/{ws_id}/members/{}",
            common::TEST_USER_B_ID
        )),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json["ok"], true);
}

#[tokio::test]
async fn test_owner_can_change_member_role() {
    let (app, pool) = common::setup_app_with_pool().await;
    common::insert_user_b(&pool).await;

    let ws_id = common::create_workspace(&app).await;

    // Add user B as member
    common::send(
        &app,
        common::post(
            &format!("/api/workspaces/{ws_id}/members"),
            json!({ "user_id": common::TEST_USER_B_ID }),
        ),
    )
    .await;

    // Change role to admin
    let (status, json) = common::send(
        &app,
        common::patch(
            &format!("/api/workspaces/{ws_id}/members/{}", common::TEST_USER_B_ID),
            json!({ "role": "admin" }),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json["role"], "admin");
}

#[tokio::test]
async fn test_member_cannot_update_workspace_settings() {
    let (app, pool) = common::setup_app_with_pool().await;
    common::insert_user_b(&pool).await;

    let ws_id = common::create_workspace(&app).await;

    // Add user B as member
    common::send(
        &app,
        common::post(
            &format!("/api/workspaces/{ws_id}/members"),
            json!({ "user_id": common::TEST_USER_B_ID }),
        ),
    )
    .await;

    // User B (member) tries to update workspace
    let token_b = common::token_for(common::TEST_USER_B_ID);
    let (status, _) = common::send(
        &app,
        common::put_as(
            &format!("/api/workspaces/{ws_id}"),
            json!({ "name": "Hacked Name" }),
            &token_b,
        ),
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn test_member_cannot_add_another_member() {
    let (app, pool) = common::setup_app_with_pool().await;
    common::insert_user_b(&pool).await;

    // Insert a third user
    sqlx::query(
        "INSERT INTO users (id, provider, provider_id, email, name, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind("test-user-003")
    .bind("test")
    .bind("test-provider-003")
    .bind("testc@example.com")
    .bind("Test User C")
    .bind("2026-01-01T00:00:00")
    .bind("2026-01-01T00:00:00")
    .execute(&pool)
    .await
    .unwrap();

    let ws_id = common::create_workspace(&app).await;

    // Add user B as member
    common::send(
        &app,
        common::post(
            &format!("/api/workspaces/{ws_id}/members"),
            json!({ "user_id": common::TEST_USER_B_ID }),
        ),
    )
    .await;

    // User B (member) tries to add user C
    let token_b = common::token_for(common::TEST_USER_B_ID);
    let (status, _) = common::send(
        &app,
        common::post_as(
            &format!("/api/workspaces/{ws_id}/members"),
            json!({ "user_id": "test-user-003" }),
            &token_b,
        ),
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn test_member_cannot_remove_another_member() {
    let (app, pool) = common::setup_app_with_pool().await;
    common::insert_user_b(&pool).await;

    // Insert a third user
    sqlx::query(
        "INSERT INTO users (id, provider, provider_id, email, name, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind("test-user-003")
    .bind("test")
    .bind("test-provider-003")
    .bind("testc@example.com")
    .bind("Test User C")
    .bind("2026-01-01T00:00:00")
    .bind("2026-01-01T00:00:00")
    .execute(&pool)
    .await
    .unwrap();

    let ws_id = common::create_workspace(&app).await;

    // Owner adds user B and user C
    common::send(
        &app,
        common::post(
            &format!("/api/workspaces/{ws_id}/members"),
            json!({ "user_id": common::TEST_USER_B_ID }),
        ),
    )
    .await;
    common::send(
        &app,
        common::post(
            &format!("/api/workspaces/{ws_id}/members"),
            json!({ "user_id": "test-user-003" }),
        ),
    )
    .await;

    // User B (member) tries to remove user C
    let token_b = common::token_for(common::TEST_USER_B_ID);
    let (status, _) = common::send(
        &app,
        common::delete_as(
            &format!("/api/workspaces/{ws_id}/members/test-user-003"),
            &token_b,
        ),
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn test_project_member_override_changes_effective_role() {
    let (app, pool) = common::setup_app_with_pool().await;
    common::insert_user_b(&pool).await;

    let ws_id = common::create_workspace(&app).await;
    let pid = common::create_project_in(&app, "Proj", "PR", &ws_id).await;

    common::send(
        &app,
        common::post(
            &format!("/api/workspaces/{ws_id}/members"),
            json!({ "user_id": common::TEST_USER_B_ID }),
        ),
    )
    .await;

    let (status, json) = common::send(
        &app,
        common::patch(
            &format!("/api/projects/{pid}/members/{}", common::TEST_USER_B_ID),
            json!({ "role": "viewer" }),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json["role"], "viewer");
    assert_eq!(json["workspace_role"], "member");
    assert_eq!(json["inherited"], false);
}

#[tokio::test]
async fn test_project_viewer_can_read_but_cannot_create_issue() {
    let (app, pool) = common::setup_app_with_pool().await;
    common::insert_user_b(&pool).await;

    let ws_id = common::create_workspace(&app).await;
    let pid = common::create_project_in(&app, "Proj", "PR", &ws_id).await;

    common::send(
        &app,
        common::post(
            &format!("/api/workspaces/{ws_id}/members"),
            json!({ "user_id": common::TEST_USER_B_ID }),
        ),
    )
    .await;
    common::send(
        &app,
        common::patch(
            &format!("/api/projects/{pid}/members/{}", common::TEST_USER_B_ID),
            json!({ "role": "viewer" }),
        ),
    )
    .await;

    let token_b = common::token_for(common::TEST_USER_B_ID);
    let (status, _) = common::send(
        &app,
        common::get_as(&format!("/api/projects/{pid}"), &token_b),
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    let (status, _) = common::send(
        &app,
        common::post_as(
            &format!("/api/projects/{pid}/issues"),
            json!({ "title": "Should fail" }),
            &token_b,
        ),
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn test_project_editor_cannot_update_project_settings() {
    let (app, pool) = common::setup_app_with_pool().await;
    common::insert_user_b(&pool).await;

    let ws_id = common::create_workspace(&app).await;
    let pid = common::create_project_in(&app, "Proj", "PR", &ws_id).await;

    common::send(
        &app,
        common::post(
            &format!("/api/workspaces/{ws_id}/members"),
            json!({ "user_id": common::TEST_USER_B_ID }),
        ),
    )
    .await;

    let token_b = common::token_for(common::TEST_USER_B_ID);
    let (status, _) = common::send(
        &app,
        common::put_as(
            &format!("/api/projects/{pid}"),
            json!({ "name": "Editor should fail" }),
            &token_b,
        ),
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn test_project_admin_can_update_project_settings() {
    let (app, pool) = common::setup_app_with_pool().await;
    common::insert_user_b(&pool).await;

    let ws_id = common::create_workspace(&app).await;
    let pid = common::create_project_in(&app, "Proj", "PR", &ws_id).await;

    common::send(
        &app,
        common::post(
            &format!("/api/workspaces/{ws_id}/members"),
            json!({ "user_id": common::TEST_USER_B_ID }),
        ),
    )
    .await;
    common::send(
        &app,
        common::patch(
            &format!("/api/projects/{pid}/members/{}", common::TEST_USER_B_ID),
            json!({ "role": "admin" }),
        ),
    )
    .await;

    let token_b = common::token_for(common::TEST_USER_B_ID);
    let (status, json) = common::send(
        &app,
        common::put_as(
            &format!("/api/projects/{pid}"),
            json!({ "name": "Project Admin Updated" }),
            &token_b,
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json["name"], "Project Admin Updated");
}

#[tokio::test]
async fn test_clearing_project_override_reverts_to_inherited_role() {
    let (app, pool) = common::setup_app_with_pool().await;
    common::insert_user_b(&pool).await;

    let ws_id = common::create_workspace(&app).await;
    let pid = common::create_project_in(&app, "Proj", "PR", &ws_id).await;

    common::send(
        &app,
        common::post(
            &format!("/api/workspaces/{ws_id}/members"),
            json!({ "user_id": common::TEST_USER_B_ID }),
        ),
    )
    .await;
    common::send(
        &app,
        common::patch(
            &format!("/api/projects/{pid}/members/{}", common::TEST_USER_B_ID),
            json!({ "role": "viewer" }),
        ),
    )
    .await;

    let (status, json) = common::send(
        &app,
        common::delete(&format!(
            "/api/projects/{pid}/members/{}",
            common::TEST_USER_B_ID
        )),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json["ok"], true);

    let (status, members) =
        common::send(&app, common::get(&format!("/api/projects/{pid}/members"))).await;
    assert_eq!(status, StatusCode::OK);
    let member_b = members
        .as_array()
        .unwrap()
        .iter()
        .find(|member| member["user_id"] == common::TEST_USER_B_ID)
        .unwrap();
    assert_eq!(member_b["role"], "editor");
    assert_eq!(member_b["inherited"], true);
}

#[tokio::test]
async fn test_non_member_cannot_access_workspace() {
    let (app, pool) = common::setup_app_with_pool().await;
    common::insert_user_b(&pool).await;

    let ws_id = common::create_workspace(&app).await;

    // User B (not a member) tries to access workspace
    let token_b = common::token_for(common::TEST_USER_B_ID);
    let (status, _) = common::send(
        &app,
        common::get_as(&format!("/api/workspaces/{ws_id}"), &token_b),
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn test_non_member_cannot_update_workspace() {
    let (app, pool) = common::setup_app_with_pool().await;
    common::insert_user_b(&pool).await;

    let ws_id = common::create_workspace(&app).await;

    let token_b = common::token_for(common::TEST_USER_B_ID);
    let (status, _) = common::send(
        &app,
        common::put_as(
            &format!("/api/workspaces/{ws_id}"),
            json!({ "name": "Hacked" }),
            &token_b,
        ),
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN);
}

// ---------------------------------------------------------------
// Owner protection
// ---------------------------------------------------------------

#[tokio::test]
async fn test_cannot_demote_last_owner() {
    let app = common::setup_app().await;
    let ws_id = common::create_workspace(&app).await;

    // Try to demote the only owner to member
    let (status, json) = common::send(
        &app,
        common::patch(
            &format!("/api/workspaces/{ws_id}/members/{}", common::TEST_USER_ID),
            json!({ "role": "member" }),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert!(json["error"]
        .as_str()
        .unwrap()
        .to_lowercase()
        .contains("owner"));
}

#[tokio::test]
async fn test_cannot_remove_last_owner() {
    let app = common::setup_app().await;
    let ws_id = common::create_workspace(&app).await;

    // Try to remove the only owner
    let (status, json) = common::send(
        &app,
        common::delete(&format!(
            "/api/workspaces/{ws_id}/members/{}",
            common::TEST_USER_ID
        )),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert!(json["error"]
        .as_str()
        .unwrap()
        .to_lowercase()
        .contains("owner"));
}

#[tokio::test]
async fn test_can_demote_owner_when_another_owner_exists() {
    let (app, pool) = common::setup_app_with_pool().await;
    common::insert_user_b(&pool).await;

    let ws_id = common::create_workspace(&app).await;

    // Add user B as owner
    common::send(
        &app,
        common::post(
            &format!("/api/workspaces/{ws_id}/members"),
            json!({ "user_id": common::TEST_USER_B_ID, "role": "owner" }),
        ),
    )
    .await;

    // Now demoting user A should succeed (user B is still owner)
    let (status, json) = common::send(
        &app,
        common::patch(
            &format!("/api/workspaces/{ws_id}/members/{}", common::TEST_USER_ID),
            json!({ "role": "member" }),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json["role"], "member");
}

#[tokio::test]
async fn test_can_remove_owner_when_another_owner_exists() {
    let (app, pool) = common::setup_app_with_pool().await;
    common::insert_user_b(&pool).await;

    let ws_id = common::create_workspace(&app).await;

    // Add user B as owner
    common::send(
        &app,
        common::post(
            &format!("/api/workspaces/{ws_id}/members"),
            json!({ "user_id": common::TEST_USER_B_ID, "role": "owner" }),
        ),
    )
    .await;

    // Remove user B (owner) — should succeed since user A is still owner
    let token_b = common::token_for(common::TEST_USER_B_ID);
    // User A (owner) removes user B (owner)
    let (status, json) = common::send(
        &app,
        common::delete(&format!(
            "/api/workspaces/{ws_id}/members/{}",
            common::TEST_USER_B_ID
        )),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json["ok"], true);

    // Verify user B no longer has access
    let (status, _) = common::send(
        &app,
        common::get_as(&format!("/api/workspaces/{ws_id}"), &token_b),
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN);
}

// ---------------------------------------------------------------
// Role validation
// ---------------------------------------------------------------

#[tokio::test]
async fn test_add_member_with_invalid_role_returns_400() {
    let (app, pool) = common::setup_app_with_pool().await;
    common::insert_user_b(&pool).await;

    let ws_id = common::create_workspace(&app).await;

    let (status, json) = common::send(
        &app,
        common::post(
            &format!("/api/workspaces/{ws_id}/members"),
            json!({ "user_id": common::TEST_USER_B_ID, "role": "superadmin" }),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(
        json["error"],
        "role must be one of: owner, admin, member, viewer"
    );
}

#[tokio::test]
async fn test_update_member_role_with_invalid_role_returns_400() {
    let (app, pool) = common::setup_app_with_pool().await;
    common::insert_user_b(&pool).await;

    let ws_id = common::create_workspace(&app).await;

    // Add user B
    common::send(
        &app,
        common::post(
            &format!("/api/workspaces/{ws_id}/members"),
            json!({ "user_id": common::TEST_USER_B_ID }),
        ),
    )
    .await;

    // Try to change to invalid role
    let (status, json) = common::send(
        &app,
        common::patch(
            &format!("/api/workspaces/{ws_id}/members/{}", common::TEST_USER_B_ID),
            json!({ "role": "superadmin" }),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(
        json["error"],
        "role must be one of: owner, admin, member, viewer"
    );
}

// ---------------------------------------------------------------
// Admin role tests
// ---------------------------------------------------------------

#[tokio::test]
async fn test_admin_can_update_workspace() {
    let (app, pool) = common::setup_app_with_pool().await;
    common::insert_user_b(&pool).await;

    let ws_id = common::create_workspace(&app).await;

    // Add user B as admin
    common::send(
        &app,
        common::post(
            &format!("/api/workspaces/{ws_id}/members"),
            json!({ "user_id": common::TEST_USER_B_ID, "role": "admin" }),
        ),
    )
    .await;

    // Admin can update workspace
    let token_b = common::token_for(common::TEST_USER_B_ID);
    let (status, json) = common::send(
        &app,
        common::put_as(
            &format!("/api/workspaces/{ws_id}"),
            json!({ "name": "Admin Updated" }),
            &token_b,
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json["name"], "Admin Updated");
}

#[tokio::test]
async fn test_admin_can_add_member() {
    let (app, pool) = common::setup_app_with_pool().await;
    common::insert_user_b(&pool).await;

    // Insert user C
    sqlx::query(
        "INSERT INTO users (id, provider, provider_id, email, name, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind("test-user-003")
    .bind("test")
    .bind("test-provider-003")
    .bind("testc@example.com")
    .bind("Test User C")
    .bind("2026-01-01T00:00:00")
    .bind("2026-01-01T00:00:00")
    .execute(&pool)
    .await
    .unwrap();

    let ws_id = common::create_workspace(&app).await;

    // Add user B as admin
    common::send(
        &app,
        common::post(
            &format!("/api/workspaces/{ws_id}/members"),
            json!({ "user_id": common::TEST_USER_B_ID, "role": "admin" }),
        ),
    )
    .await;

    // Admin (user B) adds user C
    let token_b = common::token_for(common::TEST_USER_B_ID);
    let (status, json) = common::send(
        &app,
        common::post_as(
            &format!("/api/workspaces/{ws_id}/members"),
            json!({ "user_id": "test-user-003" }),
            &token_b,
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json["user_id"], "test-user-003");
}

#[tokio::test]
async fn test_viewer_cannot_update_workspace() {
    let (app, pool) = common::setup_app_with_pool().await;
    common::insert_user_b(&pool).await;

    let ws_id = common::create_workspace(&app).await;

    // Add user B as viewer
    common::send(
        &app,
        common::post(
            &format!("/api/workspaces/{ws_id}/members"),
            json!({ "user_id": common::TEST_USER_B_ID, "role": "viewer" }),
        ),
    )
    .await;

    // Viewer cannot update workspace
    let token_b = common::token_for(common::TEST_USER_B_ID);
    let (status, _) = common::send(
        &app,
        common::put_as(
            &format!("/api/workspaces/{ws_id}"),
            json!({ "name": "Viewer Updated" }),
            &token_b,
        ),
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN);
}

// ---------------------------------------------------------------
// List and get workspaces
// ---------------------------------------------------------------

#[tokio::test]
async fn test_list_workspaces_returns_only_member_workspaces() {
    let app = common::setup_app().await;

    let ws_id_1 = common::create_workspace(&app).await;

    let (status, json) = common::send(&app, common::get("/api/workspaces")).await;
    assert_eq!(status, StatusCode::OK);
    let workspaces = json.as_array().unwrap();
    assert!(workspaces.iter().any(|w| w["id"] == ws_id_1));
}

#[tokio::test]
async fn test_get_workspace_returns_correct_data() {
    let app = common::setup_app().await;
    let ws_id = common::create_workspace(&app).await;

    let (status, json) = common::send(&app, common::get(&format!("/api/workspaces/{ws_id}"))).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json["id"], ws_id);
    assert_eq!(json["name"], "Test Workspace");
}

// ---------------------------------------------------------------
// Member added to workspace can access it
// ---------------------------------------------------------------

#[tokio::test]
async fn test_added_member_can_access_workspace() {
    let (app, pool) = common::setup_app_with_pool().await;
    common::insert_user_b(&pool).await;

    let ws_id = common::create_workspace(&app).await;

    // Add user B as member
    common::send(
        &app,
        common::post(
            &format!("/api/workspaces/{ws_id}/members"),
            json!({ "user_id": common::TEST_USER_B_ID }),
        ),
    )
    .await;

    // User B can now access the workspace
    let token_b = common::token_for(common::TEST_USER_B_ID);
    let (status, json) = common::send(
        &app,
        common::get_as(&format!("/api/workspaces/{ws_id}"), &token_b),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json["id"], ws_id);
}

#[tokio::test]
async fn test_added_member_can_access_workspace_projects() {
    let (app, pool) = common::setup_app_with_pool().await;
    common::insert_user_b(&pool).await;

    let ws_id = common::create_workspace(&app).await;
    let pid = common::create_project_in(&app, "Proj", "PR", &ws_id).await;

    // Add user B as member
    common::send(
        &app,
        common::post(
            &format!("/api/workspaces/{ws_id}/members"),
            json!({ "user_id": common::TEST_USER_B_ID }),
        ),
    )
    .await;

    // User B can now access the project
    let token_b = common::token_for(common::TEST_USER_B_ID);
    let (status, json) = common::send(
        &app,
        common::get_as(&format!("/api/projects/{pid}"), &token_b),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json["id"], pid);
}

// ---------------------------------------------------------------
// Duplicate member add
// ---------------------------------------------------------------

#[tokio::test]
async fn test_add_duplicate_member_returns_conflict() {
    let (app, pool) = common::setup_app_with_pool().await;
    common::insert_user_b(&pool).await;

    let ws_id = common::create_workspace(&app).await;

    // Add user B
    let (status, _) = common::send(
        &app,
        common::post(
            &format!("/api/workspaces/{ws_id}/members"),
            json!({ "user_id": common::TEST_USER_B_ID }),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    // Try adding user B again
    let (status, _) = common::send(
        &app,
        common::post(
            &format!("/api/workspaces/{ws_id}/members"),
            json!({ "user_id": common::TEST_USER_B_ID }),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::CONFLICT);
}
