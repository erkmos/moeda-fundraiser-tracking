FROM mhart/alpine-node:8.0

RUN apk update --no-cache && apk add git \
  && cd /app && npm install -g yarn && yarn
ADD . /app

EXPOSE 3000
ENTRYPOINT ["node", "/app/index.js"]
