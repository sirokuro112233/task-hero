from datetime import date
from fastapi import FastAPI, Depends, HTTPException
from sqlmodel import SQLModel, Field, Session, select
from database import get_session


# 勇者（ユーザー）テーブルの定義
class User(SQLModel, table=True):
    __tablename__ = "users"
    id: int | None = Field(default=None, primary_key=True)
    username: str
    current_level: int = Field(default=1)
    total_exp: int = Field(default=0)
    current_streak: int = Field(default=0)

# クエストテーブルの定義
class Quest(SQLModel, table=True):
    __tablename__ = "quests"
    
    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id")
    title: str
    exp_reward: int
    is_completed: bool = Field(default=False)
    target_date: date
    completed_at: date | None = None


app = FastAPI()

# 死活監視用
@app.get("/")
def read_root():
    return {"Hello": "Hero"}


# 勇者ステータスの取得
@app.get("/users/{user_id}")
def read_users_status(
    user_id: int,
    session: Session = Depends(get_session)
):
    # ステータスを取得
    user_status = session.get(User, user_id)

    # 存在しない場合のエラーハンドリング
    if not user_status:
        raise HTTPException(status_code=404, detail="勇者が見つかりません")

    return user_status


# クエスト一覧の取得
@app.get("/quests")
def read_quests(
    user_id: int,
    session: Session = Depends(get_session),
    target_date: date | None = None,
    is_completed: bool | None = None
):
    # user_idが存在しない場合のエラーハンドリング
    if not user_id:
        raise HTTPException(status_code=400, detail="クエリパラメータuser_idが指定されていません")

    # クエリを作成
    query = select(Quest).where(Quest.user_id == user_id)
    
    # クエリパラメータの有無で絞り込み条件を追加
    if target_date:
        query = query.where(Quest.target_date == target_date)
    if is_completed:
        query = query.where(Quest.is_completed == is_completed)

    # クエリを実行
    quests = session.exec(query).all()

    return quests


# 新規クエストの受注
@app.post("/quests")
def write_quests(
    quest: Quest,       # リクエストボディ
    session: Session = Depends(get_session)
):
    # エラーハンドリングはFastAPIが自動で行う
    
    # クエストの作成
    session.add(quest)
    session.commit()
    session.refresh(quest)

    return {"message": "新規クエストを受注しました！", "quest": quest}


# クエストの達成
@app.patch("/quests/{quest_id}/complete")
def update_quest_status(
    quest_id: int,
    session: Session = Depends(get_session)
):
    # dbからクエストを取得
    quest = session.get(Quest, quest_id)

    # クエストが存在しない場合のエラーハンドリング
    if not quest:
        raise HTTPException(status_code=404, detail="クエストが存在しません")
    
    # クエストがすでに達成済みの場合はエラーにする
    if quest.is_completed:
        raise HTTPException(status_code=400, detail="すでに達成済みのクエストです")

    # 達成済みに書き換え
    quest.is_completed = True
    quest.completed_at = date.today()

    # 勇者に経験値を付与
    hero = session.get(User, quest.user_id)
    hero.total_exp += quest.exp_reward
    hero.current_level = (hero.total_exp // 1000) + 1
    session.add(hero)

    # 変更をdbに保存
    session.add(quest)
    session.commit()

    # 最新のデータを取得し直す
    session.refresh(quest)

    return {
        "message": f"クエスト「{quest.title}を達成しました！」",
        "quest": quest,
        "hero_current_exp": hero.total_exp
    }


# クエストの破棄・削除
@app.delete("/quests/{quest_id}")
def remove_quest(
    quest_id: int,
    session: Session = Depends(get_session)
):
    quest = session.get(Quest, quest_id)

    # クエストが存在しない場合のエラーハンドリング
    if not quest:
        raise HTTPException(status_code=404, detail="クエストが存在しません")
    
    # セッションから対象オブジェクトの削除
    session.delete(quest)

    # dbの変更を確定
    session.commit()

    return {"message": f"クエスト「{quest.title}」を破棄しました"}
