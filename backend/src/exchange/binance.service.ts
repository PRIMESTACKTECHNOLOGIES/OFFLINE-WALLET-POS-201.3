import crypto from 'crypto';
import axios from 'axios';

interface BinanceConfig {
  apiKey: string;
  apiSecret: string;
  baseUrl: string;
}

/** FATF Travel Rule Standard PII for originator (sender) — passed as JSON to Binance Local Entity endpoints. */
export interface StandardPii {
  /** Full legal name of the originator */
  name: string;
  /** Originator's local account / customer ID on our platform */
  accountNumber?: string;
  /** Customer-facing internal user identifier (maps to Binance originator KYC reference) */
  customerId?: string;
  /** Date of birth — YYYY-MM-DD */
  dateOfBirth?: string;
  /** ISO 3166-1 alpha-2 country code of the place of birth */
  placeOfBirthCountryCode?: string;
  /** Nationality ISO 2-letter code */
  nationality?: string;
  /** National ID / Passport number */
  nationalIdentificationNumber?: string;
  /** National ID type: PASSPORT / NATIONAL_ID / DRIVERS_LICENSE / SOCIAL_SECURITY */
  nationalIdentificationType?: 'PASSPORT' | 'NATIONAL_ID' | 'DRIVERS_LICENSE' | 'SOCIAL_SECURITY' | string;
  /** Issuing country ISO 2-letter code */
  countryOfIssue?: string;
  /** Street address — line 1 */
  addressLine1?: string;
  /** Street address — line 2 */
  addressLine2?: string;
  /** City / Town */
  city?: string;
  /** State / Province / Region */
  state?: string;
  /** Postal / ZIP code */
  postalCode?: string;
  /** Country ISO 2-letter code of residential address */
  countryCode?: string;
}

export interface TravelRuleBrokerWithdrawRequest {
  address: string;
  coin: string;
  amount: number;
  withdrawOrderId: string;
  /** JSON string or JSON object of travel-rule questionnaire answers per country.  */
  questionnaire: Record<string, any> | string;
  /** Originator PII (the sender / customer) — required for /broker/withdraw/apply. */
  originatorPii: StandardPii;
  addressTag?: string;
  network?: string;
  addressName?: string;
  transactionFeeFlag?: boolean;
  walletType?: 0 | 1;
  recvWindow?: number;
}

/**
 * Request body for the PLAIN Travel Rule withdraw endpoint:
 *   POST /sapi/v1/localentity/withdraw/apply
 *
 * Binance support (2026-08-11) directed us to use THIS endpoint for accounts
 * under a Travel Rule-mandatory jurisdiction (e.g. India), instead of the
 * older /capital/withdraw/apply or the /broker/withdraw/apply variant (which
 * is only for licensed brokers of local entities and requires a broker flag
 * on the API key).
 *
 * The ONLY mandatory extra field vs standard withdraw is `questionnaire`
 * (per-country JSON answers).  originatorPii is NOT required on this endpoint
 * but is accepted if passed.
 */
export interface TravelRuleWithdrawRequest {
  address: string;
  coin: string;
  amount: number;
  withdrawOrderId?: string;
  /** JSON string or JSON object — per India/withdraw-questionnaire on Binance docs. */
  questionnaire: Record<string, any> | string;
  /** Optional — will be JSON-stringified if supplied; endpoint does not require it. */
  originatorPii?: StandardPii;
  addressTag?: string;
  network?: string;
  addressName?: string;
  transactionFeeFlag?: boolean;
  walletType?: 0 | 1;
  recvWindow?: number;
}

export interface BrokerWithdrawResponse {
  trId: number;
  accepted: boolean;
  info?: string;
  /** Plain /localentity/withdraw/apply sometimes returns id instead of trId */
  id?: string;
}

export interface LocalEntityCountry {
  countryCode: string;
  countryName: string;
  blockType: 'supported' | 'limited' | 'blocked' | string;
  depositAllowed: boolean;
  withdrawalAllowed: boolean;
  hasRegionRestrictions: boolean;
  lastUpdated: number;
}

export interface QuestionnaireRequirements {
  questionnaireCountryCode: string;
}

