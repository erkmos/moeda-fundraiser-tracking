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
      if (blockNum.slice(0, 2) === '0x') {
        blockNum = blockNum.slice('2');
      }
      return parseInt(blockNum, 16);
    }

    return parseInt(blockNum, 10);
  },
  isInvalidAddress(address) {
    return !web3.isAddress(address);
  },
  decodeRateUpdate(logEntry) {
    const [centsPerUsd, tokensPerEth] = [
      web3.toBigNumber(logEntry.data.slice(0, 66)),
      web3.toBigNumber(`0x${logEntry.data.slice(66, 130)}`),
    ];

    return { centsPerUsd, tokensPerEth };
  },
  decodeDonation(logEntry) {
    if (logEntry.data.length !== 130) {
      throw new Error(`invalid log data ${logEntry.data}`);
    }
    const [ethAmount, tokenAmount] = [
      web3.toBigNumber(logEntry.data.slice(0, 66)),
      web3.toBigNumber(`0x${logEntry.data.slice(66, 130)}`),
    ];
    const address = `0x${logEntry.topics[1].slice(26)}`;

    return { ethAmount, tokenAmount, address };
  },
  formatPurchase({ ethAmount, tokenAmount, address }) {
    return {
      ethAmount: ethAmount.toString('10'),
      tokenAmount: tokenAmount.toString('10'),
      address,
    };
  },
  reversePurchase(purchase) {
    return Object.assign(
      {}, purchase, {
        ethAmount: purchase.ethAmount.mul(-1),
        tokenAmount: purchase.tokenAmount.mul(-1) });
  },
};
