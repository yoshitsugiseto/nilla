# Nilla - スプリント管理アプリ 仕様書

## 概要

JIRAライクなスプリント管理アプリ。Workspace単位でチーム管理・マルチユーザー対応。

## 技術スタック

| レイヤー | 技術 |
|---------|------|
| バックエンド | Rust (Edition 2021) + Axum 0.8 (WebSocket・Multipart対応) |
| DB | SQLite + sqlx 0.8 |
| マイグレーション | sqlx `migrate!` マクロ（起動時自動実行） |
| 全文検索 | SQLite FTS5 |
| 認証 | JWT (アクセストークン 5分 / リフレッシュトークン 30日) + OAuth (GitHub / Google) + Email/Password (Argon2) |
| リアルタイム | WebSocket (チケットベース認証) |
| セキュリティ | nonce-based CSP, レート制限 (tower-governor) |
| ファイルストレージ | S3互換 / ローカルファイルシステム |
| パスワードハッシュ | Argon2 |
| フロントエンド | React 19 + Vite 5 + TypeScript 5.9 |
| ルーティング | React Router 7 |
| スタイル | Tailwind CSS 4 |
| 状態管理 | TanStack Query 5 + Zustand 5 |
| チャート | Recharts 3 |
| ドラッグ&ドロップ | @hello-pangea/dnd 18 |
| ユニットテスト | Vitest + React Testing Library |
| E2Eテスト | Playwright |

---

## ディレクトリ構成

```
nilla/
├── backend/
│   ├── Cargo.toml
│   ├── src/
│   │   ├── main.rs             # エントリーポイント（CORS・レート制限・サーバー起動）
│   │   ├── lib.rs              # ルーター構築・セキュリティヘッダー・SPA配信
│   │   ├── csp.rs              # nonce-based Content-Security-Policy
│   │   ├── db.rs               # SQLiteプール生成・マイグレーション
│   │   ├── error.rs            # AppError / Result 型
│   │   ├── realtime.rs         # WebSocket ブロードキャスト (RealtimeHub)
│   │   ├── automation.rs       # ワークスペース自動化ルール
│   │   ├── storage.rs          # ファイルストレージ抽象層
│   │   ├── auth/               # 認証・認可
│   │   │   ├── mod.rs          # public_router / protected_router / レート制限
│   │   │   ├── jwt.rs          # JWT エンコード・デコード
│   │   │   ├── middleware.rs   # 認証ミドルウェア
│   │   │   ├── oauth.rs        # OAuth (GitHub/Google) フロー
│   │   │   ├── password.rs     # Email/Password 認証 (Argon2)
│   │   │   └── ws.rs           # WebSocket チケット認証
│   │   ├── models/
│   │   │   ├── mod.rs
│   │   │   ├── project.rs
│   │   │   ├── sprint.rs
│   │   │   ├── issue.rs        # Issue, IssueLink, BulkUpdate 等
│   │   │   ├── workspace.rs    # Workspace, AutomationSettings 等
│   │   │   ├── notification.rs
│   │   │   ├── label.rs
│   │   │   ├── template.rs
│   │   │   └── search_preset.rs
│   │   └── routes/
│   │       ├── mod.rs           # 全APIルート登録
│   │       ├── projects.rs
│   │       ├── sprints.rs
│   │       ├── workspaces.rs    # Workspace・メンバー・自動化・プロジェクトメンバー
│   │       ├── attachments.rs
│   │       ├── notifications.rs
│   │       ├── labels.rs
│   │       ├── templates.rs
│   │       ├── search_presets.rs
│   │       └── issues/
│   │           ├── mod.rs           # Issues CRUD・ステータス・スプリント割当
│   │           ├── helpers.rs       # SQL構築・通知ロジック・FTS5検索
│   │           ├── comments.rs      # コメント・アクティビティログ
│   │           ├── issue_links.rs   # Issue間リンク
│   │           └── bulk_operations.rs # 一括更新
│   ├── migrations/              # 001〜028 のSQLマイグレーション
│   └── tests/                   # 統合テスト（インメモリSQLite）
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   ├── vitest.config.ts
│   ├── playwright.config.ts
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── AppShell.tsx
│       ├── types/
│       │   └── index.ts
│       ├── api/
│       │   ├── client.ts       # Axiosインスタンス・extractErrorMessage
│       │   ├── projects.ts
│       │   ├── sprints.ts
│       │   ├── issues.ts
│       │   ├── workspaces.ts
│       │   ├── attachments.ts
│       │   └── notifications.ts
│       ├── store/
│       │   ├── index.ts        # Zustand（activeProjectId・activeSprint・boardFilters）
│       │   └── auth.ts         # 認証状態管理
│       ├── hooks/              # カスタムフック
│       ├── components/
│       │   ├── Board/
│       │   │   ├── Board.tsx
│       │   │   ├── BoardFilters.tsx
│       │   │   ├── BurndownChart.tsx
│       │   │   ├── Column.tsx
│       │   │   └── IssueCard.tsx
│       │   ├── Issue/
│       │   │   ├── IssueDetail.tsx
│       │   │   └── IssueForm.tsx
│       │   └── common/
│       │       ├── Avatar.tsx
│       │       ├── Badge.tsx
│       │       ├── DetailPanel.tsx
│       │       ├── ErrorBoundary.tsx
│       │       ├── Modal.tsx
│       │       └── Toast.tsx
│       ├── pages/
│       │   ├── BoardPage.tsx
│       │   ├── BacklogPage.tsx
│       │   ├── DashboardPage.tsx
│       │   ├── SearchPage.tsx
│       │   ├── SprintPage.tsx
│       │   ├── SprintHistoryPage.tsx
│       │   ├── LoginPage.tsx
│       │   ├── AuthCallbackPage.tsx
│       │   └── SettingsPage.tsx
│       ├── test/               # Vitestユニットテスト
│       └── e2e/                # Playwright E2Eテスト
├── deploy/
│   ├── Dockerfile
│   └── docker-compose.yml
└── seed.sql                    # サンプルデータ
```

