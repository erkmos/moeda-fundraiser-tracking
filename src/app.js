const Tracker = require('./tracker');
const io = require('socket.io')();
const bluebird = require('bluebird');
const redis = require('redis');
const logger = require('./logger');
const gethClient = require('./gethClient');

bluebird.promisifyAll(redis.RedisClient.prototype);
bluebird.promisifyAll(redis.Multi.prototype);

async function handleClientAction(tracker, client, action) {
  const result = { type: null };

  try {
    switch (action.type) {
      case 'server/balance':
        result.data = await tracker.getBalance(action.data);
        result.type = 'BALANCE';
        break;
      default:
        return;
    }
  } catch (error) {
    result.type = 'BALANCE_ERROR';
    result.data = 'request error';
  }


  client.emit('action', result);
}

async function handleConnection(tracker, client) {
  try {
    const state = await tracker.getCurrentState();
    client.emit('update', state);
  } catch (error) {
    client.emit('error', 'failed to get state');
    return;
  }

  client.on('action', handleClientAction.bind(null, tracker, client));
}

function makeAction(data) {
  return { type: 'FUNDRAISER_UPDATE', data };
}

async function run(config) {
  const client = await gethClient.setupGeth(
    config.gethHost, config.gethRpcPort, config.gethWsPort);

  const tracker = new Tracker(
    redis.createClient(),
    client,
    config.contractAddress,
    config.topic);

  await tracker.start();

  io.on('connection', handleConnection.bind(null, tracker));
  io.listen(3000, () => logger.info('Listening on port 3000'));

  tracker.on('error', (message) => logger.error(message));
  tracker.on('purchase', (message) => logger.info(message));
  tracker.on(
    'block',
    (height) => io.sockets.emit('action', makeAction({ blockNumber: height })));
  tracker.on(
    'update',
    (total) => io.sockets.emit('action', makeAction({ totalReceived: total })));
  tracker.on(
    'rate',
    (rate) => io.sockets.emit('action', makeAction({ exchangeRate: rate })));
}

module.exports = {
  run,
};
