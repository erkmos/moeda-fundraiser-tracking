const { each } = require('lodash');
const utils = require('../src/utils');

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
        result: {
          number: '1',
        },
      };
      expect(typeof utils.getBlockNumber(data)).toBe('number');
    });

    it('should return blockNumber as number if number', () => {
      const data = {
        result: {
          number: 124,
        },
      };
      expect(typeof utils.getBlockNumber(data)).toBe('number');
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
});

function repeatBooleanTest(fn, cases, formatMessage, expected) {
  each(cases, (example) => {
    it(formatMessage(example), () => {
      expect(fn(example)).toBe(expected);
    });
  });
}
