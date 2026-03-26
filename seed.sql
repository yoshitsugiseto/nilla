-- =============================================================
-- Nilla サンプルデータ
-- 使い方 (プロジェクトルートから実行):
--   sqlite3 backend/nilla.db < seed.sql
-- 既存データとは衝突しない (INSERT OR IGNORE)
-- =============================================================

-- ユーザー
INSERT OR IGNORE INTO users (id, provider, provider_id, email, name, avatar_url, created_at, updated_at) VALUES
  ('demo-user-alice', 'demo', 'demo-alice', 'alice@example.com', 'Alice',  NULL, '2026-01-01T00:00:00', '2026-01-01T00:00:00'),
  ('demo-user-bob',   'demo', 'demo-bob',   'bob@example.com',   'Bob',    NULL, '2026-01-01T00:00:00', '2026-01-01T00:00:00'),
  ('demo-user-carol', 'demo', 'demo-carol', 'carol@example.com', 'Carol',  NULL, '2026-01-01T00:00:00', '2026-01-01T00:00:00');

-- ワークスペース
INSERT OR IGNORE INTO workspaces (id, name, created_by, created_at, updated_at) VALUES
  ('demo-workspace-001', 'Demo Workspace', 'demo-user-alice', '2026-01-01T00:00:00', '2026-01-01T00:00:00');

-- ワークスペースメンバー
INSERT OR IGNORE INTO workspace_members (workspace_id, user_id, role, joined_at) VALUES
  ('demo-workspace-001', 'demo-user-alice', 'owner',  '2026-01-01T00:00:00'),
  ('demo-workspace-001', 'demo-user-bob',   'member', '2026-01-01T00:00:00'),
  ('demo-workspace-001', 'demo-user-carol', 'member', '2026-01-01T00:00:00');

-- ログイン済みの全ユーザーをデモワークスペースに追加（seed実行時点でDBにいるユーザー全員）
INSERT OR IGNORE INTO workspace_members (workspace_id, user_id, role, joined_at)
SELECT 'demo-workspace-001', u.id, 'member', CURRENT_TIMESTAMP
FROM users u;

-- プロジェクト
INSERT OR IGNORE INTO projects (id, name, key, description, workspace_id) VALUES
  ('demo-project-001', 'Demo Project', 'SMPL', 'ページネーション確認用のサンプルプロジェクト', 'demo-workspace-001');

-- プロジェクト権限 override（role UI の確認用）
-- Alice は workspace owner の継承で admin のままにし、Bob/Carol だけ差を付ける
INSERT OR IGNORE INTO project_members (project_id, user_id, role, assigned_at) VALUES
  ('demo-project-001', 'demo-user-bob',   'viewer', '2026-01-01T00:00:00'),
  ('demo-project-001', 'demo-user-carol', 'admin',  '2026-01-01T00:00:00');

-- スプリント
INSERT OR IGNORE INTO sprints (id, project_id, name, goal, status, start_date, end_date) VALUES
  ('demo-sprint-001', 'demo-project-001', 'Sprint 1', 'バックエンドAPIの基盤整備',        'completed', '2026-01-06', '2026-01-17'),
  ('demo-sprint-002', 'demo-project-001', 'Sprint 2', 'フロントエンドの主要画面実装',    'active',    '2026-01-20', '2026-01-31'),
  ('demo-sprint-003', 'demo-project-001', 'Sprint 3', 'パフォーマンス改善とバグ修正',    'planning',  '2026-02-03', '2026-02-14');

