FROM debian:jessie-slim

RUN apt-get update && apt-get install -y wget && \
  wget https://gethstore.blob.core.windows.net/builds/geth-linux-amd64-1.6.6-10a45cb5.tar.gz && \
  tar zxf geth-linux-amd64-1.6.6-10a45cb5.tar.gz && \
  cp geth-linux-amd64-1.6.6-10a45cb5/geth /usr/bin/geth
ADD startGeth.sh /startGeth.sh
RUN chmod +x /startGeth.sh

EXPOSE 8545
EXPOSE 8546
EXPOSE 30303
EXPOSE 30303/udp

ENTRYPOINT ["sh", "/startGeth.sh"]