const Web3 = require('web3');
const EventEmitter = require('events');
const ExchangeRate = require('./exchangeRate');
const logger = require('./logger');
const {
  isHeader, isLog, getBlockNumber, isInvalidAddress, decodeLogEntry,
} = require('./utils');

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

    redisClient.on('error', errorHandler);
  }

  async start() {
    try {
      logger.info('Updating entries since last run...');
      const lastBlockNumber = await this.redisClient.getAsync('currentBlock');
      const [totalReceived, currentBlock] = await this.gethClient.fastForward(
        lastBlockNumber,
        this.updateBalance.bind(this),
        this.address,
        this.topic);

      await this.incTotalReceived(totalReceived);
      await this.redisClient.setAsync('currentBlock', currentBlock);
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
    this.rater.on('data', this.updateExchangeRate);
  }

  async incTotalReceived(amount) {
    const totalReceived = await this.redisClient.getAsync('totalReceived');
    const newTotal = web3.toBigNumber(amount).plus(totalReceived || 0);
    await this.redisClient.setAsync(
      'totalReceived', newTotal.toString('10'));
    this.redisClient.incr('purchases');
  }

  async getCurrentState() {
    const [
      totalReceived, currentBlock, exchangeRate,
    ] = await this.redisClient.mgetAsync(
      'totalReceived', 'currentBlock', 'exchangeRate');

    return { totalReceived, currentBlock, exchangeRate };
  }

  async getBalance(address) {
    if (isInvalidAddress(address)) {
      return undefined;
    }

    try {
      const balance = await this.redisClient.hgetAsync('balances', address);
      return web3.toBigNumber(balance || 0).toString('10');
    } catch (error) {
      return 'error';
    }
  }

  async updateExchangeRate(rate) {
    await this.redisClient.setAsync('exchangeRate', rate);
    this.emit('rate', rate);
  }

  async updateBlock(number) {
    await this.redisClient.setAsync('currentBlock', number);
    this.emit('block', number);
  }

  async addPurchase(purchase) {
    await this.updateBalance(purchase);
    await this.incTotalReceived(purchase.ethAmount);
    this.emit('purchase', purchase);
  }

  async handleSubscription(data) {
    if (isHeader(data)) {
      const blockNumber = getBlockNumber(data);
      await this.updateBlock(blockNumber);
    } else if (isLog(data)) {
      const purchase = decodeLogEntry(data.result);
      await this.addPurchase(purchase);
      await this.sendFundraiserUpdate();
    }
  }

  async sendFundraiserUpdate() {
    const totalReceived = await this.redisClient.getAsync('totalReceived');
    this.emit('update', totalReceived);
  }

  handleData(entry) {
    if (entry.result) {
      this.emit('data', entry.result);
    } else if (entry.method === 'eth_subscription' || entry.subscription) {
      this.handleSubscription(entry.params);
    } else {
      this.emit('error', `unhandled message type ${JSON.stringify(entry)}`);
    }
  }

  async updateBalance(data) {
    let balance = await this.redisClient.hgetAsync('balances', data.address);

    if (balance === null) {
      balance = 0;
    }
    const newBalance = web3.toBigNumber(balance).plus(data.tokenAmount);
    await this.redisClient.hsetAsync(
      'balances', data.address, newBalance.toString(10));
  }
}

module.exports = Tracker;
