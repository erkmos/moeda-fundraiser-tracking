const { each } = require('lodash');
const utils = require('../src/utils');
const logEntry = require('./data/logEntry.json');
const blockHeader = require('./data/blockHeader.json');
const Web3 = require('web3');
const web3 = new Web3();

describe('utils', () => {
  describe('isHeader', () => {
    it('should return true if object has parentHash prop', () => {
      const data = {
        result: {
          parentHash: '0x1241241',
        },
      };

      expect(utils.isHeader(data)).toBe(true);
    });

    it('should return false if object has no parentHash prop', () => {
      expect(utils.isHeader({})).toBe(false);
    });
  });

  describe('isLog', () => {
    it('should return true if data has topics', () => {
      const data = {
        result: {
          topics: ['0x1241241', '0x125151'],
        },
      };

      expect(utils.isLog(data)).toBe(true);
    });

    it('should return false if data has no topics', () => {
      expect(utils.isLog({})).toBe(false);
    });
  });

  describe('getBlockNumber', () => {
    it('should return blockNumber as number if string', () => {
      const data = {
        result: blockHeader,
      };

      const result = utils.getBlockNumber(data);
      expect(typeof result).toBe('number');
      expect(result).toBe(155);
    });

    it('should return blockNumber as number if number', () => {
      const data = {
        result: {
          number: '0x133',
        },
      };

      const result = utils.getBlockNumber(data);
      expect(typeof result).toBe('number');
      expect(result).toBe(307);
    });

    it('should throw if there is no block number', () => {
      try {
        utils.getBlockNumber(undefined);
        fail('should have thrown');
      } catch (error) {
        expect(error.message).toBe('unable to get block number');
      }
    });
  });

  describe('isInvalidAddress', () => {
    repeatBooleanTest(
      utils.isInvalidAddress,
      [
        '',
        null,
        undefined,
        [],
        NaN,
        0xD8775F648430679A709E98d2b0Cb6250d2887EF,
        '0x123',
        '0x12',
        '0x0D8775F648430679A709E98d2b0Cb6250d2887Ek',
        '000D8775F648430679A709E98d2b0Cb6250d2887EF',
      ],
      (example) => `should return true if address is ${example}`,
      true);

    repeatBooleanTest(
      utils.isInvalidAddress,
      ['0x0D8775F648430679A709E98d2b0Cb6250d2887EF'],
      (example) => `should return false if address is ${example}`,
      false);
  });

  describe('decodeLogEntry', () => {
    it('should get amounts and address', () => {
      const result = utils.decodeLogEntry(logEntry);

      expect(result.ethAmount.toString('10'))
        .toEqual(web3.toBigNumber('0xde0b6b3a7640000').toString('10'));
      expect(result.tokenAmount.toString('10'))
        .toEqual(web3.toBigNumber('0x8ac7230489e800000').toString('10'));
      expect(result.address)
        .toEqual('0x001d8d7dd820e22ce63e6d86d4a48346ba13c154');
    });
  });

  describe('formatPurchase', () => {
    it('should stringify amounts', () => {
      const data = {
        ethAmount: web3.toBigNumber(123),
        tokenAmount: web3.toBigNumber(1234),
        address: 'abc',
      };
      const result = utils.formatPurchase(data);
      expect(result).toEqual({
        ethAmount: '123',
        tokenAmount: '1234',
        address: 'abc',
      });
    });
  });
});

function repeatBooleanTest(fn, cases, formatMessage, expected) {
  each(cases, (example) => {
    it(formatMessage(example), () => {
      expect(fn(example)).toBe(expected);
    });
  });
}
