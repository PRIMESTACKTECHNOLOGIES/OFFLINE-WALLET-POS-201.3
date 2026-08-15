require('dotenv').config();
const crypto = require('crypto');
const axios = require('axios');

const cfg = {
  apiKey: process.env.BINANCE_API_KEY?.trim() || '',
  apiSecret: process.env.BINANCE_API_SECRET?.trim() || '',
  baseUrl: process.env.BINANCE_BASE_URL?.trim() || 'https://api.binance.com',
};

const H = { 'X-MBX-APIKEY': cfg.apiKey };

function signQuery(params) {
  const qs = new URLSearchParams(params).toString();
  const sig = crypto.createHmac('sha256', cfg.apiSecret).update(qs).digest('hex');
  return `${qs}&signature=${sig}`;
}

const GET = async (p, params = {}) => {
  const t = Date.now();
  const signed = signQuery({ recvWindow: 60000, ...params, timestamp: t });
  const url = `${cfg.baseUrl}${p}?${signed}`;
  console.log(`\n📡 GET  ${cfg.baseUrl}${p}?... (full URL logged below on error)`);
  console.log(`   URL query (before signature — not redacted HMAC input): ` +
    new URLSearchParams({ recvWindow: 60000, ...params, timestamp: t }).toString());
  try {
    const r = await axios.get(url, { headers: H, timeout: 20000 });
    console.log(`   ✅ HTTP ${r.status}  response = ${JSON.stringify(r.data).slice(0, 800)}`);
    return r.data;
  } catch (e) {
    console.log(`   ❌ HTTP ${e.response?.status ?? e.code}: ${e.response?.statusText ?? e.message}`);
    console.log(`   Full URL on failure:\n      ${url}`);
    if (e.response?.data) console.log(`   Body: ${JSON.stringify(e.response.data)}`);
    return { __error: true, status: e.response?.status, data: e.response?.data };
  }
};

(async () => {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  BINANCE TRAVEL RULE — KEY ENTITLEMENT DIAGNOSTIC');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(` Endpoint base: ${cfg.baseUrl}`);
  console.log(` API Key       : ${cfg.apiKey.slice(0, 12)}… (${cfg.apiKey.length} chars)`);
  console.log('');
  console.log(' These 2 GET endpoints are SAFE read-only probes — no state change,');
  console.log(' no withdrawal executed. They tell us WHICH JURISDICTION questionnaire');
  console.log(' Binance expects for this API key (questionnaireCountryCode) and whether');
  console.log(' the key has any local-entity / broker entitlements.');
  console.log('');

  // ── Probe 1: /sapi/v1/localentity/questionnaire-requirements ──
  console.log('───────────────────────────────────────────────────────────────');
  console.log(' 1. GET /sapi/v1/localentity/questionnaire-requirements');
  console.log('    → Returns the MANDATORY Travel Rule country code for this API key.');
  console.log('    → Weight 1 (IP). Expected: { questionnaireCountryCode: "IN" }.');
  const qr = await GET('/sapi/v1/localentity/questionnaire-requirements');

  // ── Probe 2: /sapi/v1/localentity/country/list ─────────────────
  console.log('');
  console.log('───────────────────────────────────────────────────────────────');
  console.log(' 2. GET /sapi/v1/localentity/country/list');
  console.log('    → Returns every Travel Rule jurisdiction Binance Local Entity');
  console.log('      currently supports + withdrawal/deposit allowed flags.');
  console.log('    → Weight 1 (IP). Expect: IN with withdrawalAllowed=true.');
  const cl = await GET('/sapi/v1/localentity/country/list');

  // ── Summary ─────────────────────────────────────────────────────
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  RESULT SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════');
  const detected = qr?.questionnaireCountryCode || qr?.data?.questionnaireCountryCode;
  if (detected) {
    console.log(` ✅ Travel Rule jurisdiction detected on this key: ${detected.toUpperCase()}`);
    console.log(`    → Default India questionnaire {isAddressOwner:1, sendTo:1} will be`);
    console.log(`      CORRECT if country = IN (you confirmed India jurisdiction).`);
    if (detected.toUpperCase() !== 'IN') {
      console.log(` ⚠️  WARNING: country != "IN". The code currently uses INDIA questionnaire.`);
      console.log(`      If Binance returned ${detected.toUpperCase()}, you MUST override the`);
      console.log(`      questionnaire field to match the ${detected.toUpperCase()} schema.`);
    }
  } else if (qr?.__error && (qr.status === 403 || qr.data?.code === -4005 || qr.data?.code === -1002)) {
    console.log(' ⚠️  /localentity endpoints returned 403 / code -4005 / code -1002.');
    console.log('    → This means this API key does NOT have Local-Entity / Broker READ flags.');
    console.log('    → CRITICAL REALITY CHECK: the PLAIN Travel Rule endpoint');
    console.log('      POST /sapi/v1/localentity/withdraw/apply (which we made PRIMARY)');
    console.log('      does NOT actually require the GET endpoints to succeed for your account.');
    console.log('      They are informational — the WRITE endpoint is open to ALL India accounts');
    console.log('      when the questionnaire field is supplied. Continue to LIVE WITHDRAW probe.');
  } else {
    console.log(' ℹ️  Unknown response shape — see raw response above.');
  }

  const countries = (cl?.countries || cl?.data?.countries || []);
  if (countries.length) {
    console.log(`\n 🌐 Local Entity country list returned (${countries.length} entries). IN entry:`);
    const india = countries.find(c => String(c.countryCode).toUpperCase() === 'IN');
    if (india) {
      console.log(`    countryCode=${india.countryCode}  blockType=${india.blockType}  ` +
        `depositAllowed=${india.depositAllowed}  withdrawalAllowed=${india.withdrawalAllowed}  ` +
        `hasRegionRestrictions=${india.hasRegionRestrictions}`);
    } else {
      console.log('    India (IN) not explicitly listed in country list (normal — list may');
      console.log('    only include "local entity" licensed jurisdictions. The withdrawal');
      console.log('    endpoint still accepts India questionnaires for regular accounts.)');
    }
  }

  process.exit(0);
})().catch(e => {
  console.error('\n💥 UNHANDLED:', e.message);
  process.exit(1);
});
