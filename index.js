const app = require('./src/app');
const logger = require('./src/logger');

async function main() {
  try {
    await app.run(
      '0x38980ccb7b83b1ab9bf15d2979e784f9f7f0461a',
      '0x12cb4648cf3058b17ceeb33e579f8b0bc269fe0843f3900b8e24b6c54871703c');
  } catch (error) {
    logger.error('Failed to start tracker:', error.message);
  }
}

main();
