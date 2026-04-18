//! Per-request nonce-based Content-Security-Policy for the SPA shell.
//!
//! The Vite build emits `index.html` containing the literal placeholder
//! `__CSP_NONCE__`.  At request time we generate a random nonce, replace
//! every occurrence of the placeholder in the cached template, and set the
//! corresponding `Content-Security-Policy` header so the browser accepts
//! the nonced `<script>` / `<style>` tags and any runtime-injected styles
//! (e.g. from `@hello-pangea/dnd`).

use axum::{
    http::{header, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
};
use rand::Rng;

/// Placeholder string that Vite and the meta tag use in the built HTML.
const NONCE_PLACEHOLDER: &str = "__CSP_NONCE__";

/// Pre-loaded index.html template.  Read once at startup and cloned per
/// request with the nonce substituted.
#[derive(Clone)]
pub struct IndexTemplate {
    html: String,
}

impl IndexTemplate {
    /// Read `<dir>/index.html` and keep it in memory.
    pub fn load(static_dir: &str) -> std::io::Result<Self> {
        let path = std::path::Path::new(static_dir).join("index.html");
        let html = std::fs::read_to_string(path)?;
        Ok(Self { html })
    }
}

/// Generate a cryptographically random 16-byte nonce encoded as 32 hex chars.
fn generate_nonce() -> String {
    let bytes: [u8; 16] = rand::thread_rng().gen();
    hex::encode(bytes)
}

/// Build the `Content-Security-Policy` header value for a given nonce.
fn build_csp_header(nonce: &str) -> String {
    format!(
        "default-src 'self'; \
         script-src 'self' 'nonce-{nonce}'; \
         style-src 'self' 'nonce-{nonce}'; \
         style-src-attr 'unsafe-inline'; \
         img-src 'self' data: https:; \
         connect-src 'self' wss:"
    )
}

/// Serve `index.html` with a fresh CSP nonce injected into both the HTML
/// body and the response header.
pub fn serve_index_with_nonce(template: &IndexTemplate) -> Response {
    let nonce = generate_nonce();
    let html = template.html.replace(NONCE_PLACEHOLDER, &nonce);
    let csp = build_csp_header(&nonce);

    match HeaderValue::from_str(&csp) {
        Ok(csp_value) => (
            StatusCode::OK,
            [
                (header::CONTENT_TYPE, HeaderValue::from_static("text/html; charset=utf-8")),
                (header::CONTENT_SECURITY_POLICY, csp_value),
                (header::CACHE_CONTROL, HeaderValue::from_static("no-store")),
            ],
            html,
        )
            .into_response(),
        Err(_) => {
            tracing::error!("Failed to build CSP header value");
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_nonce_length() {
        let nonce = generate_nonce();
        assert_eq!(nonce.len(), 32, "nonce should be 32 hex chars (16 bytes)");
    }

    #[test]
    fn test_generate_nonce_uniqueness() {
        let a = generate_nonce();
        let b = generate_nonce();
        assert_ne!(a, b, "consecutive nonces should differ");
    }

    #[test]
    fn test_build_csp_header_contains_nonce() {
        let csp = build_csp_header("abc123");
        assert!(csp.contains("'nonce-abc123'"));
        // style-src-attr is allowed to have 'unsafe-inline' (for React
        // element.style props), but the main style-src directive must not.
        let style_src_directive = csp
            .split(';')
            .find(|d| {
                let trimmed = d.trim();
                trimmed.starts_with("style-src ") || trimmed == "style-src"
            })
            .expect("style-src directive must exist");
        assert!(
            !style_src_directive.contains("unsafe-inline"),
            "style-src must not contain unsafe-inline, got: {style_src_directive}"
        );
        assert!(csp.contains("style-src-attr 'unsafe-inline'"));
    }

    #[test]
    fn test_nonce_placeholder_replacement() {
        let template = IndexTemplate {
            html: "<meta property=\"csp-nonce\" content=\"__CSP_NONCE__\" />\
                   <script nonce=\"__CSP_NONCE__\">app()</script>"
                .to_string(),
        };
        let nonce = "deadbeef12345678deadbeef12345678";
        let result = template.html.replace(NONCE_PLACEHOLDER, nonce);
        assert!(!result.contains(NONCE_PLACEHOLDER));
        assert!(result.contains(nonce));
        // Ensure both occurrences are replaced
        assert_eq!(result.matches(nonce).count(), 2);
    }
}
