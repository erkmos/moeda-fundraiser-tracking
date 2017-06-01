const _ = require('lodash');

module.exports = {
  isHeader(data) {
    return _.get(data, 'result.parentHash') !== undefined;
  },
  isLog(data) {
    return _.get(data, 'result.topics') !== undefined;
  },
  getBlockNumber(block) {
    let blockNum = _.get(block, 'result.number');
    if (!blockNum) {
      throw new Error('unable to get block number');
    }

    if (typeof blockNum !== 'number') {
      blockNum = blockNum.slice('2');
    }

    return parseInt(blockNum, 16);
  },
  isInvalidAddress(address) {
    return typeof address !== 'string' || address === null ||
      address === '' || address.slice(0, 2) !== '0x' ||
      address.length !== 42 || !address.match(/^0x[A-Fa-f0-9]{40}$/);
  },
};
