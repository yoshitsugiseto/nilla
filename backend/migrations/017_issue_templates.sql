CREATE TABLE IF NOT EXISTS issue_templates (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    description TEXT,
    type        TEXT NOT NULL DEFAULT 'task',
    priority    TEXT NOT NULL DEFAULT 'medium',
    labels      TEXT,   -- JSON array
    points      INTEGER,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(project_id, name)
);
CREATE INDEX IF NOT EXISTS idx_issue_templates_project ON issue_templates(project_id);
