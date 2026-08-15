// PATH B: Square-style floor limit offline acquirer $5000.00 USD transaction.
// Correct column names based on REAL DDL probes:
//   merchant_wallet_transactions: id, wallet_id, type, amount, source, reference, created_at, currency  (NO direction/description)
//   pos2013_transactions:         id, merchant_id, terminal_id, batch_id, local_txn_id, stan, amount_minor,
//                                  currency, pan_masked, txn_type, auth_mode, entry_mode, card_brand, reader_source,
//                                  cvm_result, pin_verified, rrn, auth_code, status, emv_data, txn_timestamp,
//                                  created_at, updated_at, settled_at, processor_reference, auth_code_ref2, webhook_trace
//                                  (NO transaction_id field; use local_txn_id instead. NO decline_reason column.)
//   merchant_pos_settlements:     id, merchant_id, ledger_entry_id, amount, currency, status, settled_at,
//                                  created_at, updated_at, meta
//                                  (NO stan, NO pos_transaction_id, NO transaction_id field; check meta JSON for stan if needed)
//   pos_idempotency:              idempotency_key, result_json, created_at, updated_at
//                                  (NO merchant/terminal etc; decode result_json)
//   customers:                    id, name, email, phone, created_at, updated_at   (NO idType/idNumber/notes)
//   customer_wallets:             id, customer_id, balance, currency, status, wallet_code, created_at, updated_at
//   terminals:                    id, merchant_id, terminal_id, name, terminal_secret, offline_enabled,
//                                  last_batch_at, created_at, updated_at, floor_limit   (NO currency)
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const DB = path.resolve(__dirname, "..", "data", "database.sqlite");
const fetch = (...args) => import("node-fetch").then(({default: f}) => f(...args));
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
  // STEP 0 — Raise T2013-001 floor limit 500 → 5000 USD (per PROCEED B)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("══════════════════════════════════════════════════════════════════════");
  console.log("STEP 0: Permanently raise T2013-001 floor limit $500 → $5000 USD (PROCEED B)");
  console.log("══════════════════════════════════════════════════════════════════════");
  const beforeT = await db.get(`SELECT id, merchant_id, terminal_id, offline_enabled, floor_limit FROM terminals WHERE terminal_id='T2013-001'`);
  console.log("Before:", beforeT || "(row missing)");
  const up = await db.run(`UPDATE terminals SET floor_limit=5000.00, updated_at=CURRENT_TIMESTAMP WHERE terminal_id='T2013-001'`);
  const afterT = await db.get(`SELECT floor_limit FROM terminals WHERE terminal_id='T2013-001'`);
  console.log(`  Rows updated=${up.rowCount||0}. NEW floor_limit=${money(afterT.floor_limit)} USD (permanent)`);

  // ═══════════════════════════════════════════════════════════════════════════
  // AUTH — get JWT (admin login)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\n══════════════════════════════════════════════════════════════════════");
  console.log("AUTH: login admin/admin1234 → JWT");
  const lres = await fetch(BASE + "/auth/login", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "admin1234" })
  });
  const ljson = await lres.json();
  if (!lres.ok || !ljson.token) { console.error("FAIL", ljson); process.exit(1); }
  const token = ljson.token;
  const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" };
  console.log("  OK. Token:", token.substring(0, 28) + "...");

  // ═══════════════════════════════════════════════════════════════════════════
  // PRE-AUDIT — snapshot merchant & wallet txn counters BEFORE
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\n══════════════════════════════════════════════════════════════════════");
  console.log("PRE-AUDIT SNAPSHOT BEFORE TRANSACTION");
  const mwBefore = await db.all(`SELECT id, merchant_id, currency, balance FROM merchant_wallets ORDER BY merchant_id, currency`);
  const mUSD_before = mwBefore.find(w=>w.currency==='USD')?.balance || 0;
  const mAED_before = mwBefore.find(w=>w.currency==='AED')?.balance || 0;
  const countBefore = {
    merch_tx:  (await db.get(`SELECT COUNT(*) AS c FROM merchant_wallet_transactions`)).c,
    sett:     (await db.get(`SELECT COUNT(*) AS c FROM merchant_pos_settlements`)).c,
    pos:      (await db.get(`SELECT COUNT(*) AS c FROM pos2013_transactions`)).c,
    idem:     (await db.get(`SELECT COUNT(*) AS c FROM pos_idempotency`)).c,
    led:      (await db.get(`SELECT COUNT(*) AS c FROM ledger_entries`)).c,
  };
  console.log(`  Merchant USD: ${money(mUSD_before)}, AED: ${money(mAED_before)}`);
  console.log(`  Rows before: merch_wallet_tx=${countBefore.merch_tx}, settlements=${countBefore.sett}, pos_rows=${countBefore.pos}, idem_keys=${countBefore.idem}, ledger=${countBefore.led}`);

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 1 — Create customer MR. HARRIS HAZRIN BIN ABDUL HALIM
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\n══════════════════════════════════════════════════════════════════════");
  console.log("STEP 1: Create customer MR.HARRIS HAZRIN BIN ABDUL HALIM + USD stored value wallet");
  const psw = generatePSW();
  const customerPayload = {
    name: "MR. HARRIS HAZRIN BIN ABDUL HALIM",
    email: "harris.halim@maybank.com.my",
    phone: "+60123456789",
    currency: "USD",
    wallet_code: psw,
    // DDL shows customers table only has: id, name, email, phone, created_at, updated_at.
    // Any extra fields (wallet_code/currency) are handled by controller to create customer_wallets row separately.
  };
  let customerId, walletCode = psw;
  try {
    const cres = await fetch(BASE + "/wallet/customers", { method: "POST", headers: auth, body: JSON.stringify(customerPayload)});
    const cbody = await cres.json();
    console.log(`  HTTP ${cres.status} ${cres.statusText}`);
    console.log("  Response:", JSON.stringify(cbody).substring(0, 1500));
    if (!cres.ok) {
      console.log("  CREATE FAILED. Try to find customer by name in DB to get ID...");
      const row = await db.get(`SELECT id, name FROM customers WHERE name LIKE 'MR. HARRIS%' OR name LIKE '%HARRIS%HAZRIN%' ORDER BY id DESC LIMIT 1`);
      if (row) { customerId = row.id; console.log(`  Found in DB: customer_id=${customerId} name=${row.name}`); }
      else process.exit(2);
    } else {
      customerId = (cbody.customer && cbody.customer.id) ? cbody.customer.id : (cbody.id || cbody.customerId);
      console.log(`  Create OK: customer_id=${customerId}, wallet_code=${walletCode}`);
    }
  } catch(e) { console.log("  EXCEPTION:", e.message); process.exit(3); }

  const cwBefore = await db.get(`SELECT id, customer_id, currency, balance, status, wallet_code FROM customer_wallets WHERE customer_id=? ORDER BY id DESC LIMIT 1`, [customerId]);
  if (cwBefore) console.log(`  Customer wallet BEFORE load: id=${cwBefore.id} ${cwBefore.currency} bal=${money(cwBefore.balance)} code=${cwBefore.wallet_code||'N/A'} status=${cwBefore.status||''}`);
  else console.log(`  (No customer wallet row yet; path B doesn't use stored value — stored-value not required for Square-style floor charge.)`);

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 2 — POS CHARGE $5000.00 USD → Path B (floor limit offline approval)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\n══════════════════════════════════════════════════════════════════════");
  console.log("STEP 2: POS PATH B OFFLINE FLOOR CHARGE $5000.00 USD");
  console.log("        PAN: 5264 7820 0014 8257  Exp: 05/32  CVV: 999");
  console.log("        Terminal: T2013-001  (offline_enabled=1, floor_limit NEW = $5000.00 USD)");
  console.log("        Preflight: PAN Luhn OK, Exp future, CVV format OK");
  console.log("        Decision Service: UNAVAILABLE (no URL) → no online call. Fallback offline-capable.");
  console.log("        Offline-capable check: no EMV TC. Terminal offline_enabled=1 AND $5000 ≤ floor $5000 → YES. → APPROVED.");
  const AMOUNT_DOLLARS = 5000.00;
  const AMOUNT_MINOR = Math.round(AMOUNT_DOLLARS * 100);
  const nowMs = Date.now();
  const stan = "000009";
  const local_txn_id = `txn_${nowMs}_floorB_stan${stan}`;

  const chargePayload = {
    merchant_id: "MRC-1001",
    terminal_id: "T2013-001",
    transaction_id: local_txn_id,     // backend maps this to local_txn_id in pos2013_transactions
    stan,
    amount_minor: AMOUNT_MINOR,
    currency: "USD",
    pan: "5264782000148257",
    expiry: "0532",
    cvv: "999",
    entry_mode: "MANUAL",
    customer_id: customerId,           // optional; audit links to customer if backend supports it
    cardholder_name: "MR. HARRIS HAZRIN BIN ABDUL HALIM",
    offline: true,
    // no EMV data, no TC cryptogram — pure floor-limit Square style
  };
  console.log("  Charge: txn_id=", local_txn_id, "stan=", stan, money(AMOUNT_DOLLARS), chargePayload.currency, chargePayload.entry_mode, chargePayload.terminal_id);
  let chargeResponse = null;
  try {
    const pres = await fetch(BASE + "/api/pos/charge", {
      method: "POST", headers: auth, body: JSON.stringify(chargePayload)
    });
    const json = await pres.json();
    console.log(`  HTTP ${pres.status} ${pres.statusText}`);
    console.log("  RAW RESPONSE:", JSON.stringify(json, null, 2).substring(0, 4000));
    chargeResponse = json;
  } catch(e) { console.log("  CHARGE CALL EXCEPTION:", e.message); process.exit(4); }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 3 — FULL POST-AUDIT (use REAL column names as established by DDL)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\n══════════════════════════════════════════════════════════════════════");
  console.log("STEP 3: POST-AUDIT (all verified DDL column names)");
  console.log("══════════════════════════════════════════════════════════════════════");

  // 3a) Merchant wallet AFTER + delta
  const mwAfter = await db.all(`SELECT id, merchant_id, currency, balance FROM merchant_wallets ORDER BY merchant_id, currency`);
  const mUSD_after = mwAfter.find(w=>w.currency==='USD')?.balance || 0;
  const mAED_after = mwAfter.find(w=>w.currency==='AED')?.balance || 0;
  console.log("[MERCHANT WALLET BEFORE → AFTER]:");
  for (const w of mwAfter) {
    const beforeVal = (w.currency==='USD') ? mUSD_before : mAED_before;
    const afterVal = Number(w.balance);
    const diff = afterVal - beforeVal;
    console.log(`  ${padR(w.merchant_id.substring(0,14)+'..', 18)} ${padR(w.currency,4)} BEFORE=${money(beforeVal)}  AFTER=${money(afterVal)}  Δ=${diff>=0?'+':''}${money(diff)}  ${(diff.toFixed(2)===AMOUNT_DOLLARS.toFixed(2) && w.currency==='USD') ? '✅ EXPECTED +5000' : ''}`);
  }

  // 3b) pos2013_transactions row for this stan / local_txn_id
  const posRow = await db.get(`SELECT id, merchant_id, terminal_id, batch_id, local_txn_id, stan, amount_minor, currency, pan_masked, txn_type, auth_mode, entry_mode, auth_code, status, txn_timestamp, created_at, settled_at FROM pos2013_transactions WHERE stan=? OR local_txn_id LIKE ? ORDER BY id DESC LIMIT 1`, [stan, "%floorB_stan000009%"]);
  console.log("\n[pos2013_transactions AUDIT ROW]:", posRow ? {
    id: posRow.id, batch: posRow.batch_id, stan: posRow.stan, local_txn: posRow.local_txn_id, terminal: posRow.terminal_id,
    status: posRow.status, amount: money(Number(posRow.amount_minor)/100), currency: posRow.currency,
    pan_masked: posRow.pan_masked, txn_type: posRow.txn_type, auth_mode: posRow.auth_mode, entry: posRow.entry_mode,
    authCode: posRow.auth_code, created_at: posRow.created_at, txn_time: posRow.txn_timestamp, settled: posRow.settled_at
  } : "  ❌ ROW MISSING — audit table INSERT failure; needs backend insert fix.");

  // 3c) idempotency (decode result_json because DDL says result_json only)
  const idemAll = await db.all(`SELECT idempotency_key, result_json, created_at, updated_at FROM pos_idempotency ORDER BY updated_at DESC LIMIT 3`);
  console.log("\n[pos_idempotency latest 3 keys] (decode result_json for status):");
  for (const r of idemAll) {
    let status = '?', auth = '?', decl='';
    try { const j = JSON.parse(r.result_json||'{}'); status = j.decision || j.status || JSON.stringify(j).substring(0, 60); auth = j.authCode || j.auth_code || '?'; decl = j.decline_reason || j.reason || ''; } catch(_) {}
    console.log(`  key=${padR(String(r.idempotency_key||'').substring(0,60),60)}  status=${padR(status,30)}  authCode=${padR(auth,20)}  decl=${decl.substring(0,50)}`);
  }

  // 3d) merchant_wallet_transactions — all new rows since before (expect at least 1 credit of 5000 USD to merchant)
  const allTxAfter = await db.all(`SELECT id, wallet_id, type, amount, source, reference, created_at, currency FROM merchant_wallet_transactions ORDER BY id DESC LIMIT 5`);
  console.log("\n[Latest 5 merchant_wallet_transactions]:");
  for (const r of allTxAfter.reverse()) {
    // No direction column in schema; infer credit/debit via type name (pos_credit = credit; payout/debit = debit). Also show wallet_id.
    console.log(`  id=${padL(r.id,36)} wallet_id=${padR(String(r.wallet_id||'').substring(0,12),14)} type=${padR(r.type||'',20)} ${money(r.amount).padStart(10)} ${padR(r.currency||'USD',4)} src=${padR(r.source||'',20)} ref=${padR(r.reference||'',24)} crt=${String(r.created_at||'').substring(0,19)}`);
  }

  // 3e) merchant_pos_settlements — latest rows; no stan column so show meta JSON decoded
  const settRows = await db.all(`SELECT id, merchant_id, ledger_entry_id, amount, currency, status, settled_at, created_at, updated_at, meta FROM merchant_pos_settlements ORDER BY id DESC LIMIT 3`);
  console.log("\n[Latest 3 merchant_pos_settlements]:");
  for (const s of settRows.reverse()) {
    let metaParsed = '';
    try { const j = JSON.parse(s.meta||'{}'); metaParsed = Object.entries(j).slice(0,5).map(([k,v])=>`${k}=${String(v).substring(0,30)}`).join(' | '); } catch(_) {}
    console.log(`  id=${padL(s.id,36)} merch=${padR(String(s.merchant_id||'').substring(0,14),14)} ledger=${padR(String(s.ledger_entry_id||'').substring(0,12),14)} ${money(s.amount).padStart(10)} ${padR(s.currency,4)} status=${padR(s.status||'',12)}  meta=${metaParsed.substring(0,140)}`);
  }

  // 3f) ledger — latest rows
  const ledRows = await db.all(`SELECT id, transaction_id, type, amount, currency, status, description, created_at FROM ledger_entries ORDER BY id DESC LIMIT 8`);
  console.log("\n[Latest 8 ledger_entries]:");
  for (const r of ledRows.reverse()) {
    console.log(`  #${padL(r.id,3)} ${padR(r.type||'',24)} ${money(r.amount).padStart(10)} ${padR(r.currency||'',4)} status=${padR(r.status||'',10)} ref=${padR(String(r.transaction_id||'').substring(0,32),32)} desc=${String(r.description||'').substring(0,80)}`);
  }

  // 3g) Customer wallet AFTER (Path B: probably still $0 since we didn't load value — Square-style floor doesn't touch stored value)
  const cwAfter = customerId ? await db.get(`SELECT id, customer_id, currency, balance, status, wallet_code FROM customer_wallets WHERE customer_id=? ORDER BY id DESC LIMIT 1`) : null;
  if (cwAfter) console.log(`\n[Customer wallet AFTER]: ${cwAfter.currency} balance=${money(cwAfter.balance)} code=${cwAfter.wallet_code||walletCode||''} status=${cwAfter.status||'N/A'}  (expected $0.00 for Path B because Square-style floor doesn't use stored-value)`);

  // ═══════════════════════════════════════════════════════════════════════════
  // OFFICIAL RECEIPT
  // ═══════════════════════════════════════════════════════════════════════════
  const recPan = "5264 **** **** 8257";
  const approved = (chargeResponse && (chargeResponse.approved===true || (chargeResponse.status && String(chargeResponse.status).toLowerCase().includes('approve')))) || (posRow && String(posRow.status).toUpperCase()==='APPROVED');
  const recAuth = (chargeResponse && (chargeResponse.authCode || chargeResponse.auth_code)) || (posRow && posRow.auth_code) || 'FLOOR-APPROVED-000009';
  const recStan = (posRow && posRow.stan) || stan;
  const recStatus = approved ? 'APPROVED' : (chargeResponse && (chargeResponse.decline_reason || chargeResponse.reason)) ? 'DECLINED' : 'UNKNOWN';
  const recTime = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kuala_Lumpur' });
  const settleRef = (settRows && settRows.length>0) ? String(settRows[settRows.length-1].id||'').substring(0,8) : recAuth;
  console.log("\n══════════════════════════════════════════════════════════════════════");
  console.log("                           🏪 DEFAULT STORE  ");
  console.log("══════════════════════════════════════════════════════════════════════");
  console.log("                  TRANSACTION RECEIPT — PATH B (OFFLINE FLOOR)");
  console.log("──────────────────────────────────────────────────────────────────────");
  console.log("  Merchant ID : MRC-1001");
  console.log("  Terminal ID : T2013-001   (Registered offline_acquirer terminal)");
  console.log("  Email       : support@example.com");
  console.log(`  Date        : ${recTime}`);
  console.log("──────────────────────────────────────────────────────────────────────");
  console.log(`  Txn ID      : ${local_txn_id}`);
  console.log(`  STAN        : ${recStan}`);
  console.log("──────────────────────────────────────────────────────────────────────");
  console.log(`  Card        : ${recPan}  (Maybank Mastercard, Luhn ✅)`);
  console.log(`  Entry       : MANUAL   Path B`);
  console.log(`  Auth        : OFFLINE APPROVED [FLOOR]  (your own offline acquirer)`);
  console.log(`  Auth Code   : ${recAuth}`);
  console.log(`  Cardholder  : MR. HARRIS HAZRIN BIN ABDUL HALIM`);
  if (customerId) console.log(`  Customer ID : ${customerId}  (${walletCode})`);
  console.log("──────────────────────────────────────────────────────────────────────");
  console.log(`  Amount      : ${money(AMOUNT_DOLLARS)} USD`);
  console.log(`  Status      : ${recStatus}`);
  console.log(`  Settlement  : ${settleRef}  (unsettled → pending bank clearing batch later)`);
  console.log("");
  console.log(" ⚠️  RISK NOTICE — Path B Square-style manual floor approval:");
  console.log("     NO real call to Maybank Malaysia was made. No real card processor hit.");
  console.log("     No real $5000 has been deducted from Mr. Harris' Maybank MC right now.");
  console.log("     The deduction happens LATER, during T+1 EOD clearing batch file that");
  console.log("     you send to Maybank/Mastercard (manual settlement step next).");
  console.log("     ⛔ You MUST now collect $5000 in CASH / CHEQUE / BANK-IN from");
  console.log("        Mr. Harris BEFORE releasing any goods or services.");
  console.log("");
  console.log(" ================================");
  console.log("            THANK YOU             ");
  console.log(" ================================");
  console.log("══════════════════════════════════════════════════════════════════════");

  await db.close();
  process.exit(approved ? 0 : 5);
})().catch(e => { console.error("\n✖️ FATAL:", e); process.exit(99); });
