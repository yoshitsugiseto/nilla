use std::collections::HashMap;

use axum::{
    extract::{Path, State},
    Extension,
    Json,
};
use chrono::NaiveDate;
use sqlx::SqlitePool;
use tokio::sync::broadcast;
use uuid::Uuid;

use crate::{
    auth::middleware::UserId,
    db::check_project_access,
    error::{AppError, Result},
    models::sprint::{CreateSprint, Sprint, SprintRow, SprintStatus, UpdateSprint},
};

async fn get_workspace_id_for_project(pool: &SqlitePool, project_id: &str) -> Option<String> {
    sqlx::query_scalar::<_, String>("SELECT workspace_id FROM projects WHERE id = ?")
        .bind(project_id)
        .fetch_optional(pool)
        .await
        .ok()
        .flatten()
}

async fn get_project_id_for_sprint(pool: &SqlitePool, sprint_id: &str) -> Result<String> {
    sqlx::query_scalar::<_, String>("SELECT project_id FROM sprints WHERE id = ?")
        .bind(sprint_id)
        .fetch_optional(pool)
        .await?
        .ok_or(AppError::NotFound)
}

const LIST_SPRINTS_SQL: &str =
    "SELECT id, project_id, name, goal, status, start_date, end_date, created_at, updated_at FROM sprints WHERE project_id = ? ORDER BY created_at DESC";
const GET_SPRINT_SQL: &str =
    "SELECT id, project_id, name, goal, status, start_date, end_date, created_at, updated_at FROM sprints WHERE id = ?";

pub async fn list_sprints(
    State(pool): State<SqlitePool>,
    Extension(user_id): Extension<UserId>,
    Path(project_id): Path<String>,
) -> Result<Json<Vec<Sprint>>> {
    check_project_access(&pool, &user_id.0, &project_id).await?;
    let rows = sqlx::query_as::<_, SprintRow>(LIST_SPRINTS_SQL)
        .bind(&project_id)
        .fetch_all(&pool)
        .await?;
    Ok(Json(rows.into_iter().map(Sprint::from).collect()))
}

pub async fn create_sprint(
    State(pool): State<SqlitePool>,
    Extension(user_id): Extension<UserId>,
    Path(project_id): Path<String>,
    Json(body): Json<CreateSprint>,
) -> Result<Json<Sprint>> {
    check_project_access(&pool, &user_id.0, &project_id).await?;
    if body.name.trim().is_empty() {
        return Err(AppError::BadRequest("name is required".to_string()));
    }
    if body.name.len() > 255 {
        return Err(AppError::BadRequest(
            "name must be 255 characters or less".to_string(),
        ));
    }
    if body.goal.as_deref().map_or(false, |g| g.len() > 10000) {
        return Err(AppError::BadRequest(
            "goal must be 10000 characters or less".to_string(),
        ));
    }
    if let (Some(start), Some(end)) = (body.start_date, body.end_date) {
        if start >= end {
            return Err(AppError::BadRequest(
                "start_date must be before end_date".to_string(),
            ));
        }
    }

    let id = Uuid::new_v4().to_string();

    let row = sqlx::query_as::<_, SprintRow>(
        "INSERT INTO sprints (id, project_id, name, goal, start_date, end_date) VALUES (?, ?, ?, ?, ?, ?) RETURNING id, project_id, name, goal, status, start_date, end_date, created_at, updated_at",
    )
    .bind(&id)
    .bind(&project_id)
    .bind(&body.name)
    .bind(&body.goal)
    .bind(body.start_date)
    .bind(body.end_date)
    .fetch_one(&pool)
    .await?;

    Ok(Json(Sprint::from(row)))
}

pub async fn get_sprint(
    State(pool): State<SqlitePool>,
    Extension(user_id): Extension<UserId>,
    Path(id): Path<String>,
) -> Result<Json<Sprint>> {
    let row = sqlx::query_as::<_, SprintRow>(GET_SPRINT_SQL)
        .bind(&id)
        .fetch_optional(&pool)
        .await?
        .ok_or(AppError::NotFound)?;
    check_project_access(&pool, &user_id.0, &row.project_id).await?;
    Ok(Json(Sprint::from(row)))
}

