const _ = require('lodash');
const Web3 = require('web3');
const web3 = new Web3();

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
      return parseInt(blockNum, 16);
    }

    return parseInt(blockNum, 10);
  },
  isInvalidAddress(address) {
    return typeof address !== 'string' || address === null ||
      address === '' || address.slice(0, 2) !== '0x' ||
      address.length !== 42 || !address.match(/^0x[A-Fa-f0-9]{40}$/);
  },
  decodeLogEntry(logEntry) {
    const [ethAmount, tokenAmount] = [
      web3.toBigNumber(logEntry.data.slice(0, 66)),
      web3.toBigNumber(`0x${logEntry.data.slice(66, 130)}`),
    ];
    const address = `0x${logEntry.topics[1].slice(26)}`;

    return { ethAmount, tokenAmount, address };
  },
};
