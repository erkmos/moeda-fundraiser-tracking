const app = require('../src/app');
const io = require('socket.io');
const logger = require('winston');
const gethClient = require('../src/gethClient');
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
  CLIENT_BALANCE_REQUEST
} = require('../src/constants');

describe('App', () => {
  describe('handleClientAction', () => {
    let fakeClient;
    beforeEach(() => {
      fakeClient = jasmine.createSpyObj('client', ['emit']);
    });

    it('should emit new balance on balance action', async () => {
      const fakeTracker = { getBalance: null };
      const balance = '12';
      spyOn(fakeTracker, 'getBalance')
        .and.returnValue(Promise.resolve(balance));
      const payload = { type: CLIENT_BALANCE_REQUEST, data: '0x123' };

      await app.handleClientAction(fakeTracker, fakeClient, payload);

      expect(fakeTracker.getBalance).toHaveBeenCalledWith(payload.data);
      expect(fakeClient.emit).toHaveBeenCalledWith(
        CLIENT_ACTION_EVENT, { type: CLIENT_BALANCE_RESULT, data: balance });
    });

    it('should emit generic error on exception', async () => {
      const fakeTracker = { getBalance: null };
      const payload = { type: CLIENT_BALANCE_REQUEST, data: '0x123' };
      spyOn(fakeTracker, 'getBalance')
        .and.returnValue(Promise.reject(new Error('boogie')));

      try {
        await app.handleClientAction(fakeTracker, fakeClient, payload);
      } catch (error) {
        fail('should not have thrown')
      }

      expect(fakeClient.emit).toHaveBeenCalledWith(
        CLIENT_ACTION_EVENT,
        { type: CLIENT_BALANCE_ERROR_EVENT, data: 'request error' });
    });

    it('should not emit on unrecognized event', async () => {
      await app.handleClientAction(null, fakeClient, { type: 'foo' });

      expect(fakeClient.emit).not.toHaveBeenCalled();
    });
  });

  describe('handleConnection', () => {
    let fakeClient;
    beforeEach(() => {
      fakeClient = jasmine.createSpyObj('client', ['on', 'emit']);
    });

    it('should emit state update on connect', async () => {
      const fakeTracker = { getCurrentState: null };
      spyOn(fakeTracker, 'getCurrentState')
        .and.returnValue(Promise.resolve('foo'));

      await app.handleConnection(fakeTracker, fakeClient);

      expect(fakeClient.emit).toHaveBeenCalledWith(TOTAL_RECEIVED_EVENT, 'foo');
    });

    it('should emit error event on exception', async () => {
      const fakeTracker = { getCurrentState: null };
      spyOn(fakeTracker, 'getCurrentState')
        .and.returnValue(Promise.reject(new Error('foo')));

      await app.handleConnection(fakeTracker, fakeClient);
      expect(fakeClient.emit).toHaveBeenCalledWith(
        ERROR_EVENT, 'failed to get state');
    });

    it('should bind event listener for client actions', async () => {
      const fakeTracker = { getCurrentState: null };
      spyOn(fakeTracker, 'getCurrentState')
        .and.returnValue(Promise.resolve('foo'));

      await app.handleConnection(fakeTracker, fakeClient);

      expect(fakeClient.on).toHaveBeenCalledWith(
        CLIENT_ACTION_EVENT, jasmine.any(Function));
    });
  });

  describe('fundraiserUpdate', () => {
    it('should return a new action object', () => {
      expect(app.fundraiserUpdate('foo')).toEqual({
        type: CLIENT_FUNDRAISER_UPDATE_ACTION, data: 'foo',
      });
    });
  });


  describe('newPurchase', () => {
    it('should return a new action object', () => {
      expect(app.newPurchase('foo')).toEqual({
        type: CLIENT_NEW_PURCHASE_ACTION, data: 'foo',
      });
    });
  });

  describe('instance', () => {
    let instance;
    let fakeTracker;
    let fakeIo;

    beforeEach(() => {
      instance = new app.App();
      fakeIo = jasmine.createSpyObj(
        'SocketIO', ['on', 'listen', 'emit']);
      fakeIo.sockets = null;
      fakeTracker = {
        on: jasmine.createSpy(), start: null, handleData: jasmine.createSpy(),
      };
      spyOn(fakeTracker, 'start').and.returnValue(Promise.resolve());
      fakeIo.sockets = jasmine.createSpyObj('sockets', ['emit']);
      spyOn(instance, 'setupSocket').and.callFake(() => {
        instance.io = fakeIo;
      });
      spyOn(instance, 'setupTracker').and.callFake(() => {
        instance.tracker = fakeTracker;
      });
    });

    describe('run', () => {
      let config;

      beforeEach(async () => {
        spyOn(gethClient, 'setupGeth');
        spyOn(gethClient, 'connectWebsocket')
          .and.returnValue(Promise.resolve());
        spyOn(instance, 'startServer');

        config = {
          address: 'address',
          topic: 'topic',
          redisHost: '127.0.0.1',
          redisPort: 6379,
          gethHost: '127.0.0.1',
          gethRpcPort: 8545,
          gethWsPort: 8546,
        };

        await instance.run(config, gethClient);
      });

      it('should set up gethClient', () => {
        expect(gethClient.setupGeth).toHaveBeenCalledWith(
          config.gethHost, config.gethRpcPort);
      });

      it('should set up tracker', () => {
        expect(instance.setupTracker).toHaveBeenCalledWith(config);
        expect(fakeTracker.start).toHaveBeenCalled();
      });

      it('should start server', () => {
        expect(instance.startServer).toHaveBeenCalledWith(fakeTracker);
      });
    });

    describe('startServer', () => {
      beforeEach(() => {
        spyOn(instance, 'emitAction');
        instance.startServer(fakeTracker);
      });

      it('should set up socket', () => {
        expect(instance.setupSocket).toHaveBeenCalled();
        expect(instance.io).toBe(fakeIo);
        expect(instance.io.on).toHaveBeenCalledWith(
          'connection', jasmine.any(Function));

        expect(instance.io.listen).toHaveBeenCalledWith(
          3000, jasmine.any(Function));
        const callback = instance.io.listen.calls.argsFor(0)[1];
        spyOn(logger, 'info');
        callback();
        expect(logger.info).toHaveBeenCalledWith('Listening on port 3000');
      });

      it('should set up tracker error listener', () => {
        expect(fakeTracker.on).toHaveBeenCalledWith(
          ERROR_EVENT, jasmine.any(Function));
        const callback = fakeTracker.on.calls.argsFor(0)[1];
        spyOn(logger, 'error');
        callback('message');
        expect(logger.error).toHaveBeenCalledWith('message');
      });

      it('should set tracker new purchase listener', () => {
        expect(fakeTracker.on).toHaveBeenCalledWith(
          NEW_PURCHASE_EVENT, jasmine.any(Function));
      });

      it('should set up tracker new block event listener', () => {
        expect(fakeTracker.on).toHaveBeenCalledWith(
          BLOCK_EVENT, jasmine.any(Function));
      });

      it('should set up fundraiser total received update listener', () => {
        expect(fakeTracker.on).toHaveBeenCalledWith(
          TOTAL_RECEIVED_EVENT, jasmine.any(Function));
      });

      it('should set up tracker exchange rate listener', () => {
        expect(fakeTracker.on).toHaveBeenCalledWith(
          NEW_EXCHANGE_RATE_EVENT, jasmine.any(Function));
      });
    });

    describe('emitAction', () => {
      it('should broadcast event', () => {
        const payload = { type: 'foo', data: 'bar' };
        instance.io = fakeIo;
        instance.emitAction(payload);

        expect(instance.io.sockets.emit).toHaveBeenCalledWith(
          CLIENT_ACTION_EVENT, payload);
      });
    });
  });
});
