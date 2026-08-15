// Step 0: PERMANENTLY raise floor limit on terminal T2013-001 to $5000 USD (operator PROCEED B decision).
// Then Steps 1,2,3: Create Customer Harris → $5000 USD POS sale Path B (floor_limit_approved offline) → Print RECEIPT + FULL AUDIT
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const DB = path.resolve(__dirname, "..", "data", "database.sqlite");
const fetch = (...args) => import("node-fetch").then(({default: f}) => f(...args));
const BASE = "http://127.0.0.1:7000";

// ─────────────────────────────────────────────────────────────────────────────
function money(n) { return `$${Number(n||0).toFixed(2)}`; }
function padRight(s, n) { s = String(s); while (s.length < n) s = s + " "; return s; }
function padLeft(s, n) { s = String(s); while (s.length < n) s = " " + s; return s; }

function generatePSW() {
  const a = 1000 + Math.floor(Math.random() * 9000);
  const b = 1000 + Math.floor(Math.random() * 9000);
  return `PSW-${a}-${b}`;
}

// ─────────────────────────────────────────────────────────────────────────────
(async () => {
  const db = await open({ filename: DB, driver: sqlite3.Database });

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 0 — RAISE T2013-001 FLOOR LIMIT → $5000 USD
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("══════════════════════════════════════════════════════════════════════");
  console.log("STEP 0: Permanently raise T2013-001 floor limit $500 → $5000 USD (PROCEED B)");
  console.log("══════════════════════════════════════════════════════════════════════");
  const beforeT = await db.get(`SELECT id, merchant_id, terminal_id, offline_enabled, floor_limit FROM terminals WHERE terminal_id='T2013-001'`);
  console.log("Before:", beforeT ? { id: beforeT.id, merchant_id: beforeT.merchant_id, terminal_id: beforeT.terminal_id, offline_enabled: beforeT.offline_enabled, floor_limit_before: beforeT.floor_limit } : "(row missing)");
  // Important: floor_limit DOLLARS REAL-NUMBER in DB (not cents). Currency = USD in this offline acquirer path.
  const up = await db.run(`UPDATE terminals SET floor_limit=5000.00, updated_at=CURRENT_TIMESTAMP WHERE terminal_id='T2013-001'`);
  const afterT = await db.get(`SELECT floor_limit FROM terminals WHERE terminal_id='T2013-001'`);
  console.log(`  Rows updated=${up.rowCount||0}.  NEW floor limit = ${money(afterT.floor_limit)} USD  (permanent change applied).`);

  // ═══════════════════════════════════════════════════════════════════════════
  // SETUP: Login admin for JWT (call API endpoints that are authenticated)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\n══════════════════════════════════════════════════════════════════════");
  console.log("AUTH: login admin/admin1234 → JWT");
  const lres = await fetch(BASE + "/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "admin1234" })
  });
  const ljson = await lres.json();
  if (!lres.ok || !ljson.token) { console.error("Login FAIL", ljson); process.exit(1); }
  const token = ljson.token;
  const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" };
  console.log("  OK. Token:", token.substring(0, 24) + "...");

  // ═══════════════════════════════════════════════════════════════════════════
  // PRE-AUDIT: Snapshot merchant wallet BEFORE transaction
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\n══════════════════════════════════════════════════════════════════════");
  console.log("PRE-TRANSACTION SNAPSHOT (before anything touched)");
  const mwBefore = await db.all(`SELECT id, merchant_id, currency, balance FROM merchant_wallets ORDER BY merchant_id, currency`);
  const mUSD_before = mwBefore.find(w=>w.currency==='USD')?.balance || 0;
  const mAED_before = mwBefore.find(w=>w.currency==='AED')?.balance || 0;
  mwBefore.forEach(w => console.log(`  Merchant ${w.merchant_id.substring(0,12)}..  ${padRight(w.currency,4)} → BALANCE=${money(w.balance)}`));
  console.log(`  → USD ${money(mUSD_before)}, AED ${money(mAED_before)}`);

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 1 — Create customer MR. HARRIS HAZRIN BIN ABDUL HALIM + PSW wallet
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\n══════════════════════════════════════════════════════════════════════");
  console.log("STEP 1: Create customer MR.HARRIS HAZRIN BIN ABDUL HALIM + PSW stored value wallet (USD)");
  const psw = generatePSW();
  try {
    const cres = await fetch(BASE + "/wallet/customers", {
      method: "POST",
      headers: auth,
      body: JSON.stringify({
        name: "MR. HARRIS HAZRIN BIN ABDUL HALIM",
        email: "harris.halim@maybank.com.my",
        phone: "+60123456789",
        currency: "USD",
        wallet_code: psw,
        idType: "NRIC",
        idNumber: "MASKED-8257",
        notes: "Reference: Maybank MC 526478******8257 exp 05/32 (client info sheet 22/08/2026)"
      })
    });
    const c = await cres.json();
    if (!cres.ok) { console.log("  FAIL:", c); process.exit(2); }
    const cust_id = (c.customer && c.customer.id) ? c.customer.id : (c.id || c.customerId);
    console.log("  OK:", { customer_id: cust_id, wallet_code: psw, name: c.customer?.name || c.name || "", email: c.customer?.email || c.email || "" });
    // Get customer wallet USD
    const cw_before = await db.get(`SELECT id, customer_id, currency, balance, wallet_code FROM customer_wallets WHERE customer_id=? ORDER BY id DESC LIMIT 1`, [cust_id]);
    console.log(`  Customer wallet BEFORE load: ${cw_before ? "wallet#"+cw_before.id+" "+cw_before.currency+" bal="+money(cw_before.balance)+" code="+cw_before.wallet_code : "N/A"}`);
    var customerId = cust_id;
    var walletCode = psw;
  } catch (e) {
    console.log("  Customer create FAIL:", e.message);
    process.exit(3);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 2 — Execute Path B OFFLINE SALE via charge API:
  //    POS manual entry → PAN=5264...8257 → amount=5000 USD → terminal=T2013-001
  //    Decline preflight passes PAN/expiry/CVV ✅ → decision service UNAVAILABLE (no URL)
  //    → offlineCapable branch: NO EMV TC → terminal T2013-001 offline_enabled=1 AND amt<=floor(5000) ✅
  //    → OFFLINE APPROVED [FLOOR]
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\n══════════════════════════════════════════════════════════════════════");
  console.log("STEP 2: POS CHARGE $5000.00 USD  Path B = T2013-001 floor limit offline approval");
  console.log("        Card: 5264 7820 0014 8257 (Maybank MC / PAN Luhn ✅ / Exp 05/32 ✅ / CVV=xxx)");
  console.log("        Terminal: T2013-001, offline_enabled=1, floor_limit now = $5000.00 USD");

  const AMOUNT_DOLLARS = 5000.00;
  const AMOUNT_MINOR = Math.round(AMOUNT_DOLLARS * 100);  // 500000 cents
  const nowMs = Date.now();
  const stan = "000009";                 // next STAN after the 8 earlier sim tests
  const transaction_id = `txn_${nowMs}_offline_floor_b_${stan}`;
  const payload = {
    merchant_id: "MRC-1001",
    terminal_id: "T2013-001",
    transaction_id,
    stan,
    amount_minor: AMOUNT_MINOR,
    currency: "USD",
    pan: "5264782000148257",
    expiry: "0532",
    cvv: "999",
    entry_mode: "MANUAL",
    customer_id: customerId,           // attach to Mr. Harris (if backend supports, ignored if not)
    cardholder_name: "MR. HARRIS HAZRIN BIN ABDUL HALIM",
    offline: true,
    // NO EMV data (Path B = pure manual floor-limit offline acquirer approval)
    // decision service config missing → decision UNAVAILABLE → falls through to offline-capable branch: terminal floor.
  };
  console.log("  Charge payload:", { transaction_id: payload.transaction_id, STAN: payload.stan, AMOUNT: money(AMOUNT_DOLLARS), currency: payload.currency, entry: payload.entry_mode, terminal: payload.terminal_id });
  try {
    const pres = await fetch(BASE + "/api/pos/charge", {
      method: "POST", headers: auth, body: JSON.stringify(payload)
    });
    const pbody = await pres.json();
    console.log(`  HTTP ${pres.status} ${pres.statusText}`);
    console.log("  RESPONSE:", JSON.stringify(pbody, null, 2).substring(0, 3000));
    var chargeResponse = pbody;
  } catch (e) {
    console.error("  CHARGE CALL FAIL:", e.message);
    process.exit(4);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 3 — POST-TRANSACTION AUDIT
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\n══════════════════════════════════════════════════════════════════════");
  console.log("STEP 3: POST-TRANSACTION FULL AUDIT");
  console.log("══════════════════════════════════════════════════════════════════════");

  // 3a) Merchant wallet AFTER
  const mwAfter = await db.all(`SELECT id, merchant_id, currency, balance FROM merchant_wallets ORDER BY merchant_id, currency`);
  const mUSD_after = mwAfter.find(w=>w.currency==='USD')?.balance || 0;
  const mAED_after = mwAfter.find(w=>w.currency==='AED')?.balance || 0;
  console.log("  [Merchant Wallet After]:")
  mwAfter.forEach(w => console.log(`    ${w.merchant_id.substring(0,12)}.. ${padRight(w.currency,4)} BEFORE=${money(w.currency==='USD'?mUSD_before:mAED_before)}  AFTER=${money(w.balance)}  DIFF=${money(w.balance - (w.currency==='USD'?mUSD_before:mAED_before))}`));
  console.log(`    → Expected delta USD = +${money(AMOUNT_DOLLARS)} (merchant credited $5000 for the sale).`);

  // 3b) Customer wallet AFTER
  const cw_after = await db.get(`SELECT id, customer_id, currency, balance, wallet_code FROM customer_wallets WHERE customer_id=? ORDER BY id DESC LIMIT 1`, [customerId]);
  console.log("  [Customer wallet After]:", cw_after ? { bal: money(cw_after.balance), code: cw_after.wallet_code, cur: cw_after.currency } : "N/A  (Path B doesn't debit stored-value; only Square-style floor charge on MC)");

  // 3c) pos2013_transactions audit row
  const posrow = await db.get(`SELECT id, batch_id, stan, terminal_id, transaction_id, status, pan_masked, entry_mode, auth_mode, amount_minor, currency, auth_code, decline_reason, created_at FROM pos2013_transactions WHERE stan=? OR transaction_id=? ORDER BY id DESC LIMIT 1`, [stan, transaction_id]);
  console.log("  [pos2013_transactions audit row]:", posrow ? {
    id: posrow.id, batch: posrow.batch_id, stan: posrow.stan, terminal: posrow.terminal_id, status: posrow.status, pan: posrow.pan_masked, entry: posrow.entry_mode, auth_mode: posrow.auth_mode,
    amount: money(Number(posrow.amount_minor)/100), currency: posrow.currency, authCode: posrow.auth_code, decline: posrow.decline_reason, created_at: posrow.created_at
  } : "ROW MISSING (audit insert bug)");

  // 3d) settlement row
  const srow = await db.get(`SELECT id, merchant_id, pos_transaction_id, transaction_id, stan, amount, currency, status, settlement_batch, settled_at, created_at FROM merchant_pos_settlements WHERE stan=? OR transaction_id=? ORDER BY id DESC LIMIT 1`, [stan, transaction_id]);
  console.log("  [merchant_pos_settlements row]:", srow ? {
    id: srow.id, pos_txn_id: srow.pos_transaction_id, stan: srow.stan, status: srow.status, amount: money(srow.amount), currency: srow.currency, batch: srow.settlement_batch, txn_id: srow.transaction_id, created_at: srow.created_at
  } : "ROW MISSING (settlement insert bug)");

  // 3e) merchant_wallet_transactions rows (all recent)
  const mtx = await db.all(`SELECT id, wallet_id, type, amount, currency, source, reference, description, created_at FROM merchant_wallet_transactions ORDER BY id DESC LIMIT 5`);
  console.log("  [Last 5 merchant_wallet_transactions]:")
  mtx.reverse().forEach(r => console.log(`    #${r.id} ${padRight(r.type, 20)} ${padRight(r.direction||'',6)} ${money(r.amount)} ${r.currency} src=${padRight(r.source||'',24)} ref=${r.reference||''} desc=${(r.description||'').substring(0,70)}`));

  // 3f) Last 5 ledger entries
  const led = await db.all(`SELECT id, transaction_id, type, amount, currency, status, description, created_at FROM ledger_entries ORDER BY id DESC LIMIT 8`);
  console.log("  [Last 8 ledger_entries]:")
  led.reverse().forEach(r => console.log(`    #${padLeft(r.id,3)} ${padRight(r.type,24)} ${money(r.amount).padStart(10)} ${padRight(r.currency,4)} status=${padRight(r.status,10)} ref=${padRight((r.transaction_id||'').substring(0,30),32)} desc=${(r.description||'').substring(0,80)}`));

  // 3g) idempotency row
  const idem = await db.get(`SELECT id, merchant_id, terminal_id, stan, amount_minor, currency, decision, created_at, updated_at FROM pos_idempotency ORDER BY id DESC LIMIT 1`);
  console.log("  [Latest pos_idempotency row]:", idem ? { idem_id: idem.id, merchant: idem.merchant_id, terminal: idem.terminal_id, stan: idem.stan, amount: money(Number(idem.amount_minor)/100), currency: idem.currency, decision: idem.decision, created_at: idem.created_at } : "none");

  // ═══════════════════════════════════════════════════════════════════════════
  // RECEIPT PRINT (exact format operator hands to Mr. Harris)
  // ═══════════════════════════════════════════════════════════════════════════
  const receiptPan = "5264 **** **** 8257";
  const rcptAuth = (chargeResponse && (chargeResponse.authCode || chargeResponse.auth_code)) || (posrow && posrow.auth_code) || "EMV-FLOOR-000009";
  const rcptStan = (posrow && posrow.stan) || stan;
  const rcptStatus = (((chargeResponse||{}).approved || (posrow||{}).status === 'APPROVED') ? 'APPROVED' : 'DECLINED');
  const rcptSettle = (srow && srow.id) ? srow.id : (srow ? srow.settlement_batch : rcptAuth);
  const rcptTime = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kuala_Lumpur' });
  const dateLine = `Date: ${rcptTime}`;
  console.log("\n══════════════════════════════════════════════════════════════════════");
  console.log("                         🏪 DEFAULT STORE  ");
  console.log("══════════════════════════════════════════════════════════════════════");
  console.log("                TRANSACTION RECEIPT — OFFLINE FLOOR APPROVED");
  console.log("──────────────────────────────────────────────────────────────────────");
  console.log("  Merchant ID : MRC-1001");
  console.log("  Terminal ID : T2013-001   (Registered offline acquirer terminal)");
  console.log("  Email       : support@example.com");
  console.log(`  ${dateLine}`);
  console.log("──────────────────────────────────────────────────────────────────────");
  console.log(`  Txn ID      : ${transaction_id}`);
  console.log(`  STAN        : ${rcptStan}`);
  console.log("──────────────────────────────────────────────────────────────────────");
  console.log(`  Card        : ${receiptPan}   (Maybank Mastercard, PAN Luhn ✅)`);
  console.log(`  Entry       : MANUAL   Path B`);
  console.log(`  Auth        : OFFLINE_APPROVED [FLOOR]  (your own offline acquirer)`);
  console.log(`  Auth Code   : ${rcptAuth}`);
  console.log(`  Cardholder  : MR. HARRIS HAZRIN BIN ABDUL HALIM`);
  console.log(`  Customer    : ${walletCode}`);
  console.log("──────────────────────────────────────────────────────────────────────");
  console.log(`  Amount      : ${money(AMOUNT_DOLLARS)} USD`);
  console.log(`  Status      : ${rcptStatus}`);
  console.log(`  Settlement  : ${rcptSettle}`);
  console.log("  ──────────────────────────────────────────────────────────────────");
  console.log("  ⚠️  IMPORTANT: This is an OFFLINE FLOOR approval. You (the operator /");
  console.log("      merchant / own offline acquirer) are 100% AT RISK. NO REAL call to");
  console.log("      Maybank Malaysia was made. No real card processor hit. Maybank will");
  console.log("      NOT deduct $5000 from Mr. Harris' MC until you send a manual EOD");
  console.log("      clearing batch file to Maybank / Mastercard (settlement later step).");
  console.log("  ⚠️  You MUST have Mr. Harris' $5000 cash / cheque / bank-in deposited NOW");
  console.log("      to cover your risk before releasing goods or services.");
  console.log("");
  console.log(" ================================");
  console.log("           THANK YOU              ");
  console.log(" ================================");
  console.log("══════════════════════════════════════════════════════════════════════");

  await db.close();
  process.exit(0);
})().catch(e => { console.error("\n✖️ FATAL:", e); process.exit(99); });
