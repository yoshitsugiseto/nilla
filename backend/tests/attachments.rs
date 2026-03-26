mod common;

use axum::body::Body;
use axum::http::{Request, StatusCode};
use http_body_util::BodyExt;
use serde_json::json;
use tower::ServiceExt;

// ---------------------------------------------------------------
// Multipart helper
// ---------------------------------------------------------------

/// Build a multipart/form-data request for file upload.
fn multipart_upload(
    uri: &str,
    token: &str,
    filename: &str,
    content_type: &str,
    data: &[u8],
) -> Request<Body> {
    let boundary = "----TestBoundary7MA4YWxkTrZu0gW";
    let mut body = Vec::new();

    // File field
    body.extend_from_slice(format!("--{boundary}\r\n").as_bytes());
    body.extend_from_slice(
        format!(
            "Content-Disposition: form-data; name=\"file\"; filename=\"{filename}\"\r\n"
        )
        .as_bytes(),
    );
    body.extend_from_slice(format!("Content-Type: {content_type}\r\n\r\n").as_bytes());
    body.extend_from_slice(data);
    body.extend_from_slice(b"\r\n");
    body.extend_from_slice(format!("--{boundary}--\r\n").as_bytes());

    Request::builder()
        .method("POST")
        .uri(uri)
        .header(
            "content-type",
            format!("multipart/form-data; boundary={boundary}"),
        )
        .header("Authorization", format!("Bearer {token}"))
        .body(Body::from(body))
        .unwrap()
}

// ---------------------------------------------------------------
// Helper: create a workspace + project + issue for attachment tests
// ---------------------------------------------------------------

async fn setup_project_and_issue(
    app: &axum::Router,
) -> (String, String) {
    let project_id = common::create_project(app, "AttachProj", "AP").await;
    let issue_id = common::create_issue(app, &project_id, "Attach Issue").await;
    (project_id, issue_id)
}

// ---------------------------------------------------------------
// 1. Upload within size limit
// ---------------------------------------------------------------

#[tokio::test]
async fn test_upload_attachment_within_size_limit_returns_ok() {
    let (app, _pool) = common::setup_app_with_pool().await;
    let (_project_id, issue_id) = setup_project_and_issue(&app).await;

    let token = common::test_token();
    let data = b"Hello, this is a small test file.";

    let req = multipart_upload(
        &format!("/api/issues/{issue_id}/attachments"),
        &token,
        "test.txt",
        "text/plain",
        data,
    );

    let (status, json) = common::send(&app, req).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json["issue_id"], issue_id);
    assert_eq!(json["filename"], "test.txt");
    assert_eq!(json["uploaded_by"], common::TEST_USER_ID);
    assert!(json["id"].is_string());
    assert!(json["url"].as_str().unwrap().contains("/download"));
}

// ---------------------------------------------------------------
// 2. Upload over 10MB limit
// ---------------------------------------------------------------

#[tokio::test]
async fn test_upload_attachment_over_size_limit_returns_400() {
    let (app, _pool) = common::setup_app_with_pool().await;
    let (_project_id, issue_id) = setup_project_and_issue(&app).await;

    let token = common::test_token();
    // 10 MB + 1 byte
    let data = vec![0u8; 10 * 1024 * 1024 + 1];

    let req = multipart_upload(
        &format!("/api/issues/{issue_id}/attachments"),
        &token,
        "big.bin",
        "application/octet-stream",
        &data,
    );

    let (status, _json) = common::send(&app, req).await;
    // The oversized payload is rejected either by axum's multipart parser
    // (default body limit) or by the handler's own MAX_FILE_SIZE check.
    // Both return 400; the exact error message depends on which layer
    // catches it first.
    assert_eq!(status, StatusCode::BAD_REQUEST);
}

// ---------------------------------------------------------------
// 3. Download by owner
// ---------------------------------------------------------------

