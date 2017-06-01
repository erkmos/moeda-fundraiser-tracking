const WebsocketClient = require('websocket').client;
const Web3 = require('web3');
const bluebird = require('bluebird');
const _ = require('lodash');
const utils = require('./utils');

let web3;

async function connectWebsocket(host, port, handleData, address, topic) {
  const client = new WebsocketClient();
  const connection = await new Promise((resolve, reject) => {
    client.once('connect', (connection) => resolve(connection));
    client.once('connectFailed', (error) => reject(error));
    client.connect(`ws://${host}:${port}`);
  });

  connection.on('message', (data) => handleData(JSON.parse(data.utf8Data)));
  subscribe(connection, address, topic);

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

async function fastForward(lastBlockNumber, updateBalance, address, topic) {
  const getCurrentBlock = bluebird.promisify(web3.eth.getBlockNumber);
  const currentBlock = await getCurrentBlock();

  const purchases = await getPurchasesSince(lastBlockNumber, address, topic);
  const newTotalReceived = _.reduce(
    purchases,
    (acc, purchase) => acc.plus(purchase.ethAmount),
    web3.toBigNumber(0));

  await bluebird.each(purchases, updateBalance);

  return [newTotalReceived, currentBlock];
}

async function getPurchasesSince(blockNumber, address, topic) {
  const logs = await getLogsSince(blockNumber, address, topic);
  const purchases = logs.map(utils.decodeLogEntry);
  return purchases;
}

async function getLogsSince(fromBlock, address, topic) {
  if (!address || !topic) {
    throw new Error('getLogsSince: address or topic cannot be undefined');
  }
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
