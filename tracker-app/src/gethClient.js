const WebSocket = require('reconnect-ws');
const Web3 = require('web3');
const bluebird = require('bluebird');
const _ = require('lodash');
const utils = require('./utils');
const logger = require('winston');

let web3;

async function connectWebsocket(host, port, handleData, address, topic) {
  const client = WebSocket();
  client.on('connect', (conn) => {
    logger.info('Websocket reconnected.');
    conn.on('data', (data) => handleData(JSON.parse(data)));
    // assume that geth was offline and will emit events while
    // syncing for past blocks, i.e. don't run fastforward
    subscribe(conn, address, topic);
  });
  client.on('reconnect', () => {
    logger.warn('geth connection lost, reconnecting...');
  });

  client.on('error', (error) => logger.error(error.message));
  client.connect(`ws://${host}:${port}`);

  // we want to pause execution on the first run during setup
  // to allow websocket to finish connecting
  await bluebird.delay(300);

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
  conn.write(rpcSubscribe([
    'logs',
    {
      address: contractAddress,
      topics: [topic],
    },
  ]));

  conn.write(rpcSubscribe(['newHeads', { includeTransactions: false }]));
}

function sumAmounts(purchases) {
  let totalReceived = web3.toBigNumber(0);
  let tokensSold = web3.toBigNumber(0);
  const length = purchases.length;

  for (let i = 0; i < length; i += 1) {
    const purchase = purchases[i];
    totalReceived = totalReceived.plus(purchase.ethAmount);
    tokensSold = tokensSold.plus(purchase.tokenAmount);
  }

  return [totalReceived, tokensSold];
}

async function fastForward(lastBlockNumber, updateBalance, address, topic) {
  const getCurrentBlock = bluebird.promisify(web3.eth.getBlockNumber);
  const currentBlock = await getCurrentBlock();

  const purchases = await getPurchasesSince(lastBlockNumber, address, topic);
  const [newTotalReceived, newTokensSold] = sumAmounts(purchases);

  await bluebird.each(purchases, updateBalance);
  const numPurchases = purchases ? purchases.length : 0;

  return [
    newTotalReceived, currentBlock, numPurchases, newTokensSold];
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
