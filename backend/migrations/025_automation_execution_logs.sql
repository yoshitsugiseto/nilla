CREATE TABLE automation_execution_logs (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    issue_id TEXT REFERENCES issues(id) ON DELETE CASCADE,
    rule_type TEXT NOT NULL,
    status TEXT NOT NULL,
    target_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    message TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_automation_execution_logs_workspace_created_at
    ON automation_execution_logs(workspace_id, created_at DESC);

CREATE INDEX idx_automation_execution_logs_issue_created_at
    ON automation_execution_logs(issue_id, created_at DESC);
