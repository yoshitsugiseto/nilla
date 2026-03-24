use axum::{
    extract::{Path, State},
    Json,
};
use chrono::NaiveDate;
use sqlx::SqlitePool;
use tokio::sync::broadcast;
use uuid::Uuid;

use crate::{
    error::{AppError, Result},
    models::sprint::{CreateSprint, Sprint, UpdateSprint},
};

const LIST_SPRINTS_SQL: &str =
    "SELECT id, project_id, name, goal, status, start_date, end_date, created_at, updated_at FROM sprints WHERE project_id = ? ORDER BY created_at DESC";
const GET_SPRINT_SQL: &str =
    "SELECT id, project_id, name, goal, status, start_date, end_date, created_at, updated_at FROM sprints WHERE id = ?";

pub async fn list_sprints(
    State(pool): State<SqlitePool>,
    Path(project_id): Path<String>,
) -> Result<Json<Vec<Sprint>>> {
    let sprints = sqlx::query_as::<_, Sprint>(LIST_SPRINTS_SQL)
        .bind(&project_id)
        .fetch_all(&pool)
        .await?;
    Ok(Json(sprints))
}

pub async fn create_sprint(
    State(pool): State<SqlitePool>,
    Path(project_id): Path<String>,
    Json(body): Json<CreateSprint>,
) -> Result<Json<Sprint>> {
    if body.name.trim().is_empty() {
        return Err(AppError::BadRequest("name is required".to_string()));
    }
    if let (Some(start), Some(end)) = (body.start_date, body.end_date) {
        if start >= end {
            return Err(AppError::BadRequest(
                "start_date must be before end_date".to_string(),
            ));
        }
    }

    let id = Uuid::new_v4().to_string();

    let sprint = sqlx::query_as::<_, Sprint>(
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

    Ok(Json(sprint))
}

pub async fn get_sprint(
    State(pool): State<SqlitePool>,
    Path(id): Path<String>,
) -> Result<Json<Sprint>> {
    let sprint = sqlx::query_as::<_, Sprint>(GET_SPRINT_SQL)
        .bind(&id)
        .fetch_optional(&pool)
        .await?
        .ok_or(AppError::NotFound)?;
    Ok(Json(sprint))
}

pub async fn update_sprint(
    State(pool): State<SqlitePool>,
    Path(id): Path<String>,
    Json(body): Json<UpdateSprint>,
) -> Result<Json<Sprint>> {
    if let Some(ref name) = body.name {
        if name.trim().is_empty() {
            return Err(AppError::BadRequest("name must not be empty".to_string()));
        }
    }

    let current = sqlx::query_as::<_, Sprint>(GET_SPRINT_SQL)
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

    let updated = sqlx::query_as::<_, Sprint>(
        "UPDATE sprints SET name=?, goal=?, start_date=?, end_date=?, updated_at=CURRENT_TIMESTAMP WHERE id=? RETURNING id, project_id, name, goal, status, start_date, end_date, created_at, updated_at",
    )
    .bind(&name)
    .bind(&goal)
    .bind(start_date)
    .bind(end_date)
    .bind(&id)
    .fetch_one(&pool)
    .await?;

    Ok(Json(updated))
}

pub async fn start_sprint(
    State(pool): State<SqlitePool>,
    State(ws_tx): State<broadcast::Sender<String>>,
    Path(id): Path<String>,
) -> Result<Json<Sprint>> {
    let sprint = sqlx::query_as::<_, Sprint>(GET_SPRINT_SQL)
        .bind(&id)
        .fetch_optional(&pool)
        .await?
        .ok_or(AppError::NotFound)?;

    if sprint.status != "planning" {
        return Err(AppError::BadRequest(
            "Only planning sprints can be started".to_string(),
        ));
    }

    let updated = sqlx::query_as::<_, Sprint>(
        "UPDATE sprints SET status='active', updated_at=CURRENT_TIMESTAMP WHERE id=? RETURNING id, project_id, name, goal, status, start_date, end_date, created_at, updated_at",
    )
    .bind(&id)
    .fetch_one(&pool)
    .await?;

    let _ = ws_tx.send(
        serde_json::json!({ "type": "sprint.updated", "project_id": updated.project_id }).to_string(),
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
    Path(id): Path<String>,
    body: Option<Json<CompleteSprintBody>>,
) -> Result<Json<Sprint>> {
    let sprint = sqlx::query_as::<_, Sprint>(GET_SPRINT_SQL)
        .bind(&id)
        .fetch_optional(&pool)
        .await?
        .ok_or(AppError::NotFound)?;

    if sprint.status != "active" {
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

    let updated = sqlx::query_as::<_, Sprint>(
        "UPDATE sprints SET status='completed', updated_at=CURRENT_TIMESTAMP WHERE id=? RETURNING id, project_id, name, goal, status, start_date, end_date, created_at, updated_at",
    )
    .bind(&id)
    .fetch_one(&mut *tx)
    .await?;

    tx.commit().await?;

    let _ = ws_tx.send(
        serde_json::json!({ "type": "sprint.updated", "project_id": updated.project_id }).to_string(),
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
    Path(id): Path<String>,
) -> Result<Json<Vec<BurndownPoint>>> {
    let sprint = sqlx::query_as::<_, Sprint>(GET_SPRINT_SQL)
        .bind(&id)
        .fetch_optional(&pool)
        .await?
        .ok_or(AppError::NotFound)?;

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
    let mut points = vec![];

    for i in 0..days {
        let date = start + chrono::Duration::days(i);
        let date_str = date.format("%Y-%m-%d").to_string();
        let next_date_str = (date + chrono::Duration::days(1))
            .format("%Y-%m-%d")
            .to_string();

        let done_points: i64 = sqlx::query_scalar(
            r#"SELECT COALESCE(SUM(i.points), 0)
               FROM issues i
               JOIN activity_logs a ON a.issue_id = i.id
               WHERE i.sprint_id = ?
                 AND a.field = 'status'
                 AND a.new_value = 'done'
                 AND a.created_at < ?"#,
        )
        .bind(&id)
        .bind(&next_date_str)
        .fetch_one(&pool)
        .await?;

        let ideal = total_points as f64 * (1.0 - i as f64 / (days - 1).max(1) as f64);
        let actual = (total_points - done_points) as f64;

        points.push(BurndownPoint {
            date: date_str,
            ideal,
            actual,
        });
    }

    Ok(Json(points))
}

pub async fn delete_sprint(
    State(pool): State<SqlitePool>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>> {
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
