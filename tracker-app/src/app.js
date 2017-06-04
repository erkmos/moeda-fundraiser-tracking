const Tracker = require('./tracker');
const SocketIO = require('socket.io');
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
  CLIENT_BALANCE_REQUEST,
} = require('./constants');

bluebird.promisifyAll(redis.RedisClient.prototype);
bluebird.promisifyAll(redis.Multi.prototype);

async function handleClientAction(tracker, client, action) {
  const result = { type: null };

  try {
    switch (action.type) {
      case CLIENT_BALANCE_REQUEST:
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
    client.emit(CLIENT_ACTION_EVENT, fundraiserUpdate(state));
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

function handleError(error) {
  logger.error(error);
}

function handlePurchaseEvent(data) {
  this.emitAction(newPurchase(data));
}

function handleBlockEvent(height) {
  this.emitAction(fundraiserUpdate({ currentBlock: height }));
}

function handleTotalReceivedEvent(state) {
  this.emitAction(fundraiserUpdate(state));
}

function handleExchangeRateEvent(rate) {
  this.emitAction(fundraiserUpdate({ exchangeRate: rate }));
}

class App {
  constructor() {
    this.run = this.run.bind(this);
    this.startServer = this.startServer.bind(this);
    this.emitAction = this.emitAction.bind(this);
  }

  setupSocket() {
    this.io = new SocketIO();
  }

  setupTracker(config) {
    this.tracker = new Tracker(
      redis.createClient({ host: config.redisHost, port: config.redisPort }),
      gethClient,
      config.address,
      config.topic,
      config.startBlock);
  }

  async run(config) {
    gethClient.setupGeth(
      config.gethHost, config.gethRpcPort);

    this.setupTracker(config);

    // link websocket to tracker
    await gethClient.connectWebsocket(
      config.gethHost,
      config.gethWsPort,
      this.tracker.handleData.bind(this.tracker),
      config.address,
      config.topic);

    await this.tracker.start();

    this.startServer(this.tracker);
  }

  startServer(tracker) {
    if (!this.io) {
      this.setupSocket();
    }
    this.io.on('connection', handleConnection.bind(null, tracker));
    this.io.listen(8787, () => logger.info('Listening on port 3000'));

    tracker.on(ERROR_EVENT, handleError.bind(this));
    tracker.on(NEW_PURCHASE_EVENT, handlePurchaseEvent.bind(this));
    tracker.on(BLOCK_EVENT, handleBlockEvent.bind(this));
    tracker.on(TOTAL_RECEIVED_EVENT, handleTotalReceivedEvent.bind(this));
    tracker.on(NEW_EXCHANGE_RATE_EVENT, handleExchangeRateEvent.bind(this));
  }

  emitAction(actionData) {
    this.io.sockets.emit(CLIENT_ACTION_EVENT, actionData);
  }
}

module.exports = {
  handleClientAction,
  handleConnection,
  fundraiserUpdate,
  newPurchase,
  App,
};
