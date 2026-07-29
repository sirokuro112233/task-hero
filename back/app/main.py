import asyncio
import base64
import hashlib
import hmac
import json
import os
import random
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta, timezone
from typing import Literal

from fastapi import Depends, FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field as PydanticField
from sqlalchemy import Column, Text, inspect, text
from sqlmodel import Field, Session, SQLModel, select

from database import engine, get_session


# 勇者（ユーザー）テーブルの定義
class User(SQLModel, table=True):
    __tablename__ = "users"
    id: int | None = Field(default=None, primary_key=True)
    username: str
    current_level: int = Field(default=1)
    total_exp: int = Field(default=0)
    current_streak: int = Field(default=0)
    tickets: int = Field(default=0)
    last_active_date: date | None = Field(default=None)
    avatar_data_url: str | None = Field(default=None, sa_column=Column(Text, nullable=True))
    password_hash: str | None = Field(default=None)


# クエストテーブルの定義
class Quest(SQLModel, table=True):
    __tablename__ = "quests"
    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id")
    title: str
    exp_reward: int
    is_completed: bool = Field(default=False)
    is_buffed: bool = Field(default=False)
    target_date: date
    created_at: datetime | None = Field(default_factory=datetime.now)
    completed_at: datetime | None = None


# ガチャの報酬マスターテーブルの定義
class Reward(SQLModel, table=True):
    __tablename__ = "rewards"
    id: int | None = Field(default=None, primary_key=True)
    name: str
    description: str
    rarity: str
    weight: int = Field(default=1)


# 勇者が獲得した報酬テーブルの定義
class UserReward(SQLModel, table=True):
    __tablename__ = "user_rewards"
    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id")
    reward_id: int = Field(foreign_key="rewards.id")
    obtained_at: datetime = Field(default_factory=datetime.now)
    used_at: datetime | None = Field(default=None)


# クエスト受注時の入力データの定義
class QuestCreate(BaseModel):
    user_id: int
    title: str = PydanticField(min_length=1, max_length=255)
    exp_reward: int = PydanticField(ge=1, le=1000)
    target_date: date


# プレイヤー作成時の入力データの定義
class UserCreate(BaseModel):
    username: str = PydanticField(min_length=1, max_length=50)


# プロフィール変更時の入力データの定義
class UserUpdate(BaseModel):
    username: str = PydanticField(min_length=1, max_length=50)
    avatar_data_url: str | None = PydanticField(default=None, max_length=2_800_000)


# 新規登録・ログイン時の入力データの定義
class AuthRequest(BaseModel):
    username: str = PydanticField(min_length=1, max_length=50)
    password: str = PydanticField(min_length=6, max_length=100)


# タイマーの状態を保持するデータの定義
class TimerState(BaseModel):
    mode: Literal["focus", "break"] = "focus"
    duration: int = 25 * 60
    remaining: int = 25 * 60
    is_running: bool = False
    end_at: datetime | None = None


# 接続中のブラウザとタイマー状態をメモリ上で管理
timer_states: dict[int, TimerState] = {}
timer_connections: dict[int, set[WebSocket]] = {}


# 既存データベースへ不足しているカラムを追加
def migrate_database():
    inspector = inspect(engine)
    if "users" in inspector.get_table_names():
        user_columns = {column["name"] for column in inspector.get_columns("users")}
        statements = []
        if "tickets" not in user_columns:
            statements.append("ALTER TABLE users ADD COLUMN tickets INT NOT NULL DEFAULT 0")
        if "last_active_date" not in user_columns:
            statements.append("ALTER TABLE users ADD COLUMN last_active_date DATE NULL")
        if "avatar_data_url" not in user_columns:
            statements.append("ALTER TABLE users ADD COLUMN avatar_data_url MEDIUMTEXT NULL")
        if "password_hash" not in user_columns:
            statements.append("ALTER TABLE users ADD COLUMN password_hash VARCHAR(255) NULL")
        with engine.begin() as connection:
            for statement in statements:
                connection.execute(text(statement))

    if "quests" in inspector.get_table_names():
        quest_columns = {column["name"] for column in inspector.get_columns("quests")}
        if "is_buffed" not in quest_columns:
            with engine.begin() as connection:
                connection.execute(text("ALTER TABLE quests ADD COLUMN is_buffed BOOLEAN NOT NULL DEFAULT FALSE"))

    if "user_rewards" in inspector.get_table_names():
        reward_columns = {column["name"] for column in inspector.get_columns("user_rewards")}
        if "used_at" not in reward_columns:
            with engine.begin() as connection:
                connection.execute(text("ALTER TABLE user_rewards ADD COLUMN used_at DATETIME NULL"))

    # 新しく追加した報酬テーブルを作成
    SQLModel.metadata.create_all(engine)


