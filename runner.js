const forever = require('forever-monitor');
const logger = require('winston');

const retries = 15;

const child = new (forever.Monitor)('index.js', {
  max: retries,
  silent: false,
  args: [],
  env: process.env,
});

child.on('exit', () => {
  logger.warn(`Program exited ${retries} times, giving up!`);
});

child.start();
