CREATE TABLE IF NOT EXISTS workspace_automation_settings (
    workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
    notify_on_assignee_change INTEGER NOT NULL DEFAULT 1,
    notify_on_review_ready INTEGER NOT NULL DEFAULT 1,
    notify_on_overdue_transition INTEGER NOT NULL DEFAULT 1,
    sprint_carryover_mode TEXT NOT NULL DEFAULT 'prompt'
        CHECK (sprint_carryover_mode IN ('prompt', 'backlog', 'next_sprint')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO workspace_automation_settings (workspace_id)
SELECT id FROM workspaces;
