const Web3 = require('web3');
const EventEmitter = require('events');
const logger = require('./logger');
const {
  isHeader, isLog, getBlockNumber, isInvalidAddress, decodeDonation,
  formatPurchase, reversePurchase, decodeRateUpdate,
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
  DONATION_TOPIC,
  RATE_UPDATE_TOPIC,
  PAUSE_TOPIC,
  UNPAUSE_TOPIC,
  FINALISE_TOPIC,
  SALE_PAUSED_KEY,
  STATE_CHANGE_EVENT,
  SALE_FINALISED_KEY,
} = require('./constants');

const web3 = new Web3();

function handleRedisError(error) {
  logger.error(error.message);
}

class Tracker extends EventEmitter {
  constructor(
    redisClient, gethClient, address, startBlock) {
    super();
    this.redisClient = redisClient;
    this.gethClient = gethClient;
    this.address = address;
    this.startBlock = startBlock;
    this.updateBalance = this.updateBalance.bind(this);

    redisClient.on(ERROR_EVENT, handleRedisError);
  }

  async getLastBlockNumber() {
    const lastBlockNumber = await this.redisClient.getAsync(CURRENT_BLOCK_KEY);

    if (lastBlockNumber) {
      return lastBlockNumber;
    }

    if (lastBlockNumber === null && this.startBlock === undefined) {
      return 0;
    }

    return this.startBlock;
  }

  async start() {
    try {
      logger.info('Updating entries since last run...');
      const blockNumber = await this.getLastBlockNumber();

      const [
        totalReceived, currentBlock, numPurchases, tokensSold, exchangeRate,
      ] = await this.gethClient.fastForward(
          blockNumber,
          this.updateBalance,
          this.address);

      await this.updateTotalReceived(
        totalReceived, tokensSold);
      await this.redisClient.msetAsync(
        CURRENT_BLOCK_KEY, currentBlock,
        EXCHANGE_RATE_KEY, exchangeRate.toString('10'));
      await this.redisClient.incrbyAsync(PURCHASES_COUNT_KEY, numPurchases);
      logger.info('Done');
    } catch (error) {
      logger.error(error.message);
      throw error;
    }
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

  async incTotalReceived(amount, tokensSold) {
    await this.updateTotalReceived(amount, tokensSold);
    let donorCount = await this.redisClient.hlenAsync(BALANCES_KEY);
    if (donorCount === null) {
      donorCount = 0;
    }
    this.redisClient.setAsync(PURCHASES_COUNT_KEY, donorCount);
  }

  async getCurrentState() {
    const [
      totalReceived, currentBlock, exchangeRate,
      purchases, tokensSold, isPaused, isFinalised,
    ] = await this.redisClient.mgetAsync(
        TOTAL_RECEIVED_KEY,
        CURRENT_BLOCK_KEY,
        EXCHANGE_RATE_KEY,
        PURCHASES_COUNT_KEY,
        TOTAL_SOLD_KEY,
        SALE_PAUSED_KEY,
        SALE_FINALISED_KEY);

    return {
      totalReceived,
      currentBlock,
      exchangeRate,
      purchases,
      tokensSold,
      isPaused: !!isPaused,
      isFinalised: !!isFinalised,
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

  async updateExchangeRate({ centsPerUsd }) {
    await this.redisClient.setAsync(
      EXCHANGE_RATE_KEY, centsPerUsd.toString('10'));
    this.emit(NEW_EXCHANGE_RATE_EVENT, centsPerUsd.toString('10'));
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

  async handleDonation(log) {
    let purchase = decodeDonation(log);
    if (log.removed) {
      purchase = reversePurchase(purchase);
    }
    await this.addPurchase(purchase, log.removed);
    return this.sendFundraiserUpdate();
  }

  async handleEvent(log) {
    switch (log.topics[0]) {
      case DONATION_TOPIC:
        return this.handleDonation(log);
      case RATE_UPDATE_TOPIC:
        return this.updateExchangeRate(decodeRateUpdate(log));
      case PAUSE_TOPIC:
        this.emit(STATE_CHANGE_EVENT, { isPaused: true });
        return this.redisClient.setAsync(SALE_PAUSED_KEY, 1);
      case UNPAUSE_TOPIC:
        this.emit(STATE_CHANGE_EVENT, { isPaused: false });
        return this.redisClient.setAsync(SALE_PAUSED_KEY, 0);
      case FINALISE_TOPIC:
        this.emit(STATE_CHANGE_EVENT, { isFinalised: true });
        return this.redisClient.setAsync(SALE_FINALISED_KEY, 1);
      default:
        throw new Error(`unhandled event ${JSON.stringify(log)}`);
    }
  }

  async handleSubscription(data) {
    if (isHeader(data)) {
      const blockNumber = getBlockNumber(data);
      await this.updateBlock(blockNumber);
    } else if (isLog(data)) {
      return this.handleEvent(data.result);
    }

    return undefined;
  }

  async sendFundraiserUpdate() {
    const [
      totalReceived, purchases, tokensSold, isPaused, isFinalised,
    ] = await this.redisClient.mgetAsync(
        TOTAL_RECEIVED_KEY, PURCHASES_COUNT_KEY, TOTAL_SOLD_KEY,
        SALE_PAUSED_KEY, SALE_FINALISED_KEY);
    this.emit(TOTAL_RECEIVED_EVENT,
      { totalReceived, purchases, tokensSold, isPaused, isFinalised });
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
