const socket = require('socket.io');
const WebsocketClient = require('websocket').client;
const Web3 = require('web3');
const _ = require('lodash');

const web3 = new Web3();

function subscribe(conn) {
  conn.send(JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'eth_subscribe',
    params: [
      'logs',
      {
        address: '0x38980ccb7b83b1ab9bf15d2979e784f9f7f0461a',
        topics: [
          '0x12cb4648cf3058b17ceeb33e579f8b0bc269fe0843f3900b8e24b6c54871703c',
        ],
      },
    ],
  }));
  conn.send(JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'eth_getBalance',
    params: ['0x98a321f414d67f186e30bdac641e5ecf990397ae', 'latest'],
  }));
  conn.send(JSON.stringify({
    jsonrpc: '2.0',
    id: 2,
    method: 'eth_subscribe',
    params: ['newHeads', { includeTransactions: false }],
  }));
}

function decodeLogEntry(logEntry) {
  const [ethAmount, tokenAmount] = [
    web3.toBigNumber(logEntry.data.slice(0, 66)),
    web3.toBigNumber(`0x${logEntry.data.slice(66, 130)}`),
  ];
  const address = `0x${logEntry.topics[1].slice(26)}`;

  return { ethAmount, tokenAmount, address };
}

function handlePlain(data) {
  console.log(data);
}

function isHeader(data) {
  return _.get(data, 'result.parentHash') !== undefined;
}

function isLog(data) {
  return _.get(data, 'result.topics') !== undefined;
}

function getBlockNumber(block) {
  return parseInt(_.get(block, 'result.number').slice(2), 16);
}

async function updateBlock(number) {

}

function addPurchase({ ethAmount, tokenAmount, address }) {

}

function handleSubscription(data) {
  if (isHeader(data)) {
    const blockNumber = getBlockNumber(data);
    console.log('New block:', blockNumber);
    updateBlock(blockNumber);
  } else if (isLog(data)) {
    const purchase = decodeLogEntry(data.result);
    console.log('New purchase', purchase);
    addPurchase(purchase);
  } else {
    console.log(data.result);
  }
}

function handleData(logEntry) {
  if (logEntry.result) {
    handlePlain(logEntry.result);
  } else if (logEntry.method === 'eth_subscription' || logEntry.subscription) {
    handleSubscription(logEntry.params);
  } else {
    console.log('unhandled message type', logEntry);
  }
}

async function main() {
  const client = new WebsocketClient();
  const connection = await new Promise((resolve, reject) => {
    client.on('connect', (connection) => resolve(connection));
    client.on('connectFailed', (error) => reject(error));
    client.connect('ws://127.0.0.1:8546');
  });
  connection.on('message', (data) => handleData(JSON.parse(data.utf8Data)));
  subscribe(connection);
}

main();