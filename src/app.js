const Tracker = require('./tracker');
const io = require('socket.io')();
const bluebird = require('bluebird');
const redis = require('redis');
const logger = require('./logger');
const gethClient = require('./gethClient');
const {
  CLIENT_ACTION_EVENT,
  CLIENT_BALANCE_ERROR_EVENT,
  CLIENT_BALANCE_RESULT,
  CLIENT_FUNDRAISER_UPDATE_ACTION,
  CLIENT_NEW_PURCHASE_ACTION,
  TOTAL_RECEIVED_EVENT,
  ERROR_EVENT,
  NEW_PURCHASE_EVENT,
  BLOCK_EVENT,
  NEW_EXCHANGE_RATE_EVENT,
} = require('./constants');

bluebird.promisifyAll(redis.RedisClient.prototype);
bluebird.promisifyAll(redis.Multi.prototype);

async function handleClientAction(tracker, client, action) {
  const result = { type: null };

  try {
    switch (action.type) {
      case 'server/balance':
        result.data = await tracker.getBalance(action.data);
        result.type = CLIENT_BALANCE_RESULT;
        break;
      default:
        return;
    }
  } catch (error) {
    result.type = CLIENT_BALANCE_ERROR_EVENT;
    result.data = 'request error';
  }


  client.emit(CLIENT_ACTION_EVENT, result);
}

async function handleConnection(tracker, client) {
  try {
    const state = await tracker.getCurrentState();
    client.emit(TOTAL_RECEIVED_EVENT, state);
  } catch (error) {
    client.emit(ERROR_EVENT, 'failed to get state');
    return;
  }

  client.on(
    CLIENT_ACTION_EVENT, handleClientAction.bind(null, tracker, client));
}

function fundraiserUpdate(data) {
  return { type: CLIENT_FUNDRAISER_UPDATE_ACTION, data };
}

function newPurchase(data) {
  return { type: CLIENT_NEW_PURCHASE_ACTION, data };
}

async function run(config) {
  const client = gethClient.setupGeth(
    config.gethHost, config.gethRpcPort);

  const tracker = new Tracker(
    redis.createClient(),
    client,
    config.contractAddress,
    config.topic);

  // link websocket to tracker
  await gethClient.connectWebsocket(
    config.gethHost, config.gethWsPort, tracker.handleData);

  await tracker.start();

  startServer(tracker);
}

function emitAction(type, data) {
  io.sockets.emit(CLIENT_ACTION_EVENT, { type, data });
}

function startServer(tracker) {
  io.on('connection', handleConnection.bind(null, tracker));
  io.listen(3000, () => logger.info('Listening on port 3000'));

  tracker.on(ERROR_EVENT, (message) => logger.error(message));
  tracker.on(NEW_PURCHASE_EVENT, (data) => emitAction(newPurchase(data)));
  tracker.on(
    BLOCK_EVENT,
    (height) => emitAction(fundraiserUpdate({ blockNumber: height })));
  tracker.on(
    TOTAL_RECEIVED_EVENT,
    (total) => emitAction(fundraiserUpdate({ totalReceived: total })));
  tracker.on(
    NEW_EXCHANGE_RATE_EVENT,
    (rate) => emitAction(fundraiserUpdate({ exchangeRate: rate })));
}

module.exports = {
  run,
};
