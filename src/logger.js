const winston = require('winston');

winston.configure({
  transports: [
    new (winston.transports.Console)({
      level: 'info',
      timestamp() {
        return (new Date()).toISOString();
      },
      formatter(options) {
        // Return string will be passed to logger.
        return options.timestamp() + ' ' +
          options.level.toUpperCase() + ' '
          + (options.message ? options.message : '') +
          (options.meta && Object.keys(options.meta).length ? '\n\t' +
          JSON.stringify(options.meta) : '');
      },
    }),
  ],
});

module.exports = winston;
