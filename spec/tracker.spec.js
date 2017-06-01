const redis = require('redis-mock');
const nock = require('nock');
const bluebird = require('bluebird');
const Tracker = require('../src/tracker');
const { BASE_URL } = require('../src/exchangeRate');
const winston = require('winston');
const URL = require('url').URL;
const utils = require('../src/utils');
const logEntry = require('./data/logEntry.json');
const blockHeader = require('./data/blockHeader.json');

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
        'error', jasmine.any(Function));
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
      const totalReceived = 15;
      const currentBlock = 19;

      spyOn(geth, 'fastForward').and.returnValue(Promise.resolve([
        totalReceived, currentBlock,
      ]));
      spyOn(redisClient, 'getAsync')
        .and.returnValue(Promise.resolve(lastBlock));
      spyOn(redisClient, 'setAsync').and.returnValue(Promise.resolve());

      const instance = new Tracker(redisClient, geth, address, topic);
      spyOn(instance, 'setupExchangeRater');
      spyOn(instance, 'updateBalance');
      spyOn(instance, 'incTotalReceived');
      spyOn(winston, 'info');

      await instance.start();

      expect(geth.fastForward).toHaveBeenCalledWith(
        lastBlock, jasmine.any(Function), address, topic);
      expect(instance.incTotalReceived).toHaveBeenCalledWith(totalReceived);
      expect(redisClient.setAsync).toHaveBeenCalledWith(
        'currentBlock', currentBlock);
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
        .reply(200, { data: { rates: { BRL: rate } } });

      await instance.setupExchangeRater();
      expect(instance.rater.start).toHaveBeenCalled();
      expect(instance.updateExchangeRate).toHaveBeenCalledWith(rate);
      expect(instance.rater.on).toHaveBeenCalledWith(
        'data', instance.updateExchangeRate);
    });
  });

  describe('incTotalReceived', () => {
    it('should add given amount to totalReceived', async () => {
      const client = asyncRedisFactory();
      const instance = new Tracker(client);

      client.set('totalReceived', '50');

      await instance.incTotalReceived('15');

      expect(await client.getAsync('purchases')).toEqual('1');
      expect(await client.getAsync('totalReceived')).toEqual('65');
    });
  });

  describe('getCurrentState', () => {
    it('should get current state', async () => {
      const client = asyncRedisFactory();
      const instance = new Tracker(client);
      client.set('totalReceived', '15');
      client.set('currentBlock', '1111');
      client.set('exchangeRate', '13.15');

      const {
        totalReceived, currentBlock, exchangeRate,
      } = await instance.getCurrentState();

      expect(totalReceived).toBe('15');
      expect(currentBlock).toBe('1111');
      expect(exchangeRate).toBe('13.15');
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
      client.hdel('balances', address);
    });

    it('should get balance for address if one exists', async () => {
      client.hset('balances', address, '5');
      const balance = await instance.getBalance(address);
      expect(balance).toBe('5');
    });

    it('should return zero if there is not entry for address', async () => {
      const balance = await instance.getBalance(address);
      expect(balance).toBe('0');
    });
  });

  describe('updateExchangeRate', () => {
    it('should update exchange rate and emit new rate', async () => {
      const client = asyncRedisFactory();
      const instance = new Tracker(client);
      spyOn(instance, 'emit');
      await instance.updateExchangeRate('15');

      expect(await client.getAsync('exchangeRate')).toBe('15');
      expect(instance.emit).toHaveBeenCalledWith('rate', '15');
    });
  });

  describe('updateBlock', () => {
    it('should persist given block number and emit block event', async () => {
      const client = asyncRedisFactory();
      const instance = new Tracker(client);
      const blockNumber = '5';
      spyOn(instance, 'emit');

      await instance.updateBlock(blockNumber);

      expect(instance.emit).toHaveBeenCalledWith('block', blockNumber);
      expect(await client.getAsync('currentBlock')).toBe(blockNumber);
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
        .toHaveBeenCalledWith(purchase.ethAmount);
    });

    it('should emit purchase event', async () => {
      await instance.addPurchase(purchase);
      expect(instance.emit).toHaveBeenCalledWith('purchase', purchase);
    });
  });

  describe('handleSubscription', () => {
    let client;
    let instance;

    beforeEach(() => {
      client = asyncRedisFactory();
      instance = new Tracker(client);
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

      await instance.handleSubscription({ result: logEntry });

      expect(instance.addPurchase).toHaveBeenCalledWith(purchase);
      expect(instance.sendFundraiserUpdate).toHaveBeenCalled();
    });
  });

  describe('sendFundraiserUpdate', () => {
    it('should pull data from env and emit update event', async () => {
      const client = asyncRedisFactory();
      const instance = new Tracker(client);
      const totalReceived = '15555555';
      client.set('totalReceived', totalReceived);
      spyOn(instance, 'emit');

      await instance.sendFundraiserUpdate();

      expect(instance.emit).toHaveBeenCalledWith('update', totalReceived);
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

      expect(instance.emit).toHaveBeenCalledWith('data', 'bengo');
    });

    it('should call handleSubscript for subscription update', () => {
      spyOn(instance, 'handleSubscription');

      instance.handleData({ method: 'eth_subscription', params: '123' });

      expect(instance.handleSubscription).toHaveBeenCalledWith('123');
    });

    it('should emit error if unrecognised message type', () => {
      instance.handleData({ boo: 'foo' });

      expect(instance.emit).toHaveBeenCalledWith(
        'error', 'unhandled message type {"boo":"foo"}');
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
      client.hset('balances', address, '15');
      await instance.updateBalance({ tokenAmount: '123', address });

      expect(await client.hgetAsync('balances', address)).toBe('138');
    });

    it('should set new balance if none exists', async () => {
      const address = '0x0124';
      await instance.updateBalance({ tokenAmount: '123', address });
      const newBalance = await client.hgetAsync('balances', address);

      expect(newBalance).toBe('123');
    });
  });
});

function asyncRedisFactory() {
  const client = redis.createClient();
  client.setAsync = bluebird.promisify(client.set);
  client.getAsync = bluebird.promisify(client.get);
  client.mgetAsync = bluebird.promisify(client.mget);
  client.hsetAsync = bluebird.promisify(client.hset);
  client.hgetAsync = bluebird.promisify(client.hget);
  client.on = jasmine.createSpy();

  return client;
}