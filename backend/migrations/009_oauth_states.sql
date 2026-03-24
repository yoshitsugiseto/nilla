CREATE TABLE oauth_states (
    state TEXT PRIMARY KEY,
    expires_at TEXT NOT NULL
);
