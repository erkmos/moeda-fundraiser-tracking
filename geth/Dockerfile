FROM alpine:3.6

ENV GETH_VERSION=v1.6.5

RUN \
  apk add --update go git make gcc musl-dev linux-headers && \
  git clone https://github.com/ethereum/go-ethereum       && \
  cd go-ethereum && git checkout $GETH_VERSION            && \
  make geth                                               && \
  cp build/bin/geth /usr/local/bin/           && \
  apk del git go make gcc musl-dev linux-headers          && \
  rm -rf /go-ethereum && rm -rf /var/cache/apk/*
ADD startGeth.sh /startGeth.sh
RUN chmod +x /startGeth.sh

EXPOSE 8545
EXPOSE 8546
EXPOSE 30303
EXPOSE 30303/udp

ENTRYPOINT ["sh", "/startGeth.sh"]