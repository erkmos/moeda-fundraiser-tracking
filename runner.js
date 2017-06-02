const forever = require('forever-monitor');
const logger = require('winston');

const child = new (forever.Monitor)('index.js', {
  max: 15,
  silent: false,
  args: [],
  env: process.env,
});

child.on('exit', () => {
  logger.warn('Program exited 5 times, giving up!');
});

child.start();
