FROM    node:20-slim

WORKDIR /app

COPY    ./app/package*.json /app/

RUN     npm install

EXPOSE  3000

CMD     [ "npm", "run", "dev" ]