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
        return [
          options.timestamp(),
          options.level.toUpperCase(),
          getMessage(options),
          getMeta(options),
        ].join(' ');
      },
    }),
  ],
});

function getMessage({ message }) {
  if (message !== undefined) {
    return message;
  }

  return '';
}

function getMeta({ meta }) {
  if (meta !== undefined && Object.keys(meta).length > 0) {
    return `\n\t${JSON.stringify(meta)}`;
  }

  return '';
}

module.exports = winston;