/**
 * Default India Travel Rule withdrawal questionnaire.
 *
 * Per Binance docs (Withdraw Questionnaire Contents -> India):
 *   https://developers.binance.com/en/docs/products/wallet/travel-rule/withdraw-questionnaire#india
 *
 * sendTo = "1"  ->  self-transfer (originator == beneficiary)
 *   -> bnfType, bnfName, country, city are NOT required
 * isAddressOwner = "1"  ->  originator confirms they own the destination address
 *   -> vasp / vaspName are NOT required (no 3rd-party VASP involved)
 *
 * If the beneficiary is a 3rd party (sendTo != "1") the caller MUST override this
 * with the full questionnaire including bnfType/bnfName/country fields.
 */
export const INDIA_WITHDRAW_QUESTIONNAIRE: Record<string, string> = {
  isAddressOwner: '1',
  sendTo: '1',
};

export function getBinanceConfig(): BinanceConfig {
  const apiKey = process.env.BINANCE_API_KEY?.trim() || '';
  const apiSecret = process.env.BINANCE_API_SECRET?.trim() || '';
  const baseUrl = process.env.BINANCE_BASE_URL?.trim() || 'https://api.binance.com';

  function isPlaceholder(value: string) {
    return !value || value.includes('your_') || value.includes('REPLACE') || value.includes('example');
  }

  if (!apiKey || !apiSecret || isPlaceholder(apiKey) || isPlaceholder(apiSecret)) {
    throw new Error(
      'CRYPTO_PURCHASE_BLOCKED: Binance API keys not configured. ' +
      'Set BINANCE_API_KEY + BINANCE_API_SECRET in backend/.env for production use.'
    );
  }

  return { apiKey, apiSecret, baseUrl };
}

function signQuery(params: Record<string, any>, apiSecret: string) {
  const qs = new URLSearchParams(params as any).toString();
  const signature = crypto.createHmac('sha256', apiSecret).update(qs).digest('hex');
  return `${qs}&signature=${signature}`;
}

function signBody(body: URLSearchParams, apiSecret: string) {
  const signature = crypto.createHmac('sha256', apiSecret).update(body.toString()).digest('hex');
  body.append('signature', signature);
  return body;
}

async function binanceRequest(path: string, params: Record<string, any> = {}) {
  const { apiKey, apiSecret, baseUrl } = getBinanceConfig();

  const timestamp = Date.now();
  const signed = signQuery({ ...params, timestamp }, apiSecret);
  const url = `${baseUrl}${path}?${signed}`;
  const res = await axios.post(url, undefined, {
    headers: { 'X-MBX-APIKEY': apiKey },
    timeout: 15000,
  });
  return res.data;
}

