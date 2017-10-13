const Web3 = require('web3');

const web3 = new Web3();

module.exports = {
  BLOCK_EVENT: 'block',
  ERROR_EVENT: 'error',
  DATA_EVENT: 'data',
  TOTAL_RECEIVED_EVENT: 'update',
  NEW_PURCHASE_EVENT: 'purchase',
  NEW_EXCHANGE_RATE_EVENT: 'rate',
  STATE_CHANGE_EVENT: 'STATE_CHANGED',
  CLIENT_FUNDRAISER_UPDATE_ACTION: 'FUNDRAISER_UPDATE',
  CLIENT_NEW_PURCHASE_ACTION: 'NEW_PURCHASE',
  CLIENT_BALANCE_ERROR_EVENT: 'BALANCE_ERROR',
  CLIENT_BALANCE_RESULT: 'BALANCE',
  CLIENT_ACTION_EVENT: 'action',
  CLIENT_BALANCE_REQUEST: 'server/balance',
  CURRENT_BLOCK_KEY: 'currentBlock',
  BALANCES_KEY: 'balances',
  TOTAL_RECEIVED_KEY: 'totalReceived',
  PURCHASES_COUNT_KEY: 'purchases',
  EXCHANGE_RATE_KEY: 'exchangeRate',
  TOTAL_SOLD_KEY: 'tokensSold',
  SALE_PAUSED_KEY: 'isSalePaused',
  SALE_FINALISED_KEY: 'isSaleFinalised',
  DONATION_TOPIC: web3.sha3('LogDonation(address,uint256,uint256)'),
  RATE_UPDATE_TOPIC: web3.sha3('LogRateUpdate(uint256,uint256)'),
  PAUSE_TOPIC: web3.sha3('Pause()'),
  UNPAUSE_TOPIC: web3.sha3('Unpause()'),
  FINALISE_TOPIC: web3.sha3('LogFinalisation()'),
};
