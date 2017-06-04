FROM debian:jessie-slim

ENV GETH_VERSION=v1.6.5

RUN apt-get update && apt-get install -y wget && \
  wget https://gethstore.blob.core.windows.net/builds/geth-linux-amd64-1.6.5-cf87713d.tar.gz && \
  tar zxf geth-linux-amd64-1.6.5-cf87713d.tar.gz && \
  cp geth-linux-amd64-1.6.5-cf87713d/geth /usr/bin/geth
ADD startGeth.sh /startGeth.sh
RUN chmod +x /startGeth.sh

EXPOSE 8545
EXPOSE 8546
EXPOSE 30303
EXPOSE 30303/udp

ENTRYPOINT ["sh", "/startGeth.sh"]