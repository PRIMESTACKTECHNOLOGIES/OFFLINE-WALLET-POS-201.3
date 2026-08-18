import crypto from 'crypto';
import axios from 'axios';
import type { ExchangeProviderId, BuyAssetResult, SellAssetResult, WithdrawAssetResult, WithdrawOptions, GetPriceResult } from './exchange-provider.interface';

interface KuCoinConfig {
  apiKey: string;
  apiSecret: string;
  apiPassphrase: string;
  baseUrl: string;
}

function isPlaceholder(value: string) {
  return !value || value.includes('your_') || value.includes('REPLACE') || value.includes('example');
}

export function isConfigured(): boolean {
  try {
    getKuCoinConfig();
    return true;
  } catch {
    return false;
  }
}

function getKuCoinConfig(): KuCoinConfig {
  const apiKey = process.env.KUCOIN_API_KEY?.trim() || '';
  const apiSecret = process.env.KUCOIN_API_SECRET?.trim() || '';
  const apiPassphrase = process.env.KUCOIN_API_PASSPHRASE?.trim() || '';
  const baseUrl = process.env.KUCOIN_BASE_URL?.trim() || 'https://api.kucoin.com';
  
  if (!apiKey || !apiSecret || !apiPassphrase
      || isPlaceholder(apiKey) || isPlaceholder(apiSecret) || isPlaceholder(apiPassphrase)) {
    throw new Error('KuCoin API keys not configured. Set KUCOIN_API_KEY, KUCOIN_API_SECRET and KUCOIN_API_PASSPHRASE.');
  }
  
  return { apiKey, apiSecret, apiPassphrase, baseUrl };
}

function signKuCoin(cfg: KuCoinConfig, method: string, path: string, bodyStr: string = '') {
  const timestamp = Date.now().toString();
  const what = timestamp + method.toUpperCase() + path + (bodyStr || '');
  const signature = crypto
    .createHmac('sha256', cfg.apiSecret)
    .update(what)
    .digest('base64');
  const passphraseEnc = crypto
    .createHmac('sha256', cfg.apiSecret)
    .update(cfg.apiPassphrase)
    .digest('base64');
  return {
    timestamp,
    signature,
    passphraseEnc,
    headers: {
      'KC-API-KEY': cfg.apiKey,
      'KC-API-SIGN': signature,
      'KC-API-TIMESTAMP': timestamp,
      'KC-API-PASSPHRASE': passphraseEnc,
      'KC-API-KEY-VERSION': '2',
      'Content-Type': 'application/json',
    },
  };
}

async function kucoinSignedRequest(
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  paramsOrBody?: Record<string, any>,
  query?: Record<string, any>
) {
  const cfg = getKuCoinConfig();
  let url = `${cfg.baseUrl}${path}`;
  let bodyStr = '';
  if (method === 'GET' || method === 'DELETE') {
    if (query && Object.keys(query).length) {
      const qs = new URLSearchParams(query as any).toString();
      url += `?${qs}`;
    }
  } else if (method === 'POST') {
    if (paramsOrBody && Object.keys(paramsOrBody).length) {
      bodyStr = JSON.stringify(paramsOrBody);
    }
  }
  const { headers } = signKuCoin(cfg, method, (url.replace(cfg.baseUrl, '')) || path, bodyStr);
  let res: any;
  if (method === 'POST') {
    res = await axios.post(url, paramsOrBody || {}, { headers, timeout: 20000 });
  } else if (method === 'DELETE') {
    res = await axios.delete(url, { headers, timeout: 20000 });
  } else {
    res = await axios.get(url, { headers, timeout: 15000 });
  }
  const data = res.data;
  if (data && data.code && String(data.code) !== '200000' && String(data.code) !== '0') {
    throw Object.assign(
      new Error(`KuCoin ${path} error ${data.code}: ${data.msg || ''}`),
      { response: { data }, data }
    );
  }
  return data;
}

export async function getPrice(coin: string): Promise<GetPriceResult> {
  const symbol = coin === 'USDT' ? 'BTC-USDT' : `${coin.toUpperCase()}-USDT`;
  try {
    const res = await axios.get(
      `${process.env.KUCOIN_BASE_URL?.trim() || 'https://api.kucoin.com'}/api/v1/market/orderbook/level1?symbol=${symbol}`,
      { timeout: 5000 }
    );
    const price = parseFloat(res.data?.data?.price ?? '0');
    if (price > 0) {
      return {
        priceUsd: coin === 'USDT' ? 1.0 : price,
        provider: 'kucoin',
        symbol: coin.toUpperCase(),
        timestamp: Date.now(),
      };
    }
  } catch { /* ignore */ }
  return { priceUsd: 0, provider: 'kucoin', symbol: coin.toUpperCase(), timestamp: Date.now() };
}

