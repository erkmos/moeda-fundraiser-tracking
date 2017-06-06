const Web3 = require('web3');
const EventEmitter = require('events');
const ExchangeRate = require('./exchangeRate');
const logger = require('./logger');
const {
  isHeader, isLog, getBlockNumber, isInvalidAddress, decodeLogEntry,
  formatPurchase, reversePurchase,
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
  PURCHASES_COUNT_KEY,
  TOTAL_SOLD_KEY,
 } = require('./constants');

const web3 = new Web3();

function handleRedisError(error) {
  logger.error(error.message);
}

class Tracker extends EventEmitter {
  constructor(
    redisClient, gethClient, address, topic, startBlock) {
    super();
    this.redisClient = redisClient;
    this.gethClient = gethClient;
    this.address = address;
    this.topic = topic;
    this.startBlock = startBlock;
    this.rater = new ExchangeRate.Updater();
    this.updateExchangeRate = this.updateExchangeRate.bind(this);
    this.updateBalance = this.updateBalance.bind(this);

    redisClient.on(ERROR_EVENT, handleRedisError);
  }

  async start() {
    try {
      logger.info('Updating entries since last run...');
      const lastBlockNumber = await this.redisClient
        .getAsync(CURRENT_BLOCK_KEY);

      const blockNumber = Math.max(
        lastBlockNumber, parseInt(this.startBlock, 10));

      const [
        totalReceived, currentBlock, numPurchases, tokensSold,
      ] = await this.gethClient.fastForward(
        blockNumber,
        this.updateBalance,
        this.address,
        this.topic);

      await this.updateTotalReceived(
        totalReceived, tokensSold);
      await this.redisClient.setAsync(CURRENT_BLOCK_KEY, currentBlock);
      await this.redisClient.incrByAsync(PURCHASES_COUNT_KEY, numPurchases);
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

  async updateTotalReceived(amount, tokensSold) {
    const [
      totalReceived, totalTokensSold,
      ] = await this.redisClient.mgetAsync(TOTAL_RECEIVED_KEY, TOTAL_SOLD_KEY);
    const newTotal = web3.toBigNumber(amount).plus(totalReceived || 0);
    const newTokensSold = web3.toBigNumber(totalTokensSold || 0)
      .plus(tokensSold);
    await this.redisClient.msetAsync(
      TOTAL_RECEIVED_KEY, newTotal.toString('10'),
      TOTAL_SOLD_KEY, newTokensSold.toString('10'));
  }

  async incTotalReceived(amount, tokensSold, reverted) {
    await this.updateTotalReceived(amount, tokensSold);

    if (reverted) {
      this.redisClient.decr(PURCHASES_COUNT_KEY);
    } else if (web3.toBigNumber(amount).gt(0)) {
      this.redisClient.incr(PURCHASES_COUNT_KEY);
    }
  }

  async getCurrentState() {
    const [
      totalReceived, currentBlock, exchangeRate, purchases, tokensSold,
    ] = await this.redisClient.mgetAsync(
      TOTAL_RECEIVED_KEY,
      CURRENT_BLOCK_KEY,
      EXCHANGE_RATE_KEY,
      PURCHASES_COUNT_KEY,
      TOTAL_SOLD_KEY);

    return {
      totalReceived,
      currentBlock,
      exchangeRate,
      purchases,
      tokensSold,
    };
  }

  async getBalance(address) {
    if (isInvalidAddress(address)) {
      throw new Error('invalid address');
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

  async addPurchase(purchase, reverted) {
    await this.updateBalance(purchase);
    await this.incTotalReceived(
      purchase.ethAmount, purchase.tokenAmount, reverted);
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
      let purchase = decodeLogEntry(data.result);
      if (data.result.removed) {
        purchase = reversePurchase(purchase);
      }
      await this.addPurchase(purchase, data.result.removed);
      await this.sendFundraiserUpdate();
    }
  }

  async sendFundraiserUpdate() {
    const [
      totalReceived, purchases, tokensSold,
    ] = await this.redisClient.mgetAsync(
      TOTAL_RECEIVED_KEY, PURCHASES_COUNT_KEY, TOTAL_SOLD_KEY);
    this.emit(TOTAL_RECEIVED_EVENT, { totalReceived, purchases, tokensSold });
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
    let newBalance = web3.toBigNumber(balance).plus(data.tokenAmount);
    if (newBalance.lt(0)) {
      newBalance = web3.toBigNumber(0);
    }
    await this.redisClient.hsetAsync(
      BALANCES_KEY, data.address, newBalance.toString(10));
  }
}

module.exports = Tracker;
