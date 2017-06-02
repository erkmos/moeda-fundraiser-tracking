const logger = require('../src/logger');
const _ = require('lodash');

describe('Logger', () => {
  it('should have log level methods', () => {
    _.each(
      ['info', 'error', 'debug', 'warn'],
      (level) => expect(logger[level]).not.toBeUndefined());
  });
});
