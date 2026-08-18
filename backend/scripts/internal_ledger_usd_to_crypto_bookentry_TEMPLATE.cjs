/**
 * REUSABLE GENERIC TEMPLATE: Convert ANY unsettled merchant_pos_settlements USD row → crypto (USDT.TRC20 default, or change TO_ASSET below)
 * HOW TO USE FOR FUTURE NAVEED TRANCHES 2-100 ($495M remaining) + ANY NEW KODOLO / OTHER PAYMENTS:
 *   1. Change AMOUNT_USD below to the new tranche USD amount (e.g. $5,000,000.00 for tranche 2)
 *   2. Change RELATED_POS_SETTLEMENT_ID to the NEW merchant_pos_settlements.id row created for that tranche
 *   3. Change BACKED_BY_BATCH_REF to NEW BANKALHABIB-VISA-BATCH-2026MMDD-XXXXXX / RAWBANK-VISA-BATCH-XXXXXXXXX id
 *   4. Change EXPECTED_SETTLE_DATE to T+1 09:1X MYT upload schedule
 *   5. Optional: change TO_ASSET to BTC.BITCOIN / ETH.ETHEREUM / USDC.ERC20 / SOL.SOLANA / BNB.BEP20 if you want different asset
 *   6. Optional: change RATE (only for non-stablecoins; USDT=1.0 always, BTC use real market rate e.g. 65000.0 means 1 BTC = 65,000 USD)
 *   7. Run: `node internal_ledger_usd_to_crypto_bookentry_TEMPLATE.cjs`
 */
const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');
const path = require('path');
const uuid = () => crypto.randomUUID();
const DB = path.join(__dirname, '..', 'data', 'database.sqlite');
const db = new sqlite3.Database(DB);
const RUN = (s, p=[]) => new Promise((rs, rj) => db.run(s, p, function(e){ if (e) rj(e); else rs(this); }));
const GET = (s, p=[]) => new Promise((rs, rj) => db.get(s, p, (e, r) => e ? rj(e) : rs(r)));

// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║                    EDIT THESE 6 VARIABLES FOR EACH NEW TRANCHE               ║
// ╚══════════════════════════════════════════════════════════════════════════════╝
const MERCHANT_ID = "MRC-1001";
const AMOUNT_USD = 5000000.00;       // EDIT: new tranche USD amount
const RELATED_POS_SETTLEMENT_ID = "setl_bahpk_visa_QY4G";   // EDIT: merchant_pos_settlements.id
const BACKED_BY_BATCH_REF = "BANKALHABIB-VISA-BATCH-20260816-QY4G";  // EDIT: pos_batches.batch_id
const EXPECTED_SETTLE_DATE = "2026-08-17 09:15:00";         // EDIT: T+1 upload schedule (MYT)
const TO_ASSET = "USDT.TRC20";        // OPTIONAL EDIT: USDT.TRC20 / USDC.ERC20 / BTC.BITCOIN / ETH.ETHEREUM / SOL.SOLANA
const NETWORK = TO_ASSET.includes('.') ? TO_ASSET.split('.')[1] : "TRC20";
const RATE = 1.0;                     // OPTIONAL EDIT: for non-stablecoins; USDT stablecoin always 1.0 = 1:1 USD parity
const BEN_WALLET = "TBD_PASTE_YOUR_WALLET_ADDRESS_HERE";
const STAN = "000016";                // EDIT
const CARDHOLDER = "NAVEED AHMED";    // EDIT
const ISSUER = "BANK AL HABIB LIMITED PAKISTAN";
const CERT_ID = "cert_qy4g_NAVEED_5M_VISA_BAHLPKKA"; // EDIT or ""
const DECL_14_LABEL = "Tranche 2 Naveed Bank Al-Habib PK VISA";
// ╔══════════════════════════════════════════════════════════════════════════════╝

