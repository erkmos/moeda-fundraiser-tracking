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

    this.on('message', (data, flags) => {
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
      `WebSocketClient: retry in ${this.autoReconnectInterval}ms`, error);
    const that = this;

    setTimeout(() => {
      that.logger.info('WebSocketClient: reconnecting...');
      that.open(that.url);
    }, this.autoReconnectInterval);
  }

  onopen() {
    this.logger.info('websocket opened');
  }

  onmessage(data, flags, messageIndex) {
    this.logger.info(`websocket message received ${data} ${messageIndex}`);
  }

  onerror(error) {
    this.logger.error('websocket error', error.message);
  }

  onclose() {
    this.logger.info('websocket closed');
  }
}

module.exports = WebsocketClient;
