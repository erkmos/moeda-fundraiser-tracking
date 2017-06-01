const nock = require('nock');
const URL = require('url').URL;
const winston = require('winston');
const { Updater, getRate, BASE_URL } = require('../src/exchangeRate');

describe('ExchangeRate', () => {
  describe('Updater', () => {
    describe('constructor', () => {
      it('should assign updateInterval', () => {
        const updater = new Updater(12345);
        expect(updater.updateInterval).toBe(12345);
      });

      it('should assign default value for updateInterval', () => {
        const updater = new Updater();
        expect(updater.updateInterval).toBe(120 * 1000);
      });
    });

    describe('updateRate', () => {
      describe('successful request', () => {
        it('should emit exchange rate', (done) => {
          const body = {
            data: {
              rates: {
                BRL: '123.45',
              },
            },
          };

          stubRequest(200, body);

          const updater = new Updater(50);
          spyOn(updater, 'emit').and.callFake((name, rate) => {
            expect(rate).toBe('123.45');
            updater.stop();
            done();
          });

          updater.start();
        });

        it('should not emit when data is empty', async () => {
          const updater = new Updater(10);
          spyOn(updater, 'emit');

          stubRequest(200, null);
          await updater.updateRate();

          expect(updater.emit).not.toHaveBeenCalled();
        });

        it('should log errors', async () => {
          const updater = new Updater(10);
          spyOn(updater, 'emit');
          spyOn(winston, 'error');

          stubRequest(500, 'server error');
          await updater.updateRate();

          expect(winston.error).toHaveBeenCalledWith(
            'updateRate failed: 500 - "server error"');
          expect(updater.emit).not.toHaveBeenCalled();
        });
      });
    });
  });

  describe('getRate', () => {

  });
});

function stubRequest(status, data) {
  const url = new URL(BASE_URL);
  nock(url.origin)
    .get(`${url.pathname}?${url.searchParams.toString()}`)
    .reply(status, data);
}
