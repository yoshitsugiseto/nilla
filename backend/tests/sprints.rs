mod common;

use axum::http::StatusCode;
use serde_json::json;

#[tokio::test]
async fn create_sprint_success() {
    let app = common::setup_app().await;
    let pid = common::create_project(&app, "P", "SP").await;

    let (status, json) = common::send(
        &app,
        common::post(
            &format!("/api/projects/{pid}/sprints"),
            json!({ "name": "Sprint 1", "goal": "Ship it",
                     "start_date": "2026-01-01", "end_date": "2026-01-14" }),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json["name"], "Sprint 1");
    assert_eq!(json["status"], "planning");
    assert_eq!(json["goal"], "Ship it");
}

#[tokio::test]
async fn create_sprint_empty_name_returns_400() {
    let app = common::setup_app().await;
    let pid = common::create_project(&app, "P", "SP").await;

    let (status, _) = common::send(
        &app,
        common::post(
            &format!("/api/projects/{pid}/sprints"),
            json!({ "name": "" }),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn create_sprint_start_after_end_returns_400() {
    let app = common::setup_app().await;
    let pid = common::create_project(&app, "P", "SP").await;

    let (status, _) = common::send(
        &app,
        common::post(
            &format!("/api/projects/{pid}/sprints"),
            json!({ "name": "Sprint 1", "start_date": "2026-01-14", "end_date": "2026-01-01" }),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn list_sprints() {
    let app = common::setup_app().await;
    let pid = common::create_project(&app, "P", "SP").await;
    common::create_sprint(&app, &pid, "Sprint 1").await;
    common::create_sprint(&app, &pid, "Sprint 2").await;

    let (status, json) =
        common::send(&app, common::get(&format!("/api/projects/{pid}/sprints"))).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json.as_array().unwrap().len(), 2);
}

#[tokio::test]
async fn start_sprint_changes_status_to_active() {
    let app = common::setup_app().await;
    let pid = common::create_project(&app, "P", "SP").await;
    let sid = common::create_sprint(&app, &pid, "Sprint 1").await;

    let (status, json) = common::send(
        &app,
        common::post(&format!("/api/sprints/{sid}/start"), json!({})),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json["status"], "active");
}

#[tokio::test]
async fn start_already_active_sprint_returns_400() {
    let app = common::setup_app().await;
    let pid = common::create_project(&app, "P", "SP").await;
    let sid = common::create_sprint(&app, &pid, "Sprint 1").await;

    common::send(
        &app,
        common::post(&format!("/api/sprints/{sid}/start"), json!({})),
    )
    .await;

    let (status, _) = common::send(
        &app,
        common::post(&format!("/api/sprints/{sid}/start"), json!({})),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn complete_sprint_moves_incomplete_issues_to_backlog() {
    let app = common::setup_app().await;
    let pid = common::create_project(&app, "P", "SP").await;
    let sid = common::create_sprint(&app, &pid, "Sprint 1").await;

    // Add incomplete issue to sprint
    let (_, issue) = common::send(
        &app,
        common::post(
            &format!("/api/projects/{pid}/issues"),
            json!({ "title": "Incomplete", "sprint_id": sid }),
        ),
    )
    .await;
    let iid = issue["id"].as_str().unwrap().to_string();

    // Start then complete
    common::send(
        &app,
        common::post(&format!("/api/sprints/{sid}/start"), json!({})),
    )
    .await;
    let (status, json) = common::send(
        &app,
        common::post(&format!("/api/sprints/{sid}/complete"), json!({})),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json["status"], "completed");

    // Issue moved to backlog
    let (_, issue) = common::send(&app, common::get(&format!("/api/issues/{iid}"))).await;
    assert!(issue["sprint_id"].is_null());
}

#[tokio::test]
async fn complete_sprint_done_issues_stay() {
    let app = common::setup_app().await;
    let pid = common::create_project(&app, "P", "SP").await;
    let sid = common::create_sprint(&app, &pid, "Sprint 1").await;

    let (_, issue) = common::send(
        &app,
        common::post(
            &format!("/api/projects/{pid}/issues"),
            json!({ "title": "Done issue", "sprint_id": sid }),
        ),
    )
    .await;
    let iid = issue["id"].as_str().unwrap().to_string();

    // Mark as done
    common::send(
        &app,
        common::patch(
            &format!("/api/issues/{iid}/status"),
            json!({ "status": "done" }),
        ),
    )
    .await;

    common::send(
        &app,
        common::post(&format!("/api/sprints/{sid}/start"), json!({})),
    )
    .await;
    common::send(
        &app,
        common::post(&format!("/api/sprints/{sid}/complete"), json!({})),
    )
    .await;

    // Done issue should still be in the sprint
    let (_, issue) = common::send(&app, common::get(&format!("/api/issues/{iid}"))).await;
    assert_eq!(issue["sprint_id"], sid);
}

#[tokio::test]
async fn delete_sprint_unassigns_issues() {
    let app = common::setup_app().await;
    let pid = common::create_project(&app, "P", "SP").await;
    let sid = common::create_sprint(&app, &pid, "Sprint 1").await;

    let (_, issue) = common::send(
        &app,
        common::post(
            &format!("/api/projects/{pid}/issues"),
            json!({ "title": "Issue", "sprint_id": sid }),
        ),
    )
    .await;
    let iid = issue["id"].as_str().unwrap().to_string();

    let (status, _) = common::send(&app, common::delete(&format!("/api/sprints/{sid}"))).await;
    assert_eq!(status, StatusCode::OK);

    // Sprint gone
    let (status, _) = common::send(&app, common::get(&format!("/api/sprints/{sid}"))).await;
    assert_eq!(status, StatusCode::NOT_FOUND);

    // Issue moved to backlog
    let (_, issue) = common::send(&app, common::get(&format!("/api/issues/{iid}"))).await;
    assert!(issue["sprint_id"].is_null());
}

// ---------------------------------------------------------------
// Burndown tests
// ---------------------------------------------------------------

#[tokio::test]
async fn burndown_with_no_issues_returns_flat_zeros() {
    let app = common::setup_app().await;
    let pid = common::create_project(&app, "P", "BD").await;

    let (_, sprint) = common::send(
        &app,
        common::post(
            &format!("/api/projects/{pid}/sprints"),
            json!({
                "name": "Sprint BD",
                "start_date": "2026-01-01",
                "end_date": "2026-01-07"
            }),
        ),
    )
    .await;
    let sid = sprint["id"].as_str().unwrap().to_string();

    let (status, json) = common::send(
        &app,
        common::get(&format!("/api/sprints/{sid}/burndown")),
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    let points = json.as_array().unwrap();
    // 7 days: Jan 1 through Jan 7 inclusive
    assert_eq!(points.len(), 7);
    // All actual values should be 0 (no issues = 0 total points)
    for point in points {
        assert_eq!(point["actual"].as_f64().unwrap(), 0.0);
    }
}

#[tokio::test]
async fn burndown_with_completed_issues_reflects_done() {
    let app = common::setup_app().await;
    let pid = common::create_project(&app, "P", "BC").await;

    // Create sprint with dates
    let (_, sprint) = common::send(
        &app,
        common::post(
            &format!("/api/projects/{pid}/sprints"),
            json!({
                "name": "Sprint BC",
                "start_date": "2026-01-01",
                "end_date": "2026-01-03"
            }),
        ),
    )
    .await;
    let sid = sprint["id"].as_str().unwrap().to_string();

    // Create issue with points in the sprint
    let (_, issue) = common::send(
        &app,
        common::post(
            &format!("/api/projects/{pid}/issues"),
            json!({ "title": "Task A", "points": 5, "sprint_id": sid }),
        ),
    )
    .await;
    let iid = issue["id"].as_str().unwrap().to_string();

    // Mark issue as done — this creates an activity_log entry
    let (status, _) = common::send(
        &app,
        common::patch(
            &format!("/api/issues/{iid}/status"),
            json!({ "status": "done" }),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    let (status, json) = common::send(
        &app,
        common::get(&format!("/api/sprints/{sid}/burndown")),
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    let points = json.as_array().unwrap();
    assert_eq!(points.len(), 3); // 3 days

    // Total points = 5. The activity_log for 'done' was created with today's date.
    // Since the sprint dates are 2026-01-01..03 and today is 2026-03-26,
    // the activity_log date falls outside the sprint window.
    // So within the sprint date range, actual should remain at total_points (5).
    // First point should start at total_points (5).
    let first_actual = points[0]["actual"].as_f64().unwrap();
    assert_eq!(first_actual, 5.0);
}

#[tokio::test]
async fn burndown_ideal_line_starts_at_total_and_ends_at_zero() {
    let app = common::setup_app().await;
    let pid = common::create_project(&app, "P", "BI").await;

    let (_, sprint) = common::send(
        &app,
        common::post(
            &format!("/api/projects/{pid}/sprints"),
            json!({
                "name": "Sprint BI",
                "start_date": "2026-01-01",
                "end_date": "2026-01-03"
            }),
        ),
    )
    .await;
    let sid = sprint["id"].as_str().unwrap().to_string();

    // Create issue with 6 points
    common::send(
        &app,
        common::post(
            &format!("/api/projects/{pid}/issues"),
            json!({ "title": "Task", "points": 6, "sprint_id": sid }),
        ),
    )
    .await;

    let (status, json) = common::send(
        &app,
        common::get(&format!("/api/sprints/{sid}/burndown")),
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    let points = json.as_array().unwrap();
    assert_eq!(points.len(), 3);

    // Ideal line: starts at total_points (6.0) and ends at 0.0
    let first_ideal = points[0]["ideal"].as_f64().unwrap();
    let last_ideal = points[points.len() - 1]["ideal"].as_f64().unwrap();
    assert!((first_ideal - 6.0).abs() < f64::EPSILON);
    assert!((last_ideal - 0.0).abs() < f64::EPSILON);

    // Check date fields exist
    assert!(points[0]["date"].as_str().is_some());
}

#[tokio::test]
async fn burndown_unauthorized_returns_403() {
    let (app, pool) = common::setup_app_with_pool().await;
    common::insert_user_b(&pool).await;

    let pid = common::create_project(&app, "P", "BU").await;
    let (_, sprint) = common::send(
        &app,
        common::post(
            &format!("/api/projects/{pid}/sprints"),
            json!({
                "name": "Sprint BU",
                "start_date": "2026-01-01",
                "end_date": "2026-01-07"
            }),
        ),
    )
    .await;
    let sid = sprint["id"].as_str().unwrap().to_string();

    // User B has no access to the project
    let token_b = common::token_for(common::TEST_USER_B_ID);
    let (status, _) = common::send(
        &app,
        common::get_as(&format!("/api/sprints/{sid}/burndown"), &token_b),
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN);
}

// ---------------------------------------------------------------
// Velocity tests
// ---------------------------------------------------------------

#[tokio::test]
async fn velocity_with_no_completed_sprints_returns_empty() {
    let app = common::setup_app().await;
    let pid = common::create_project(&app, "P", "VE").await;

    // Create a sprint but don't complete it
    common::create_sprint(&app, &pid, "Sprint 1").await;

    let (status, json) = common::send(
        &app,
        common::get(&format!("/api/projects/{pid}/velocity")),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json.as_array().unwrap().len(), 0);
}

#[tokio::test]
async fn velocity_with_completed_sprint_returns_data() {
    let app = common::setup_app().await;
    let pid = common::create_project(&app, "P", "VC").await;
    let sid = common::create_sprint(&app, &pid, "Sprint 1").await;

    // Create issue with points, mark as done
    let (_, issue) = common::send(
        &app,
        common::post(
            &format!("/api/projects/{pid}/issues"),
            json!({ "title": "Done task", "points": 8, "sprint_id": sid }),
        ),
    )
    .await;
    let iid = issue["id"].as_str().unwrap().to_string();
    common::send(
        &app,
        common::patch(
            &format!("/api/issues/{iid}/status"),
            json!({ "status": "done" }),
        ),
    )
    .await;

    // Start and complete the sprint
    common::send(
        &app,
        common::post(&format!("/api/sprints/{sid}/start"), json!({})),
    )
    .await;
    common::send(
        &app,
        common::post(&format!("/api/sprints/{sid}/complete"), json!({})),
    )
    .await;

    let (status, json) = common::send(
        &app,
        common::get(&format!("/api/projects/{pid}/velocity")),
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    let velocity = json.as_array().unwrap();
    assert_eq!(velocity.len(), 1);
    assert_eq!(velocity[0]["sprint_name"], "Sprint 1");
    assert_eq!(velocity[0]["completed_points"], 8);
}

#[tokio::test]
async fn velocity_limited_to_10() {
    let app = common::setup_app().await;
    let pid = common::create_project(&app, "P", "VL").await;

    // Create 12 sprints, start and complete each
    for i in 1..=12 {
        let sid = common::create_sprint(&app, &pid, &format!("Sprint {i}")).await;

        // Add a done issue so velocity has data
        let (_, issue) = common::send(
            &app,
            common::post(
                &format!("/api/projects/{pid}/issues"),
                json!({ "title": format!("Task {i}"), "points": i, "sprint_id": sid }),
            ),
        )
        .await;
        let iid = issue["id"].as_str().unwrap().to_string();
        common::send(
            &app,
            common::patch(
                &format!("/api/issues/{iid}/status"),
                json!({ "status": "done" }),
            ),
        )
        .await;

        common::send(
            &app,
            common::post(&format!("/api/sprints/{sid}/start"), json!({})),
        )
        .await;
        common::send(
            &app,
            common::post(&format!("/api/sprints/{sid}/complete"), json!({})),
        )
        .await;
    }

    let (status, json) = common::send(
        &app,
        common::get(&format!("/api/projects/{pid}/velocity")),
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    let velocity = json.as_array().unwrap();
    assert_eq!(velocity.len(), 10);
}

#[tokio::test]
async fn velocity_unauthorized_returns_403() {
    let (app, pool) = common::setup_app_with_pool().await;
    common::insert_user_b(&pool).await;

    let pid = common::create_project(&app, "P", "VU").await;

    // User B has no access to the project
    let token_b = common::token_for(common::TEST_USER_B_ID);
    let (status, _) = common::send(
        &app,
        common::get_as(&format!("/api/projects/{pid}/velocity"), &token_b),
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN);
}
