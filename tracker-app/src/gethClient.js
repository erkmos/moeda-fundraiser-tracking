const WebSocket = require('reconnect-ws');
const Web3 = require('web3');
const bluebird = require('bluebird');
const utils = require('./utils');
const logger = require('winston');
const { DONATION_TOPIC } = require('./constants');
const abi = require('../contract_abi.json');

let web3;

async function connectWebsocket(host, port, handleData, address) {
  const client = WebSocket();
  client.on('connect', (conn) => {
    logger.info('Websocket reconnected.');
    conn.on('data', (data) => handleData(JSON.parse(data)));
    // assume that geth was offline and will emit events while
    // syncing for past blocks, i.e. don't run fastforward
    subscribe(conn, address);
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
      new Web3.providers.HttpProvider(`http://${host}:${rpcPort}`));
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

function subscribe(conn, contractAddress) {
  logger.info('Resubscribing', contractAddress);
  conn.write(rpcSubscribe([
    'logs',
    {
      address: contractAddress,
      topics: [], // subscribe to all events
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

async function getCurrentRate(address) {
  const instance = web3.eth.contract(abi).at(address);
  const fn = bluebird.promisify(instance.tokensPerEth.call);
  const tokensPerEth = await fn();
  return tokensPerEth.div(10000000000000000);
}

async function fastForward(lastBlockNumber, updateBalance, address) {
  const getCurrentBlock = bluebird.promisify(web3.eth.getBlockNumber);
  const currentBlock = await getCurrentBlock();
  logger.info('Starting sync from block', lastBlockNumber);

  const purchases = await getPurchasesSince(lastBlockNumber, address);
  const [newTotalReceived, newTokensSold] = sumAmounts(purchases);

  await bluebird.each(purchases, updateBalance);
  const numPurchases = purchases ? purchases.length : 0;
  const exchangeRate = await getCurrentRate(address);

  return [
    newTotalReceived, currentBlock, numPurchases, newTokensSold, exchangeRate,
  ];
}

async function getPurchasesSince(blockNumber, address) {
  const logs = await getLogsSince(blockNumber, address);
  const purchases = logs.map(utils.decodeDonation);
  return purchases;
}

async function getLogsSince(fromBlock, address) {
  if (!address) {
    throw new Error('getLogsSince: address cannot be undefined');
  }
  const watcher = web3.eth.filter({
    fromBlock: fromBlock || 0,
    toBlock: 'latest',
    address,
    topics: [DONATION_TOPIC],
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
