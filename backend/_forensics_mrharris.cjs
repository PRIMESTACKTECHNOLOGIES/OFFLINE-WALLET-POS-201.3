const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const DB = path.join(__dirname, 'data', 'database.sqlite');
const db = new sqlite3.Database(DB);
const Q = (s, p=[]) => new Promise((rs, rj) => db.all(s, p, (e, r) => e ? rj(e) : rs(r)));

const NAME = 'MR.HARRIS HAZRIN BIN ABDUL HALIM';
const CUST_ID = '1e109c8a-ff9a-4950-b94f-337ba3b3d650';

(async () => {
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log(`  MR.HARRIS CUSTOMER + WALLET FORENSIC AUDIT  (id=${CUST_ID.slice(0,8)}…)`);
  console.log('═══════════════════════════════════════════════════════════════════════\n');

  // 1. Customer row
  const cust = (await Q(`SELECT * FROM customers WHERE id=?`, [CUST_ID]))[0];
  if (!cust) { console.log('  ❌ CUSTOMER NOT FOUND. Abort.'); process.exit(1); }
  console.log('── Customer Row ──────────────────────────────────────────────────');
  Object.keys(cust).forEach(k => console.log(`   ${k.padEnd(20)} : ${JSON.stringify(cust[k]).slice(0,120)}`));
  console.log('');

  // 2. All wallets (fiat + crypto + virtual cards)
  console.log('── Fiat Wallets ──────────────────────────────────────────────────');
  const fiats = await Q(`SELECT * FROM customer_wallets WHERE customer_id=? ORDER BY currency`, [CUST_ID]);
  fiats.forEach(w => { console.log(''); Object.keys(w).forEach(k => console.log(`   ${k.padEnd(20)} : ${String(w[k]).slice(0,120)}`)); });
  if (fiats.length === 0) console.log('  (no rows)');

  console.log('\n── Crypto Wallets ────────────────────────────────────────────────');
  const cryptos = await Q(`SELECT * FROM customer_crypto_wallets WHERE customer_id=? ORDER BY crypto_coin`, [CUST_ID]);
  cryptos.forEach(w => { console.log(''); Object.keys(w).forEach(k => console.log(`   ${k.padEnd(20)} : ${String(w[k]).slice(0,120)}`)); });
  if (cryptos.length === 0) console.log('  (no rows)');

  console.log('\n── Virtual Cards (issued to MR.HARRIS) ───────────────────────────');
  const vcs = await Q(`SELECT * FROM virtual_cards WHERE customer_id=? ORDER BY created_at DESC`, [CUST_ID]);
  vcs.forEach(c => { console.log(''); Object.keys(c).forEach(k => console.log(`   ${k.padEnd(20)} : ${String(c[k]).slice(0,120)}`)); });
  if (vcs.length === 0) console.log('  (no virtual cards issued)');

  // 3. All wallet_transactions (detailed)
  console.log('\n── Fiat Wallet Transactions (by wallet_id JOIN) ───────────────────');
  const txs = await Q(`SELECT t.* FROM wallet_transactions t
    JOIN customer_wallets w ON w.id=t.wallet_id
    WHERE w.customer_id=? ORDER BY datetime(t.created_at) ASC`, [CUST_ID]);
  if (txs.length === 0) console.log('  (empty — no fiat tx ever written)');
  txs.forEach(t => {
    const ts = String(t.created_at).replace('T',' ').slice(0,19);
    console.log(`   ${ts}  ${String(t.type).padEnd(7)} ${Number(t.amount).toFixed(2).padStart(10)} ${t.currency||'USD'}  src=${String(t.source||'').padEnd(20)}  ref=${String(t.reference||'').padEnd(28)}  desc=${String(t.description||'').slice(0,50)}`);
  });

  // 4. All crypto_transactions
  console.log('\n── Crypto Transactions (customer_id) ──────────────────────────────');
  const cts = await Q(`SELECT * FROM crypto_transactions WHERE customer_id=? ORDER BY datetime(created_at) ASC`, [CUST_ID]);
  if (cts.length === 0) console.log('  (none)');
  cts.forEach(t => {
    const ts = String(t.created_at).replace('T',' ').slice(0,19);
    console.log(`   ${ts}  [${String(t.status).padEnd(10)}] ${String(t.transaction_type).padEnd(11)} ${Number(t.fiat_amount).toFixed(2).padStart(10)} ${t.fiat_currency} → ${Number(t.crypto_amount).toFixed(8).padStart(18)} ${t.crypto_coin}  src=${t.source||''} mode=${t.provider_mode||''}`);
  });

  // 5. Top-up / card-charge related tables (customer_cards, terminal_transactions, offline_batches, physical_terminal, store etc)
  for (const t of [
    ['customer_cards', `WHERE customer_id='${CUST_ID}'`],
    ['card_transactions', `WHERE customer_id='${CUST_ID}' OR card_id IN (select id from customer_cards where customer_id='${CUST_ID}')`],
    ['offline_batches', `WHERE customer_id='${CUST_ID}'`],
    ['terminal_transactions', `WHERE customer_id='${CUST_ID}'`],
    ['pos_terminal_sessions', `WHERE customer_id='${CUST_ID}'`],
  ]) {
    try {
      const rows = await Q(`SELECT * FROM ${t[0]} ${t[1]} ORDER BY datetime(created_at) DESC LIMIT 5`);
      if (rows.length) {
        console.log(`\n── ${t[0].toUpperCase()} (last ${rows.length}) ───────────────`);
        rows.forEach(r => {
          const line = Object.entries(r).map(([k,v]) => `${k}=${String(v).slice(0,40)}`).join(' | ');
          console.log('   ', line.slice(0, 240));
        });
      }
    } catch (e) { /* table missing */ }
  }

  // 6. SUMMARIZE CURRENT BALANCE STATES
  console.log('\n═══════════════════════════════════════════════════════════════════════');
  console.log('  CURRENT STATE SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════════════\n');

  const sumFiat = fiats.reduce((s,w)=>s+Number(w.balance||0),0);
  const sumCrypto = cryptos.reduce((s,w)=>s+Number(w.balance||0),0);
  console.log(`  Customer name         : ${cust.name}`);
  console.log(`  Customer status       : ${cust.status || '(NULL)'}`);
  console.log(`  Fiat wallets (count)  : ${fiats.length}`);
  fiats.forEach(w => console.log(`     · [${String(w.currency||'USD').padEnd(4)}] code=${String(w.wallet_code||'(NO WALLET_CODE!)').padEnd(16)}  bal=${String(Number(w.balance||0)).padStart(14)}  status=${w.status}`));
  console.log(`  Virtual cards (count) : ${vcs.length}`);
  vcs.forEach(v => console.log(`     · ${v.card_brand||''} ${v.card_scheme||''} last4=${String(v.last4||'????').padEnd(4)} status=${v.status} bal=${String(v.balance||0).padStart(10)} ${v.currency||'USD'}  card_id=${String(v.id).slice(0,8)}…`));
  console.log(`  Crypto wallets (count): ${cryptos.length}`);
  cryptos.forEach(w => console.log(`     · ${String(w.crypto_coin).padEnd(5)} bal=${Number(w.balance||0).toFixed(8).padStart(18)} addr=${w.crypto_address||'(internal)'} status=${w.status}`));
  console.log(`  Total fiat balance    : $${sumFiat.toFixed(2)}`);
  console.log(`  Total tx history fiat : ${txs.length}`);
  console.log('');

  if (sumFiat <= 0) {
    console.log('  ⚠  5,000 USD CREDIT + 5,000 USD DEBIT CANCELLED OUT → NET $0\n');
    console.log('  TO ENABLE MR.HARRIS TO SPEND / BUY CRYPTO / CASHOUT —');
    console.log('     Option 1: RE-ISSUE THE $5,000 USD CREDIT (undo the 17:49:12 debit).');
    console.log('     Option 2: Run a new POS card top-up for MR.HARRIS again.');
    console.log('     Option 3: Admin top-up script: write wallet credit row + bal update.');
  } else {
    console.log('  🟢 Balance present — spend/crypto/cashout paths ready.');
  }
  db.close();
})().catch(e => { console.error(e); db.close(); process.exit(1); });
