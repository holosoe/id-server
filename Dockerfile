FROM zokrates/zokrates:0.8.2 AS zokrates
# FROM python:3.10
# FROM node:16
FROM nikolaik/python-nodejs:python3.10-nodejs16

COPY --from=zokrates /home/zokrates /home/zokrates
ENV ZOKRATES_HOME=/home/zokrates/.zokrates
ENV PATH=/home/zokrates/.zokrates/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
ENV ZOKRATES_STDLIB=/home/zokrates/.zokrates/stdlib

ENV DOCKER_VOLUMES_DIR=/mnt/
# Create app directory
WORKDIR /app
# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)
COPY package*.json ./
RUN npm install
# If you are building your code for production
# RUN npm ci --only=production

COPY . .

EXPOSE 3000

CMD ["npm", "run", "start:main"]
# CMD ["ls", "./src/zok"]
