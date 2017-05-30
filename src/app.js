const tracker = require('./tracker');
const io = require('socket.io')();

async function handleConnection(client) {
  try {
    const state = await tracker.getCurrentState();
    client.emit('update', state);
  } catch (error) {
    client.emit('error');
    return;
  }

  client.on('balance', async (address) => {
    const balance = await tracker.getBalance(address);
    client.emit('balance', { balance });
  });
}

async function run(contractAddress, topic) {
  const trackerEvents = await tracker.start(contractAddress, topic);

  io.on('connection', handleConnection);
  io.listen(3000, () => console.log('Listening on port 3000'));

  trackerEvents.on('error', (message) => console.error(message));
  trackerEvents.on('block', (height) => io.sockets.emit(
    'update', { blockNumber: height }));
  trackerEvents.on('purchase', (message) => console.log(message));
  trackerEvents.on('update', (total) => io.sockets.emit(
    'update', { totalReceived: total }));
  trackerEvents.on(
    'rate', (rate) => io.sockets.emit('update', { exchangeRate: rate }));
}

module.exports = {
  run,
};
