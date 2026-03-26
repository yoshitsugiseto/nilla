mod common;

use axum::http::StatusCode;
use serde_json::json;
use uuid::Uuid;

// ---------------------------------------------------------------
// Helper: insert a notification directly into the database
// ---------------------------------------------------------------

async fn insert_notification(
    pool: &sqlx::SqlitePool,
    user_id: &str,
    issue_id: Option<&str>,
    notif_type: &str,
    message: &str,
) -> String {
    let id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO notifications (id, user_id, issue_id, type, message) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(user_id)
    .bind(issue_id)
    .bind(notif_type)
    .bind(message)
    .execute(pool)
    .await
    .unwrap();
    id
}

// ---------------------------------------------------------------
// 1. User sees own notifications only
// ---------------------------------------------------------------

#[tokio::test]
async fn test_list_notifications_returns_only_own() {
    let (app, pool) = common::setup_app_with_pool().await;
    common::insert_user_b(&pool).await;

    // Create notifications for user A and user B
    insert_notification(
        &pool,
        common::TEST_USER_ID,
        None,
        "info",
        "Notification for A",
    )
    .await;
    insert_notification(
        &pool,
        common::TEST_USER_B_ID,
        None,
        "info",
        "Notification for B",
    )
    .await;

    // User A lists notifications — should only see their own
    let (status, json) = common::send(&app, common::get("/api/notifications")).await;
    assert_eq!(status, StatusCode::OK);
    let notifications = json.as_array().unwrap();
    assert_eq!(notifications.len(), 1);
    assert_eq!(notifications[0]["message"], "Notification for A");
    assert_eq!(notifications[0]["user_id"], common::TEST_USER_ID);

    // User B lists notifications — should only see their own
    let token_b = common::token_for(common::TEST_USER_B_ID);
    let (status, json) = common::send(
        &app,
        common::get_as("/api/notifications", &token_b),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let notifications = json.as_array().unwrap();
    assert_eq!(notifications.len(), 1);
    assert_eq!(notifications[0]["message"], "Notification for B");
    assert_eq!(notifications[0]["user_id"], common::TEST_USER_B_ID);
}

// ---------------------------------------------------------------
// 2. Mark own notification as read
// ---------------------------------------------------------------

#[tokio::test]
async fn test_mark_own_notification_as_read_returns_ok() {
    let (app, pool) = common::setup_app_with_pool().await;

    let notif_id = insert_notification(
        &pool,
        common::TEST_USER_ID,
        None,
        "assigned",
        "You were assigned an issue",
    )
    .await;

    // Mark as read
    let (status, json) = common::send(
        &app,
        common::patch(
            &format!("/api/notifications/{notif_id}/read"),
            json!({}),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json["ok"], true);

    // Verify it's marked as read by listing
    let (status, json) = common::send(&app, common::get("/api/notifications")).await;
    assert_eq!(status, StatusCode::OK);
    let notifications = json.as_array().unwrap();
    assert_eq!(notifications.len(), 1);
    assert_eq!(notifications[0]["read"], true);
}

// ---------------------------------------------------------------
// 3. Cannot mark another user's notification as read
// ---------------------------------------------------------------

#[tokio::test]
async fn test_mark_other_user_notification_as_read_returns_404() {
    let (app, pool) = common::setup_app_with_pool().await;
    common::insert_user_b(&pool).await;

    // Create notification for user A
    let notif_id = insert_notification(
        &pool,
        common::TEST_USER_ID,
        None,
        "assigned",
        "A's notification",
    )
    .await;

    // User B tries to mark user A's notification as read
    let token_b = common::token_for(common::TEST_USER_B_ID);
    let (status, _) = common::send(
        &app,
        common::patch_as(
            &format!("/api/notifications/{notif_id}/read"),
            json!({}),
            &token_b,
        ),
    )
    .await;
    // The handler uses WHERE user_id = ?, so no rows affected → 404
    assert_eq!(status, StatusCode::NOT_FOUND);
}

// ---------------------------------------------------------------
// 4. Mark all read only affects requesting user's notifications
// ---------------------------------------------------------------

#[tokio::test]
async fn test_mark_all_read_only_affects_own_notifications() {
    let (app, pool) = common::setup_app_with_pool().await;
    common::insert_user_b(&pool).await;

    // Create notifications for both users
    insert_notification(
        &pool,
        common::TEST_USER_ID,
        None,
        "info",
        "A notif 1",
    )
    .await;
    insert_notification(
        &pool,
        common::TEST_USER_ID,
        None,
        "info",
        "A notif 2",
    )
    .await;
    insert_notification(
        &pool,
        common::TEST_USER_B_ID,
        None,
        "info",
        "B notif 1",
    )
    .await;

    // User A marks all as read
    let (status, json) = common::send(
        &app,
        common::post("/api/notifications/read-all", json!({})),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json["ok"], true);

    // Verify user A's notifications are all read
    let (status, json) = common::send(&app, common::get("/api/notifications")).await;
    assert_eq!(status, StatusCode::OK);
    let notifications = json.as_array().unwrap();
    assert!(notifications.iter().all(|n| n["read"] == true));

    // Verify user B's notification is still unread
    let token_b = common::token_for(common::TEST_USER_B_ID);
    let (status, json) = common::send(
        &app,
        common::get_as("/api/notifications", &token_b),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let notifications = json.as_array().unwrap();
    assert_eq!(notifications.len(), 1);
    assert_eq!(notifications[0]["read"], false);
}

// ---------------------------------------------------------------
// 5. Empty list for new user
// ---------------------------------------------------------------

#[tokio::test]
async fn test_empty_notification_list_for_new_user() {
    let (app, pool) = common::setup_app_with_pool().await;
    common::insert_user_b(&pool).await;

    // User B (new user, no notifications) lists notifications
    let token_b = common::token_for(common::TEST_USER_B_ID);
    let (status, json) = common::send(
        &app,
        common::get_as("/api/notifications", &token_b),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let notifications = json.as_array().unwrap();
    assert!(notifications.is_empty());
}

// ---------------------------------------------------------------
// Delete own notification
// ---------------------------------------------------------------

#[tokio::test]
async fn test_delete_own_notification_returns_ok() {
    let (app, pool) = common::setup_app_with_pool().await;

    let notif_id = insert_notification(
        &pool,
        common::TEST_USER_ID,
        None,
        "info",
        "Delete me",
    )
    .await;

    let (status, json) = common::send(
        &app,
        common::delete(&format!("/api/notifications/{notif_id}")),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json["ok"], true);

    // Verify it's gone
    let (status, json) = common::send(&app, common::get("/api/notifications")).await;
    assert_eq!(status, StatusCode::OK);
    let notifications = json.as_array().unwrap();
    assert!(notifications.is_empty());
}

// ---------------------------------------------------------------
// Cannot delete another user's notification
// ---------------------------------------------------------------

#[tokio::test]
async fn test_delete_other_user_notification_returns_404() {
    let (app, pool) = common::setup_app_with_pool().await;
    common::insert_user_b(&pool).await;

    // Create notification for user A
    let notif_id = insert_notification(
        &pool,
        common::TEST_USER_ID,
        None,
        "info",
        "A's notification",
    )
    .await;

    // User B tries to delete user A's notification
    let token_b = common::token_for(common::TEST_USER_B_ID);
    let (status, _) = common::send(
        &app,
        common::delete_as(&format!("/api/notifications/{notif_id}"), &token_b),
    )
    .await;
    // WHERE user_id = ? prevents deletion → 0 rows → 404
    assert_eq!(status, StatusCode::NOT_FOUND);

    // Verify user A's notification still exists
    let (status, json) = common::send(&app, common::get("/api/notifications")).await;
    assert_eq!(status, StatusCode::OK);
    let notifications = json.as_array().unwrap();
    assert_eq!(notifications.len(), 1);
}
