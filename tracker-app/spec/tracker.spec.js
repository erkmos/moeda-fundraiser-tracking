const redis = require('redis-mock');
const nock = require('nock');
const bluebird = require('bluebird');
const Tracker = require('../src/tracker');
const winston = require('winston');
const URL = require('url').URL;
const utils = require('../src/utils');
const logEntry = require('./data/logEntry.json');
const Web3 = require('web3');
const blockHeader = require('./data/blockHeader.json');

const web3 = new Web3();
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
} = require('../src/constants');


let CLIENT_INSTANCE;

describe('Tracker', () => {
  let redisClient;

  beforeEach(() => {
    redisClient = redis.createClient;
    redisClient.on = jasmine.createSpy();
  });

  describe('constructor', () => {
    let instance;
    beforeEach(() => {
      instance = new Tracker(redisClient, 'foo', 'bar', 'baz');
    });

    it('should assign redisClient', () => {
      expect(instance.redisClient).toBe(redisClient);
    });

    it('should assign gethClient', () => {
      expect(instance.gethClient).toBe('foo');
    });

    it('should assign address', () => {
      expect(instance.address).toBe('bar');
    });

    it('should assign topic', () => {
      expect(instance.topic).toBe('baz');
    });

    it('should assign rater', () => {
      expect(instance.rater).not.toBeUndefined();
    });

    it('should assign error event handler', () => {
      expect(redisClient.on).toHaveBeenCalledWith(
        ERROR_EVENT, jasmine.any(Function));
    });
  });

  describe('start', () => {
    it('should update events from latest block and block number', async () => {
      const geth = jasmine.createSpy();
      geth.fastForward = null;
      const redisClient = asyncRedisFactory();
      const address = 'address';
      const topic = 'topic';
      const lastBlock = 5;
      const totalReceived = web3.toBigNumber(15);
      const currentBlock = 19;
      const startBlock = 0;
      const numPurchases = 15;
      const tokensSold = web3.toBigNumber('1500');

      spyOn(geth, 'fastForward').and.returnValue(Promise.resolve([
        totalReceived, currentBlock, numPurchases, tokensSold,
      ]));
      spyOn(redisClient, 'getAsync')
        .and.returnValue(Promise.resolve(lastBlock));
      spyOn(redisClient, 'msetAsync').and.returnValue(Promise.resolve());

      const instance = new Tracker(
        redisClient, geth, address, topic, startBlock);
      spyOn(instance, 'setupExchangeRater');
      spyOn(instance, 'updateBalance');
      spyOn(instance, 'incTotalReceived');
      spyOn(winston, 'info');

      await instance.start();

      expect(geth.fastForward).toHaveBeenCalledWith(
        lastBlock, jasmine.any(Function), address, topic);
      expect(instance.incTotalReceived).toHaveBeenCalledWith(
        totalReceived, tokensSold);
      expect(redisClient.msetAsync).toHaveBeenCalledWith(
        PURCHASES_COUNT_KEY, numPurchases, CURRENT_BLOCK_KEY, currentBlock);
      expect(winston.info.calls.argsFor(0)).toEqual(
        ['Updating entries since last run...']);
      expect(winston.info.calls.argsFor(1)).toEqual(['Done']);
    });
  });

  describe('setupExchangeRater', () => {
    it('should fetch rate and start exchange background task', async () => {
      const instance = new Tracker({ on: jasmine.createSpy() });
      spyOn(instance, 'updateExchangeRate');
      spyOn(instance.rater, 'start');
      spyOn(instance.rater, 'on');

      const rate = 5;
      const url = new URL(BASE_URL);
      nock(url.origin)
        .get(`${url.pathname}?${url.searchParams.toString()}`)
        .reply(200, { data: { rates: { USD: rate } } });

      await instance.setupExchangeRater();
      expect(instance.rater.start).toHaveBeenCalled();
      expect(instance.updateExchangeRate).toHaveBeenCalledWith(rate);
      expect(instance.rater.on).toHaveBeenCalledWith(
        DATA_EVENT, instance.updateExchangeRate);
    });
  });

  describe('incTotalReceived', () => {
    it('should add given amount to totalReceived', async () => {
      const client = asyncRedisFactory();
      const instance = new Tracker(client);

      client.set(TOTAL_RECEIVED_KEY, '50');

      await instance.incTotalReceived('15', '17');

      expect(await client.getAsync('purchases')).toEqual('1');
      expect(await client.getAsync(TOTAL_RECEIVED_KEY)).toEqual('65');
    });
  });

  describe('getCurrentState', () => {
    it('should get current state', async () => {
      const client = asyncRedisFactory();
      const instance = new Tracker(client);
      client.set(TOTAL_RECEIVED_KEY, '15');
      client.set(CURRENT_BLOCK_KEY, '1111');
      client.set(EXCHANGE_RATE_KEY, '13.15');
      client.set(PURCHASES_COUNT_KEY, 0);
      client.incr(PURCHASES_COUNT_KEY);

      const {
        totalReceived, currentBlock, exchangeRate, purchases,
      } = await instance.getCurrentState();

      expect(totalReceived).toBe('15');
      expect(currentBlock).toBe('1111');
      expect(exchangeRate).toBe('13.15');
      expect(purchases).toBe('1');
    });
  });

  describe('getBalance', () => {
    let client;
    let instance;
    const address = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

    beforeEach(() => {
      client = asyncRedisFactory();
      instance = new Tracker(client);
    });

    afterEach(() => {
      client.hdel(BALANCES_KEY, address);
    });

    it('should get balance for address if one exists', async () => {
      client.hset(BALANCES_KEY, address, '5');
      const balance = await instance.getBalance(address);
      expect(balance).toBe('5');
    });

    it('should return zero if there is not entry for address', async () => {
      const balance = await instance.getBalance(address);
      expect(balance).toBe('0');
    });

    it('should throw if address is invalid', async () => {
      try {
        await instance.getBalance('barf');
        fail('should have thrown');
      } catch (error) {
        expect(error.message).toBe('invalid address');
      }
    });
  });

  describe('updateExchangeRate', () => {
    it('should update exchange rate and emit new rate', async () => {
      const client = asyncRedisFactory();
      const instance = new Tracker(client);
      spyOn(instance, 'emit');
      await instance.updateExchangeRate('15');

      expect(await client.getAsync(EXCHANGE_RATE_KEY)).toBe('15');
      expect(instance.emit).toHaveBeenCalledWith(NEW_EXCHANGE_RATE_EVENT, '15');
    });
  });

  describe('updateBlock', () => {
    it('should persist given block number and emit block event', async () => {
      const client = asyncRedisFactory();
      const instance = new Tracker(client);
      const blockNumber = '5';
      spyOn(instance, 'emit');

      await instance.updateBlock(blockNumber);

      expect(instance.emit).toHaveBeenCalledWith(BLOCK_EVENT, blockNumber);
      expect(await client.getAsync(CURRENT_BLOCK_KEY)).toBe(blockNumber);
    });
  });

  describe('addPurchase', () => {
    let client;
    let instance;
    let purchase;

    beforeEach(() => {
      purchase = utils.decodeLogEntry(logEntry);
      client = asyncRedisFactory();
      instance = new Tracker(client);
      spyOn(instance, 'emit');
      spyOn(instance, 'updateBalance').and.returnValue(Promise.resolve());
      spyOn(instance, 'incTotalReceived').and.returnValue(Promise.resolve());
    });

    it('should update balance', async () => {
      await instance.addPurchase(purchase);

      expect(instance.updateBalance).toHaveBeenCalledWith(purchase);
    });

    it('should increment total received', async () => {
      await instance.addPurchase(purchase);

      expect(instance.incTotalReceived)
        .toHaveBeenCalledWith(
          purchase.ethAmount, purchase.tokenAmount, undefined);
    });

    it('should emit purchase event', async () => {
      await instance.addPurchase(purchase);
      expect(instance.emit).toHaveBeenCalledWith(
        NEW_PURCHASE_EVENT, utils.formatPurchase(purchase));
    });
  });

  describe('handleSubscription', () => {
    let client;
    let instance;

    beforeEach(() => {
      client = asyncRedisFactory();
      instance = new Tracker(client, null, null, logEntry.topics[0], 0);
    });

    it('should update block number if header', async () => {
      spyOn(instance, 'updateBlock').and.returnValue(Promise.resolve());
      await instance.handleSubscription({ result: blockHeader });

      expect(instance.updateBlock).toHaveBeenCalledWith(blockHeader.number);
    });

    it('should add purchase and send update if log entry', async () => {
      const purchase = utils.decodeLogEntry(logEntry);
      spyOn(instance, 'addPurchase').and.returnValue(Promise.resolve());
      spyOn(instance, 'sendFundraiserUpdate')
        .and.returnValue(Promise.resolve());
      const data = { result: logEntry };
      expect(instance.isSubscribed(data)).toBe(true);

      await instance.handleSubscription(data);

      expect(instance.addPurchase).toHaveBeenCalledWith(purchase, undefined);
      expect(instance.sendFundraiserUpdate).toHaveBeenCalled();
    });
  });

  describe('sendFundraiserUpdate', () => {
    it('should pull data from env and emit update event', async () => {
      const client = asyncRedisFactory();
      const instance = new Tracker(client);
      const totalReceived = '15555555';
      const tokensSold = '1233';
      const purchases = '1';
      client.set(TOTAL_RECEIVED_KEY, totalReceived);
      client.set(TOTAL_SOLD_KEY, tokensSold);
      spyOn(instance, 'emit');

      await instance.sendFundraiserUpdate();

      expect(instance.emit).toHaveBeenCalledWith(
        TOTAL_RECEIVED_EVENT, { totalReceived, purchases, tokensSold });
    });
  });

  describe('handleData', () => {
    let instance;
    let client;

    beforeEach(() => {
      client = asyncRedisFactory();
      instance = new Tracker(client);
      spyOn(instance, 'emit');
    });

    it('should emit data event for rpc result', () => {
      instance.handleData({ result: 'bengo' });

      expect(instance.emit).toHaveBeenCalledWith(DATA_EVENT, 'bengo');
    });

    it('should call handleSubscript for subscription update', () => {
      spyOn(instance, 'handleSubscription');

      instance.handleData({ method: 'eth_subscription', params: '123' });

      expect(instance.handleSubscription).toHaveBeenCalledWith('123');
    });

    it('should emit error if unrecognised message type', () => {
      instance.handleData({ boo: 'foo' });

      expect(instance.emit).toHaveBeenCalledWith(
        ERROR_EVENT, 'unhandled message type {"boo":"foo"}');
    });
  });

  describe('updateBalance', () => {
    let instance;
    let client;

    beforeEach(() => {
      client = asyncRedisFactory();
      instance = new Tracker(client);
    });

    it('should update current balance if one exists', async () => {
      const address = '0x0123';
      client.hset(BALANCES_KEY, address, '15');
      await instance.updateBalance({ tokenAmount: '123', address });

      expect(await client.hgetAsync(BALANCES_KEY, address)).toBe('138');
    });

    it('should set balance to zero if new one would be negative',
    async () => {
      const address = '0x0125';
      client.hset('balances', address, '12');
      await instance.updateBalance({ tokenAmount: '-123', address });
      const newBalance = await client.hgetAsync(BALANCES_KEY, address);

      expect(newBalance).toBe('0');
    });

    it('should reduce current balance if negative', async () => {
      const address = '0x0127';
      client.hset('balances', address, '125');
      await instance.updateBalance({ tokenAmount: '-123', address });
      const newBalance = await client.hgetAsync(BALANCES_KEY, address);

      expect(newBalance).toBe('2');
    });

    it('should set new balance if none exists', async () => {
      const address = '0x0124';
      await instance.updateBalance({ tokenAmount: '123', address });
      const newBalance = await client.hgetAsync(BALANCES_KEY, address);

      expect(newBalance).toBe('123');
    });
  });
});

function asyncRedisFactory() {
  if (!CLIENT_INSTANCE) {
    CLIENT_INSTANCE = redis.createClient();
    const client = CLIENT_INSTANCE;
    client.mset = (k1, v1, k2, v2, cb) => {
      client.set(k1, v1, () => {
        client.set(k2, v2, cb);
      });
    };
    client.setAsync = bluebird.promisify(client.set);
    client.getAsync = bluebird.promisify(client.get);
    client.msetAsync = bluebird.promisify(client.mset);
    client.mgetAsync = bluebird.promisify(client.mget);
    client.hsetAsync = bluebird.promisify(client.hset);
    client.hgetAsync = bluebird.promisify(client.hget);
    client.on = jasmine.createSpy();
  }

  return CLIENT_INSTANCE;
}