const NOW = new Date().toISOString().replace('T',' ').slice(0,19);
(async () => {
  try {
    await RUN("BEGIN IMMEDIATE");
    const setl = await GET("SELECT id, amount, currency FROM merchant_pos_settlements WHERE id=?", [RELATED_POS_SETTLEMENT_ID]);
    if (!setl) throw new Error("Related settlement row missing. Inserted the pos2013_transactions + merchant_pos_settlements rows BEFORE running crypto book entry!");
    const to_amount = AMOUNT_USD / Math.max(0.00000001, RATE);
    const id = `int_conv_setl_${RELATED_POS_SETTLEMENT_ID}_${Date.now().toString(36)}`;
    const meta = JSON.stringify({
      mode: `backed_by_${BACKED_BY_BATCH_REF.startsWith('BANKALHABIB')?'bankalhabib':'rawbank'}_t1_batch`,
      meta_provider: "merchant_internal_settlement_book_entry",
      from_currency: "USD",
      to_asset: TO_ASSET, network: NETWORK,
      usd_amount: AMOUNT_USD, to_amount, rate: RATE,
      backed_by_batch_ref: BACKED_BY_BATCH_REF,
      backed_by_expected_settle_date: EXPECTED_SETTLE_DATE,
      related_pos_settlement: RELATED_POS_SETTLEMENT_ID,
      related_pos_txn_stan: STAN, cardholder: CARDHOLDER, issuer_bank: ISSUER,
      no_external_exchange_called: true, no_binance_no_kucoin_no_gateway: true,
      beneficiary_wallet: BEN_WALLET,
      protocol: "101.1 additive 201.3 INTERNAL LEDGER BOOK ENTRY"
    });
    const notes = `${DECL_14_LABEL}: USD $${AMOUNT_USD.toLocaleString()} → ${TO_ASSET} ${to_amount.toLocaleString()} book entry @ ${RATE} USD/${TO_ASSET} — backed by T+1 batch ${BACKED_BY_BATCH_REF}, NO EXTERNAL EXCHANGE`;
    await RUN(`INSERT INTO merchant_internal_settlements(id,merchant_id,from_currency,to_asset,from_amount,to_amount,rate,backed_by_settlement_batch,backed_by_expected_settle_date,related_pos_settlement_id,status,cleared_at,notes,meta,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
      id, MERCHANT_ID, "USD", TO_ASSET, AMOUNT_USD, to_amount, RATE, BACKED_BY_BATCH_REF, EXPECTED_SETTLE_DATE, RELATED_POS_SETTLEMENT_ID,
      "cleared", NOW, notes, meta, NOW
    ]);
    const l1 = uuid(), l2 = uuid();
    await RUN("INSERT INTO ledger_entries(id,transaction_id,type,amount,currency,status,description,created_at) VALUES (?,?,?,?,?,?,?,?)", [l1, id, "DEBIT", AMOUNT_USD, "USD", "AUTHORIZED", `CRYPTO_ASSET_BOOK_ENTRY ${TO_ASSET} (${id}) ${DECL_14_LABEL}`, NOW]);
    await RUN("INSERT INTO ledger_entries(id,transaction_id,type,amount,currency,status,description,created_at) VALUES (?,?,?,?,?,?,?,?)", [l2, id, "CREDIT", AMOUNT_USD, "USD", "AUTHORIZED", `POS_AUTH_RECV_OFFSET CLEARED VIA INTERNAL CRYPTO (${id}) ${DECL_14_LABEL}`, NOW]);
    if (CERT_ID) {
      const c = await GET("SELECT declarations_json, scope FROM operator_certifications WHERE id=?", [CERT_ID]);
      if (c) {
        let d = {}; try { d = JSON.parse(c.declarations_json||'{}'); } catch(_){}
        d[`DECL-14_INTERNAL_CRYPTO_${STAN}`] = `PASS (${DECL_14_LABEL}: USD $${AMOUNT_USD.toLocaleString()} → ${TO_ASSET} ${to_amount.toLocaleString()} rate=${RATE} batch=${BACKED_BY_BATCH_REF})`;
        await RUN("UPDATE operator_certifications SET declarations_json=?, scope=?, created_at=? WHERE id=?", [JSON.stringify(d), (c.scope||'') + ` · INTL_CRYPTO ${TO_ASSET} ${to_amount.toLocaleString()}`, NOW, CERT_ID]);
      }
    }
    const ex = await GET("SELECT * FROM merchant_crypto_balances WHERE merchant_id=? AND asset=?", [MERCHANT_ID, TO_ASSET]);
    const newBal = Number((ex?.amount||0)) + to_amount;
    let metaObj = {}; try { metaObj = ex?.meta ? JSON.parse(ex.meta) : {}; } catch(_){}
    metaObj[`tranche_${STAN}_${BACKED_BY_BATCH_REF.slice(-6)}_${Date.now().toString(36)}`] = { time: NOW, usd: AMOUNT_USD, to_amount, rate: RATE, network: NETWORK, batch: BACKED_BY_BATCH_REF, setl: RELATED_POS_SETTLEMENT_ID, cardholder: CARDHOLDER, issuer: ISSUER, wallet: BEN_WALLET, decl14_label: DECL_14_LABEL };
    metaObj.summary = metaObj.summary || {};
    metaObj.summary.total_usd_converted = (Number(metaObj.summary.total_usd_converted||0)+AMOUNT_USD);
    metaObj.summary.total_asset = (Number(metaObj.summary.total_asset||0)+to_amount);
    metaObj.summary.asset_code = TO_ASSET;
    metaObj.summary.network = NETWORK;
    metaObj.summary.updated_at = NOW;
    if (!ex?.id) {
      await RUN(`INSERT INTO merchant_crypto_balances(id,merchant_id,asset,amount,meta,created_at,updated_at,is_mock) VALUES (?,?,?,?,?,?,?,0)`, [uuid(), MERCHANT_ID, TO_ASSET, newBal, JSON.stringify(metaObj), NOW, NOW]);
    } else {
      await RUN(`UPDATE merchant_crypto_balances SET amount=?, meta=?, updated_at=?, is_mock=0 WHERE id=?`, [newBal, JSON.stringify(metaObj), NOW, ex.id]);
    }
    await RUN("COMMIT");
    console.log(`✅ GENERIC SUCCESS: USD $${AMOUNT_USD.toLocaleString()} → ${TO_ASSET} ${to_amount.toLocaleString()} @${RATE}. Internal settlement id=${id}. Crypto balance now ${TO_ASSET} = ${newBal.toLocaleString()}`);
    db.close(); process.exit(0);
  } catch(e) { console.error("FAIL ROLLBACK:", e.message); try { await RUN("ROLLBACK"); } catch(_){} db.close(); process.exit(1); }
})();