# 初回起動時にガチャの報酬候補を登録
def seed_rewards():
    with Session(engine) as session:
        if session.exec(select(Reward)).first():
            return
        session.add_all([
            Reward(name="伝説のロングブレイク", description="今日は休憩を10分延長してよい", rarity="LEGENDARY", weight=3),
            Reward(name="ごほうびランチ", description="ちょっといいランチを食べる権利", rarity="EPIC", weight=8),
            Reward(name="お気に入りドリンク", description="好きな飲み物を一杯楽しむ権利", rarity="RARE", weight=20),
            Reward(name="音楽ブースト", description="好きな曲を聴きながら作業する権利", rarity="COMMON", weight=35),
            Reward(name="5分フリータイム", description="何もしない5分間を楽しむ権利", rarity="COMMON", weight=35),
        ])
        session.commit()


# タイマーの残り時間を現在時刻から計算
def serialize_timer(state: TimerState):
    if state.is_running and state.end_at:
        remaining = max(0, int((state.end_at - datetime.now(timezone.utc)).total_seconds() + 0.999))
        state.remaining = remaining
        if remaining == 0:
            state.is_running = False
            state.end_at = None
    return state.model_dump(mode="json")


# 同じ勇者で開いている全タブへ最新状態を送信
async def broadcast_timer(user_id: int):
    state = timer_states.setdefault(user_id, TimerState())
    message = json.dumps({"type": "timer", **serialize_timer(state)})
    disconnected = []
    for websocket in timer_connections.get(user_id, set()):
        try:
            await websocket.send_text(message)
        except RuntimeError:
            disconnected.append(websocket)
    for websocket in disconnected:
        timer_connections[user_id].discard(websocket)


# 動作中タイマーを1秒ごとに同期
async def timer_ticker():
    while True:
        await asyncio.sleep(1)
        for user_id, state in list(timer_states.items()):
            if state.is_running:
                await broadcast_timer(user_id)


# アプリ起動時にDB移行とタイマー同期処理を開始
@asynccontextmanager
async def lifespan(_: FastAPI):
    # MySQLの起動完了を待ってから移行処理を実行
    for attempt in range(20):
        try:
            migrate_database()
            seed_rewards()
            break
        except Exception:
            if attempt == 19:
                raise
            await asyncio.sleep(1)
    ticker = asyncio.create_task(timer_ticker())
    yield
    ticker.cancel()


app = FastAPI(lifespan=lifespan)


# パスワードをソルト付きPBKDF2で安全にハッシュ化
def hash_password(password: str):
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 210_000)
    return f"{base64.b64encode(salt).decode()}:{base64.b64encode(digest).decode()}"


# 入力されたパスワードと保存済みハッシュを照合
def verify_password(password: str, stored_hash: str):
    try:
        encoded_salt, encoded_digest = stored_hash.split(":", 1)
        salt = base64.b64decode(encoded_salt)
        expected = base64.b64decode(encoded_digest)
        actual = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 210_000)
        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError):
        return False