async function binanceSignedPost(path: string, fields: Record<string, any>, config?: BinanceConfig): Promise<any> {
  const cfg = config || getBinanceConfig();

  const body = new URLSearchParams();
  const entries = Object.entries({
    ...fields,
    timestamp: fields.timestamp || Date.now(),
  } as Record<string, any>);
  for (const [k, v] of entries) {
    if (v === undefined || v === null) continue;
    if (typeof v === 'object') body.append(k, typeof v === 'string' ? v : JSON.stringify(v));
    else body.append(k, String(v));
  }

  // Binance SAPI endpoints require HMAC signature on the QUERY STRING, not
  // inside the POST body (exact Python sample pattern we were given).
  // The same params serialized into the POST body are serialized again as
  // the query string (no signature inside body), HMACed, and ?query+&signature
  // appended to the URL.  Content-Type still x-www-form-urlencoded with the
  // same payload in body (required for POST parsing of questionnaire).
  const signature = crypto.createHmac('sha256', cfg.apiSecret).update(body.toString()).digest('hex');
  const url = `${cfg.baseUrl}${path}?${body.toString()}&signature=${signature}`;

  const res = await axios.post(url, body.toString(), {
    headers: {
      'X-MBX-APIKEY': cfg.apiKey,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    timeout: 20000,
  });
  if (res.data?.code && res.data.code !== '0') {
    throw Object.assign(new Error(`Binance ${path} error ${res.data.code}: ${res.data.msg || ''}`), { response: { data: res.data }, data: res.data });
  }
  return res.data;
}

async function binanceSignedGet(path: string, query: Record<string, any> = {}, config?: BinanceConfig): Promise<any> {
  const cfg = config || getBinanceConfig();
  const params: Record<string, any> = { ...query, timestamp: query.timestamp || Date.now() };
  const signed = signQuery(params, cfg.apiSecret);
  const url = `${cfg.baseUrl}${path}?${signed}`;
  const res = await axios.get(url, {
    headers: { 'X-MBX-APIKEY': cfg.apiKey },
    timeout: 15000,
  });
  if (res.data?.code && res.data.code !== '0') {
    throw Object.assign(new Error(`Binance ${path} error ${res.data.code}: ${res.data.msg || ''}`), { response: { data: res.data }, data: res.data });
  }
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

export async function withdrawAsset(
  asset: string,
  address: string,
  network: string,
  amount: number,
  opts: {
    questionnaire?: Record<string, any> | string;
    withdrawOrderId?: string;
    originatorPii?: StandardPii;
    addressTag?: string;
    addressName?: string;
    transactionFeeFlag?: boolean;
    walletType?: 0 | 1;
    recvWindow?: number;
  } = {}
) {
  const questionnaire = opts.questionnaire || INDIA_WITHDRAW_QUESTIONNAIRE;
  const resp = await travelRuleWithdrawApply({
    address,
    coin: asset,
    amount,
    questionnaire,
    withdrawOrderId: opts.withdrawOrderId,
    originatorPii: opts.originatorPii,
    addressTag: opts.addressTag,
    network,
    addressName: opts.addressName,
    transactionFeeFlag: opts.transactionFeeFlag,
    walletType: opts.walletType,
    recvWindow: opts.recvWindow,
  });
  return {
    ...resp,
    id: resp?.id,
    withdrawId: resp?.id,
  };
}

// ── Binance Local Entity / Travel Rule Broker API ──────────────────────────
// These endpoints are for Binance "brokers of local entities" that require
// Travel Rule compliance programmatically.  Requires API key with broker /
// local-entity entitlements (otherwise you get HTTP 403 / -4104).

/**
 * GET /sapi/v1/localentity/country/list
 * Active country list for travel-rule questionnaires.  Currently AU only per
 * Binance docs; more added over time.  Weight 1 (IP-based).
 */
export async function getLocalEntityCountryList(query: { recvWindow?: number; timestamp?: number } = {}): Promise<{ countries: LocalEntityCountry[]; lastUpdated: number }> {
  return binanceSignedGet('/sapi/v1/localentity/country/list', query);
}

/**
 * GET /sapi/v1/localentity/questionnaire-requirements
 * Returns the applicable travel-rule country code for this API key's entity,
 * i.e. which jurisdiction's questionnaire must be submitted in broker withdrawals.
 * Weight 1 (IP-based).
 */
export async function getLocalEntityQuestionnaireRequirements(query: { recvWindow?: number; timestamp?: number } = {}): Promise<QuestionnaireRequirements> {
  return binanceSignedGet('/sapi/v1/localentity/questionnaire-requirements', query);
}

/**
 * POST /sapi/v1/localentity/withdraw/apply
 *
 * PLAIN Travel Rule Withdraw endpoint — the one Binance Support specifically
 * told us to use on 2026-08-11 for accounts in Travel Rule mandatory
 * jurisdictions (e.g. India) when the older /capital/withdraw/apply returns
 * code -4104.
 *
 * DIFFERENCE vs /broker/withdraw/apply:
 *   - NO broker/local-entity API key entitlement required.
 *   - Mandatory field is ONLY `questionnaire` (per-country answers).
 *   - `originatorPii` is optional, not required.
 *   - `withdrawOrderId` is optional.
 *
 * Questionnaire content per jurisdiction: for India use the schema at
 * https://developers.binance.com/en/docs/products/wallet/travel-rule/withdraw-questionnaire#india
 *
 * @returns Typically { id, trId, accepted, info } but shape varies; typed as BrokerWithdrawResponse for convenience.
 */
export async function travelRuleWithdrawApply(req: TravelRuleWithdrawRequest): Promise<BrokerWithdrawResponse> {
  const payload: Record<string, any> = {
    address: req.address,
    coin: req.coin.toUpperCase(),
    amount: Number(req.amount),
    questionnaire: typeof req.questionnaire === 'string' ? req.questionnaire : JSON.stringify(req.questionnaire || {}),
  };
  if (req.withdrawOrderId) payload.withdrawOrderId = String(req.withdrawOrderId);
  if (req.originatorPii && Object.keys(req.originatorPii).length) payload.originatorPii = JSON.stringify(req.originatorPii);
  if (req.addressTag) payload.addressTag = req.addressTag;
  if (req.network) payload.network = req.network;
  if (req.addressName) payload.addressName = encodeURIComponent(req.addressName).replace(/%20/g, '%2520');
  if (typeof req.transactionFeeFlag === 'boolean') payload.transactionFeeFlag = String(req.transactionFeeFlag);
  if (typeof req.walletType === 'number') payload.walletType = String(req.walletType);
  if (typeof req.recvWindow === 'number') payload.recvWindow = String(req.recvWindow);
  return binanceSignedPost('/sapi/v1/localentity/withdraw/apply', payload);
}

/**
 * POST /sapi/v1/localentity/broker/withdraw/apply
 * Broker Withdraw for local entities requiring Travel Rule.  Weight 600
 * (account-based).  On success returns { trId, accepted, info }.
 *
 * NOTE: Binance support clarified on 2026-08-11 that this /broker/ variant is
 * ONLY for LICENSED BROKERS of local entities and requires a broker flag on
 * the API key.  For standard user accounts under a Travel Rule jurisdiction
 * (e.g. India) use travelRuleWithdrawApply() -> /localentity/withdraw/apply
 * instead, which needs ONLY the questionnaire field and no broker entitlement.
 *
 * The `questionnaire` field is typically fetched from Binance's per-country
 * "Withdraw Questionnaire Contents" support page; it's a JSON object of
 * answers such as { sendTo, satoshiToken, isAddressOwner, verifyMethod } for
 * the AE/AU/other entity the API key is registered under.  When in doubt, call
 * getLocalEntityQuestionnaireRequirements() first to determine the country.
 */
export async function brokerWithdrawApply(req: TravelRuleBrokerWithdrawRequest): Promise<BrokerWithdrawResponse> {
  const payload: Record<string, any> = {
    address: req.address,
    coin: req.coin.toUpperCase(),
    amount: Number(req.amount),
    withdrawOrderId: String(req.withdrawOrderId),
    questionnaire: typeof req.questionnaire === 'string' ? req.questionnaire : JSON.stringify(req.questionnaire || {}),
    originatorPii: JSON.stringify(req.originatorPii || {}),
  };
  if (req.addressTag) payload.addressTag = req.addressTag;
  if (req.network) payload.network = req.network;
  if (req.addressName) payload.addressName = encodeURIComponent(req.addressName).replace(/%20/g, '%2520');
  if (typeof req.transactionFeeFlag === 'boolean') payload.transactionFeeFlag = String(req.transactionFeeFlag);
  if (typeof req.walletType === 'number') payload.walletType = String(req.walletType);
  if (typeof req.recvWindow === 'number') payload.recvWindow = String(req.recvWindow);
  return binanceSignedPost('/sapi/v1/localentity/broker/withdraw/apply', payload);
}

export async function sellAssetForUsdt(asset: string, amountBase: number) {
  const normalizedAsset = (asset || '').toUpperCase();
  if (!normalizedAsset) throw new Error('Asset symbol is required');
  if (normalizedAsset === 'USDT') throw new Error('Cannot sell USDT for USDT');

  const symbol = `${normalizedAsset}USDT`;
  const params = {
    symbol,
    side: 'SELL',
    type: 'MARKET',
    quantity: amountBase.toString(),
  } as Record<string, any>;

  const order = await binanceRequest('/api/v3/order', params);
  if (order?.code) {
    throw new Error(`Binance sell order failed: ${order.msg || 'Unknown error'}`);
  }

  const quoteReceived = parseFloat(
    order.cummulativeQuoteQty ||
    order.fills?.reduce((sum: number, fill: any) => sum + parseFloat(fill.qty || 0) * parseFloat(fill.price || 0), 0) ||
    '0'
  );
  const executedQty = parseFloat(
    order.executedQty ||
    order.fills?.reduce((sum: number, fill: any) => sum + parseFloat(fill.qty || 0), 0) ||
    '0'
  );

  return {
    ok: true,
    provider: 'binance',
    asset: normalizedAsset,
    amount_sold: amountBase,
    executed_qty: executedQty,
    executedQty,
    usdt_received: quoteReceived,
    fills: order.fills || [],
    status: order.status || 'FILLED',
    order_id: order.orderId?.toString() || order.id?.toString() || undefined,
    mock: Boolean(order?.mock),
    raw: order,
  };
}

export default { buyAssetWithUsd, sellAssetForUsdt, withdrawAsset, getLocalEntityCountryList, getLocalEntityQuestionnaireRequirements, travelRuleWithdrawApply, brokerWithdrawApply };

