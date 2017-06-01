const WebsocketClient = require('websocket').client;
const Web3 = require('web3');
const bluebird = require('bluebird');
const _ = require('lodash');
const utils = require('./utils');

let web3;
const getCurrentBlock = bluebird.promisify(web3.eth.getBlockNumber);

async function connectWebsocket(host, port, handleData) {
  const client = new WebsocketClient();
  const connection = await new Promise((resolve, reject) => {
    client.on('connect', (connection) => resolve(connection));
    client.on('connectFailed', (error) => reject(error));
    client.connect(`ws://${host}:${port}`);
  });

  connection.on('message', (data) => handleData(JSON.parse(data.utf8Data)));
  subscribe(connection);

  return connection;
}

function setupGeth(host, rpcPort) {
  web3 = new Web3(
      new Web3.providers.HttpProvider(`http://${host}:${rpcPort}`, 60));
}

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

function subscribe(conn, contractAddress, topic) {
  conn.send(rpcSubscribe([
    'logs',
    {
      address: contractAddress,
      topics: [topic],
    },
  ]));

  conn.send(rpcSubscribe(['newHeads', { includeTransactions: false }]));
}

async function fastForward(lastBlockNumber, updateBalance) {
  const currentBlock = await getCurrentBlock();

  const purchases = await getPurchasesSince(lastBlockNumber);
  const newTotalReceived = _.reduce(
    purchases,
    (acc, purchase) => acc.plus(purchase.ethAmount),
    web3.toBigNumber(0));

  await bluebird.each(purchases, updateBalance);

  return [newTotalReceived, currentBlock];
}

async function getPurchasesSince(blockNumber) {
  const logs = await getLogsSince(blockNumber);
  const purchases = logs.map(utils.decodeLogEntry);
  return purchases;
}

async function getLogsSince(fromBlock, address, topic) {
  const watcher = web3.eth.filter({
    fromBlock: fromBlock || 0,
    toBlock: 'latest',
    address,
    topics: [topic],
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

module.exports = {
  connectWebsocket,
  setupGeth,
  fastForward,
};
