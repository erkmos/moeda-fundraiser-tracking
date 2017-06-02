const Websocket = require('./wsClient');
const Web3 = require('web3');
const bluebird = require('bluebird');
const _ = require('lodash');
const utils = require('./utils');
const logger = require('winston');

let web3;

function reconnectListenerFactory(clientInstance, address, topic) {
  return () => {
    // assume that geth was offline and will emit events while
    // syncing for past blocks
    logger.info('Websocket reconnected.');
    subscribe(clientInstance, address, topic);
  };
}

async function connectWebsocket(host, port, handleData, address, topic) {
  const client = Websocket.create();

  // we want to pause execution on the first run during setup
  await new Promise((resolve, reject) => {
    client.onopen = resolve;
    client.onerror = reject;
    client.open(`ws://${host}:${port}`);
  });

  // future calls will use the standard callbacks
  client.onerror = (error) => logger.error(error);
  client.onmessage = (data) => handleData(JSON.parse(data));
  client.onopen = reconnectListenerFactory(client, address, topic);

  return client;
}

function setupGeth(host, rpcPort) {
  web3 = new Web3(
      new Web3.providers.HttpProvider(`http://${host}:${rpcPort}`, 60000));
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
  logger.info('Resubscribing', contractAddress, topic);
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
  reconnectListenerFactory,
  connectWebsocket,
  setupGeth,
  fastForward,
};
