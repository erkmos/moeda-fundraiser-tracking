const socket = require('socket.io-client');
const {
  CLIENT_BALANCE_RESULT,
  ERROR_EVENT,
  TOTAL_RECEIVED_EVENT,
  CLIENT_ACTION_EVENT,
} = require('./src/constants');

const client = socket('wss://ws.moeda.in');
client.on('connect', () => {
  console.log('connected to server');
  client.emit('balance', '0xd521e018e611e73c3b8d17d7f4359acd0ff22ea1');
});
client.on(CLIENT_ACTION_EVENT, (data) => console.log(data));
client.on(TOTAL_RECEIVED_EVENT, (data) => console.log(data));
client.on('disconnect', () => console.log('server disconnected'));
client.on(CLIENT_BALANCE_RESULT, (data) => console.log(data));
client.on(ERROR_EVENT, (error) => console.error(error));
