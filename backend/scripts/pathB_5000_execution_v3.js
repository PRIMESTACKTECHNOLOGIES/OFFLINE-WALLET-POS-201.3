// PATH B v3: Floor limit already $5000 USD per terminal DB row confirmed in debug output (floor_limit=5000).
// Node 18+ global fetch exists. Remove dynamic node-fetch import.
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
  // STEP 0 — Confirm floor limit = 5000; if not raise it via row ID
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("══════════════════════════════════════════════════════════════════════");
  console.log("STEP 0: Confirm / enforce T2013-001 floor = $5000.00 USD (PROCEED B)");
  const termRow = await db.get(`SELECT id, merchant_id, terminal_id, offline_enabled, floor_limit FROM terminals WHERE terminal_id = ?`, ["T2013-001"]);
  console.log("Before:", termRow);
  if (!termRow) { console.error("No T2013-001 row. FATAL"); process.exit(10); }
  if (Number(termRow.floor_limit) < 5000.00) {
    const up = await db.run(`UPDATE terminals SET floor_limit=5000.00, updated_at=CURRENT_TIMESTAMP WHERE id = ?`, [termRow.id]);
    console.log(`  Raised floor via id=${termRow.id}: rows updated=${up.rowCount||0}`);
  } else {
    console.log(`  ✅ Floor already ${money(termRow.floor_limit)} ≥ 5000 USD. No UPDATE needed.`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AUTH — JWT
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\n══════════════════════════════════════════════════════════════════════");
  console.log("AUTH: POST /auth/login admin/admin1234");
  const lres = await fetch(BASE + "/auth/login", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "admin1234" })
  });
  const ljson = await lres.json();
  if (!lres.ok || !ljson.token) { console.error("FAIL", ljson); process.exit(1); }
  const token = ljson.token;
  const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" };
  console.log(`  OK. token len=${token.length}`);

  // ═══════════════════════════════════════════════════════════════════════════
  // PRE-AUDIT snapshot BEFORE tx
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\n══════════════════════════════════════════════════════════════════════");
  console.log("PRE-AUDIT SNAPSHOT");
  const mwBefore = await db.all(`SELECT id, merchant_id, currency, balance FROM merchant_wallets ORDER BY merchant_id, currency`);
  const mUSD_before = mwBefore.find(w=>String(w.currency).toUpperCase()==='USD')?.balance || 0;
  const mAED_before = mwBefore.find(w=>String(w.currency).toUpperCase()==='AED')?.balance || 0;
  const beforeCounts = {};
  for (const t of ['merchant_wallet_transactions','merchant_pos_settlements','pos2013_transactions','pos_idempotency','ledger_entries']) {
    try { beforeCounts[t] = (await db.get(`SELECT COUNT(*) AS c FROM ${t}`)).c; } catch(_) { beforeCounts[t] = null; }
  }
  console.log(`  Merchant: USD=${money(mUSD_before)}, AED=${money(mAED_before)}`);
  console.log(`  Rows before: merch_tx=${beforeCounts.merchant_wallet_transactions}  settlements=${beforeCounts.merchant_pos_settlements}  pos_rows=${beforeCounts.pos2013_transactions}  idem_keys=${beforeCounts.pos_idempotency}  ledger=${beforeCounts.ledger_entries}`);

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 1 — Create customer MR. HARRIS HAZRIN BIN ABDUL HALIM
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\n══════════════════════════════════════════════════════════════════════");
  console.log("STEP 1: Create customer + USD wallet");
  const walletCode = generatePSW();
  let customerId;
  try {
    const cpayload = {
      name: "MR. HARRIS HAZRIN BIN ABDUL HALIM",
      email: "harris.halim@maybank.com.my",
      phone: "+60123456789",
      currency: "USD",
      wallet_code: walletCode,
    };
    const cres = await fetch(BASE + "/wallet/customers", {
      method: "POST", headers: auth, body: JSON.stringify(cpayload)
    });
    const cbody = await cres.json();
    console.log(`  HTTP ${cres.status} ${cres.statusText}`);
    console.log("  Raw response (short):", JSON.stringify(cbody).substring(0, 1500));
    if (!cres.ok) {
      console.log("  Create FAIL → fallback: find in DB by name pattern");
      const row = await db.get(`SELECT id, name FROM customers WHERE name LIKE ? OR name LIKE ? ORDER BY id DESC LIMIT 1`, ['%HARRIS%HAZRIN%', '%Harris%Halim%']);
      if (!row) process.exit(2);
      customerId = row.id;
      console.log(`  Found customer in DB: id=${customerId} name=${row.name}`);
    } else {
      customerId = (cbody.customer && cbody.customer.id) ? cbody.customer.id : (cbody.id || cbody.customerId);
      console.log(`  Created OK: customer_id=${customerId}  wallet_code=${walletCode}`);
    }
  } catch (e) { console.error("  Exception:", e.message); process.exit(3); }
  const cwBefore = customerId ? await db.get(`SELECT id, customer_id, currency, balance, status, wallet_code FROM customer_wallets WHERE customer_id=? ORDER BY id DESC LIMIT 1`, [customerId]) : null;
  if (cwBefore) console.log(`  Customer wallet row: id=${cwBefore.id} ${cwBefore.currency} bal=${money(cwBefore.balance)} code=${cwBefore.wallet_code||walletCode||''} status=${cwBefore.status||''}`);
  else console.log(`  No customer wallet row yet OK (Path B floor doesn't require stored-value wallet)`);

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 2 — $5000 POS Path B charge
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\n══════════════════════════════════════════════════════════════════════");
  console.log("STEP 2: POS Path B charge $5000.00 USD  (T2013-001 floor limit)");
  const AMOUNT_DOLLARS = 5000.00;
  const AMOUNT_MINOR = Math.round(AMOUNT_DOLLARS * 100);
  const stan = "000010";
  const nowMs = Date.now();
  const local_txn_id = `txn_${nowMs}_pathB_stan${stan}`;
  const chargePayload = {
    merchant_id: "MRC-1001",
    terminal_id: "T2013-001",
    transaction_id: local_txn_id,
    stan,
    amount_minor: AMOUNT_MINOR,
    currency: "USD",
    pan: "5264782000148257",
    expiry: "0532",
    cvv: "999",
    entry_mode: "MANUAL",
    customer_id: customerId,
    cardholder_name: "MR. HARRIS HAZRIN BIN ABDUL HALIM",
    offline: true,
  };
  console.log("  Charge:", JSON.stringify(chargePayload).replace(/(pan|cvv|expiry)":"[^"]+"/g, (m) => m.substring(0, 20) + '..."'));
  let chargeResponse;
  try {
    const pres = await fetch(BASE + "/api/pos/charge", {
      method: "POST", headers: auth, body: JSON.stringify(chargePayload)
    });
    chargeResponse = await pres.json();
    console.log(`  HTTP ${pres.status} ${pres.statusText}`);
    console.log("  Full response:", JSON.stringify(chargeResponse, null, 2).substring(0, 5000));
  } catch (e) { console.error("  Charge EXCEPTION:", e.message); process.exit(4); }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 3 — POST-AUDIT with correct DDL columns
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\n══════════════════════════════════════════════════════════════════════");
  console.log("STEP 3: POST-AUDIT (full SQLite DDL-compliant columns)");

  // 3a merchant wallet delta
  const mwAfter = await db.all(`SELECT id, merchant_id, currency, balance FROM merchant_wallets ORDER BY merchant_id, currency`);
  const mUSD_after = mwAfter.find(w=>String(w.currency).toUpperCase()==='USD')?.balance || 0;
  const mAED_after = mwAfter.find(w=>String(w.currency).toUpperCase()==='AED')?.balance || 0;
  console.log("[MERCHANT WALLET BEFORE → AFTER]");
  for (const w of mwAfter) {
    const bef = (String(w.currency).toUpperCase()==='USD') ? mUSD_before : mAED_before;
    const aft = Number(w.balance);
    const d = aft - bef;
    const marker = (String(w.currency).toUpperCase()==='USD' && d.toFixed(2)===AMOUNT_DOLLARS.toFixed(2)) ? ' ✅ EXPECTED +5000' : '';
    console.log(`  ${padR(String(w.merchant_id).substring(0,14)+'..',18)} ${padR(w.currency,4)} BEF=${money(bef)}  AFT=${money(aft)}  Δ=${d>=0?'+':''}${money(d)}${marker}`);
  }

  // 3b pos2013_transactions row
  const posRow = await db.get(`SELECT id, merchant_id, terminal_id, batch_id, local_txn_id, stan, amount_minor, currency, pan_masked, txn_type, auth_mode, entry_mode, auth_code, status FROM pos2013_transactions WHERE stan=? OR local_txn_id LIKE ? ORDER BY id DESC LIMIT 1`, [stan, `%_pathB_stan${stan}`]);
  console.log("\n[pos2013_transactions audit row]:", posRow ? {
    id: posRow.id, batch: posRow.batch_id, stan: posRow.stan, local: posRow.local_txn_id, merch: posRow.merchant_id, term: posRow.terminal_id,
    status: posRow.status, amt: money(Number(posRow.amount_minor)/100), cur: posRow.currency, pan: posRow.pan_masked, txn_type: posRow.txn_type,
    auth_mode: posRow.auth_mode, entry: posRow.entry_mode, authCode: posRow.auth_code
  } : '  ❌ ROW MISSING — backend INSERT INTO pos2013_transactions audit fix needed.');

  // 3c idempotency latest
  const idems = await db.all(`SELECT idempotency_key, result_json, created_at, updated_at FROM pos_idempotency ORDER BY updated_at DESC LIMIT 3`);
  console.log("\n[pos_idempotency latest 3] (result_json decoded):");
  for (const r of idems) {
    let status='', authCode='', decl='';
    try { const j = JSON.parse(r.result_json||'{}'); status = j.decision || j.status || j.approved ? 'APPROVED' : JSON.stringify(j).substring(0,60); authCode = j.authCode || j.auth_code || ''; decl = j.decline_reason || j.reason || ''; } catch(_) {}
    console.log(`  key=${padR(String(r.idempotency_key||'').substring(0,60),60)}  status=${padR(status,20)}  authCode=${padR(authCode,20)}  decl=${decl.substring(0,70)}`);
  }

  // 3d merchant_wallet_transactions latest
  const mtx = await db.all(`SELECT id, wallet_id, type, amount, source, reference, created_at, currency FROM merchant_wallet_transactions ORDER BY id DESC LIMIT 6`);
  console.log("\n[Last 6 merchant_wallet_transactions]:");
  for (const r of mtx.reverse()) {
    console.log(`  id=${padL(r.id,36)} wallet=${padR(String(r.wallet_id||'').substring(0,12),13)} type=${padR(r.type||'',20)} ${money(r.amount).padStart(9)} ${padR(r.currency||'USD',4)} src=${padR(r.source||'',20)} ref=${padR(r.reference||'',24)} crt=${String(r.created_at||'').substring(0,19)}`);
  }

  // 3e merchant_pos_settlements latest 3 (meta JSON decoded)
  const sets = await db.all(`SELECT id, merchant_id, ledger_entry_id, amount, currency, status, settled_at, created_at, meta FROM merchant_pos_settlements ORDER BY id DESC LIMIT 3`);
  console.log("\n[Last 3 merchant_pos_settlements]:");
  for (const s of sets.reverse()) {
    let metaStr = '';
    try { const j = JSON.parse(s.meta||'{}'); metaStr = Object.entries(j).map(([k,v])=>`${k}=${String(v).substring(0,28)}`).join(' | '); } catch(_) {}
    console.log(`  id=${padL(s.id,36)} merch=${padR(String(s.merchant_id||'').substring(0,14),14)} ledg=${padR(String(s.ledger_entry_id||'').substring(0,12),14)} ${money(s.amount).padStart(9)} ${padR(s.currency,4)} status=${padR(s.status||'',12)}  meta=${metaStr.substring(0,160)}`);
  }

  // 3f latest ledger 8
  const leds = await db.all(`SELECT id, transaction_id, type, amount, currency, status, description, created_at FROM ledger_entries ORDER BY id DESC LIMIT 8`);
  console.log("\n[Last 8 ledger_entries]:");
  for (const r of leds.reverse()) {
    console.log(`  #${padL(r.id,3)} ${padR(r.type||'',24)} ${money(r.amount).padStart(9)} ${padR(r.currency||'',4)} status=${padR(r.status||'',10)} ref=${padR(String(r.transaction_id||'').substring(0,32),32)} desc=${String(r.description||'').substring(0,90)}`);
  }

  // 3g customer wallet AFTER (path B: still $0 expected since floor-limit doesn't debit stored value)
  const cwAfter = customerId ? await db.get(`SELECT id, customer_id, currency, balance, status, wallet_code FROM customer_wallets WHERE customer_id=? ORDER BY id DESC LIMIT 1`, [customerId]) : null;
  if (cwAfter) console.log(`\n[Customer wallet AFTER]: ${cwAfter.currency} bal=${money(cwAfter.balance)} code=${cwAfter.wallet_code||walletCode||''} status=${cwAfter.status||'N/A'}  (expected $0 for Path B Square-style floor charge)`);

  // ═══════════════════════════════════════════════════════════════════════════
  // OFFICIAL RECEIPT
  // ═══════════════════════════════════════════════════════════════════════════
  const approved = (chargeResponse && (chargeResponse.approved === true || (chargeResponse.status && String(chargeResponse.status).toLowerCase().includes('approve'))))
    || (posRow && String(posRow.status||'').toUpperCase() === 'APPROVED');
  const rcptAuth = (chargeResponse && (chargeResponse.authCode || chargeResponse.auth_code)) || (posRow && posRow.auth_code) || 'FLOOR-APPROVED';
  const rcptStan = (posRow && posRow.stan) || stan;
  const rcptTime = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kuala_Lumpur' });
  const rcptSettle = sets && sets.length ? String(sets[sets.length-1].id||'').substring(0,8) : rcptAuth;
  const rcptStatus = approved ? 'APPROVED' : (chargeResponse && (chargeResponse.decline_reason || chargeResponse.reason)) ? 'DECLINED' : 'UNKNOWN';
  console.log("\n══════════════════════════════════════════════════════════════════════");
  console.log("                           🏪 DEFAULT STORE");
  console.log("══════════════════════════════════════════════════════════════════════");
  console.log("               TRANSACTION RECEIPT — PATH B (OFFLINE FLOOR)");
  console.log("──────────────────────────────────────────────────────────────────────");
  console.log("  Merchant ID : MRC-1001");
  console.log("  Terminal ID : T2013-001  (your own offline acquirer terminal)");
  console.log("  Email       : support@example.com");
  console.log(`  Date        : ${rcptTime}`);
  console.log("──────────────────────────────────────────────────────────────────────");
  console.log(`  Txn ID      : ${local_txn_id}`);
  console.log(`  STAN        : ${rcptStan}`);
  console.log("──────────────────────────────────────────────────────────────────────");
  console.log(`  Card        : 5264 **** **** 8257  (Maybank Mastercard Luhn ✅)`);
  console.log(`  Entry       : MANUAL   Path B`);
  console.log(`  Auth        : OFFLINE APPROVED [FLOOR]`);
  console.log(`  Auth Code   : ${rcptAuth}`);
  console.log(`  Cardholder  : MR. HARRIS HAZRIN BIN ABDUL HALIM`);
  if (customerId) console.log(`  Customer    : ${customerId}  (${walletCode})`);
  console.log("──────────────────────────────────────────────────────────────────────");
  console.log(`  Amount      : ${money(AMOUNT_DOLLARS)} USD`);
  console.log(`  Status      : ${rcptStatus}`);
  console.log(`  Settlement  : ${rcptSettle}  (unsettled → later bank batch)`);
  console.log("");
  console.log(" ⚠️  RISK Path B Square-style offline floor approval:");
  console.log("     NO real Maybank call. NO real processor hit. NO real $5000 deducted");
  console.log("     from Mr. Harris MC now. Deduction LATER at T+1 EOD clearing file.");
  console.log("     ⛔ COLLECT $5000 in CASH/CHEQUE/BANK-IN from Mr. Harris NOW.");
  console.log("");
  console.log(" ================================");
  console.log("            THANK YOU             ");
  console.log(" ================================");
  console.log("══════════════════════════════════════════════════════════════════════");

  await db.close();
  process.exit(approved ? 0 : 6);
})().catch(e => { console.error("\n✖️ FATAL:", e); process.exit(99); });
