import crypto from 'crypto';
import axios from 'axios';

type BinanceMode = 'live' | 'mock';

interface BinanceConfig {
  apiKey: string;
  apiSecret: string;
  baseUrl: string;
  mode: BinanceMode;
}

function isPlaceholder(value: string) {
  return !value || value.includes('your_') || value.includes('REPLACE') || value.includes('example');
}

function getBinanceConfig(): BinanceConfig {
  const apiKey = process.env.BINANCE_API_KEY?.trim() || '';
  const apiSecret = process.env.BINANCE_API_SECRET?.trim() || '';
  const baseUrl = process.env.BINANCE_BASE_URL?.trim() || 'https://api.binance.com';
  const requestedMode = (process.env.BINANCE_MODE || process.env.CRYPTO_MODE || '').toLowerCase();
  const useMock = requestedMode === 'mock'
    || process.env.BINANCE_USE_MOCK === '1'
    || process.env.BINANCE_USE_MOCK === 'true';

  if (useMock) {
    return { apiKey: '', apiSecret: '', baseUrl, mode: 'mock' };
  }

  if (!apiKey || !apiSecret || isPlaceholder(apiKey) || isPlaceholder(apiSecret)) {
    throw new Error('Binance API keys not configured. Set BINANCE_API_KEY and BINANCE_API_SECRET before making live crypto purchases.');
  }

  return { apiKey, apiSecret, baseUrl, mode: 'live' };
}

function signQuery(params: Record<string, any>, apiSecret: string) {
  const qs = new URLSearchParams(params as any).toString();
  const signature = crypto.createHmac('sha256', apiSecret).update(qs).digest('hex');
  return `${qs}&signature=${signature}`;
}

async function binanceRequest(path: string, params: Record<string, any> = {}) {
  const { apiKey, apiSecret, baseUrl, mode } = getBinanceConfig();

  if (mode === 'mock') {
    return {
      mock: true,
      status: 'MOCKED',
      symbol: params.symbol,
      side: params.side,
      type: params.type,
      executedQty: (params.quoteOrderQty || params.qty || '1').toString(),
      fills: [{ qty: (params.quoteOrderQty || params.qty || '1').toString(), price: '0' }],
      orderId: 999999,
    };
  }

  const timestamp = Date.now();
  const signed = signQuery({ ...params, timestamp }, apiSecret);
  const url = `${baseUrl}${path}?${signed}`;
  const res = await axios.post(url, undefined, {
    headers: { 'X-MBX-APIKEY': apiKey },
    timeout: 15000,
  });
  return res.data;
}

// Market buy using quoteOrderQty (amount in quote asset, e.g., USDT)
export async function buyAssetWithUsd(asset: string, amountUsd: number) {
  const normalizedAsset = (asset || '').toUpperCase();
  if (!normalizedAsset) throw new Error('Asset symbol is required');

  const symbol = normalizedAsset === 'USDT' ? 'USDTUSDT' : `${normalizedAsset}USDT`;
  const params = {
    symbol,
    side: 'BUY',
    type: 'MARKET',
    quoteOrderQty: amountUsd.toString(),
  } as Record<string, any>;

  const order = await binanceRequest('/api/v3/order', params);
  if (order?.code) {
    throw new Error(`Binance order failed: ${order.msg || 'Unknown error'}`);
  }

  const executedQty = parseFloat(order.executedQty || order.fills?.reduce((sum: number, fill: any) => sum + parseFloat(fill.qty || 0), 0) || '0');

  return {
    ok: true,
    provider: 'binance',
    asset: normalizedAsset,
    amount_usd: Number(amountUsd),
    executed_qty: executedQty,
    executedQty,
    fills: order.fills || [],
    status: order.status || 'FILLED',
    order_id: order.orderId?.toString() || order.id?.toString() || undefined,
    mock: Boolean(order?.mock),
    raw: order,
  };
}

export async function withdrawAsset(asset: string, address: string, network: string, amount: number) {
  const params = {
    coin: asset,
    address,
    network,
    amount: amount.toString(),
  } as Record<string, any>;

  const result = await binanceRequest('/sapi/v1/capital/withdraw/apply', params);
  return result;
}

export default { buyAssetWithUsd, withdrawAsset };
