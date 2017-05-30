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

async function main() {
  const trackerEvents = await tracker.start(
    '0x38980ccb7b83b1ab9bf15d2979e784f9f7f0461a',
    '0x12cb4648cf3058b17ceeb33e579f8b0bc269fe0843f3900b8e24b6c54871703c');

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

main();
