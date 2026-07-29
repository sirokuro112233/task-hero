# Task Hero — 8-Bit Task Quest & Pomodoro

毎日のタスクを「クエスト」に変える、レトロRPG風のタスク管理・ポモドーロアプリです。

作業を始めるまでの心理的なハードルを下げるため、「エディタを開く」「まず5分だけ進める」といった小さな行動をマイクロクエストとして記録できます。クエスト達成で経験値を獲得し、レベルアップや連続利用で手に入るチケットから、現実世界のご褒美を獲得できます。

## 主な機能

### プレイヤーとプロフィール

- プレイヤー名とパスワードによる新規登録・ログイン
- 複数プレイヤーのデータを個別に管理
- パスワードはPBKDF2によるソルト付きハッシュとして保存
- プレイヤー名とプロフィール画像の変更
- 旧バージョンで作成されたパスワード未設定プレイヤーの引き継ぎ
- ログアウトと別プレイヤーへの切り替え

### クエスト管理

- 日付ごとのクエスト作成・一覧表示
- クエストの達成・削除
- 50 / 100 / 200 EXPから報酬を選択
- 達成時の経験値付与と自動レベルアップ
- 昨日・今日・明日のクエスト切り替え
- 月間カレンダーから過去のクエストを振り返り
- 月ごとのクエスト数、達成数、獲得EXPを集計

### 前日受注バフ

実行日より前にクエストを登録すると、バックエンドが獲得EXPを自動的に1.5倍へ変更します。

バフの判定はフロントエンドの表示だけに依存せず、クエスト作成API側で行われます。

### ポモドーロタイマー

- 25分の集中モード `FOCUS`
- 5分の休憩モード `CAMP`
- 開始・一時停止・再開・リセット
- WebSocketによる複数タブのリアルタイム同期
- ブラウザタブが非アクティブでもサーバー時刻を基準に進行
- 終了時に8-bit風の3音アラームを再生
- 集中時の冒険シーンと休憩時のキャンプシーン

タイマーの状態はバックエンドのメモリ上で管理されます。そのため、バックエンドコンテナを再起動するとタイマーは初期状態へ戻ります。

### ご褒美ガチャ

- レベルアップ時にガチャチケットを付与
- 3日連続利用を達成するたびにチケットを付与
- 重み付き抽選による `COMMON` / `RARE` / `EPIC` / `LEGENDARY` 報酬
- 獲得したご褒美アイテムの履歴表示
- ご褒美の消費操作と二重使用の防止
- 使用済みアイテムも履歴として保存

### BGM

- 手元のMP3、WAV、OGG、M4A、AAC、FLACなどを選択して再生
- ループ再生、一時停止、再開
- 選択中のファイル名をヘッダーへ表示

音楽ファイルはサーバーへアップロードされません。ブラウザ内の一時URLを使って再生するため、ページを再読み込みした場合は再選択が必要です。

### UI / UX

- 8-bit RPGをイメージしたレスポンシブデザイン
- ピクセル風のアニメーションとカスタムファビコン
- スマートフォン・タブレット・デスクトップ対応
- OSのモーション軽減設定に対応
- Next.js開発インジケーターを非表示

## 技術スタック

| 分類 | 使用技術 |
| --- | --- |
| Frontend | Next.js 16 / React 19 / TypeScript / CSS Animations |
| Backend | FastAPI / SQLModel / WebSocket |
| Database | MySQL 8.0 |
| Infrastructure | Docker / Docker Compose |

## ディレクトリ構成

```text
task-hero/
├── back/
│   ├── app/
│   │   ├── database.py
│   │   └── main.py
│   ├── Dockerfile
│   └── requirements.txt
├── db/
│   └── init/
│       └── 01_schema.sql
├── front/
│   ├── app/
│   │   ├── app/
│   │   │   ├── globals.css
│   │   │   ├── icon.svg
│   │   │   ├── layout.tsx
│   │   │   └── page.tsx
│   │   └── next.config.ts
│   └── Dockerfile
└── docker-compose.yml
```

## セットアップ

### 必要なもの

- Docker
- Docker Compose

### 1. リポジトリを取得

```bash
git clone https://github.com/sirokuro112233/task-hero.git
cd task-hero
```

### 2. 環境変数を設定

リポジトリ直下へ `.env` を作成します。

```dotenv
MYSQL_ROOT_PASSWORD=root_password
MYSQL_DATABASE=task_quest_db
MYSQL_USER=quest_hero
MYSQL_PASSWORD=change_this_password
TZ=Asia/Tokyo
```

### 3. コンテナを起動

```bash
docker compose up -d --build
```

### 4. アプリへアクセス