-- ===================== Issues (30件) =====================
-- Sprint 1 (completed) — 8件
INSERT OR IGNORE INTO issues (id, project_id, sprint_id, number, title, type, status, priority, points, assignee_id, position) VALUES
  ('demo-i-001', 'demo-project-001', 'demo-sprint-001',  1, '[DEMO] データベーススキーマ設計',           'story', 'done',        'high',     5,  'demo-user-alice',  1000),
  ('demo-i-002', 'demo-project-001', 'demo-sprint-001',  2, '[DEMO] プロジェクトCRUD API実装',           'task',  'done',        'high',     3,  'demo-user-bob',    2000),
  ('demo-i-003', 'demo-project-001', 'demo-sprint-001',  3, '[DEMO] スプリントCRUD API実装',             'task',  'done',        'high',     3,  'demo-user-alice',  3000),
  ('demo-i-004', 'demo-project-001', 'demo-sprint-001',  4, '[DEMO] イシューCRUD API実装',               'task',  'done',        'critical', 5,  'demo-user-carol',  4000),
  ('demo-i-005', 'demo-project-001', 'demo-sprint-001',  5, '[DEMO] マイグレーション環境構築',           'task',  'done',        'medium',   2,  'demo-user-bob',    5000),
  ('demo-i-006', 'demo-project-001', 'demo-sprint-001',  6, '[DEMO] CORSミドルウェア設定',               'task',  'done',        'low',      1,  'demo-user-carol',  6000),
  ('demo-i-007', 'demo-project-001', 'demo-sprint-001',  7, '[DEMO] エラーハンドリング共通化',           'task',  'done',        'medium',   2,  'demo-user-alice',  7000),
  ('demo-i-008', 'demo-project-001', 'demo-sprint-001',  8, '[DEMO] CI/CDパイプライン構築',              'spike', 'done',        'low',      3,  'demo-user-bob',    8000);

-- Sprint 2 (active) — 10件
INSERT OR IGNORE INTO issues (id, project_id, sprint_id, number, title, type, status, priority, points, assignee_id, position) VALUES
  ('demo-i-009', 'demo-project-001', 'demo-sprint-002',  9, '[DEMO] カンバンボード実装',                 'story', 'done',        'critical', 8,  'demo-user-alice',  1000),
  ('demo-i-010', 'demo-project-001', 'demo-sprint-002', 10, '[DEMO] ドラッグ&ドロップ機能',              'task',  'in_review',   'high',     5,  'demo-user-carol',  2000),
  ('demo-i-011', 'demo-project-001', 'demo-sprint-002', 11, '[DEMO] バックログ画面実装',                 'task',  'in_progress', 'high',     5,  'demo-user-bob',    3000),
  ('demo-i-012', 'demo-project-001', 'demo-sprint-002', 12, '[DEMO] スプリント管理画面実装',             'task',  'in_progress', 'high',     3,  'demo-user-alice',  4000),
  ('demo-i-013', 'demo-project-001', 'demo-sprint-002', 13, '[DEMO] イシュー詳細モーダル',               'task',  'todo',        'medium',   3,  'demo-user-carol',  5000),
  ('demo-i-014', 'demo-project-001', 'demo-sprint-002', 14, '[DEMO] バーンダウンチャート',               'story', 'todo',        'medium',   5,  'demo-user-bob',    6000),
  ('demo-i-015', 'demo-project-001', 'demo-sprint-002', 15, '[DEMO] コメント機能実装',                   'task',  'todo',        'low',      2,  'demo-user-alice',  7000),
  ('demo-i-016', 'demo-project-001', 'demo-sprint-002', 16, '[DEMO] アクティビティログ表示',             'task',  'todo',        'low',      2,  'demo-user-carol',  8000),
  ('demo-i-017', 'demo-project-001', 'demo-sprint-002', 17, '[DEMO] 検索機能実装',                       'task',  'todo',        'medium',   3,  'demo-user-bob',    9000),
  ('demo-i-018', 'demo-project-001', 'demo-sprint-002', 18, '[DEMO] フィルター機能実装',                 'bug',   'todo',        'high',     2,  'demo-user-alice', 10000);

