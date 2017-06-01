const Web3 = require('web3');
const EventEmitter = require('events');
const ExchangeRate = require('./exchangeRate');
const logger = require('./logger');
const {
  isHeader, isLog, getBlockNumber, isInvalidAddress, decodeLogEntry,
  formatPurchase,
} = require('./utils');
const {
  ERROR_EVENT,
  CURRENT_BLOCK_KEY,
  DATA_EVENT,
  TOTAL_RECEIVED_EVENT,
  TOTAL_RECEIVED_KEY,
  EXCHANGE_RATE_KEY,
  BALANCES_KEY,
  BLOCK_EVENT,
  NEW_PURCHASE_EVENT,
  NEW_EXCHANGE_RATE_EVENT,
 } = require('./constants');

const web3 = new Web3();

function handleRedisError(error) {
  logger.error(error.message);
}

class Tracker extends EventEmitter {
  constructor(
    redisClient, gethClient, address, topic, errorHandler = handleRedisError) {
    super();
    this.redisClient = redisClient;
    this.gethClient = gethClient;
    this.address = address;
    this.topic = topic;
    this.rater = new ExchangeRate.Updater();

    redisClient.on(ERROR_EVENT, errorHandler);
  }

  async start() {
    try {
      logger.info('Updating entries since last run...');
      const lastBlockNumber = await this.redisClient
        .getAsync(CURRENT_BLOCK_KEY);
      const [totalReceived, currentBlock] = await this.gethClient.fastForward(
        lastBlockNumber,
        this.updateBalance.bind(this),
        this.address,
        this.topic);

      await this.incTotalReceived(totalReceived);
      await this.redisClient.setAsync(CURRENT_BLOCK_KEY, currentBlock);
      logger.info('Done');
    } catch (error) {
      logger.error(error.message);
      throw error;
    }

    return this.setupExchangeRater();
  }

  async setupExchangeRater() {
    // update manually the first time since there is a delay and cache
    // might be empty (or outdated)
    const rate = await ExchangeRate.getRate();
    await this.updateExchangeRate(rate);

    this.rater.start();
    this.rater.on(DATA_EVENT, this.updateExchangeRate);
  }

  async incTotalReceived(amount) {
    const totalReceived = await this.redisClient.getAsync(TOTAL_RECEIVED_KEY);
    const newTotal = web3.toBigNumber(amount).plus(totalReceived || 0);
    await this.redisClient.setAsync(
      TOTAL_RECEIVED_KEY, newTotal.toString('10'));
    this.redisClient.incr('purchases');
  }

  async getCurrentState() {
    const [
      totalReceived, currentBlock, exchangeRate,
    ] = await this.redisClient.mgetAsync(
      TOTAL_RECEIVED_KEY, CURRENT_BLOCK_KEY, EXCHANGE_RATE_KEY);

    return { totalReceived, currentBlock, exchangeRate };
  }

  async getBalance(address) {
    if (isInvalidAddress(address)) {
      return undefined;
    }

    try {
      const balance = await this.redisClient.hgetAsync(BALANCES_KEY, address);
      return web3.toBigNumber(balance || 0).toString('10');
    } catch (error) {
      return ERROR_EVENT;
    }
  }

  async updateExchangeRate(rate) {
    await this.redisClient.setAsync(EXCHANGE_RATE_KEY, rate);
    this.emit(NEW_EXCHANGE_RATE_EVENT, rate);
  }

  async updateBlock(number) {
    await this.redisClient.setAsync(CURRENT_BLOCK_KEY, number);
    this.emit(BLOCK_EVENT, number);
  }

  async addPurchase(purchase) {
    await this.updateBalance(purchase);
    await this.incTotalReceived(purchase.ethAmount);
    this.emit(NEW_PURCHASE_EVENT, formatPurchase(purchase));
  }

  isSubscribed(data) {
    return data.result.topics[0] === this.topic;
  }

  async handleSubscription(data) {
    if (isHeader(data)) {
      const blockNumber = getBlockNumber(data);
      await this.updateBlock(blockNumber);
    } else if (isLog(data) && this.isSubscribed(data)) {
      const purchase = decodeLogEntry(data.result);
      await this.addPurchase(purchase);
      await this.sendFundraiserUpdate();
    }
  }

  async sendFundraiserUpdate() {
    const totalReceived = await this.redisClient.getAsync(TOTAL_RECEIVED_KEY);
    this.emit(TOTAL_RECEIVED_EVENT, totalReceived);
  }

  handleData(entry) {
    if (entry.result) {
      this.emit(DATA_EVENT, entry.result);
    } else if (entry.method === 'eth_subscription' || entry.subscription) {
      this.handleSubscription(entry.params);
    } else {
      this.emit(ERROR_EVENT, `unhandled message type ${JSON.stringify(entry)}`);
    }
  }

  async updateBalance(data) {
    let balance = await this.redisClient.hgetAsync(BALANCES_KEY, data.address);

    if (balance === null) {
      balance = 0;
    }
    const newBalance = web3.toBigNumber(balance).plus(data.tokenAmount);
    await this.redisClient.hsetAsync(
      BALANCES_KEY, data.address, newBalance.toString(10));
  }
}

module.exports = Tracker;
