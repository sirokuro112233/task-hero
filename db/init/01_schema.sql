-- ユーザー（勇者）のステータスを管理するテーブル
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL,
    current_level INT DEFAULT 1,
    total_exp INT DEFAULT 0,
    current_streak INT DEFAULT 0, -- 連続ログイン（サボり回避）日数
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- クエスト（タスク）を管理するテーブル
CREATE TABLE IF NOT EXISTS quests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    title VARCHAR(255) NOT NULL, -- 「エディタを開く」など
    exp_reward INT NOT NULL,     -- 獲得予定の経験値
    is_completed BOOLEAN DEFAULT FALSE,
    target_date DATE NOT NULL,   -- 実行予定日（前日設定バフの判定に使用）
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- テスト用の初期データ
INSERT INTO users (username) VALUES ('TestHero');