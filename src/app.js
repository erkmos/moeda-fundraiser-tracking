const tracker = require('./tracker');
const io = require('socket.io')();
const logger = require('./logger');

async function handleClientAction(client, action) {
  const result = { type: null };

  switch (action.type) {
    case 'server/balance':
      result.data = await tracker.getBalance(action.data);
      result.type = 'balance';
      break;
    default:
      return;
  }

  client.emit('action', result);
}

async function handleConnection(client) {
  try {
    const state = await tracker.getCurrentState();
    client.emit('update', state);
  } catch (error) {
    client.emit('error');
    return;
  }

  client.on('action', handleClientAction.bind(null, client));
}

function makeAction(data) {
  return { type: 'FUNDRAISER_UPDATE', data };
}

async function run(contractAddress, topic) {
  const trackerEvents = await tracker.start(contractAddress, topic);

  io.on('connection', handleConnection);
  io.listen(3000, () => logger.info('Listening on port 3000'));

  trackerEvents.on('error', (message) => logger.error(message));
  trackerEvents.on('purchase', (message) => logger.info(message));
  trackerEvents.on(
    'block',
    (height) => io.sockets.emit('action', makeAction({ blockNumber: height })));
  trackerEvents.on(
    'update',
    (total) => io.sockets.emit('action', makeAction({ totalReceived: total })));
  trackerEvents.on(
    'rate',
    (rate) => io.sockets.emit('action', makeAction({ exchangeRate: rate })));
}

module.exports = {
  run,
};
