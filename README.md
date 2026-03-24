# Nilla

チーム向けスプリント管理アプリ。Rust + React で構築し、Docker 一発で起動できます。

---

## 特徴

- **認証** — GitHub / Google OAuth、JWT によるセッション管理
- **Workspace** — チーム単位でプロジェクトを管理、ロールベースの権限制御
- **カンバンボード** — ドラッグ&ドロップでステータス変更
- **バックログ管理** — スプリントへの割当・並び替え
- **スプリントライフサイクル** — 作成 → 開始 → 完了、未完了 Issue の自動移動
- **バーンダウンチャート** — アクティビティログから実績を自動集計
- **全文検索** — タイトル・説明をリアルタイム検索（サーバーサイドページネーション）
- **サブタスク** — Story に対して子 Issue を作成
- **ファイル添付** — Issue へのファイル・画像添付（S3互換ストレージ対応）
- **通知** — @メンション・アサイン変更・コメント追加のインアプリ通知

---

## 技術スタック

| レイヤー | 技術 |
|---|---|
| バックエンド | Rust + Axum 0.8 |
| DB | SQLite + sqlx 0.8 |
| 認証 | JWT + OAuth (GitHub / Google) |
| フロントエンド | React 19 + TypeScript + Vite |
| スタイル | Tailwind CSS 4 |
| 状態管理 | TanStack Query 5 + Zustand 5 |
| ドラッグ&ドロップ | @hello-pangea/dnd |

---

## Docker で起動（推奨）

```bash
cp .env.example .env
# .env を編集して JWT_SECRET と OAuth キーを設定

docker compose -f infra/docker-compose.yml up
# → http://localhost:8080
```

---

## ローカル開発

### 必要環境

- Rust 1.75 以上（[rustup](https://rustup.rs/)）
- Node.js 20 以上

### セットアップ

```bash
git clone https://github.com/yoshitsugiseto/nilla.git
cd nilla
cp .env.example backend/.env
# backend/.env を編集して JWT_SECRET などを設定
```

### バックエンド起動

```bash
cd backend
cargo run
# → http://localhost:8080
# DBとマイグレーションは初回起動時に自動生成
```

### フロントエンド起動（別ターミナル）

```bash
cd frontend
npm install
npm run dev
# → http://localhost:3000
```

### 環境変数

| 変数 | 説明 | 必須 |
|---|---|---|
| `JWT_SECRET` | JWT 署名キー（32文字以上推奨） | ✓ |
| `DATABASE_URL` | SQLite パス（例: `sqlite:./nilla.db`） | |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth | |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | GitHub OAuth | |
| `APP_URL` | 公開URL（OAuthコールバック用、例: `http://localhost:8080`） | |

---

## テスト

### バックエンド

```bash
cd backend
cargo test
```

インメモリ SQLite を使った統合テスト。

### フロントエンド

```bash
cd frontend

# ユニットテスト（Vitest + React Testing Library）
npm run test:unit

# E2E テスト（Playwright、API モック、dev サーバー自動起動）
npm run test:e2e
```

---

## 本番ビルド

```bash
cd frontend && npm run build
cd backend && cargo build --release
./backend/target/release/nilla
# → http://localhost:8080 で起動（静的ファイルも配信）
```

---

## ディレクトリ構成

```
nilla/
├── backend/          # Rust / Axum
│   ├── src/
│   │   └── auth/     # JWT・OAuth
│   ├── migrations/   # SQLite マイグレーション
│   └── tests/        # 統合テスト
├── frontend/         # React / Vite
│   ├── src/
│   ├── e2e/          # Playwright テスト
│   └── src/test/     # Vitest テスト
├── infra/            # Docker
│   ├── Dockerfile
│   └── docker-compose.yml
├── seed.sql          # サンプルデータ
└── SPEC.md           # 詳細仕様
```

---

## ライセンス

MIT
