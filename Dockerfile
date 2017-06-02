FROM mhart/alpine-node:8.0

RUN apk update --no-cache && apk add git
ADD . /app
WORKDIR /app
RUN npm install -g yarn && yarn

EXPOSE 3000
ENTRYPOINT ["node", "/app/index.js"]
