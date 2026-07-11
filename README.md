# 8-Bit Task Quest & Pomodoro

> 「作業を始めるまでのハードル」を極限まで下げ、毎日の開発・作業を冒険に変えるレトロRPG風タスク管理＆ポモドーロタイマー。

## 開発の目的 (Why this exists)

サボってしまう最大の原因は「0から1への移行（作業を始めること）」にあります。
このアプリケーションは、タスク管理にRPGのゲームメカニクスとポモドーロ・テクニックを融合させることで、**「とにかくPCを開いて作業を始めること」への摩擦をなくす**ために開発されました。

## 主な機能 (Key Features)

* **初速特化の経験値設計 (Micro-Quest EXP)**
  タスクそのものより、「エディタを立ち上げる」「とりあえず5分やる」といった**準備のマイクロタスク**に全体の70%の経験値を割り当て、行動の初速をブーストします。
* **前日受注バフ (Day-Before Buff)**
  前日の夜までに翌日のクエストを登録すると、翌日の獲得経験値が「1.5倍」になります。計画的なタスク設定をシステムレベルで推奨します。
* **ポモドーロ・冒険タイマー (Pomodoro RPG Timer)**
  * **25分 (集中):** 勇者がひたすら右へ歩き続け、自動でモンスターを倒し続ける横スクロールアニメーション（CSS `steps()` によるレトロ表現）。
  * **5分 (休憩):** 場面が夜に切り替わり、焚き火で休むキャンプフェーズ。脳のスイッチを強制的に切り替えます。
* **現実とリンクする報酬ガチャ (Gacha System)**
  レベルアップや連続ログイン（ストリーク）で獲得したチケットを使い、「ちょっといいランチを食べる権利」などの現実世界の報酬を獲得できます。
* **WebSocketによるリアルタイム同期**
  裏側でブラウザのタブが非アクティブになってもタイマーがズレないよう、状態と時間はバックエンドで一元管理し、WebSocketで同期しています。

## 技術スタック (Tech Stack)

* **Frontend:** Next.js (React) / CSS Animations
* **Backend:** FastAPI (Python) or Node.js / WebSocket
* **Database:** PostgreSQL
* **Infrastructure:** Docker / Docker Compose

## 起動方法 (Getting Started)

DockerとDocker Composeがインストールされている環境であれば、すぐに冒険を始められます。

### 1. リポジトリのクローン
```bash
git clone [https://github.com/your-username/8bit-task-quest.git](https://github.com/your-username/8bit-task-quest.git)
cd 8bit-task-quest
```

### 2. 環境変数の設定
ルートディレクトリに `.env` ファイルを作成し、必要なデータベース情報を記述します。
```bash
cp .env.example .env
```

### 3. コンテナの起動
以下のコマンドを実行すると、フロントエンド・バックエンド・データベースの全サービスが立ち上がります。
```bash
docker compose up -d
```

* **Frontend (UI):** `http://localhost:3000`
* **Backend (API Docs):** `http://localhost:8000/docs`

## UI/UX コンセプト

* **8-Bit ピクセルアート:** すべてのUI要素、キャラクター、背景はレトロなドット絵で構成されています。
* **ドット絵フォント:** `DotGothic16` などのモノスペースフォントを使用し、古き良きコンソールゲームの雰囲気を再現。
* **パララックススクロール:** 作業中は背景が視差スクロールし、前に進んでいる没入感（フロー状態）を視覚的に演出します。

## ライセンス (License)

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.