const Web3 = require('web3');
const gethClient = require('../src/gethClient');
const Websocket = require('../src/wsClient');

describe('GethClient', () => {
  describe('connectWebSocket', () => {
    let fakeClient;
    beforeEach(() => {
      fakeClient = { open: null };
      spyOn(gethClient, 'reconnectListenerFactory');
      spyOn(Websocket, 'create').and.returnValue(fakeClient);
    });

    it('should setup websocket to geth server', async () => {
      const fakeHandleData = jasmine.createSpy();
      spyOn(fakeClient, 'open').and.callFake(() => {
        fakeClient.onopen();
      });
      const client = await gethClient.connectWebsocket(
        'host', 'port', fakeHandleData, 'address', 'topic');

      const prototype = Websocket.WebsocketClient.prototype;
      expect(client).not.toBeUndefined();
      expect(client).toBe(fakeClient);
      expect(client.onerror).not.toBe(prototype.error);
      expect(client.onmessage).not.toBe(prototype.onopen);
      expect(client.onopen).not.toBe(prototype.onopen);

      const data = { data: 'bar' };
      client.onmessage(JSON.stringify(data));

      expect(fakeHandleData).toHaveBeenCalledWith(data);
    });

    it('should reject on connection error', async () => {
      spyOn(fakeClient, 'open').and.callFake(() => {
        expect(fakeClient.onerror).toEqual(jasmine.any(Function));
        fakeClient.onerror(new Error('error'));
      });

      try {
        await gethClient.connectWebsocket(
        'host', 'port', 'handleData', 'address', 'topic');
        fail('should have thrown');
      } catch (error) {
        expect(error.message).toEqual('error');
      }
    });
  });

  describe('setupGeth', () => {
    it('should assign web3 instance', () => {
      spyOn(Web3.providers, 'HttpProvider');
      gethClient.setupGeth('host', 'port');
      expect(Web3.providers.HttpProvider).toHaveBeenCalledWith(
        'http://host:port', 60000);
    });
  });

  describe('fastForward', () => {
    it('should behave...');
  });
});
