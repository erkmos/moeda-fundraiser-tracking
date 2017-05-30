const WebsocketClient = require('websocket').client;
const Web3 = require('web3');
const _ = require('lodash');
const redis = require('redis');
const bluebird = require('bluebird');
const EventEmitter = require('events');

bluebird.promisifyAll(redis.RedisClient.prototype);
bluebird.promisifyAll(redis.Multi.prototype);

const web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:8545'));

let contractAddress;
let contractEventHash;
let events;

function rpcRequest(method, params) {
  return JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method,
    params,
  });
}

function rpcSubscribe(params) {
  return rpcRequest('eth_subscribe', params);
}

function subscribe(conn) {
  conn.send(rpcSubscribe([
    'logs',
    {
      address: contractAddress,
      topics: [
        contractEventHash,
      ],
    },
  ]));

  conn.send(rpcSubscribe(['newHeads', { includeTransactions: false }]));
}

function formatPurchase({ ethAmount, tokenAmount, address }) {
  const humanEth = web3.fromWei(ethAmount).toString('10');
  const humanToken = web3.fromWei(tokenAmount).toString('10');

  return `New donation: ${address} got ${humanToken} MDA for ${humanEth} ETH`;
}

function decodeLogEntry(logEntry) {
  const [ethAmount, tokenAmount] = [
    web3.toBigNumber(logEntry.data.slice(0, 66)),
    web3.toBigNumber(`0x${logEntry.data.slice(66, 130)}`),
  ];
  const address = `0x${logEntry.topics[1].slice(26)}`;

  return { ethAmount, tokenAmount, address };
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
  await redisClient.setAsync('currentBlock', number);
}

async function addPurchase(purchase) {
  await updateBalance(purchase);
}

function handleSubscription(data) {
  if (isHeader(data)) {
    const blockNumber = getBlockNumber(data);
    updateBlock(blockNumber);
    events.emit('block', blockNumber);
  } else if (isLog(data)) {
    const purchase = decodeLogEntry(data.result);
    addPurchase(purchase);
    events.emit('purchase', formatPurchase(purchase));
  }
}

function handleData(logEntry) {
  if (logEntry.result) {
    events.emit('data', logEntry.result);
  } else if (logEntry.method === 'eth_subscription' || logEntry.subscription) {
    handleSubscription(logEntry.params);
  } else {
    events.emit('error', `unhandled message type ${logEntry}`);
  }
}

async function getLogsSince(fromBlock) {
  const watcher = web3.eth.filter({
    fromBlock,
    toBlock: 'latest',
    address: contractAddress,
    topics: [
      contractEventHash,
    ],
  });

  const logs = await new Promise((resolve, reject) => {
    watcher.get((error, result) => {
      if (error) return reject(error);
      return resolve(result);
    });
  });

  watcher.stopWatching();

  return logs;
}

async function updateBalance(data) {
  let balance = await redisClient.hgetAsync('balances', data.address);

  if (balance === null) {
    balance = 0;
  }
  const newBalance = web3.toBigNumber(balance).add(data.tokenAmount);
  await redisClient.hsetAsync(
    'balances', data.address, newBalance.toString(10));
}

async function fastForward() {
  const lastBlockNumber = await redisClient.getAsync('currentBlock');

  const purchases = await getPurchasesSince(lastBlockNumber);
  const newTotalReceived = _.reduce(purchases, (acc, purchase) => {
    acc.add(purchase.ethAmount);
    return acc;
  }, web3.toBigNumber(0));

  await incTotalReceived(newTotalReceived);

  // update block last when we are sure all other updates were successful
  const currentBlock = web3.eth.blockNumber;
  await redisClient.setAsync('currentBlock', currentBlock);
}

async function incTotalReceived(amount) {
  const totalReceived = await redisClient.getAsync('totalReceived') || 0;
  const newTotal = web3.toBigNumber(amount).add(totalReceived);
  await redisClient.setAsync(
    'totalReceived', newTotal.toString('10'));
}

async function getPurchasesSince(blockNumber) {
  const logs = await getLogsSince(blockNumber);
  const purchases = logs.map(decodeLogEntry);
  await bluebird.each(purchases, updateBalance);
}

async function Tracker(address, topic) {
  contractAddress = address;
  contractEventHash = topic;
  global.redisClient = redis.createClient();
  events = new EventEmitter();

  try {
    console.log('Updating entries since last run...');
    await fastForward();
    console.log('Done');
  } catch (error) {
    events.emit('error', error.message);
    return undefined;
  }

  const client = new WebsocketClient();
  const connection = await new Promise((resolve, reject) => {
    client.on('connect', (connection) => resolve(connection));
    client.on('connectFailed', (error) => reject(error));
    client.connect('ws://127.0.0.1:8546');
  });

  connection.on('message', (data) => handleData(JSON.parse(data.utf8Data)));
  subscribe(connection);

  return events;
}

module.exports = {
  start: Tracker,
};