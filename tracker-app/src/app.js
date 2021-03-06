const Tracker = require('./tracker');
const SocketIO = require('socket.io');
const bluebird = require('bluebird');
const redis = require('redis');
const logger = require('./logger');
const gethClient = require('./gethClient');
const {
  CLIENT_ACTION_EVENT,
  CLIENT_FUNDRAISER_UPDATE_ACTION,
  CLIENT_NEW_PURCHASE_ACTION,
  TOTAL_RECEIVED_EVENT,
  ERROR_EVENT,
  NEW_PURCHASE_EVENT,
  BLOCK_EVENT,
  NEW_EXCHANGE_RATE_EVENT,
  STATE_CHANGE_EVENT,
} = require('./constants');

bluebird.promisifyAll(redis.RedisClient.prototype);
bluebird.promisifyAll(redis.Multi.prototype);

async function handleConnection(tracker, client) {
  try {
    const state = await tracker.getCurrentState();
    client.emit(CLIENT_ACTION_EVENT, fundraiserUpdate(state));
  } catch (error) {
    client.emit(ERROR_EVENT, 'failed to get state');
  }
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

function handleStateChange(data) {
  this.emitAction(fundraiserUpdate(data));
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
      config.address);

    await this.tracker.start();

    this.startServer(this.tracker);
  }

  startServer(tracker) {
    if (!this.io) {
      this.setupSocket();
    }
    this.io.on('connection', handleConnection.bind(null, tracker));
    this.io.listen(8787, () => logger.info('Listening on port 8787'));

    tracker.on(STATE_CHANGE_EVENT, handleStateChange.bind(this));
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
  handleConnection,
  fundraiserUpdate,
  newPurchase,
  App,
};
