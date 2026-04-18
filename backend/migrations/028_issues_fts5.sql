CREATE VIRTUAL TABLE IF NOT EXISTS issues_fts USING fts5(
    id UNINDEXED,
    title,
    description,
    content='issues',
    content_rowid='rowid'
);

-- Backfill existing data
INSERT INTO issues_fts(id, title, description)
SELECT id, title, COALESCE(description, '') FROM issues;

-- Keep FTS index in sync via triggers
CREATE TRIGGER issues_fts_insert AFTER INSERT ON issues BEGIN
    INSERT INTO issues_fts(id, title, description) VALUES (new.id, new.title, COALESCE(new.description, ''));
END;

CREATE TRIGGER issues_fts_update AFTER UPDATE ON issues BEGIN
    INSERT INTO issues_fts(issues_fts, id, title, description) VALUES ('delete', old.id, old.title, COALESCE(old.description, ''));
    INSERT INTO issues_fts(id, title, description) VALUES (new.id, new.title, COALESCE(new.description, ''));
END;

CREATE TRIGGER issues_fts_delete AFTER DELETE ON issues BEGIN
    INSERT INTO issues_fts(issues_fts, id, title, description) VALUES ('delete', old.id, old.title, COALESCE(old.description, ''));
END;