#[tokio::test]
async fn test_download_attachment_by_owner_returns_file() {
    let (app, _pool) = common::setup_app_with_pool().await;
    let (_project_id, issue_id) = setup_project_and_issue(&app).await;

    let token = common::test_token();
    let file_content = b"download me please";

    // Upload
    let req = multipart_upload(
        &format!("/api/issues/{issue_id}/attachments"),
        &token,
        "download.txt",
        "text/plain",
        file_content,
    );
    let (status, json) = common::send(&app, req).await;
    assert_eq!(status, StatusCode::OK);
    let attachment_id = json["id"].as_str().unwrap();

    // Download
    let req = Request::builder()
        .method("GET")
        .uri(&format!("/api/attachments/{attachment_id}/download"))
        .header("Authorization", format!("Bearer {token}"))
        .body(Body::empty())
        .unwrap();

    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);

    // Verify content-disposition header
    let disposition = resp
        .headers()
        .get("content-disposition")
        .unwrap()
        .to_str()
        .unwrap();
    assert!(disposition.contains("download.txt"));

    // Verify body matches uploaded content
    let bytes = resp.into_body().collect().await.unwrap().to_bytes();
    assert_eq!(&bytes[..], file_content);
}

// ---------------------------------------------------------------
// 4. Delete by owner
// ---------------------------------------------------------------

