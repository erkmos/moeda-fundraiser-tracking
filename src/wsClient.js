const WebSocket = require('ws');
const logger = require('winston');

class WebsocketClient {
  constructor() {
    this.logger = logger;
    this.autoReconnectInterval = 5 * 1000;
    this.messageCount = 0;
  }

  open(url) {
    this.url = url;
    this.instance = new WebSocket(this.url);
    this.instance.on('open', () => {
      this.onopen();
    });

    this.instance.on('message', (data, flags) => {
      this.messageCount += 1;
      this.onmessage(data, flags, this.messageCount);
    });

    this.instance.on('close', (error) => {
      switch (error) {
        case 1000: // CLOSE_NORMAL
          console.log('WebSocket: closed');
          break;
        default: // Abnormal closure
          this.reconnect(error);
          break;
      }
      this.onclose(error);
    });

    this.instance.on('error', (error) => {
      switch (error.code) {
        case 'ECONNREFUSED':
          this.reconnect(error);
          break;
        default:
          this.onerror(error);
          break;
      }
    });
  }

  send(data, options) {
    try {
      this.instance.send(data, options);
    } catch (error) {
      this.instance.emit('error', error);
    }
  }

  reconnect(error) {
    this.logger.warn(
      `Websocket: retry in ${this.autoReconnectInterval}ms`, error.message);
    const that = this;
    if (this.retrying) return;

    this.retrying = setTimeout(() => {
      that.logger.info('Websocket: reconnecting...');
      that.open(that.url);
      that.retrying = undefined;
    }, this.autoReconnectInterval);
  }

  onopen() {
    this.logger.info('Websocket opened');
  }

  onmessage(data, flags, messageIndex) {
    this.logger.info(`Websocket message received ${data} ${messageIndex}`);
  }

  onerror(error) {
    this.logger.error('Websocket error', error.message);
  }

  onclose() {
    this.logger.info('Websocket closed');
  }
}

function create() {
  return new WebsocketClient();
}

module.exports = {
  WebsocketClient,
  create,
};
