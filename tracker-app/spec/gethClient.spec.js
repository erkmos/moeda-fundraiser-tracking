const Web3 = require('web3');
const gethClient = require('../src/gethClient');

describe('GethClient', () => {
  describe('connectWebSocket', () => {
    it('should setup websocket to geth server');
    it('should reject on connection error');
  });

  describe('setupGeth', () => {
    it('should assign web3 instance', () => {
      spyOn(Web3.providers, 'HttpProvider');
      gethClient.setupGeth('host', 'port');
      expect(Web3.providers.HttpProvider).toHaveBeenCalledWith(
        'http://host:port');
    });
  });

  describe('fastForward', () => {
    it('should behave...');
  });
});