-- Sprint 3 (planning) — 6件
INSERT OR IGNORE INTO issues (id, project_id, sprint_id, number, title, type, status, priority, points, assignee_id, position) VALUES
  ('demo-i-019', 'demo-project-001', 'demo-sprint-003', 19, '[DEMO] ページネーション実装',               'task',  'todo',        'high',     3,  'demo-user-bob',    1000),
  ('demo-i-020', 'demo-project-001', 'demo-sprint-003', 20, '[DEMO] パフォーマンスプロファイリング',     'spike', 'todo',        'medium',   3,  'demo-user-carol',  2000),
  ('demo-i-021', 'demo-project-001', 'demo-sprint-003', 21, '[DEMO] DBインデックス最適化',               'task',  'todo',        'medium',   2,  'demo-user-alice',  3000),
  ('demo-i-022', 'demo-project-001', 'demo-sprint-003', 22, '[DEMO] N+1クエリ問題修正',                  'bug',   'todo',        'high',     3,  'demo-user-bob',    4000),
  ('demo-i-023', 'demo-project-001', 'demo-sprint-003', 23, '[DEMO] メモリリーク調査',                   'bug',   'todo',        'critical', 5,  'demo-user-carol',  5000),
  ('demo-i-024', 'demo-project-001', 'demo-sprint-003', 24, '[DEMO] セキュリティレビュー',               'spike', 'todo',        'high',     3,  'demo-user-alice',  6000);

-- バックログ — 6件 (sprint_id = NULL)
INSERT OR IGNORE INTO issues (id, project_id, sprint_id, number, title, type, status, priority, points, assignee_id, position) VALUES
  ('demo-i-025', 'demo-project-001', NULL, 25, '[DEMO] ダークモード対応',                    'story', 'todo', 'low',    5, NULL,              1000),
  ('demo-i-026', 'demo-project-001', NULL, 26, '[DEMO] モバイルレスポンシブ対応',            'task',  'todo', 'low',    3, NULL,              2000),
  ('demo-i-027', 'demo-project-001', NULL, 27, '[DEMO] キーボードショートカット',            'task',  'todo', 'low',    2, NULL,              3000),
  ('demo-i-028', 'demo-project-001', NULL, 28, '[DEMO] エクスポート機能 (CSV/JSON)',         'story', 'todo', 'medium', 8, NULL,              4000),
  ('demo-i-029', 'demo-project-001', NULL, 29, '[DEMO] Webhook通知機能',                     'spike', 'todo', 'medium', 5, NULL,              5000),
  ('demo-i-030', 'demo-project-001', NULL, 30, '[DEMO] ユーザー設定画面',                    'task',  'todo', 'medium', 3, NULL,              6000);

-- エピック — 2件
INSERT OR IGNORE INTO issues (id, project_id, sprint_id, number, title, type, status, priority, points, assignee_id, position) VALUES
  ('demo-epic-001', 'demo-project-001', NULL, 31, '[DEMO] Epic: コアAPI基盤整備',             'epic', 'in_progress', 'high',   20, 'demo-user-alice', 100),
  ('demo-epic-002', 'demo-project-001', NULL, 32, '[DEMO] Epic: フロントエンド実装',          'epic', 'todo',        'high',   30, 'demo-user-bob',   200);

-- エピックに既存イシューを紐付け
UPDATE issues SET epic_id = 'demo-epic-001' WHERE id IN ('demo-i-001','demo-i-002','demo-i-003','demo-i-004','demo-i-005','demo-i-006','demo-i-007','demo-i-008') AND epic_id IS NULL;
UPDATE issues SET epic_id = 'demo-epic-002' WHERE id IN ('demo-i-009','demo-i-010','demo-i-011','demo-i-012','demo-i-013','demo-i-014','demo-i-015','demo-i-016','demo-i-017','demo-i-018') AND epic_id IS NULL;

