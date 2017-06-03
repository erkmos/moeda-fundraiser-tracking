const App = require('./src/app').App;
const logger = require('./src/logger');
const _ = require('lodash');

function missingEnvVars() {
  return _.isUndefined(process.env.CONTRACT_ADDRESS) ||
    _.isUndefined(process.env.CONTRACT_TOPIC);
}

function getConfig() {
  if (missingEnvVars()) {
    throw new Error('Missing CONTRACT_ADDRESS and/or CONTRACT_TOPIC in env!');
  }
  return {
    address: process.env.CONTRACT_ADDRESS,
    topic: process.env.CONTRACT_TOPIC,
    redisHost: process.env.REDIS_HOST || '127.0.0.1',
    redisPort: process.env.REDIS_PORT || 6379,
    gethHost: process.env.GETH_HOST || '127.0.0.1',
    gethRpcPort: process.env.GETH_RPC_PORT || 8545,
    gethWsPort: process.env.GETH_WS_PORT || 8546,
    startBlock: process.env.START_BLOCK,
  };
}

async function main() {
  try {
    const app = new App();
    await app.run(getConfig());
  } catch (error) {
    logger.error('Failed to start tracker:', error.message);
    process.exit(1);
  }
}

main();
