#!/bin/sh
geth --fast --cache=4096 --rpc --rpcaddr 0.0.0.0 --rpcapi personal,eth,net,web3 --ws --wsorigins "*" --wsaddr 0.0.0.0 geth --datadir /data