-- アクティビティログ (Sprint 1 完了分)
INSERT OR IGNORE INTO activity_logs (id, issue_id, field, old_value, new_value, created_at) VALUES
  ('demo-al-001', 'demo-i-001', 'status', 'todo',        'in_progress', '2026-01-07 09:00:00'),
  ('demo-al-002', 'demo-i-001', 'status', 'in_progress', 'in_review',   '2026-01-09 14:00:00'),
  ('demo-al-003', 'demo-i-001', 'status', 'in_review',   'done',        '2026-01-10 11:00:00'),
  ('demo-al-004', 'demo-i-002', 'status', 'todo',        'in_progress', '2026-01-08 10:00:00'),
  ('demo-al-005', 'demo-i-002', 'status', 'in_progress', 'done',        '2026-01-12 16:00:00'),
  ('demo-al-006', 'demo-i-003', 'status', 'todo',        'in_progress', '2026-01-09 09:30:00'),
  ('demo-al-007', 'demo-i-003', 'status', 'in_progress', 'done',        '2026-01-13 15:00:00'),
  ('demo-al-008', 'demo-i-004', 'status', 'todo',        'in_progress', '2026-01-08 11:00:00'),
  ('demo-al-009', 'demo-i-004', 'status', 'in_progress', 'in_review',   '2026-01-14 10:00:00'),
  ('demo-al-010', 'demo-i-004', 'status', 'in_review',   'done',        '2026-01-15 14:00:00'),
  ('demo-al-011', 'demo-i-005', 'status', 'todo',        'done',        '2026-01-07 17:00:00'),
  ('demo-al-012', 'demo-i-006', 'status', 'todo',        'done',        '2026-01-08 12:00:00'),
  ('demo-al-013', 'demo-i-007', 'status', 'todo',        'in_progress', '2026-01-12 09:00:00'),
  ('demo-al-014', 'demo-i-007', 'status', 'in_progress', 'done',        '2026-01-14 17:00:00'),
  ('demo-al-015', 'demo-i-008', 'status', 'todo',        'in_progress', '2026-01-13 10:00:00'),
  ('demo-al-016', 'demo-i-008', 'status', 'in_progress', 'done',        '2026-01-16 16:00:00');

-- プロジェクトラベル（DB内の全プロジェクトに挿入）
INSERT OR IGNORE INTO project_labels (id, project_id, name, color)
SELECT lower(hex(randomblob(8))), p.id, 'frontend',    '#3b82f6' FROM projects p;
INSERT OR IGNORE INTO project_labels (id, project_id, name, color)
SELECT lower(hex(randomblob(8))), p.id, 'backend',     '#8b5cf6' FROM projects p;
INSERT OR IGNORE INTO project_labels (id, project_id, name, color)
SELECT lower(hex(randomblob(8))), p.id, 'bug',         '#ef4444' FROM projects p;
INSERT OR IGNORE INTO project_labels (id, project_id, name, color)
SELECT lower(hex(randomblob(8))), p.id, 'enhancement', '#10b981' FROM projects p;
INSERT OR IGNORE INTO project_labels (id, project_id, name, color)
SELECT lower(hex(randomblob(8))), p.id, 'performance', '#f59e0b' FROM projects p;
INSERT OR IGNORE INTO project_labels (id, project_id, name, color)
SELECT lower(hex(randomblob(8))), p.id, 'security',    '#ec4899' FROM projects p;
INSERT OR IGNORE INTO project_labels (id, project_id, name, color)
SELECT lower(hex(randomblob(8))), p.id, 'docs',        '#6b7280' FROM projects p;
INSERT OR IGNORE INTO project_labels (id, project_id, name, color)
SELECT lower(hex(randomblob(8))), p.id, 'infra',       '#0ea5e9' FROM projects p;

-- イシューテンプレート（DB内の全プロジェクトに挿入）
INSERT OR IGNORE INTO issue_templates (id, project_id, name, description, type, priority, labels, points)
SELECT lower(hex(randomblob(8))), p.id,
  'バグ報告',
  '## 再現手順\n1. \n2. \n\n## 期待される動作\n\n## 実際の動作\n\n## 環境\n- OS: \n- ブラウザ: ',
  'bug', 'high', '["bug"]', 2
FROM projects p;
INSERT OR IGNORE INTO issue_templates (id, project_id, name, description, type, priority, labels, points)
SELECT lower(hex(randomblob(8))), p.id,
  '新機能',
  '## 概要\n\n## 要件\n- \n\n## 完了条件\n- [ ] \n- [ ] ',
  'story', 'medium', '["enhancement"]', 5