---

## データモデル

### User

```sql
CREATE TABLE users (
    id            TEXT PRIMARY KEY,  -- UUID
    provider      TEXT NOT NULL,     -- 'github' | 'google' | 'email'
    provider_id   TEXT NOT NULL,
    email         TEXT,
    name          TEXT NOT NULL,
    avatar_url    TEXT,
    password_hash TEXT,              -- Email認証の場合のみ (Argon2)
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL,
    UNIQUE (provider, provider_id)
);
```

### Workspace

```sql
CREATE TABLE workspaces (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    created_by TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE workspace_members (
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role         TEXT NOT NULL DEFAULT 'member', -- owner | admin | member | viewer
    joined_at    TEXT NOT NULL,
    PRIMARY KEY (workspace_id, user_id)
);
```

### WorkspaceAutomationSettings

```sql
CREATE TABLE workspace_automation_settings (
    workspace_id               TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
    notify_on_assignee_change  INTEGER NOT NULL DEFAULT 1,
    notify_on_review_ready     INTEGER NOT NULL DEFAULT 1,
    notify_on_overdue_transition INTEGER NOT NULL DEFAULT 1,
    sprint_carryover_mode      TEXT NOT NULL DEFAULT 'prompt'
        CHECK (sprint_carryover_mode IN ('prompt', 'backlog', 'next_sprint')),
    created_at                 TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at                 TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### AutomationExecutionLog

```sql
CREATE TABLE automation_execution_logs (
    id             TEXT PRIMARY KEY,
    workspace_id   TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    project_id     TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    issue_id       TEXT REFERENCES issues(id) ON DELETE CASCADE,
    rule_type      TEXT NOT NULL,      -- 'assignee_change' | 'review_ready' | 'overdue' | 'sprint_carryover'
    status         TEXT NOT NULL,      -- 'sent' | 'skipped' | 'disabled' | 'applied'
    target_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    message        TEXT NOT NULL,
    created_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### Project

```sql
CREATE TABLE projects (
    id           TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    name         TEXT NOT NULL,
    key          TEXT NOT NULL UNIQUE,  -- "PROJ" など（英数字のみ）
    description  TEXT,
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### ProjectMember

```sql
CREATE TABLE project_members (
    project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role        TEXT NOT NULL,  -- 'admin' | 'editor' | 'viewer'
    assigned_at TEXT NOT NULL,
    PRIMARY KEY (project_id, user_id)
);
```

> プロジェクトメンバーは Workspace メンバーから継承され、個別にオーバーライド可能。
> Workspace role → Project role の自動マッピング: owner/admin → admin, member → editor, viewer → viewer

### Sprint

```sql
CREATE TABLE sprints (
    id                    TEXT PRIMARY KEY,
    project_id            TEXT NOT NULL REFERENCES projects(id),
    name                  TEXT NOT NULL,
    goal                  TEXT,
    status                TEXT NOT NULL DEFAULT 'planning',  -- planning | active | completed
    start_date            DATE,
    end_date              DATE,
    snapshot_total_points  INTEGER,  -- スプリント開始時にスナップショット（バーンダウン用）
    created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### Issue

```sql
CREATE TABLE issues (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL REFERENCES projects(id),
    sprint_id   TEXT REFERENCES sprints(id),              -- NULL = バックログ
    parent_id   TEXT REFERENCES issues(id) ON DELETE SET NULL,
    epic_id     TEXT REFERENCES issues(id) ON DELETE SET NULL,
    number      INTEGER NOT NULL,                          -- プロジェクト内連番
    title       TEXT NOT NULL,
    description TEXT,
    type        TEXT NOT NULL DEFAULT 'task',              -- story | task | bug | spike | epic
    status      TEXT NOT NULL DEFAULT 'todo',              -- todo | in_progress | in_review | done
    priority    TEXT NOT NULL DEFAULT 'medium',            -- critical | high | medium | low
    points      INTEGER,                                   -- 0〜999
    assignee_id TEXT REFERENCES users(id),
    labels      TEXT,                                      -- JSON配列 ["frontend", "api"]
    position    INTEGER NOT NULL DEFAULT 0,
    due_date    DATE,                                      -- 期限日
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(project_id, number)
);
```

### IssueLink

```sql
CREATE TABLE issue_links (
    id              TEXT PRIMARY KEY,
    source_issue_id TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    target_issue_id TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    link_type       TEXT NOT NULL,  -- 'blocks' | 'is_blocked_by' | 'relates_to' | 'duplicates'
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(source_issue_id, target_issue_id, link_type)
);
```

### Comment

```sql
CREATE TABLE comments (
    id         TEXT PRIMARY KEY,
    issue_id   TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    user_id    TEXT REFERENCES users(id),
    author     TEXT NOT NULL,          -- 表示名（後方互換）
    body       TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### ActivityLog

```sql
CREATE TABLE activity_logs (
    id         TEXT PRIMARY KEY,
    issue_id   TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    field      TEXT NOT NULL,   -- "status", "sprint_carryover", "assignee_notification", "review_ready", "overdue" など
    old_value  TEXT,
    new_value  TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### ProjectLabel

```sql
CREATE TABLE project_labels (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    color       TEXT NOT NULL DEFAULT '#6366f1',
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(project_id, name)
);
```

### IssueTemplate

```sql
CREATE TABLE issue_templates (
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
```

### SearchPreset

```sql
CREATE TABLE search_presets (
    id         TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    query      TEXT NOT NULL DEFAULT '',
    filters    TEXT NOT NULL DEFAULT '{}',   -- JSON object
    created_by TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### Attachment

```sql
CREATE TABLE attachments (
    id           TEXT PRIMARY KEY,
    issue_id     TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    uploaded_by  TEXT NOT NULL REFERENCES users(id),
    filename     TEXT NOT NULL,
    content_type TEXT NOT NULL,
    size         INTEGER NOT NULL,
    storage_key  TEXT NOT NULL UNIQUE,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### Notification

```sql
CREATE TABLE notifications (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    issue_id   TEXT REFERENCES issues(id) ON DELETE SET NULL,
    type       TEXT NOT NULL,      -- 'mention' | 'assigned' | 'comment' | 'review_ready' | 'overdue'
    message    TEXT NOT NULL,
    read       INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### 全文検索 (FTS5)

```sql
CREATE VIRTUAL TABLE issues_fts USING fts5(
    id UNINDEXED,
    title,
    description,
    content='issues',
    content_rowid='rowid'
);
```

FTS インデックスはトリガーにより自動同期（INSERT / UPDATE / DELETE 時）。検索クエリはフレーズマッチ + プレフィックスマッチ（`"query"*`）で実行される。Issue番号による検索も並行して LIKE で処理される。

### WebSocket チケット

```sql
CREATE TABLE ws_tickets (
    ticket     TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    expires_at TEXT NOT NULL          -- 10秒間有効の使い捨てチケット
);
```

### OAuth 一時コード

```sql
CREATE TABLE oauth_codes (
    code          TEXT PRIMARY KEY,
    access_token  TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    expires_at    TEXT NOT NULL
);
```

---

## API 仕様

### 認証（Public エンドポイント）

| メソッド | パス | 説明 |
|---------|------|------|
| POST | `/api/auth/signup` | メール+パスワード登録（Argon2ハッシュ、パスワード8〜128文字） |
| POST | `/api/auth/login` | メール+パスワードログイン（JWT + refresh_token cookie を返す） |
| POST | `/api/auth/logout` | ログアウト（セッション削除・Cookie クリア） |
| POST | `/api/auth/refresh` | アクセストークン更新（Cookie 内の refresh_token を使用） |
| GET | `/api/auth/token` | OAuth 一時コードからトークンを交換 |
| GET | `/api/auth/google` | Google OAuthリダイレクト（レート制限あり） |
| GET | `/api/auth/google/callback` | Google OAuthコールバック（レート制限あり） |
| GET | `/api/auth/github` | GitHub OAuthリダイレクト（レート制限あり） |
| GET | `/api/auth/github/callback` | GitHub OAuthコールバック（レート制限あり） |
| GET | `/api/ws` | WebSocket接続（チケット認証、`?ticket=...&workspace_id=...`） |

### 認証（Protected エンドポイント）

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/api/auth/me` | 現在のユーザー情報 |
| POST | `/api/auth/ws-ticket` | WebSocket用の使い捨てチケット発行（10秒有効） |

### ヘルスチェック

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/api/health` | ヘルスチェック（"ok" を返す） |

### Users

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/api/users` | 同一Workspace内のユーザー一覧 |

### Workspaces

| メソッド | パス | 権限 | 説明 |
|---------|------|------|------|
| GET | `/api/workspaces` | Member | 所属Workspace一覧 |
| POST | `/api/workspaces` | Any | Workspace作成（作成者が owner に） |
| GET | `/api/workspaces/{id}` | Member | Workspace詳細 |
| PUT | `/api/workspaces/{id}` | Admin+ | Workspace更新 |
| DELETE | `/api/workspaces/{id}` | Owner | Workspace削除（全関連データを cascade 削除） |
| GET | `/api/workspaces/{id}/members` | Member | メンバー一覧 |
| POST | `/api/workspaces/{id}/members` | Admin+ | メンバー追加 |
| PATCH | `/api/workspaces/{id}/members/{uid}` | Admin+ | ロール変更（最後のownerは変更不可） |
| DELETE | `/api/workspaces/{id}/members/{uid}` | Admin+ | メンバー除外（最後のownerは除外不可） |

### Workspace Automation

| メソッド | パス | 権限 | 説明 |
|---------|------|------|------|
| GET | `/api/workspaces/{id}/automation` | Member | 自動化設定取得 |
| PATCH | `/api/workspaces/{id}/automation` | Admin+ | 自動化設定更新 |
| GET | `/api/workspaces/{id}/automation/logs` | Member | 自動化実行ログ一覧（`?limit=20&offset=0`） |

#### 自動化設定フィールド

| フィールド | 型 | デフォルト | 説明 |
|-----------|-----|----------|------|
| `notify_on_assignee_change` | bool | true | アサイン変更時に通知 |
| `notify_on_review_ready` | bool | true | レビュー待ち移行時に通知 |
| `notify_on_overdue_transition` | bool | true | 期限超過時に通知 |
| `sprint_carryover_mode` | string | "prompt" | スプリント完了時の未完了Issue処理（`prompt` / `backlog` / `next_sprint`） |

### Projects

| メソッド | パス | 権限 | 説明 |
|---------|------|------|------|
| GET | `/api/projects` | Member | プロジェクト一覧（`?workspace_id=...` でフィルター） |
| POST | `/api/projects` | Editor+ | プロジェクト作成 |
| GET | `/api/projects/{id}` | Viewer+ | プロジェクト詳細 |
| PUT | `/api/projects/{id}` | Admin | プロジェクト更新 |
| DELETE | `/api/projects/{id}` | Admin | プロジェクト削除（Issue・Sprint を cascade 削除） |

### Project Members

| メソッド | パス | 権限 | 説明 |
|---------|------|------|------|
| GET | `/api/projects/{id}/members` | Viewer+ | プロジェクトメンバー一覧（Workspace メンバーから継承、個別ロールをオーバーライド表示） |
| PATCH | `/api/projects/{id}/members/{uid}` | Admin | プロジェクト個別ロール設定（admin / editor / viewer） |
| DELETE | `/api/projects/{id}/members/{uid}` | Admin | プロジェクト個別ロールをクリア（Workspace 継承に戻す） |

### Sprints

| メソッド | パス | 権限 | 説明 |
|---------|------|------|------|
| GET | `/api/projects/{id}/sprints` | Viewer+ | スプリント一覧 |
| POST | `/api/projects/{id}/sprints` | Editor+ | スプリント作成 |
| GET | `/api/sprints/{id}` | Viewer+ | スプリント詳細 |
| PUT | `/api/sprints/{id}` | Editor+ | スプリント更新 |
| DELETE | `/api/sprints/{id}` | Editor+ | スプリント削除（Issueをバックログへ移動） |
| POST | `/api/sprints/{id}/start` | Editor+ | スプリント開始（planning → active、合計ポイントをスナップショット） |
| POST | `/api/sprints/{id}/complete` | Editor+ | スプリント完了（`{ next_sprint_id?: string }`、未完了Issueをバックログまたは次スプリントへ移動、自動化設定のcarryoverモードに従う） |
| GET | `/api/sprints/{id}/burndown` | Viewer+ | バーンダウンデータ取得 |
| GET | `/api/projects/{id}/velocity` | Viewer+ | ベロシティデータ取得（完了済みスプリント、最大10件） |

### Issues

| メソッド | パス | 権限 | 説明 |
|---------|------|------|------|
| GET | `/api/projects/{id}/issues` | Viewer+ | Issue一覧（フィルター・ページネーション対応） |
| POST | `/api/projects/{id}/issues` | Editor+ | Issue作成 |
| GET | `/api/issues/{id}` | Viewer+ | Issue詳細 |
| PUT | `/api/issues/{id}` | Editor+ | Issue更新 |
| DELETE | `/api/issues/{id}` | Editor+ | Issue削除（サブタスクも cascade 削除） |
| PATCH | `/api/issues/{id}/status` | Editor+ | ステータス変更（activity_log 自動記録） |
| PATCH | `/api/issues/{id}/sprint` | Editor+ | スプリント割当変更 |
| GET | `/api/issues/{id}/children` | Viewer+ | サブタスク一覧 |
| PUT | `/api/projects/{id}/issues/reorder` | Editor+ | Issue並び順更新（`{ ids: string[] }`、最大500件） |
| PATCH | `/api/projects/{id}/issues/bulk` | Editor+ | 一括更新（最大100件） |

#### Issue一覧のクエリパラメータ

```
sprint_id   : スプリントID（"backlog" でバックログのみ）
status      : todo | in_progress | in_review | done
type        : story | task | bug | spike | epic
priority    : critical | high | medium | low
assignee_id : ユーザーID（"__unassigned__" で未アサインのみ）
due_state   : "overdue"（期限超過 & 未完了のみ）
q           : タイトル・説明の全文検索（FTS5）+ Issue番号検索
limit       : 取得件数（デフォルト 500、最大 1000）
offset      : オフセット（デフォルト 0）
```

#### レスポンスヘッダー

```
X-Total-Count : フィルター条件に一致する総件数（ページネーション用）
```

#### 一括更新 (Bulk Update)

```
PATCH /api/projects/{id}/issues/bulk

Request Body:
{
    "issue_ids": ["id1", "id2", ...],  // 必須、最大100件
    "status": "todo",                  // optional
    "sprint_id": "sprint-id",          // optional ("backlog" でNULL設定)
    "assignee_id": "user-id",          // optional ("" でクリア)
    "priority": "high",               // optional
    "labels": ["label1"],             // optional
    "due_date": "2026-04-30"          // optional (null でクリア)
}

Response:
{
    "items": [...],           // 更新されたIssueの配列
    "updated_count": 2,
    "skipped_ids": [...],
    "skipped": [{ "issue_id": "...", "reason": "..." }]
}
```

### Issue Links

| メソッド | パス | 権限 | 説明 |
|---------|------|------|------|
| GET | `/api/issues/{id}/links` | Viewer+ | リンク一覧（source/target 両方向を返す） |
| POST | `/api/issues/{id}/links` | Editor+ | リンク作成（`{ target_issue_id, link_type }`）|
| DELETE | `/api/issue-links/{id}` | Editor+ | リンク削除 |

#### リンクタイプ

| 値 | 説明 |
|----|------|
| `blocks` | ブロック |
| `is_blocked_by` | ブロックされている |
| `relates_to` | 関連 |
| `duplicates` | 重複 |

> 同一プロジェクト内のIssue間のみリンク可能。自己リンクは不可。

### Comments

| メソッド | パス | 権限 | 説明 |
|---------|------|------|------|
| GET | `/api/issues/{id}/comments` | Viewer+ | コメント一覧 |
| POST | `/api/issues/{id}/comments` | Editor+ | コメント追加（@メンション通知対応、最大10000文字） |

### Activity Logs

| メソッド | パス | 権限 | 説明 |
|---------|------|------|------|
| GET | `/api/issues/{id}/activity` | Viewer+ | アクティビティログ |

### Labels

| メソッド | パス | 権限 | 説明 |
|---------|------|------|------|
| GET | `/api/projects/{id}/labels` | Viewer+ | プロジェクトのラベル一覧 |
| POST | `/api/projects/{id}/labels` | Admin | ラベル作成（`{ name, color? }`、デフォルト色 `#6366f1`） |
| PUT | `/api/labels/{id}` | Admin | ラベル更新 |
| DELETE | `/api/labels/{id}` | Admin | ラベル削除 |

### Templates

| メソッド | パス | 権限 | 説明 |
|---------|------|------|------|
| GET | `/api/projects/{id}/templates` | Viewer+ | Issue テンプレート一覧 |
| POST | `/api/projects/{id}/templates` | Admin | テンプレート作成（`{ name, description?, type?, priority?, labels?, points? }`） |
| PUT | `/api/templates/{id}` | Admin | テンプレート更新 |
| DELETE | `/api/templates/{id}` | Admin | テンプレート削除 |

### Search Presets

| メソッド | パス | 権限 | 説明 |
|---------|------|------|------|
| GET | `/api/projects/{id}/search-presets` | Viewer+ | 検索プリセット一覧 |
| POST | `/api/projects/{id}/search-presets` | Editor+ | プリセット作成（`{ name, query?, filters }`） |
| PUT | `/api/search-presets/{id}` | Editor+ | プリセット更新 |
| DELETE | `/api/search-presets/{id}` | Editor+ | プリセット削除 |

### Attachments

| メソッド | パス | 権限 | 説明 |
|---------|------|------|------|
| GET | `/api/issues/{id}/attachments` | Viewer+ | 添付ファイル一覧 |
| POST | `/api/issues/{id}/attachments` | Editor+ | ファイルアップロード（Multipart、最大10MB） |
| GET | `/api/attachments/{id}/download` | Viewer+ | ファイルダウンロード |
| DELETE | `/api/attachments/{id}` | Editor+ / 本人 / Admin | 添付ファイル削除（アップローダー本人 or プロジェクトAdmin） |

> 実行可能ファイル（ELF, PE, shebang等）はブロックされる。

### Notifications

| メソッド | パス | 権限 | 説明 |
|---------|------|------|------|
| GET | `/api/notifications` | 自分 | 通知一覧（`?limit=50&offset=0`、最大100件） |
| PATCH | `/api/notifications/{id}/read` | 自分 | 既読にする |
| DELETE | `/api/notifications/{id}` | 自分 | 通知削除 |
| POST | `/api/notifications/read-all` | 自分 | 全件既読 |

---

## WebSocket API

### 接続

```
GET /api/ws?ticket=<ticket>&workspace_id=<workspace_id>
```

1. `POST /api/auth/ws-ticket` で使い捨てチケットを取得（10秒有効）
2. チケットと workspace_id を指定して WebSocket 接続
3. チケットは1回限り使用可能（リプレイ攻撃防止）
4. workspace_id が指定された場合、そのワークスペースのメンバーシップを検証

### イベント

サーバーからクライアントへプッシュされるイベント：

| イベントタイプ | スコープ | 説明 |
|--------------|---------|------|
| `issue.created` | Workspace | Issue作成時 |
| `issue.updated` | Workspace | Issue更新時 |
| `issue.deleted` | Workspace | Issue削除時 |
| `issue.reordered` | Workspace | Issue並び替え時 |
| `sprint.updated` | Workspace | スプリント開始・完了時 |
| `sprint.deleted` | Workspace | スプリント削除時 |
| `comment.created` | Workspace | コメント追加時 |
| `attachment.created` | Workspace | ファイル添付時 |
| `notification.new` | User | 通知発生時 |

各イベントには `project_id`, `workspace_id` フィールドが含まれ、クライアント側でフィルタリング可能。

### キープアライブ

サーバーは30秒ごとに Ping フレームを送信。

---

## 画面仕様

### 1. ログイン画面

- メール+パスワード / GitHub / Google でのサインイン
- サインアップリンク

### 2. ダッシュボード画面

- アクティブスプリントの進捗サマリー（完了 / 総ポイント・Issue数）
- ステータス別Issue数の内訳
- バーンダウンチャート（アクティブスプリント）

### 3. ボード画面

- カンバン形式で4カラム表示：**Todo / In Progress / In Review / Done**
- カード要素：Issue番号・タイトル・タイプアイコン・優先度バッジ・ポイント・アサイニー
- @hello-pangea/dnd によるカード間ドラッグ&ドロップ（ステータス自動更新）
- ヘッダー：アクティブスプリント名・期間・進捗バー（完了ポイント / 合計ポイント）
- フィルター：アサイニー・優先度・タイプ
- Issue作成ボタン（モーダル）
- Issue行クリックで詳細モーダルを表示

### 4. バックログ画面

- スプリント別グループ表示（planning / active スプリント + バックログ）
- Issue作成・編集・削除
- ドラッグ&ドロップまたはドロップダウンでスプリント割当
- 各スプリントのポイント合計表示
- Issue行クリックで詳細モーダルを表示

### 5. スプリント管理画面

- スプリント一覧（planning / active / completed）
- スプリント作成・編集（名前・ゴール・開始日・終了日）
- アクティブスプリントの開始・完了操作
- 完了時に未完了Issueを次スプリントまたはバックログへ移動
- Sprint History 画面へのリンク

### 6. スプリント履歴画面

- 完了済みスプリントの一覧
- 各スプリントのベロシティ（完了ポイント）・Issue完了数

### 7. 検索画面

- サイドバーの検索ボックスに2文字以上入力すると表示（300ms デバウンス）
- タイトル・説明に対する全文検索（サーバーサイド FTS5）
- サーバーサイドページネーション（20件 / ページ）
- 検索結果クリックで詳細モーダルを表示

### 8. 設定画面

- プロフィール編集（名前・アバター）
- Workspace設定・メンバー管理
- 自動化設定（通知ルール・スプリントキャリーオーバーモード）
- 通知設定

### Issue詳細（モーダル）

- 全フィールドの編集
- Markdown 対応の説明フィールド
- サブタスク一覧（type=story の場合）
- Epic リンク
- Issue間リンク（blocks / is_blocked_by / relates_to / duplicates）
- ファイル添付（アップロード・ダウンロード）
- コメント投稿・一覧（@メンション対応）
- アクティビティログ（ステータス変更履歴）
- 期限日（due_date）

---

## 権限マトリックス

### Workspace レベル

| 操作 | Viewer | Member | Admin | Owner |
|------|--------|--------|-------|-------|
| Workspace閲覧 | ✓ | ✓ | ✓ | ✓ |
| Workspace更新 | | | ✓ | ✓ |
| メンバー管理 | | | ✓ | ✓ |
| Workspace削除 | | | | ✓ |
| 自動化設定変更 | | | ✓ | ✓ |

### Project レベル

| 操作 | Viewer | Editor | Admin |
|------|--------|--------|-------|
| Issue閲覧 | ✓ | ✓ | ✓ |
| Issue作成・編集 | | ✓ | ✓ |
| スプリント管理 | | ✓ | ✓ |
| プロジェクト設定 | | | ✓ |
| ラベル・テンプレート管理 | | | ✓ |
| メンバーロール管理 | | | ✓ |

---

## ステータス・優先度の定義

### ステータス

| 値 | 表示名 | 色 |
|----|--------|-----|
| `todo` | Todo | グレー |
| `in_progress` | In Progress | ブルー |
| `in_review` | In Review | パープル |
| `done` | Done | グリーン |

### 優先度

| 値 | 表示名 | 色 |
|----|--------|-----|
| `critical` | Critical | レッド |
| `high` | High | オレンジ |
| `medium` | Medium | イエロー |
| `low` | Low | グレー |

### タイプ

| 値 | 表示名 | アイコン |
|----|--------|---------|
| `story` | Story | 緑の本（BookOpen） |
| `task` | Task | 青のチェック（CheckSquare） |
| `bug` | Bug | 赤のバグ（Bug） |
| `spike` | Spike | 黄の稲妻（Zap） |
| `epic` | Epic | 紫のレイヤー |

---

## バーンダウンチャート

- X軸：スプリント開始日〜終了日
- Y軸：残ストーリーポイント
- 理想線：均等に減少するガイドライン
- 実績線：各日時点での未完了ポイント合計（`activity_logs` のステータス変更履歴から算出）
- **スナップショット**: スプリント開始時に `snapshot_total_points` として合計ポイントを記録。これにより、スプリント途中でIssueが追加・削除されても理想線の始点が安定する。スナップショットがない場合（旧データ）は現在の合計ポイントにフォールバック。
- バーンダウンの計算は1クエリで日別完了ポイントを集約（N+1 問題を回避）。

---

## 通知

### 自動通知トリガー

| トリガー | 通知タイプ | 通知先 | 自動化設定 |
|---------|-----------|--------|-----------|
| @メンション（コメント内） | `mention` | メンションされたユーザー | 常に有効 |
| アサイン変更 | `assigned` | 新しいアサイニー | `notify_on_assignee_change` |
| コメント追加 | `comment` | Issue のアサイニー | 常に有効 |
| ステータス → In Review | `review_ready` | Issue のアサイニー | `notify_on_review_ready` |
| 期限超過 | `overdue` | Issue のアサイニー | `notify_on_overdue_transition` |

> 自分自身への通知はスキップされる。自動化ログに実行結果が記録される。

### リアルタイム配信

WebSocket 経由で `notification.new` イベントをプッシュ。

---

## セキュリティ

### Content-Security-Policy (CSP)

- 本番モードでは nonce-based CSP を使用
- `index.html` 内の `__CSP_NONCE__` プレースホルダーをリクエストごとにランダムnonceに置換
- CSP ヘッダー: `default-src 'self'; script-src 'self' 'nonce-{nonce}'; style-src 'self' 'nonce-{nonce}'; style-src-attr 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' wss:`
- 静的ファイル・APIレスポンスにはデフォルトの厳格なCSPが適用

### セキュリティヘッダー

| ヘッダー | 値 |
|---------|-----|
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |

### レート制限

| スコープ | 設定 |
|---------|------|
| OAuth エンドポイント | 3秒に1トークン補充、バースト10（~20 req/min per IP） |
| API 全体 | 100msに1トークン補充、バースト200（定常 10 req/s per IP） |

### リクエストボディ制限

- API 全体: 1 MB
- ファイルアップロード: 10 MB（Multipart 内で個別制限）

---

## デプロイ構成

```
[Internet]
    ↓
[Reverse Proxy: nginx / Cloudflare]
    ↓
[Backend: Rust/Axum コンテナ]  ←→  [SQLite (litestream レプリケーション)]
                                ←→  [S3互換ストレージ (添付ファイル)]
[Frontend: 静的ファイル (同一コンテナ)]
```

**ホスティング選択肢:**

| 選択肢 | 特徴 | 向き |
|--------|------|------|
| Fly.io | Rustネイティブ対応, 無料枠あり | スモールチーム |
| Railway | シンプル, PostgreSQL込み | プロトタイプ |
| AWS ECS + RDS | 本番グレード | 中〜大規模 |
| 自己ホスト (Docker Compose) | コスト最小 | プライベート運用 |

---

## 非機能要件

- ポート：バックエンド `8080`、開発時フロント `3000`
- CORS：開発時は `localhost:3000` を許可、`X-Total-Count` ヘッダーを expose
- JWT：アクセストークン有効期限 **5分**（300秒）、リフレッシュトークン **30日**
- リフレッシュトークン：HttpOnly Cookie（`Path=/api/auth; SameSite=Lax`、HTTPS時は `Secure` フラグ付き）
- ファイル添付：S3互換ストレージ対応（ローカル開発時はファイルシステム `./uploads`）
- 環境変数：`DATABASE_URL`, `JWT_SECRET`（32文字以上必須）, `CORS_ORIGIN`, `APP_URL`, `FRONTEND_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `STORAGE_PATH`, `STATIC_DIR`
