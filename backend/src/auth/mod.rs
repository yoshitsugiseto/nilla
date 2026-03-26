pub mod jwt;
pub mod middleware;
pub mod oauth;
pub mod ws;

use std::sync::Arc;
use axum::{Router, routing::{get, post}};
use axum::body::Body;
use axum::extract::Request;
use axum::http::StatusCode;
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use tower_governor::{GovernorLayer, governor::GovernorConfigBuilder};
use crate::AppState;

/// 429 レスポンスをアプリのデザインに合わせた HTML/JSON に差し替えるミドルウェア
pub async fn rate_limit_response(req: Request<Body>, next: Next) -> Response {
    let path = req.uri().path().to_string();
    let resp = next.run(req).await;

    if resp.status() != StatusCode::TOO_MANY_REQUESTS {
        return resp;
    }

    let retry_after = resp
        .headers()
        .get("retry-after")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("1")
        .to_string();

    // ブラウザが直接ナビゲートする OAuth エンドポイントは HTML を返す
    let is_browser_path = path.starts_with("/api/auth/google") || path.starts_with("/api/auth/github");

    if is_browser_path {
        let html = format!(
            r#"<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Nilla - リクエスト制限</title>
  <style>
    *{{box-sizing:border-box;margin:0;padding:0}}
    body{{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f9fafb;display:flex;align-items:center;justify-content:center;min-height:100vh}}
    .card{{background:#fff;border:1px solid #e5e7eb;border-radius:1rem;padding:2rem;max-width:22rem;width:100%;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,.06)}}
    h1{{font-size:1.5rem;font-weight:700;color:#2563eb;margin-bottom:.25rem}}
    .sub{{font-size:.875rem;color:#6b7280;margin-bottom:1.5rem}}
    .icon{{font-size:2rem;margin-bottom:1rem}}
    p{{font-size:.875rem;color:#374151;line-height:1.6}}
    .note{{font-size:.75rem;color:#9ca3af;margin-top:.75rem}}
    a{{display:inline-block;margin-top:1.25rem;padding:.5rem 1.25rem;background:#2563eb;color:#fff;border-radius:.5rem;font-size:.875rem;text-decoration:none}}
    a:hover{{background:#1d4ed8}}
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">⏳</div>
    <h1>Nilla</h1>
    <p class="sub">Sprint Manager</p>
    <p>リクエストが多すぎます。<br>しばらく待ってから再度お試しください。</p>
    <p class="note">{retry_after} 秒後に再試行できます</p>
    <a href="javascript:history.back()">戻る</a>
  </div>
</body>
</html>"#
        );
        (
            StatusCode::TOO_MANY_REQUESTS,
            [("content-type", "text/html; charset=utf-8")],
            html,
        )
            .into_response()
    } else {
        // API クライアント向けは JSON
        (
            StatusCode::TOO_MANY_REQUESTS,
            [("content-type", "application/json")],
            format!(r#"{{"error":"Too many requests","retry_after":{retry_after}}}"#),
        )
            .into_response()
    }
}

pub fn router() -> Router<AppState> {
    // OAuth ログイン開始エンドポイントのみにレート制限を適用
    // max ~20 req/min per IP (1 token / 3s, burst 10)
    let governor_conf = Arc::new(
        GovernorConfigBuilder::default()
            .period(std::time::Duration::from_secs(3))
            .burst_size(10)
            .finish()
            .unwrap(),
    );

    // レート制限あり: OAuth ログイン・コールバックのみ
    let oauth_router = Router::new()
        .route("/api/auth/google", get(oauth::google_login))
        .route("/api/auth/google/callback", get(oauth::google_callback))
        .route("/api/auth/github", get(oauth::github_login))
        .route("/api/auth/github/callback", get(oauth::github_callback))
        .layer(GovernorLayer::new(governor_conf))
        .layer(axum::middleware::from_fn(rate_limit_response));

    // レート制限なし: トークン認証済み or 無害なエンドポイント
    let util_router = Router::new()
        .route("/api/auth/me", get(oauth::get_me))
        .route("/api/auth/token", get(oauth::exchange_token))
        .route("/api/auth/refresh", post(oauth::refresh_token))
        .route("/api/auth/logout", post(oauth::logout))
        .route("/api/auth/ws-ticket", post(ws::create_ws_ticket))
        .route("/api/ws", get(ws::ws_handler));

    Router::new()
        .merge(oauth_router)
        .merge(util_router)
}