# パスワード情報を除いた公開プロフィールへ変換
def public_user(user: User):
    return {
        "id": user.id,
        "username": user.username,
        "current_level": user.current_level,
        "total_exp": user.total_exp,
        "current_streak": user.current_streak,
        "tickets": user.tickets,
        "last_active_date": user.last_active_date,
        "avatar_data_url": user.avatar_data_url,
    }


# 死活監視用
@app.get("/")
def read_root():
    return {"Hello": "Hero"}


# ユーザー名とパスワードで新しいアカウントを登録
@app.post("/auth/register")
def register_user(data: AuthRequest, session: Session = Depends(get_session)):
    # 空白を除いたユーザー名が重複していないか確認
    username = data.username.strip()
    if not username:
        raise HTTPException(status_code=422, detail="プレイヤー名を入力してください")
    existing = session.exec(select(User).where(User.username == username)).first()
    if existing:
        # 旧バージョンのパスワード未設定ユーザーは過去データを保ったまま引き継ぐ
        if existing.password_hash is None:
            existing.password_hash = hash_password(data.password)
            session.add(existing)
            session.commit()
            session.refresh(existing)
            return {"message": f"勇者「{existing.username}」を引き継ぎました！", "user": public_user(existing)}
        raise HTTPException(status_code=409, detail="そのプレイヤー名はすでに使われています")

    # パスワードは平文で保存せずハッシュだけを登録
    user = User(username=username, password_hash=hash_password(data.password))
    session.add(user)
    session.commit()
    session.refresh(user)
    return {"message": f"勇者「{user.username}」が誕生しました！", "user": public_user(user)}


# ユーザー名とパスワードでログイン
@app.post("/auth/login")
def login_user(data: AuthRequest, session: Session = Depends(get_session)):
    # ユーザーを検索してパスワードを照合
    username = data.username.strip()
    user = session.exec(select(User).where(User.username == username)).first()
    if not user or not user.password_hash or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="プレイヤー名またはパスワードが違います")

    # フロントで使用する公開ステータスだけを返す
    return {"message": f"おかえりなさい、{user.username}！", "user": public_user(user)}


# アクセス日をもとにストリークを更新
def update_streak(user: User, session: Session):
    today = date.today()
    if user.last_active_date == today:
        return
    if user.last_active_date == today - timedelta(days=1):
        user.current_streak += 1
    else:
        user.current_streak = 1

    # 3日連続を達成するたびにガチャチケットを1枚付与
    if user.current_streak > 0 and user.current_streak % 3 == 0:
        user.tickets += 1
    user.last_active_date = today
    session.add(user)
    session.commit()
    session.refresh(user)


# 勇者ステータスの取得
@app.get("/users/{user_id}")
def read_users_status(user_id: int, session: Session = Depends(get_session)):
    # ステータスを取得
    user_status = session.get(User, user_id)
    if not user_status:
        raise HTTPException(status_code=404, detail="勇者が見つかりません")

    # 1日1回だけ連続ログイン日数を更新
    update_streak(user_status, session)
    return public_user(user_status)


# 新しいプレイヤーの作成
@app.post("/users")
def create_user(data: UserCreate, session: Session = Depends(get_session)):
    # 前後の空白を除去して空文字の登録を防止
    username = data.username.strip()
    if not username:
        raise HTTPException(status_code=422, detail="プレイヤー名を入力してください")

    # 初期ステータスを持つ勇者をDBへ登録
    user = User(username=username)
    session.add(user)
    session.commit()
    session.refresh(user)
    return {"message": f"勇者「{user.username}」が誕生しました！", "user": public_user(user)}