#[tokio::test]
async fn test_delete_attachment_by_owner_returns_ok() {
    let (app, _pool) = common::setup_app_with_pool().await;
    let (_project_id, issue_id) = setup_project_and_issue(&app).await;

    let token = common::test_token();

    // Upload
    let req = multipart_upload(
        &format!("/api/issues/{issue_id}/attachments"),
        &token,
        "deleteme.txt",
        "text/plain",
        b"to be deleted",
    );
    let (status, json) = common::send(&app, req).await;
    assert_eq!(status, StatusCode::OK);
    let attachment_id = json["id"].as_str().unwrap();

    // Delete
    let (status, json) = common::send(
        &app,
        common::delete(&format!("/api/attachments/{attachment_id}")),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json["ok"], true);

    // Verify it's gone — download should return 404
    let (status, _) = common::send(
        &app,
        common::get(&format!("/api/attachments/{attachment_id}/download")),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

// ---------------------------------------------------------------
// 5. Delete by non-owner returns 403
// ---------------------------------------------------------------

#[tokio::test]
async fn test_delete_attachment_by_non_owner_returns_403() {
    let (app, pool) = common::setup_app_with_pool().await;
    common::insert_user_b(&pool).await;

    let (_project_id, issue_id) = setup_project_and_issue(&app).await;

    // User A uploads a file
    let token_a = common::test_token();
    let req = multipart_upload(
        &format!("/api/issues/{issue_id}/attachments"),
        &token_a,
        "protected.txt",
        "text/plain",
        b"only owner can delete",
    );
    let (status, json) = common::send(&app, req).await;
    assert_eq!(status, StatusCode::OK);
    let attachment_id = json["id"].as_str().unwrap();

    // Add user B to workspace so they have project access
    // First find the workspace ID
    let ws_id: String = sqlx::query_scalar("SELECT workspace_id FROM projects WHERE id = ?")
        .bind(&_project_id)
        .fetch_one(&pool)
        .await
        .unwrap();

    common::send(
        &app,
        common::post(
            &format!("/api/workspaces/{ws_id}/members"),
            json!({ "user_id": common::TEST_USER_B_ID }),
        ),
    )
    .await;

    // User B tries to delete — should get 403
    let token_b = common::token_for(common::TEST_USER_B_ID);
    let (status, _) = common::send(
        &app,
        common::delete_as(&format!("/api/attachments/{attachment_id}"), &token_b),
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN);
}

// ---------------------------------------------------------------
// 6. Cross-project isolation
// ---------------------------------------------------------------

#[tokio::test]
async fn test_cross_project_user_cannot_access_attachment() {
    let (app, pool) = common::setup_app_with_pool().await;
    common::insert_user_b(&pool).await;

    // User A creates workspace + project + issue + attachment
    let (_project_id, issue_id) = setup_project_and_issue(&app).await;

    let token_a = common::test_token();
    let req = multipart_upload(
        &format!("/api/issues/{issue_id}/attachments"),
        &token_a,
        "secret.txt",
        "text/plain",
        b"secret content",
    );
    let (status, json) = common::send(&app, req).await;
    assert_eq!(status, StatusCode::OK);
    let attachment_id = json["id"].as_str().unwrap();

    // User B is NOT in the workspace — tries to download attachment
    let token_b = common::token_for(common::TEST_USER_B_ID);
    let (status, _) = common::send(
        &app,
        common::get_as(
            &format!("/api/attachments/{attachment_id}/download"),
            &token_b,
        ),
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN);

    // User B tries to list attachments on the issue
    let (status, _) = common::send(
        &app,
        common::get_as(
            &format!("/api/issues/{issue_id}/attachments"),
            &token_b,
        ),
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN);
}

// ---------------------------------------------------------------
// 7. Blocked content type (ELF binary)
// ---------------------------------------------------------------

#[tokio::test]
async fn test_upload_elf_binary_returns_400() {
    let (app, _pool) = common::setup_app_with_pool().await;
    let (_project_id, issue_id) = setup_project_and_issue(&app).await;

    let token = common::test_token();
    // ELF magic bytes: 0x7f 'E' 'L' 'F'
    let mut elf_data = vec![0x7f, b'E', b'L', b'F'];
    elf_data.extend_from_slice(&[0u8; 100]); // pad to make it plausible

    let req = multipart_upload(
        &format!("/api/issues/{issue_id}/attachments"),
        &token,
        "malware.bin",
        "application/octet-stream",
        &elf_data,
    );

    let (status, json) = common::send(&app, req).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert!(json["error"].is_string());
}

#[tokio::test]
async fn test_upload_pe_binary_returns_400() {
    let (app, _pool) = common::setup_app_with_pool().await;
    let (_project_id, issue_id) = setup_project_and_issue(&app).await;

    let token = common::test_token();
    // Windows PE magic bytes: "MZ"
    let mut pe_data = b"MZ".to_vec();
    pe_data.extend_from_slice(&[0u8; 100]);

    let req = multipart_upload(
        &format!("/api/issues/{issue_id}/attachments"),
        &token,
        "evil.exe",
        "application/octet-stream",
        &pe_data,
    );

    let (status, json) = common::send(&app, req).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert!(json["error"].is_string());
}

#[tokio::test]
async fn test_upload_shebang_script_returns_400() {
    let (app, _pool) = common::setup_app_with_pool().await;
    let (_project_id, issue_id) = setup_project_and_issue(&app).await;

    let token = common::test_token();
    let script_data = b"#!/bin/bash\nrm -rf /\n";

    let req = multipart_upload(
        &format!("/api/issues/{issue_id}/attachments"),
        &token,
        "evil.sh",
        "text/plain",
        script_data,
    );

    let (status, json) = common::send(&app, req).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert!(json["error"].is_string());
}

// ---------------------------------------------------------------
// 8. Filename with path traversal is sanitized
// ---------------------------------------------------------------

#[tokio::test]
async fn test_upload_filename_with_path_traversal_is_sanitized() {
    let (app, _pool) = common::setup_app_with_pool().await;
    let (_project_id, issue_id) = setup_project_and_issue(&app).await;

    let token = common::test_token();

    let req = multipart_upload(
        &format!("/api/issues/{issue_id}/attachments"),
        &token,
        "../../../etc/passwd",
        "text/plain",
        b"not actually passwd",
    );

    let (status, json) = common::send(&app, req).await;
    assert_eq!(status, StatusCode::OK);
    // The filename should be sanitized — only the basename
    let stored_filename = json["filename"].as_str().unwrap();
    assert!(!stored_filename.contains(".."));
    assert!(!stored_filename.contains('/'));
    assert_eq!(stored_filename, "passwd");
}

// ---------------------------------------------------------------
// List attachments
// ---------------------------------------------------------------

#[tokio::test]
async fn test_list_attachments_returns_uploaded_files() {
    let (app, _pool) = common::setup_app_with_pool().await;
    let (_project_id, issue_id) = setup_project_and_issue(&app).await;

    let token = common::test_token();

    // Upload two files
    for name in ["file1.txt", "file2.txt"] {
        let req = multipart_upload(
            &format!("/api/issues/{issue_id}/attachments"),
            &token,
            name,
            "text/plain",
            b"content",
        );
        let (status, _) = common::send(&app, req).await;
        assert_eq!(status, StatusCode::OK);
    }

    // List
    let (status, json) = common::send(
        &app,
        common::get(&format!("/api/issues/{issue_id}/attachments")),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let attachments = json.as_array().unwrap();
    assert_eq!(attachments.len(), 2);

    let filenames: Vec<&str> = attachments
        .iter()
        .map(|a| a["filename"].as_str().unwrap())
        .collect();
    assert!(filenames.contains(&"file1.txt"));
    assert!(filenames.contains(&"file2.txt"));
}
