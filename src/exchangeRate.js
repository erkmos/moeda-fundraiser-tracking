const request = require('request-promise-native');
const EventEmitter = require('events');
const _ = require('lodash');
const logger = require('./logger');

const BASE_URL = 'https://api.coinbase.com/v2/exchange-rates?currency=ETH';

async function getRate() {
  const options = {
    headers: { 'CB-VERSION': '2015-04-08' },
    json: true,
  };

  const response = await request.get(BASE_URL, options);

  return _.get(response, 'data.rates.BRL');
}

class Updater extends EventEmitter {
  constructor(updateInterval = 120 * 1000) {
    super();
    this.updateInterval = updateInterval;
  }

  async updateRate() {
    try {
      const rate = await getRate();

      if (rate) {
        this.emit('data', rate);
      }
    } catch (error) {
      logger.error(`updateRate failed: ${error.message}`);
    }
  }

  start() {
    this.interval = setInterval(
      this.updateRate.bind(this),
      this.updateInterval);
  }

  stop() {
    clearInterval(this.interval);
    this.interval = undefined;
  }
}

module.exports = {
  Updater,
  getRate,
  BASE_URL,
};