# プレイヤーの名前とプロフィール画像を更新
@app.patch("/users/{user_id}")
def update_user(user_id: int, data: UserUpdate, session: Session = Depends(get_session)):
    # 更新対象の勇者が存在するか確認
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="勇者が見つかりません")

    # 名前の空白とプロフィール画像の形式を検証
    username = data.username.strip()
    if not username:
        raise HTTPException(status_code=422, detail="プレイヤー名を入力してください")
    duplicate = session.exec(select(User).where(User.username == username, User.id != user_id)).first()
    if duplicate:
        raise HTTPException(status_code=409, detail="そのプレイヤー名はすでに使われています")
    if data.avatar_data_url and not data.avatar_data_url.startswith("data:image/"):
        raise HTTPException(status_code=422, detail="画像ファイルを選択してください")

    # 検証済みのプロフィール情報をDBへ保存
    user.username = username
    user.avatar_data_url = data.avatar_data_url
    session.add(user)
    session.commit()
    session.refresh(user)
    return {"message": "プロフィールを更新しました！", "user": public_user(user)}


# クエスト一覧の取得
@app.get("/quests")
def read_quests(
    user_id: int,
    session: Session = Depends(get_session),
    target_date: date | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    is_completed: bool | None = None,
):
    # クエリを作成
    query = select(Quest).where(Quest.user_id == user_id)
    if target_date:
        query = query.where(Quest.target_date == target_date)
    if date_from:
        query = query.where(Quest.target_date >= date_from)
    if date_to:
        query = query.where(Quest.target_date <= date_to)
    if is_completed is not None:
        query = query.where(Quest.is_completed == is_completed)
    return session.exec(query).all()


# 新規クエストの受注
@app.post("/quests")
def write_quests(data: QuestCreate, session: Session = Depends(get_session)):
    # 勇者が存在することを確認
    if not session.get(User, data.user_id):
        raise HTTPException(status_code=404, detail="勇者が見つかりません")

    # 実行日の前日までに登録した場合は経験値を1.5倍にする
    is_buffed = data.target_date > date.today()
    exp_reward = round(data.exp_reward * 1.5) if is_buffed else data.exp_reward
    quest_data = data.model_dump()
    quest_data["exp_reward"] = exp_reward
    quest = Quest(**quest_data, is_buffed=is_buffed)
    session.add(quest)
    session.commit()
    session.refresh(quest)
    return {"message": "新規クエストを受注しました！", "quest": quest}


