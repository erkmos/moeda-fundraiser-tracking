const _ = require('lodash');

module.exports = {
  isHeader(data) {
    return _.get(data, 'result.parentHash') !== undefined;
  },
  isLog(data) {
    return _.get(data, 'result.topics') !== undefined;
  },
  getBlockNumber(block) {
    return parseInt(_.get(block, 'result.number').slice(2), 16);
  },
  isInvalidAddress(address) {
    return typeof address !== 'string' || address === null ||
      address === '' ||
      (address.length % 2) !== 0 ||
      address.slice(0, 2) !== '0x' || address.length !== 42;
  },
};
