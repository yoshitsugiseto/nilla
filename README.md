# Lira

ローカル動作のスプリント管理アプリ。インターネット接続不要、シングルプロセスで起動します。

---

## 特徴

- **カンバンボード** — ドラッグ&ドロップでステータス変更
- **バックログ管理** — スプリントへの割当・並び替え
- **スプリントライフサイクル** — 作成 → 開始 → 完了、未完了 Issue の自動移動
- **バーンダウンチャート** — アクティビティログから実績を自動集計
- **全文検索** — タイトル・説明をリアルタイム検索（サーバーサイドページネーション）
- **サブタスク** — Story に対して子 Issue を作成
- **コメント・アクティビティログ** — Issue ごとの変更履歴を記録
- **データはローカル SQLite** — `nilla.db` をコピーするだけでバックアップ

---

## 技術スタック

| レイヤー | 技術 |
|---|---|
| バックエンド | Rust + Axum 0.8 |
| DB | SQLite + sqlx 0.8 |
| フロントエンド | React 19 + TypeScript + Vite |
| スタイル | Tailwind CSS 4 |
| 状態管理 | TanStack Query 5 + Zustand 5 |
| ドラッグ&ドロップ | @hello-pangea/dnd |

---

## 必要環境

- **Rust** 1.75 以上（[rustup](https://rustup.rs/)）
- **Node.js** 20 以上

---

## セットアップ

```bash
git clone https://github.com/yourname/nilla.git
cd nilla
```

環境変数はデフォルトのままで動きますが、変更したい場合は `.env.example` をコピーして編集します。

```bash
cp .env.example backend/.env
```

### バックエンド起動

```bash
cd backend
cargo run
# → http://localhost:8080
# データベース (nilla.db) とマイグレーションは初回起動時に自動生成
```

### フロントエンド起動（別ターミナル）

```bash
cd frontend
npm install
npm run dev
# → http://localhost:3000
```

ブラウザで http://localhost:3000 を開きます。

### サンプルデータ（任意）

```bash
sqlite3 nilla.db < seed.sql
```

30 件のサンプル Issue が追加されます。

---

## テスト

### バックエンド

```bash
cd backend
cargo test
```

インメモリ SQLite を使った統合テスト（34 件）。

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
│   ├── migrations/   # SQLite マイグレーション
│   └── tests/        # 統合テスト
├── frontend/         # React / Vite
│   ├── src/
│   ├── e2e/          # Playwright テスト
│   └── src/test/     # Vitest テスト
├── seed.sql          # サンプルデータ
└── SPEC.md           # 詳細仕様
```

---

## ライセンス

MIT