export async function buyAssetWithUsd(asset: string, amountUsd: number): Promise<BuyAssetResult> {
  const normalized = (asset || '').toUpperCase();
  if (!normalized) throw new Error('Asset symbol required');
  const cfg = getKuCoinConfig();
  const symbol = normalized === 'USDT' ? 'USDT-USDT' : `${normalized}-USDT`;
  const orderBody: Record<string, any> = {
    clientOid: `buy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    side: 'buy',
    symbol,
    type: 'market',
    funds: String(amountUsd),
  };
  const order = await kucoinSignedRequest('POST', '/api/v1/orders', orderBody);
  const orderId = order?.data?.orderId;
  let fills: any[] = [];
  let executedQty = 0;
  if (orderId) {
    try {
      const detail = await kucoinSignedRequest('GET', `/api/v1/orders/${orderId}`, undefined, undefined);
      executedQty = parseFloat(detail?.data?.dealSize || '0');
      fills = detail?.data?.fills ? detail.data.fills : [];
    } catch { /* ignore */ }
  }
  if (executedQty <= 0 && normalized !== 'USDT') {
    try {
      const p = (await getPrice(normalized)).priceUsd;
      if (p > 0) executedQty = amountUsd / p;
    } catch { /* ignore */ }
  }
  return {
    ok: true, provider: 'kucoin', asset: normalized,
    amount_usd: Number(amountUsd),
    executed_qty: executedQty, executedQty,
    fills, status: order?.data?.status || 'FILLED',
    order_id: String(orderId || order?.data?.orderId || `KC-${Date.now()}`),
    raw: order,
  };
}

export async function sellAssetForUsdt(asset: string, amountBase: number): Promise<SellAssetResult> {
  const normalized = (asset || '').toUpperCase();
  if (!normalized) throw new Error('Asset symbol required');
  if (normalized === 'USDT') throw new Error('Cannot sell USDT for USDT');
  const cfg = getKuCoinConfig();
  const symbol = `${normalized}-USDT`;
  const orderBody: Record<string, any> = {
    clientOid: `sell-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    side: 'sell',
    symbol,
    type: 'market',
    size: String(amountBase),
  };
  const order = await kucoinSignedRequest('POST', '/api/v1/orders', orderBody);
  const orderId = order?.data?.orderId;
  let fills: any[] = [];
  let executedQty = 0;
  let usdtReceived = 0;
  if (orderId) {
    try {
      const detail = await kucoinSignedRequest('GET', `/api/v1/orders/${orderId}`, undefined, undefined);
      executedQty = parseFloat(detail?.data?.dealSize || '0') || Number(amountBase);
      usdtReceived = parseFloat(detail?.data?.dealFunds || '0');
      fills = detail?.data?.fills ? detail.data.fills : [];
    } catch { /* ignore */ }
  }
  if (usdtReceived <= 0) {
    try {
      const p = (await getPrice(normalized)).priceUsd;
      if (p > 0) usdtReceived = (executedQty || amountBase) * p;
    } catch { /* ignore */ }
  }
  return {
    ok: true, provider: 'kucoin', asset: normalized,
    amount_sold: Number(amountBase),
    executed_qty: executedQty || Number(amountBase),
    executedQty: executedQty || Number(amountBase),
    usdt_received: usdtReceived,
    fills, status: order?.data?.status || 'FILLED',
    order_id: String(orderId || order?.data?.orderId || `KC-${Date.now()}`),
    raw: order,
  };
}

function networkToKuCoinChain(network: string, asset: string): string {
  const net = String(network || '').toUpperCase();
  const coin = String(asset || '').toUpperCase();
  if (['TRX', 'TRC20', 'TRON'].includes(net)) return 'trc20';
  if (['BSC', 'BEP20', 'BSC_BEP20'].includes(net)) return 'bsc';
  if (['POLYGON', 'MATIC', 'ERC20_POLYGON'].includes(net)) return 'polygon';
  if (['ETH', 'ERC20', 'ETHEREUM'].includes(net)) return 'eth';
  if (['SOL', 'SOLANA'].includes(net)) return 'sol';
  if (['BTC', 'BITCOIN'].includes(net)) return 'btc';
  if (coin === 'USDT') return 'trc20';
  return net.toLowerCase();
}

export async function withdrawAsset(
  asset: string,
  address: string,
  network: string,
  amount: number,
  opts: WithdrawOptions = {}
): Promise<WithdrawAssetResult> {
  const cfg = getKuCoinConfig();
  const coin = String(asset || '').toUpperCase();
  const chain = networkToKuCoinChain(network, coin);
  const body: Record<string, any> = {
    currency: coin,
    address,
    amount: Number(amount),
    chain,
  };
  if (opts.withdrawOrderId) body.withdrawOrderId = String(opts.withdrawOrderId);
  if (opts.addressTag) body.memo = String(opts.addressTag);
  if (opts.addressName) {
    try { body.remark = decodeURIComponent(opts.addressName.replace(/%2520/g, '%20')); } catch { body.remark = opts.addressName; }
  }
  const resp = await kucoinSignedRequest('POST', '/api/v1/withdrawals', body);
  const wId = resp?.data?.withdrawalId || resp?.data?.id || null;
  return {
    ok: true, provider: 'kucoin',
    id: wId ? String(wId) : undefined,
    withdrawId: wId ? String(wId) : undefined,
    accepted: true, info: resp?.data?.msg || '',
    txUrl: null,
    raw: resp,
  };
}

export default { buyAssetWithUsd, sellAssetForUsdt, withdrawAsset, getPrice, isConfigured };
