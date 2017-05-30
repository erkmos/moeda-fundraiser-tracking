const request = require('request');
const EventEmitter = require('events');

async function getRate() {
  const options = {
    url: 'https://api.coinbase.com/v2/exchange-rates?currency=ETH',
    headers: { 'CB-VERSION': '2015-04-08' },
    json: true,
  };

  const rates = await new Promise((resolve, reject) => {
    request(options, (error, response, body) => {
      if (!error && response.statusCode === 200) {
        return resolve(body.data.rates);
      }

      return reject(error);
    });
  });

  return rates.BRL;
}

class ExchangeRate extends EventEmitter {
  constructor(updateInterval = 120 * 1000) {
    super();
    this.updateInterval = updateInterval;
  }

  getRate() {
    return getRate();
  }

  async updateRate() {
    const rate = await getRate();
    this.emit('data', rate);
  }

  start() {
    this.interval = setInterval(
      this.updateRate.bind(this), this.updateInterval);
  }

  stop() {
    clearInterval(this.interval);
    this.interval = undefined;
  }
}

module.exports = ExchangeRate;
