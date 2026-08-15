require('dotenv').config();
const { execSync } = require('child_process');

// ── Bypass ts-node requirement by compiling a small in-memory script ──────
//    We call binance.service.ts's travelRuleWithdrawApply() + INDIA_WITHDRAW_QUESTIONNAIRE
//    directly through ts-node which resolves all TS imports the same way the
//    running backend does.

const script = `
import 'dotenv/config';
import { travelRuleWithdrawApply, INDIA_WITHDRAW_QUESTIONNAIRE, getLocalEntityQuestionnaireRequirements } from './src/exchange/binance.service';

(async () => {
  const DEST = process.env.PROBE_DEST_ADDR || 'TFZXzaXXgk3uCcCWbUWKZAydsc95D8GZBP';

  console.log('═══ TRAVEL RULE LIVENESS — USING PRODUCTION binance.service.ts ═══');
  console.log('  travelRuleWithdrawApply() + INDIA_WITHDRAW_QUESTIONNAIRE constant');
  console.log('  imported DIRECTLY from src/exchange/binance.service.ts (same path');
  console.log('  as the running backend on port 7000).');
  console.log('');
  console.log('  Default India questionnaire =', JSON.stringify(INDIA_WITHDRAW_QUESTIONNAIRE));
  console.log('');

  // ── 1. Print India jurisdiction confirmation (already proven) ─────────
  try {
    const qr = await getLocalEntityQuestionnaireRequirements();
    console.log('✅ Preflight: questionnaireCountryCode =', qr?.questionnaireCountryCode);
  } catch (e) {
    console.log('ℹ️  Preflight skipped (code !== 0 returned):', e?.message || e);
  }
  console.log('');

  // ── 2. Dust withdrawals in priority order (cheapest gas first) ────────
  const probes = [
    // Try USDT BSC to our own T-addr: Binance will give a clear error if
    // address type doesn't match, which is fine — we read the code.
    { coin: 'USDT', network: 'BSC',   amount: 0.10, address: DEST,
      withdrawOrderId: 'PROBE-BSC-' + Date.now() },
    // USDT-TRC20 to the T-addr: correct network/address pair, can succeed
    // if address is whitelisted & USDT balance >= 0.10 (has 0.158 ✅)
    { coin: 'USDT', network: 'TRC20', amount: 0.10, address: DEST,
      withdrawOrderId: 'PROBE-TRC-' + Date.now() },
    // TRX TRC20 to the T-addr: has 3.0 TRX (✅ >= 2.0)
    { coin: 'TRX',  network: 'TRC20', amount: 2.00, address: DEST,
      withdrawOrderId: 'PROBE-TRX-' + Date.now() },
  ];

  for (const p of probes) {
    console.log('────────────────────────────────────────────────────────────');
    console.log('▶ PROBE: ', p.amount, p.coin, '/', p.network, '→', p.address);
    console.log('  withdrawOrderId:', p.withdrawOrderId);
    const t0 = Date.now();
    try {
      const resp = await travelRuleWithdrawApply({
        address: p.address,
        coin: p.coin,
        amount: p.amount,
        network: p.network,
        withdrawOrderId: p.withdrawOrderId,
        questionnaire: INDIA_WITHDRAW_QUESTIONNAIRE,
        recvWindow: 60000,
      });
      const ms = Date.now() - t0;
      console.log('✅ HTTP 200 accepted (', ms, 'ms )');
      console.log('   Full response body:', JSON.stringify(resp));
      console.log('   id      =', resp?.id);
      console.log('   trId    =', resp?.trId);
      console.log('   accepted=', resp?.accepted);
      console.log('   info    =', resp?.info);
      console.log('');
      console.log('🎉🎉🎉 TRAVEL RULE RESOLVED FOR THIS API KEY 🎉🎉🎉');
      console.log('   -4104 is gone. The code path withdrawAsset() →');
      console.log('   travelRuleWithdrawApply() → /sapi/v1/localentity/withdraw/apply');
      console.log('   with INDIA questionnaire works.');
      process.exit(0);
    } catch (e: any) {
      const ms = Date.now() - t0;
      const code = e?.data?.code ?? e?.response?.data?.code;
      const msg  = e?.data?.msg  ?? e?.response?.data?.msg  ?? e?.message ?? String(e);
      console.log('❌ FAILED (', ms, 'ms ) code=', code, ' msg=', msg);
      console.log('   Full error data:', JSON.stringify(e?.data ?? e?.response?.data ?? { message: String(e) }));
      console.log('');
      console.log('   Diagnosis:');
      if (code === -4104 || /travel.?rule/i.test(msg)) {
        console.log('   ⛔ STILL -4104 despite using /localentity/withdraw/apply + IN questionnaire.');
        console.log('      Next: try questionnaire = { isAddressOwner:"1", sendTo:"0", bnfType:"0",');
        console.log('      bnfName:"<FULL NAME>", country:"in", city:"<CITY>" } (3rd-party format).');
      } else if (code === -1022) {
        console.log('   ⛔ SIGNATURE -1022 — HMAC-SHA256 on this API key secret is malformed.');
        console.log('      (This is impossible since travelRuleWithdrawApply uses binanceSignedPost');
        console.log('      which also signs /sapi/v1/localentity/questionnaire-requirements successfully');
        console.log('      in the same module. Check BINANCE_API_SECRET in .env is 64-char hex.)');
      } else if (code === -2010 || /insufficient/i.test(msg)) {
        console.log('   ℹ️  Insufficient balance for ' + p.coin + ' — try next probe.');
      } else if (code === -3001 || code === -3003 || code === -3005 || /whitelist|address not allowed|not whitelisted|withdraw address/i.test(msg)) {
        console.log('   ℹ️  Address NOT WHITELISTED on Binance API security page.');
        console.log('      This is NOT a Travel Rule problem. Add ' + DEST + ' to Binance → Security →');
        console.log('      API Management → Withdrawal Addresses Whitelist for this API key, then retry.');
      } else if (code === -3006 || /network|address.*format/i.test(msg)) {
        console.log('   ℹ️  Address/network combination mismatch (expected). Proceeding to next probe.');
      } else if (code === -2015 || /ip|api.?key/i.test(msg)) {
        console.log('   ⛔ API key locked / IP not whitelisted (-2015). Check Binance API key settings.');
      } else {
        console.log('   ℹ️  Standard Binance error. Classify using https://binance-docs.github.io/apidocs/spot/en/#error-codes-2');
      }
    }
    console.log('');
  }

  console.log('═══ ALL PROBES EXHAUSTED ═══');
  console.log('Review diagnosis above. The /capital/withdraw/apply → /localentity/withdraw/apply');
  console.log('migration is ALREADY active in the production service code.');
})().catch(e => {
  console.error('💥 UNHANDLED:', e.message);
  if (e?.data || e?.response?.data) console.error('   response data:', JSON.stringify(e?.data ?? e?.response?.data));
  process.exit(1);
});
`;

const fs = require('fs');
const tmpPath = require('path').join(__dirname, '_probe_via_service.tmp.ts');
fs.writeFileSync(tmpPath, script);

try {
  const out = execSync(
    `"${process.execPath}" "${require.resolve('ts-node/dist/bin.js')}" -T --transpile-only "${tmpPath}"`,
    {
      cwd: __dirname,
      stdio: 'inherit',
      env: { ...process.env, TS_NODE_TRANSPILE_ONLY: '1', TS_NODE_SKIP_PROJECT: '0' },
    }
  );
} finally {
  try { fs.unlinkSync(tmpPath); } catch {}
}
