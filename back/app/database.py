# database.py
import os
from sqlmodel import create_engine, Session

# 第二引数は、環境変数が取れなかった場合の「デフォルト値」
MYSQL_USER = os.getenv("MYSQL_USER", "quest_hero")
MYSQL_PASSWORD = os.getenv("MYSQL_PASSWORD", "super_secret_password_1234")
MYSQL_DATABASE = os.getenv("MYSQL_DATABASE", "task_quest_db")
DB_HOST = os.getenv("DB_HOST", "db")
DB_PORT = os.getenv("DB_PORT", "3306")

DATABASE_URL = f"mysql+pymysql://{MYSQL_USER}:{MYSQL_PASSWORD}@{DB_HOST}:{DB_PORT}/{MYSQL_DATABASE}"

engine = create_engine(DATABASE_URL, echo=True)

def get_session():
    with Session(engine) as session:
        yield session