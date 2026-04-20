# Fly.io デプロイ手順

Nilla を Fly.io にデプロイするための手順書です。

## 前提条件
- Fly.io のアカウントが作成済みであること
- `flyctl`（Fly.io CLI）がインストールされていること

## 1. アプリの初期化

`deploy` ディレクトリまたはプロジェクトルートで以下のコマンドを実行し、アプリを初期化します。
※ここではデプロイは行いません。

```bash
fly launch --no-deploy
```

## 2. fly.toml の設定

生成された `fly.toml` を、同ディレクトリにある `fly.toml.example` を参考に編集します。
特に `app` 名と環境変数 (`APP_URL` など) を書き換えてください。

## 3. 永続ボリューム (Volume) の作成

SQLiteのデータベースファイルとアップロードファイルを永続化するために、ボリュームを作成します。
`fly.toml` の `[mounts]` セクションで指定した `source` （例: `nilla_data`）に合わせて作成してください。

```bash
fly volumes create nilla_data --region nrt --size 1
```

## 4. シークレットの設定

環境変数の中でも公開すべきではない JWT_SECRET や OAuth キーなどは、Fly.io のシークレットストアに登録します。

```bash
# 必須: JWT のシークレットキー
fly secrets set JWT_SECRET="your-super-secret-jwt-key"

# オプション: Google OAuth を利用する場合
fly secrets set GOOGLE_CLIENT_ID="xxx" GOOGLE_CLIENT_SECRET="yyy"

# オプション: GitHub OAuth を利用する場合
fly secrets set GITHUB_CLIENT_ID="xxx" GITHUB_CLIENT_SECRET="yyy"
```

## 5. デプロイ

すべての設定が完了したら、デプロイを実行します。

```bash
fly deploy
```

## 6. 運用・バックアップ

コンテナ内の SQLite データファイルをローカルにバックアップしたい場合は、`ssh` または `sftp` サブコマンドを使用します。

```bash
# ローカルへダウンロード
fly sftp get /data/nilla.db ./nilla-backup.db
```