- アプリ: [http://localhost:3000](http://localhost:3000)
- APIドキュメント: [http://localhost:8000/docs](http://localhost:8000/docs)

初回アクセスでは「新規登録」を選択し、プレイヤー名と6文字以上のパスワードを入力してください。

### コンテナの状態を確認

```bash
docker compose ps
docker compose logs -f front back db
```

### コンテナを停止

```bash
docker compose down
```

DBの内容はDockerボリューム `db_data` に保存されるため、通常の `docker compose down` では削除されません。

## 基本的な使い方

1. 新規登録またはログインします。
2. 「エディタを開く」など、すぐに始められるマイクロクエストを登録します。
3. `START QUEST` を押して25分の集中タイマーを開始します。
4. クエストが終わったらチェックボタンで達成し、EXPを受け取ります。
5. レベルアップやストリークでチケットを獲得したら、タイマー下のガチャを引きます。
6. 獲得したご褒美を実行したら、報酬ログの「使う」を押します。
7. 冒険カレンダーから過去の達成状況を振り返ります。

プロフィール画像またはプレイヤー名横の「編集」から、名前と画像を変更できます。

## ご褒美アイテムの追加

現在、ご褒美マスターを編集する管理画面はありません。既存環境へ報酬を追加する場合はMySQLへ接続します。

```bash
docker compose exec db mysql \
  -u quest_hero \
  -p \
  task_quest_db
```

接続後、次のように登録します。

```sql
INSERT INTO rewards (
    name,
    description,
    rarity,
    weight
) VALUES (
    '午後のスイーツ',
    '好きなスイーツを1つ食べる権利',
    'RARE',
    20
);
```

`weight` が大きい報酬ほど抽選されやすくなります。初期報酬は `back/app/main.py` の `seed_rewards()` で定義されています。

## API概要

### 認証・プレイヤー

| Method | Endpoint | 内容 |
| --- | --- | --- |
| `POST` | `/auth/register` | 新規登録、または旧プレイヤーの引き継ぎ |
| `POST` | `/auth/login` | ログイン |
| `GET` | `/users/{user_id}` | プレイヤーステータス取得・ストリーク更新 |
| `PATCH` | `/users/{user_id}` | 名前・プロフィール画像変更 |

### クエスト

| Method | Endpoint | 内容 |
| --- | --- | --- |
| `GET` | `/quests` | クエスト一覧取得。日付・期間・完了状態で絞り込み可能 |
| `POST` | `/quests` | クエスト作成・前日受注バフ判定 |
| `PATCH` | `/quests/{quest_id}/complete` | クエスト達成・EXP付与 |
| `DELETE` | `/quests/{quest_id}` | クエスト削除 |

`GET /quests` では次のクエリパラメータを利用できます。

- `user_id`
- `target_date`
- `date_from`
- `date_to`
- `is_completed`

### ガチャ

| Method | Endpoint | 内容 |
| --- | --- | --- |
| `POST` | `/gacha/draw/{user_id}` | チケットを1枚消費してガチャを引く |
| `GET` | `/gacha/inventory/{user_id}` | 獲得報酬一覧を取得 |
| `PATCH` | `/gacha/inventory/{user_id}/{user_reward_id}/use` | 報酬を使用済みにする |

### タイマー

| Protocol | Endpoint | 内容 |
| --- | --- | --- |
| WebSocket | `/ws/timer/{user_id}` | ポモドーロタイマーの状態同期 |

WebSocketでは `start`、`pause`、`reset`、`switch`、`sync` アクションをJSONで送信します。

## データベース

主なテーブルは次のとおりです。

- `users`: プレイヤー、レベル、EXP、ストリーク、チケット、プロフィール、パスワードハッシュ
- `quests`: クエスト、対象日、EXP、バフ・完了状態
- `rewards`: ご褒美マスターと抽選ウェイト
- `user_rewards`: プレイヤーが獲得したご褒美と使用日時

バックエンド起動時に不足しているカラムとテーブルを検出し、旧バージョンのDBへ必要な変更を適用します。

## 開発時の確認

フロントエンドのLintとproduction buildは、次のコマンドで確認できます。

```bash
docker compose exec front npm run lint
docker compose exec front npm run build
```

バックエンドの構文確認:

```bash
docker compose exec back python -m py_compile main.py
```

## 現在の注意事項

- ログイン状態はブラウザのLocal StorageへプレイヤーIDとして保存されます。
- 現在はCookieやBearerトークンを使ったAPI認可までは実装していません。インターネットへ公開する場合は、セッションまたはJWTによるAPI保護を追加してください。
- プロフィール画像はData URLとしてDBへ保存されます。大規模運用ではオブジェクトストレージへの移行を推奨します。
- タイマー状態はバックエンドのメモリ上にあり、バックエンド再起動時にリセットされます。
- ローカルBGMはページ再読み込み後に再選択が必要です。

## ライセンス

MIT License