FROM projects p;
INSERT OR IGNORE INTO issue_templates (id, project_id, name, description, type, priority, labels, points)
SELECT lower(hex(randomblob(8))), p.id,
  'パフォーマンス改善',
  '## 現状の問題\n\n## 計測結果\n- Before: \n- After (目標): \n\n## アプローチ',
  'task', 'medium', '["performance"]', 3
FROM projects p;
INSERT OR IGNORE INTO issue_templates (id, project_id, name, description, type, priority, labels, points)
SELECT lower(hex(randomblob(8))), p.id,
  'セキュリティ調査',
  '## 調査内容\n\n## リスク評価\n- 影響範囲: \n- 深刻度: \n\n## 対応方針',
  'spike', 'high', '["security"]', 3
FROM projects p;
INSERT OR IGNORE INTO issue_templates (id, project_id, name, description, type, priority, labels, points)
SELECT lower(hex(randomblob(8))), p.id,
  'フロントエンドタスク',
  '## 実装内容\n\n## デザイン参考\n\n## 完了条件\n- [ ] PC表示確認\n- [ ] モバイル確認',
  'task', 'medium', '["frontend"]', 2
FROM projects p;
INSERT OR IGNORE INTO issue_templates (id, project_id, name, description, type, priority, labels, points)
SELECT lower(hex(randomblob(8))), p.id,
  'APIエンドポイント追加',
  '## エンドポイント\n- Method: \n- Path: \n\n## Request\n```json\n\n```\n\n## Response\n```json\n\n```',
  'task', 'medium', '["backend"]', 3
FROM projects p;

-- サンプルコメント
INSERT OR IGNORE INTO comments (id, issue_id, user_id, author, body) VALUES
  ('demo-c-001', 'demo-i-009', 'demo-user-alice', 'Alice', 'カンバンボードのカラム幅を可変にする案も検討中です。'),
  ('demo-c-002', 'demo-i-009', 'demo-user-bob',   'Bob',   '@Alice ドラッグ中のプレビュー表示も優先度高めにお願いします！'),
  ('demo-c-003', 'demo-i-010', 'demo-user-carol', 'Carol', 'hello-pangea/dnd を採用することにしました。react-beautiful-dnd の後継です。'),
  ('demo-c-004', 'demo-i-014', 'demo-user-bob',   'Bob',   'バーンダウンの実績線はactivity_logsから算出します。スプリント開始時のスナップショットがないので中途追加issueの扱いに注意。'),
  ('demo-c-005', 'demo-i-019', 'demo-user-alice', 'Alice', '検索はサーバーサイドで20件/ページ。Board/Backlogはスプリント単位で自然に件数が絞られるのでページネーション不要の方針。');

SELECT '✓ シードデータ挿入完了' AS result;
SELECT '  ユーザー:         ' || COUNT(*) || '件' AS summary FROM users WHERE id LIKE 'demo-user-%';
SELECT '  ワークスペース:   ' || COUNT(*) || '件' AS summary FROM workspaces WHERE id = 'demo-workspace-001';
SELECT '  プロジェクト:     ' || COUNT(*) || '件' AS summary FROM projects WHERE id = 'demo-project-001';
SELECT '  スプリント:       ' || COUNT(*) || '件' AS summary FROM sprints WHERE project_id = 'demo-project-001';
SELECT '  イシュー:         ' || COUNT(*) || '件' AS summary FROM issues WHERE project_id = 'demo-project-001';
SELECT '  コメント:         ' || COUNT(*) || '件' AS summary FROM comments WHERE id LIKE 'demo-c-%';
SELECT '  ラベル:           ' || COUNT(*) || '件' AS summary FROM project_labels WHERE project_id = 'demo-project-001';
SELECT '  テンプレート:     ' || COUNT(*) || '件' AS summary FROM issue_templates WHERE project_id = 'demo-project-001';
SELECT '  権限override:     ' || COUNT(*) || '件' AS summary FROM project_members WHERE project_id = 'demo-project-001';
