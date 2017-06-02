#!/bin/sh
geth --syncmode fast --rpc --rpcaddr 0.0.0.0 --rpcapi personal,eth,net,web3 --ws --wsorigins "*" --wsaddr 0.0.0.0 geth --datadir /data