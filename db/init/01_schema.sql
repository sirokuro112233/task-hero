-- ユーザー（勇者）のステータスを管理するテーブル
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL,
    current_level INT DEFAULT 1,
    total_exp INT DEFAULT 0,
    current_streak INT DEFAULT 0, -- 連続ログイン（サボり回避）日数
    tickets INT DEFAULT 0, -- ガチャを引くためのチケット枚数
    last_active_date DATE NULL, -- ストリークを最後に更新した日
    avatar_data_url MEDIUMTEXT NULL, -- プロフィール画像のData URL
    password_hash VARCHAR(255) NULL, -- ログイン用パスワードのハッシュ
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- クエスト（タスク）を管理するテーブル
CREATE TABLE IF NOT EXISTS quests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    title VARCHAR(255) NOT NULL, -- 「エディタを開く」など
    exp_reward INT NOT NULL,     -- 獲得予定の経験値
    is_completed BOOLEAN DEFAULT FALSE,
    is_buffed BOOLEAN DEFAULT FALSE, -- 前日受注バフの適用有無
    target_date DATE NOT NULL,   -- 実行予定日（前日設定バフの判定に使用）
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ガチャで獲得できる報酬のマスターテーブル
CREATE TABLE IF NOT EXISTS rewards (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description VARCHAR(255) NOT NULL,
    rarity VARCHAR(20) NOT NULL,
    weight INT DEFAULT 1
);

-- ユーザーが獲得した報酬を管理するテーブル
CREATE TABLE IF NOT EXISTS user_rewards (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    reward_id INT NOT NULL,
    obtained_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    used_at TIMESTAMP NULL, -- ご褒美アイテムを消費した日時
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (reward_id) REFERENCES rewards(id) ON DELETE CASCADE
);

-- テスト用の初期データ
INSERT INTO users (username) VALUES ('TestHero');
