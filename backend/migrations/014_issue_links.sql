CREATE TABLE IF NOT EXISTS issue_links (
    id              TEXT PRIMARY KEY,
    source_issue_id TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    target_issue_id TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    link_type       TEXT NOT NULL, -- 'blocks' | 'is_blocked_by' | 'relates_to' | 'duplicates'
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(source_issue_id, target_issue_id, link_type)
);
CREATE INDEX IF NOT EXISTS idx_issue_links_source ON issue_links(source_issue_id);
CREATE INDEX IF NOT EXISTS idx_issue_links_target ON issue_links(target_issue_id);