pub async fn update_sprint(
    State(pool): State<SqlitePool>,
    Extension(user_id): Extension<UserId>,
    Path(id): Path<String>,
    Json(body): Json<UpdateSprint>,
) -> Result<Json<Sprint>> {
    let project_id = get_project_id_for_sprint(&pool, &id).await?;
    check_project_access(&pool, &user_id.0, &project_id).await?;
    if let Some(ref name) = body.name {
        if name.trim().is_empty() {
            return Err(AppError::BadRequest("name must not be empty".to_string()));
        }
        if name.len() > 255 {
            return Err(AppError::BadRequest(
                "name must be 255 characters or less".to_string(),
            ));
        }
    }
    if body.goal.as_deref().map_or(false, |g| g.len() > 10000) {
        return Err(AppError::BadRequest(
            "goal must be 10000 characters or less".to_string(),
        ));
    }

    let current = sqlx::query_as::<_, SprintRow>(GET_SPRINT_SQL)
        .bind(&id)
        .fetch_optional(&pool)
        .await?
        .ok_or(AppError::NotFound)?;

    let name = body.name.unwrap_or(current.name);
    let goal = body.goal.or(current.goal);
    let start_date: Option<NaiveDate> = body.start_date.or(current.start_date);
    let end_date: Option<NaiveDate> = body.end_date.or(current.end_date);

    if let (Some(start), Some(end)) = (start_date, end_date) {
        if start >= end {
            return Err(AppError::BadRequest(
                "start_date must be before end_date".to_string(),
            ));
        }
    }

    let row = sqlx::query_as::<_, SprintRow>(
        "UPDATE sprints SET name=?, goal=?, start_date=?, end_date=?, updated_at=CURRENT_TIMESTAMP WHERE id=? RETURNING id, project_id, name, goal, status, start_date, end_date, created_at, updated_at",
    )
    .bind(&name)
    .bind(&goal)
    .bind(start_date)
    .bind(end_date)
    .bind(&id)
    .fetch_one(&pool)
    .await?;

    Ok(Json(Sprint::from(row)))
}

pub async fn start_sprint(
    State(pool): State<SqlitePool>,
    State(ws_tx): State<broadcast::Sender<String>>,
    Extension(user_id): Extension<UserId>,
    Path(id): Path<String>,
) -> Result<Json<Sprint>> {
    let project_id = get_project_id_for_sprint(&pool, &id).await?;
    check_project_access(&pool, &user_id.0, &project_id).await?;
    let row = sqlx::query_as::<_, SprintRow>(GET_SPRINT_SQL)
        .bind(&id)
        .fetch_optional(&pool)
        .await?
        .ok_or(AppError::NotFound)?;

    let current_status = row.status.parse::<SprintStatus>().unwrap_or(SprintStatus::Planning);
    if current_status != SprintStatus::Planning {
        return Err(AppError::BadRequest(
            "Only planning sprints can be started".to_string(),
        ));
    }

    let updated_row = sqlx::query_as::<_, SprintRow>(
        "UPDATE sprints SET status='active', updated_at=CURRENT_TIMESTAMP WHERE id=? RETURNING id, project_id, name, goal, status, start_date, end_date, created_at, updated_at",
    )
    .bind(&id)
    .fetch_one(&pool)
    .await?;

    let updated = Sprint::from(updated_row);
    let workspace_id = get_workspace_id_for_project(&pool, &updated.project_id).await;
    let _ = ws_tx.send(
        serde_json::json!({
            "type": "sprint.updated",
            "project_id": updated.project_id,
            "workspace_id": workspace_id,
        })
        .to_string(),
    );
    Ok(Json(updated))
}

#[derive(serde::Deserialize, Default)]
pub struct CompleteSprintBody {
    pub next_sprint_id: Option<String>, // None or omitted = move to backlog
}

pub async fn complete_sprint(
    State(pool): State<SqlitePool>,
    State(ws_tx): State<broadcast::Sender<String>>,
    Extension(user_id): Extension<UserId>,
    Path(id): Path<String>,
    body: Option<Json<CompleteSprintBody>>,
) -> Result<Json<Sprint>> {
    let project_id = get_project_id_for_sprint(&pool, &id).await?;
    check_project_access(&pool, &user_id.0, &project_id).await?;
    let row = sqlx::query_as::<_, SprintRow>(GET_SPRINT_SQL)
        .bind(&id)
        .fetch_optional(&pool)
        .await?
        .ok_or(AppError::NotFound)?;

    let current_status = row.status.parse::<SprintStatus>().unwrap_or(SprintStatus::Planning);
    if current_status != SprintStatus::Active {
        return Err(AppError::BadRequest(
            "Only active sprints can be completed".to_string(),
        ));
    }

    let next_sprint_id = body.and_then(|b| b.next_sprint_id.clone());

    let mut tx = pool.begin().await?;

    // Move incomplete issues to next sprint or backlog
    sqlx::query(
        "UPDATE issues SET sprint_id=?, updated_at=CURRENT_TIMESTAMP WHERE sprint_id=? AND status != 'done'",
    )
    .bind(&next_sprint_id)
    .bind(&id)
    .execute(&mut *tx)
    .await?;

    let updated_row = sqlx::query_as::<_, SprintRow>(
        "UPDATE sprints SET status='completed', updated_at=CURRENT_TIMESTAMP WHERE id=? RETURNING id, project_id, name, goal, status, start_date, end_date, created_at, updated_at",
    )
    .bind(&id)
    .fetch_one(&mut *tx)
    .await?;

    tx.commit().await?;

    let updated = Sprint::from(updated_row);
    let workspace_id = get_workspace_id_for_project(&pool, &updated.project_id).await;
    let _ = ws_tx.send(
        serde_json::json!({
            "type": "sprint.updated",
            "project_id": updated.project_id,
            "workspace_id": workspace_id,
        })
        .to_string(),
    );
    Ok(Json(updated))
}

