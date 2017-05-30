const tracker = require('./tracker');
const socket = require('socket.io');

async function main() {
  const events = await tracker.start(
    '0x38980ccb7b83b1ab9bf15d2979e784f9f7f0461a',
    '0x12cb4648cf3058b17ceeb33e579f8b0bc269fe0843f3900b8e24b6c54871703c');
  
  events.on('block', (height) => console.log('New block', height));
  events.on('error', (message) => console.error(message));
  events.on('purchase', (message) => console.log(message));
}

main();
