require('ts-node/register/transpile-only');
const assert = require('assert');
const test = require('node:test');
const axios = require('axios');

function loadService() {
  delete require.cache[require.resolve('../src/exchange/binance.service.ts')];
  return require('../src/exchange/binance.service.ts');
}

test('buyAssetWithUsd returns a route-compatible result', async () => {
  delete process.env.BINANCE_API_KEY;
  delete process.env.BINANCE_API_SECRET;

  const service = loadService();
  process.env.BINANCE_API_KEY = 'test-key';
  process.env.BINANCE_API_SECRET = 'test-secret';

  const originalPost = axios.post;
  let calledUrl = '';
  axios.post = async (url, data, config) => {
    calledUrl = url;
    return { data: { symbol: 'BTCUSDT', orderId: 123, executedQty: '0.001', fills: [{ qty: '0.001' }] } };
  };

  try {
    const result = await service.buyAssetWithUsd('btc', 10);
    assert.strictEqual(result.asset, 'BTC');
    assert.strictEqual(result.executedQty, 0.001);
    assert.ok(calledUrl.includes('/api/v3/order'));
  } finally {
    axios.post = originalPost;
  }
});

test('buyAssetWithUsd does not silently downgrade live mode to mock when keys are missing', async () => {
  delete process.env.BINANCE_API_KEY;
  delete process.env.BINANCE_API_SECRET;
  process.env.BINANCE_MODE = 'live';
  process.env.NODE_ENV = 'development';

  const service = loadService();

  await assert.rejects(
    () => service.buyAssetWithUsd('btc', 10),
    /Binance API keys not configured/
  );
});