#[derive(serde::Serialize)]
pub struct BurndownPoint {
    pub date: String,
    pub ideal: f64,
    pub actual: f64,
}

pub async fn get_burndown(
    State(pool): State<SqlitePool>,
    Extension(user_id): Extension<UserId>,
    Path(id): Path<String>,
) -> Result<Json<Vec<BurndownPoint>>> {
    let row = sqlx::query_as::<_, SprintRow>(GET_SPRINT_SQL)
        .bind(&id)
        .fetch_optional(&pool)
        .await?
        .ok_or(AppError::NotFound)?;
    let sprint = Sprint::from(row);
    check_project_access(&pool, &user_id.0, &sprint.project_id).await?;

    let Some(start) = sprint.start_date else {
        return Ok(Json(vec![]));
    };
    let Some(end) = sprint.end_date else {
        return Ok(Json(vec![]));
    };

    // NOTE: total_points は現時点のスプリント内イシューの合計ポイントを使用している。
    // スプリント途中にイシューが追加・削除された場合、理想線と実績線の始点がずれる可能性がある。
    // 正確なバーンダウンを実現するには、スプリント開始時点のスナップショットを保存する必要がある。
    let total_points: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(points), 0) FROM issues WHERE sprint_id = ?",
    )
    .bind(&id)
    .fetch_one(&pool)
    .await?;

    let days = (end - start).num_days() + 1;

    // Single query: aggregate done-points by date instead of N+1 per-day queries
    let start_str = start.format("%Y-%m-%d").to_string();
    let end_next_str = (end + chrono::Duration::days(1))
        .format("%Y-%m-%d")
        .to_string();

    #[derive(sqlx::FromRow)]
    struct DoneByDate {
        change_date: String,
        done_points: i64,
    }

    let rows = sqlx::query_as::<_, DoneByDate>(
        r#"SELECT DATE(a.created_at) as change_date, COALESCE(SUM(i.points), 0) as done_points
           FROM activity_logs a
           JOIN issues i ON a.issue_id = i.id
           WHERE i.sprint_id = ?
             AND a.field = 'status'
             AND a.new_value = 'done'
             AND a.created_at >= ?
             AND a.created_at < ?
           GROUP BY DATE(a.created_at)
           ORDER BY change_date ASC"#,
    )
    .bind(&id)
    .bind(&start_str)
    .bind(&end_next_str)
    .fetch_all(&pool)
    .await?;

    let done_by_date: HashMap<String, i64> = rows
        .into_iter()
        .map(|r| (r.change_date, r.done_points))
        .collect();

    // Build burndown points with cumulative done-points
    let mut cumulative_done: i64 = 0;
    let mut points = vec![];

    for i in 0..days {
        let date = start + chrono::Duration::days(i);
        let date_str = date.format("%Y-%m-%d").to_string();

        if let Some(&day_done) = done_by_date.get(&date_str) {
            cumulative_done += day_done;
        }

        let ideal = total_points as f64 * (1.0 - i as f64 / (days - 1).max(1) as f64);
        let actual = (total_points - cumulative_done) as f64;

        points.push(BurndownPoint {
            date: date_str,
            ideal,
            actual,
        });
    }

    Ok(Json(points))
}

#[derive(serde::Serialize, sqlx::FromRow)]
pub struct VelocityPoint {
    pub sprint_name: String,
    pub completed_points: i64,
}

pub async fn get_velocity(
    State(pool): State<SqlitePool>,
    Extension(user_id): Extension<UserId>,
    Path(project_id): Path<String>,
) -> Result<Json<Vec<VelocityPoint>>> {
    check_project_access(&pool, &user_id.0, &project_id).await?;
    let points = sqlx::query_as::<_, VelocityPoint>(
        r#"SELECT s.name as sprint_name, COALESCE(SUM(i.points), 0) as completed_points
           FROM sprints s
           LEFT JOIN issues i ON i.sprint_id = s.id AND i.status = 'done'
           WHERE s.project_id = ? AND s.status = 'completed'
           GROUP BY s.id, s.name
           ORDER BY s.created_at ASC
           LIMIT 10"#,
    )
    .bind(&project_id)
    .fetch_all(&pool)
    .await?;

    Ok(Json(points))
}

pub async fn delete_sprint(
    State(pool): State<SqlitePool>,
    Extension(user_id): Extension<UserId>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>> {
    let project_id = get_project_id_for_sprint(&pool, &id).await?;
    check_project_access(&pool, &user_id.0, &project_id).await?;
    // Unassign issues from this sprint (move them to backlog) before deleting
    sqlx::query(
        "UPDATE issues SET sprint_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE sprint_id = ?",
    )
    .bind(&id)
    .execute(&pool)
    .await?;

    let result = sqlx::query("DELETE FROM sprints WHERE id = ?")
        .bind(&id)
        .execute(&pool)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }

    Ok(Json(serde_json::json!({ "ok": true })))
}
