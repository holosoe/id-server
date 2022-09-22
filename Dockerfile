# TODO Multistage build?
FROM zokrates/zokrates:0.8.2 AS zokrates
FROM node:16.17.0-bullseye-slim

RUN apt-get update && apt-get install -y --no-install-recommends dumb-init

COPY --from=zokrates /home/zokrates /home/zokrates
ENV ZOKRATES_HOME=/home/zokrates/.zokrates
ENV PATH=/home/zokrates/.zokrates/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
ENV ZOKRATES_STDLIB=/home/zokrates/.zokrates/stdlib

ENV NODE_ENV=production

WORKDIR /app

COPY package*.json ./
RUN npm install
# If you are building your code for production
RUN npm ci --only=production

COPY . .

EXPOSE 3000

CMD ["dumb-init", "node", "./src/main/server"]
