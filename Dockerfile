FROM node:18.9.0-bullseye-slim

RUN apt-get update -y
RUN apt-get install -y python3
RUN apt-get install -y python3-pip
RUN apt-get install -y --no-install-recommends dumb-init

ENV NODE_ENV=production

WORKDIR /app

COPY package*.json ./
RUN npm install
RUN npm ci --omit=dev

COPY . .

EXPOSE 3000

CMD ["dumb-init", "node", "./src/main/server"]
