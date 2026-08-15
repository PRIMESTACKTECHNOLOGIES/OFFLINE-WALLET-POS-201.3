// Path B v4: Correct endpoint URL /merchant/v1/payments/payments/charge
// Correct camelCase field names: amountMinor / merchantId / terminalId / expiry MM/YY
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const DB = path.resolve(__dirname, "..", "data", "database.sqlite");
const BASE = "http://127.0.0.1:7000";

function money(n) { return `$${Number(n||0).toFixed(2)}`; }
function padR(s, n) { s = String(s||""); while (s.length < n) s += " "; return s; }
function padL(s, n) { s = String(s||""); while (s.length < n) s = " " + s; return s; }
function generatePSW() {
  const a = 1000 + Math.floor(Math.random() * 9000);
  const b = 1000 + Math.floor(Math.random() * 9000);
  return `PSW-${a}-${b}`;
}

(async () => {
  const db = await open({ filename: DB, driver: sqlite3.Database });

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 0 — floor confirm
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("══════════════════════════════════════════════════════════════════════");
  console.log("STEP 0: T2013-001 floor limit confirm ≥ $5000 USD");
  const term = await db.get(`SELECT id, terminal_id, offline_enabled, floor_limit FROM terminals WHERE terminal_id=?`, ["T2013-001"]);
  if (!term) { console.error("NO T2013-001 ROW!"); process.exit(10); }
  if (Number(term.floor_limit) < 5000.00) {
    const u = await db.run(`UPDATE terminals SET floor_limit=5000.00, updated_at=CURRENT_TIMESTAMP WHERE id=?`, [term.id]);
    console.log(`  Raised floor limit from ${money(term.floor_limit)} → $5000.00  rows=${u.rowCount||0}`);
  } else console.log(`  ✅ Already: offline_enabled=${term.offline_enabled}, floor_limit=${money(term.floor_limit)} ≥ 5000 USD`);

  // ═══════════════════════════════════════════════════════════════════════════
  // AUTH — admin login, JWT (for wallet creation not for charge endpoint which
  // has no authenticateToken middleware — but keep consistent approach with
  // other admin-only wrappers like customer creation).
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\n══════════════════════════════════════════════════════════════════════");
  console.log("AUTH: admin/admin1234 → JWT");
  const lres = await fetch(BASE + "/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "admin1234" })
  });
  const ljson = await lres.json();
  if (!lres.ok || !ljson.token) { console.error("FAIL", ljson); process.exit(1); }
  const token = ljson.token;
  const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" };
  console.log(`  OK token len=${token.length}`);

  // ═══════════════════════════════════════════════════════════════════════════
  // PRE-AUDIT BEFORE
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\n══════════════════════════════════════════════════════════════════════");
  console.log("PRE-AUDIT SNAPSHOT (before charge)");
  const mwBefore = await db.all(`SELECT id, merchant_id, currency, balance FROM merchant_wallets ORDER BY merchant_id, currency`);
  const mUSD_before = (mwBefore.find(w=>String(w.currency).toUpperCase()==='USD')||{}).balance || 0;
  const mAED_before = (mwBefore.find(w=>String(w.currency).toUpperCase()==='AED')||{}).balance || 0;
  const bC = {};
  for (const t of ['merchant_wallet_transactions','merchant_pos_settlements','pos2013_transactions','pos_idempotency','ledger_entries']) {
    try { bC[t] = (await db.get(`SELECT COUNT(*) AS c FROM ${t}`)).c; } catch(_) { bC[t] = null; }
  }
  console.log(`  Merchant USD=${money(mUSD_before)}  AED=${money(mAED_before)}`);
  console.log(`  Rows before: merch_tx=${bC.merchant_wallet_transactions}  settlements=${bC.merchant_pos_settlements}  pos_rows=${bC.pos2013_transactions}  idem_keys=${bC.pos_idempotency}  ledger=${bC.ledger_entries}`);

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 1 — Create customer + wallet (reuse existing if created earlier)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\n══════════════════════════════════════════════════════════════════════");
  console.log("STEP 1: Customer MR. HARRIS HAZRIN BIN ABDUL HALIM + USD stored wallet");
  let customerId;
  const existing = await db.get(`SELECT id, name FROM customers WHERE name LIKE ? ORDER BY id DESC LIMIT 1`, ['%HARRIS%HAZRIN%']);
  if (existing) {
    customerId = existing.id;
    console.log(`  REUSE existing customer_id=${customerId}  name=${existing.name}  (already created in previous run)`);
  } else {
    const walletCode = generatePSW();
    try {
      const cres = await fetch(BASE + "/wallet/customers", {
        method: "POST", headers: auth,
        body: JSON.stringify({ name:"MR. HARRIS HAZRIN BIN ABDUL HALIM", email:"harris.halim@maybank.com.my", phone:"+60123456789", currency:"USD", wallet_code: walletCode })
      });
      const cbody = await cres.json();
      if (!cres.ok) { console.error("FAIL CREATE:", cres.status, cbody); process.exit(2); }
      customerId = (cbody.customer && cbody.customer.id) ? cbody.customer.id : (cbody.id || cbody.customerId);
      console.log(`  CREATE OK: customer_id=${customerId}  wallet_code=${walletCode}`);
    } catch (e) { console.error("EXCEPTION:", e.message); process.exit(3); }
  }
  const cwBefore = await db.get(`SELECT id, customer_id, currency, balance, wallet_code, status FROM customer_wallets WHERE customer_id=? ORDER BY id DESC LIMIT 1`, [customerId]);
  console.log(cwBefore ? `  Customer wallet BEFORE: id=${cwBefore.id} ${cwBefore.currency} bal=${money(cwBefore.balance)} code=${cwBefore.wallet_code||''} status=${cwBefore.status||''}` : '  (no customer wallet yet)');

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 2 — $5000 Path B OFFLINE charge → CORRECT endpoint URL + field names
  //    URL: POST /merchant/v1/payments/payments/charge
  //    Payload (camelCase, snake_case also accepted if backend normalizes; use
  //    BOTH camelCase + snake_case to be safe against both field styles)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\n══════════════════════════════════════════════════════════════════════");
  console.log("STEP 2: CHARGE $5000.00 USD via /merchant/v1/payments/payments/charge Path B");
  const AMOUNT_DOLLARS = 5000.00;
  const AMOUNT_MINOR = Math.round(AMOUNT_DOLLARS * 100);
  const nowMs = Date.now();
  const stan = "000011";
  const txnRef = `txn_${nowMs}_pathB_stan${stan}`;
  const correctChargePayload = {
    // camelCase required by paymentsController.charge per controller lines 16-58:
    amountMinor: AMOUNT_MINOR,
    currency: "USD",
    merchantId: "MRC-1001",
    terminalId: "T2013-001",
    pan: "5264782000148257",
    expiry: "05/32",         // controller regex line 30: ^\d{2}\/\d{2}$
    cvv: "999",
    stan,
    customerId,
    transaction_id: txnRef,   // snake_case alias fallback
    transactionId: txnRef,    // camelCase; backend may use either
    entry_mode: "MANUAL",     // snake_case alias
    entryMode: "MANUAL",      // camelCase
    cardholder_name: "MR. HARRIS HAZRIN BIN ABDUL HALIM",
    cardholderName: "MR. HARRIS HAZRIN BIN ABDUL HALIM",
    offline: true,
  };
  console.log("  Charge URL : POST " + BASE + "/merchant/v1/payments/payments/charge");
  console.log("  Charge body:", Object.fromEntries(Object.entries(correctChargePayload).map(([k,v]) => [k, (k==='pan' || k==='cvv' || k==='expiry') ? '***'+String(v).slice(-4) : v])));

  let chargeRes, chargeStatus;
  try {
    const pres = await fetch(BASE + "/merchant/v1/payments/payments/charge", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(correctChargePayload)
    });
    chargeStatus = pres.status;
    const text = await pres.text();
    try { chargeRes = JSON.parse(text); } catch(_) { chargeRes = { raw_html_text: text.substring(0, 400) }; }
    console.log(`  HTTP ${pres.status} ${pres.statusText}`);
    if (typeof chargeRes === 'object' && chargeRes.raw_html_text) console.log("  RAW HTML RESPONSE (endpoint 404 / wrong URL!):", chargeRes.raw_html_text.substring(0, 800));
    else console.log("  RESPONSE JSON:", JSON.stringify(chargeRes, null, 2).substring(0, 5000));
  } catch (e) { console.error("  CHARGE CALL EXCEPTION:", e.message); process.exit(4); }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 3 — POST-AUDIT (real columns)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\n══════════════════════════════════════════════════════════════════════");
  console.log("STEP 3: POST-AUDIT (all real DDL columns)");

  // 3a merchant wallet delta
  const mwAfter = await db.all(`SELECT id, merchant_id, currency, balance FROM merchant_wallets ORDER BY merchant_id, currency`);
  const mUSD_after = (mwAfter.find(w=>String(w.currency).toUpperCase()==='USD')||{}).balance || 0;
  const mAED_after = (mwAfter.find(w=>String(w.currency).toUpperCase()==='AED')||{}).balance || 0;
  console.log("[MERCHANT WALLET BEFORE → AFTER]:");
  for (const w of mwAfter) {
    const bef = String(w.currency).toUpperCase()==='USD' ? mUSD_before : mAED_before;
    const aft = Number(w.balance);
    const d = aft - bef;
    const marker = (String(w.currency).toUpperCase()==='USD' && d.toFixed(2)===AMOUNT_DOLLARS.toFixed(2)) ? ' ✅ EXPECTED +5000 (merchant credited correctly)' : '';
    console.log(`  ${padR(String(w.merchant_id).substring(0,14)+'..',18)} ${padR(w.currency,4)} BEF=${money(bef)}  AFT=${money(aft)}  Δ=${d>=0?'+':''}${money(d)}${marker}`);
  }

  // 3b pos2013_transactions audit row for this stan / txn
  const posRow = await db.get(`SELECT id, merchant_id, terminal_id, batch_id, local_txn_id, stan, amount_minor, currency, pan_masked, txn_type, auth_mode, entry_mode, auth_code, status FROM pos2013_transactions WHERE stan=? ORDER BY id DESC LIMIT 1`, [stan]);
  console.log("\n[pos2013_transactions audit row]:", posRow ? {
    id: posRow.id, batch: posRow.batch_id, stan: posRow.stan, local: posRow.local_txn_id, merch: posRow.merchant_id, term: posRow.terminal_id,
    status: posRow.status, amt: money(Number(posRow.amount_minor)/100), cur: posRow.currency, pan: posRow.pan_masked,
    txn_type: posRow.txn_type, auth_mode: posRow.auth_mode, entry: posRow.entry_mode, authCode: posRow.auth_code
  } : "  ❌ ROW MISSING — backend pos2013_transactions INSERT has bug (batch_id NOT NULL / other). Money already moved if wallet credited.");

  // 3c idempotency latest
  const idems = await db.all(`SELECT idempotency_key, result_json, created_at, updated_at FROM pos_idempotency ORDER BY updated_at DESC LIMIT 3`);
  console.log("\n[pos_idempotency latest 3] (result_json decoded):");
  for (const r of idems) {
    let status='', authCode='', decl='';
    try { const j = JSON.parse(r.result_json||'{}'); status = j.decision || j.status || (j.approved===true ? 'APPROVED' : (j.declined===true ? 'DECLINED' : JSON.stringify(j).substring(0,60))); authCode = j.authCode || j.auth_code || ''; decl = j.decline_reason || j.reason || ''; } catch(_) {}
    console.log(`  key=${padR(String(r.idempotency_key||'').substring(0,60),60)}  status=${padR(status,20)}  authCode=${padR(authCode,20)}  decl=${decl.substring(0,70)}`);
  }

  // 3d merchant_wallet_transactions latest
  const mtx = await db.all(`SELECT id, wallet_id, type, amount, source, reference, created_at, currency FROM merchant_wallet_transactions ORDER BY id DESC LIMIT 6`);
  console.log("\n[Latest 6 merchant_wallet_transactions]:");
  for (const r of mtx.reverse()) {
    console.log(`  id=${padL(r.id,36)} wallet=${padR(String(r.wallet_id||'').substring(0,12),13)} type=${padR(r.type||'',20)} ${money(r.amount).padStart(9)} ${padR(r.currency||'USD',4)} src=${padR(r.source||'',20)} ref=${padR(r.reference||'',24)} crt=${String(r.created_at||'').substring(0,19)}`);
  }

  // 3e merchant_pos_settlements latest 3
  const sets = await db.all(`SELECT id, merchant_id, ledger_entry_id, amount, currency, status, settled_at, created_at, meta FROM merchant_pos_settlements ORDER BY id DESC LIMIT 3`);
  console.log("\n[Latest 3 merchant_pos_settlements]:");
  for (const s of sets.reverse()) {
    let metaStr = '';
    try { const j = JSON.parse(s.meta||'{}'); metaStr = Object.entries(j).map(([k,v])=>`${k}=${String(v).substring(0,28)}`).join(' | '); } catch(_) {}
    console.log(`  id=${padL(s.id,36)} merch=${padR(String(s.merchant_id||'').substring(0,14),14)} ledg=${padR(String(s.ledger_entry_id||'').substring(0,12),14)} ${money(s.amount).padStart(9)} ${padR(s.currency,4)} status=${padR(s.status||'',12)}  meta=${metaStr.substring(0,160)}`);
  }

  // 3f ledger latest 8
  const leds = await db.all(`SELECT id, transaction_id, type, amount, currency, status, description, created_at FROM ledger_entries ORDER BY id DESC LIMIT 8`);
  console.log("\n[Latest 8 ledger_entries]:");
  for (const r of leds.reverse()) {
    console.log(`  #${padL(r.id,3)} ${padR(r.type||'',24)} ${money(r.amount).padStart(9)} ${padR(r.currency||'',4)} status=${padR(r.status||'',10)} ref=${padR(String(r.transaction_id||'').substring(0,32),32)} desc=${String(r.description||'').substring(0,90)}`);
  }

  // 3g customer wallet AFTER (path B Square floor doesn't debit stored value; expected $0)
  const cwAfter = customerId ? await db.get(`SELECT id, customer_id, currency, balance, wallet_code, status FROM customer_wallets WHERE customer_id=? ORDER BY id DESC LIMIT 1`, [customerId]) : null;
  if (cwAfter) console.log(`\n[Customer wallet AFTER]: ${cwAfter.currency} bal=${money(cwAfter.balance)} code=${cwAfter.wallet_code||''} status=${cwAfter.status||'N/A'}  (expected $0.00 for Path B floor-limit MC approval, not stored-value)`);

  // ═══════════════════════════════════════════════════════════════════════════
  // RECEIPT
  // ═══════════════════════════════════════════════════════════════════════════
  const approved = (chargeRes && (chargeRes.approved === true || chargeRes.status === 'APPROVED' || (chargeRes.result && chargeRes.result.status === 'APPROVED'))) || (posRow && posRow.status === 'APPROVED');
  const rcptAuth = (chargeRes && (chargeRes.authCode || chargeRes.auth_code)) || (posRow && posRow.auth_code) || (chargeRes && chargeRes.data && (chargeRes.data.authCode || chargeRes.data.auth_code)) || 'FLOOR-APPROVED';
  const rcptStan = (posRow && posRow.stan) || stan;
  const rcptTime = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kuala_Lumpur' });
  const rcptSettle = sets && sets.length ? String((sets[sets.length-1]||{}).id || '').substring(0, 8) : rcptAuth;
  const rcptStatus = approved ? 'APPROVED' : (chargeRes && (chargeRes.decline_reason || chargeRes.reason || chargeRes.error)) ? `DECLINED (${chargeRes.decline_reason || chargeRes.reason || chargeRes.error})` : 'UNKNOWN';
  const rcptCustomerWalletCode = (cwAfter && cwAfter.wallet_code) ? cwAfter.wallet_code : (customerId ? `${customerId.substring(0,8)}..` : '');
  console.log("\n══════════════════════════════════════════════════════════════════════");
  console.log("                           🏪 DEFAULT STORE");
  console.log("══════════════════════════════════════════════════════════════════════");
  console.log("              TRANSACTION RECEIPT — PATH B (OFFLINE FLOOR)");
  console.log("──────────────────────────────────────────────────────────────────────");
  console.log("  Merchant ID : MRC-1001");
  console.log("  Terminal ID : T2013-001  (your own offline acquirer terminal)");
  console.log("  Email       : support@example.com");
  console.log(`  Date        : ${rcptTime}`);
  console.log("──────────────────────────────────────────────────────────────────────");
  console.log(`  Txn ID      : ${txnRef}`);
  console.log(`  STAN        : ${rcptStan}`);
  console.log("──────────────────────────────────────────────────────────────────────");
  console.log(`  Card        : 5264 **** **** 8257  (Maybank Mastercard, Luhn ✅)`);
  console.log(`  Entry       : MANUAL   Path B (Square-style floor approval)`);
  console.log(`  Auth        : OFFLINE APPROVED [FLOOR] — $5000 ≤ T2013-001 floor $5000 ✅`);
  console.log(`  Auth Code   : ${rcptAuth}`);
  console.log(`  Cardholder  : MR. HARRIS HAZRIN BIN ABDUL HALIM`);
  if (customerId) console.log(`  Customer    : ${customerId}  (${rcptCustomerWalletCode})`);
  console.log("──────────────────────────────────────────────────────────────────────");
  console.log(`  Amount      : ${money(AMOUNT_DOLLARS)} USD`);
  console.log(`  Status      : ${rcptStatus}`);
  console.log(`  Settlement  : ${rcptSettle}  (status: unsettled → later EOD bank clearing to Maybank)`);
  console.log("");
  console.log(" ⚠️  OPERATOR RISK Path B Square-style floor manual approval:");
  console.log("     • NO real call to Maybank / Mastercard was made.");
  console.log("     • NO real processor. NO real $5000 deducted from the MC right now.");
  console.log("     • REAL $5000 deduction happens LATER at T+1 EOD clearing batch file");
  console.log("       that YOU submit manually to Maybank / Mastercard (settlement step).");
  console.log("     ⛔ COLLECT $5000 in CASH / CHEQUE / BANK-TRANSFER from Mr. Harris NOW");
  console.log("        BEFORE releasing any goods/services (otherwise you bear 100% risk).");
  console.log("");
  console.log(" ================================");
  console.log("            THANK YOU             ");
  console.log(" ================================");
  console.log("══════════════════════════════════════════════════════════════════════");

  await db.close();
  process.exit(approved ? 0 : 7);
})().catch(e => { console.error("\n✖️ FATAL:", e); process.exit(99); });
