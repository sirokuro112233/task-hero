FROM    python:3.10.20-alpine

WORKDIR /app

COPY    ./requirements.txt /app/requirements.txt

RUN     pip install --no-cache-dir --upgrade -r ./requirements.txt

EXPOSE  8000

# 開発用 (ホットリロード有効)
CMD     [ "fastapi", "dev", "main.py", "--host", "0.0.0.0", "--port", "8000" ]

# 本番用
# CMD     [ "fastapi", "run", "main.py", "--host", "0.0.0.0", "--port", "8000" ]