# クエストの達成
@app.patch("/quests/{quest_id}/complete")
def update_quest_status(quest_id: int, session: Session = Depends(get_session)):
    # DBからクエストを取得
    quest = session.get(Quest, quest_id)
    if not quest:
        raise HTTPException(status_code=404, detail="クエストが存在しません")
    if quest.is_completed:
        raise HTTPException(status_code=400, detail="すでに達成済みのクエストです")

    # 達成日時と勇者の経験値を更新
    quest.is_completed = True
    quest.completed_at = datetime.now()
    hero = session.get(User, quest.user_id)
    if not hero:
        raise HTTPException(status_code=404, detail="勇者が見つかりません")
    previous_level = hero.current_level
    hero.total_exp += quest.exp_reward
    hero.current_level = (hero.total_exp // 1000) + 1

    # レベルアップした回数分のガチャチケットを付与
    earned_tickets = max(0, hero.current_level - previous_level)
    hero.tickets += earned_tickets
    session.add(hero)
    session.add(quest)
    session.commit()
    session.refresh(quest)
    return {
        "message": f"クエスト「{quest.title}」を達成しました！",
        "quest": quest,
        "hero_current_exp": hero.total_exp,
        "earned_tickets": earned_tickets,
    }


# クエストの破棄・削除
@app.delete("/quests/{quest_id}")
def remove_quest(quest_id: int, session: Session = Depends(get_session)):
    # DBから対象クエストを取得
    quest = session.get(Quest, quest_id)
    if not quest:
        raise HTTPException(status_code=404, detail="クエストが存在しません")
    session.delete(quest)
    session.commit()
    return {"message": f"クエスト「{quest.title}」を破棄しました"}


# ガチャを1回引いて現実世界の報酬を獲得
@app.post("/gacha/draw/{user_id}")
def draw_gacha(user_id: int, session: Session = Depends(get_session)):
    # チケットを所持しているか確認
    hero = session.get(User, user_id)
    if not hero:
        raise HTTPException(status_code=404, detail="勇者が見つかりません")
    if hero.tickets < 1:
        raise HTTPException(status_code=400, detail="ガチャチケットが足りません")

    # 重みに応じて報酬を抽選
    rewards = list(session.exec(select(Reward)).all())
    if not rewards:
        raise HTTPException(status_code=503, detail="報酬が登録されていません")
    reward = random.choices(rewards, weights=[item.weight for item in rewards], k=1)[0]
    hero.tickets -= 1
    user_reward = UserReward(user_id=user_id, reward_id=reward.id)
    session.add(hero)
    session.add(user_reward)
    session.commit()
    return {
        "message": f"「{reward.name}」を獲得しました！",
        "reward": reward.model_dump(),
        "tickets": hero.tickets,
    }


# 勇者が獲得した報酬一覧の取得
@app.get("/gacha/inventory/{user_id}")
def read_inventory(user_id: int, session: Session = Depends(get_session)):
    # 報酬履歴と報酬マスターを結合して取得
    query = (
        select(UserReward, Reward)
        .join(Reward, UserReward.reward_id == Reward.id)
        .where(UserReward.user_id == user_id)
        .order_by(UserReward.obtained_at.desc())
    )
    return [
        {"id": owned.id, "obtained_at": owned.obtained_at, "used_at": owned.used_at, "reward": reward}
        for owned, reward in session.exec(query).all()
    ]


# 獲得したご褒美アイテムを使用済みにする
@app.patch("/gacha/inventory/{user_id}/{user_reward_id}/use")
def use_reward(user_id: int, user_reward_id: int, session: Session = Depends(get_session)):
    # 指定された報酬が勇者の所有物か確認
    owned_reward = session.get(UserReward, user_reward_id)
    if not owned_reward or owned_reward.user_id != user_id:
        raise HTTPException(status_code=404, detail="ご褒美アイテムが見つかりません")
    if owned_reward.used_at:
        raise HTTPException(status_code=400, detail="このご褒美アイテムは使用済みです")

    # 使用日時を記録して二重消費を防止
    reward = session.get(Reward, owned_reward.reward_id)
    owned_reward.used_at = datetime.now()
    session.add(owned_reward)
    session.commit()
    session.refresh(owned_reward)
    return {
        "message": f"「{reward.name if reward else 'ご褒美アイテム'}」を使用しました！",
        "used_at": owned_reward.used_at,
    }


# ポモドーロタイマーをWebSocketでリアルタイム同期
@app.websocket("/ws/timer/{user_id}")
async def timer_websocket(websocket: WebSocket, user_id: int):
    # 接続したタブを勇者ごとの接続一覧へ追加
    await websocket.accept()
    timer_connections.setdefault(user_id, set()).add(websocket)
    timer_states.setdefault(user_id, TimerState())
    await broadcast_timer(user_id)
    try:
        while True:
            command = await websocket.receive_json()
            state = timer_states[user_id]
            action = command.get("action")

            # 開始・一時停止・リセット・モード切替を反映
            if action == "start" and not state.is_running:
                state.is_running = True
                state.end_at = datetime.now(timezone.utc) + timedelta(seconds=state.remaining)
            elif action == "pause" and state.is_running:
                serialize_timer(state)
                state.is_running = False
                state.end_at = None
            elif action == "reset":
                state.is_running = False
                state.remaining = state.duration
                state.end_at = None
            elif action == "switch" and command.get("mode") in {"focus", "break"}:
                state.mode = command["mode"]
                state.duration = 25 * 60 if state.mode == "focus" else 5 * 60
                state.remaining = state.duration
                state.is_running = False
                state.end_at = None
            else:
                if action not in {"start", "pause", "reset", "switch", "sync"}:
                    await websocket.send_json({"type": "error", "detail": "不明な操作です"})
                    continue
            await broadcast_timer(user_id)
    except WebSocketDisconnect:
        timer_connections[user_id].discard(websocket)
