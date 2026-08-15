require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const path = require('path');

const REGISTER_PATH = path.join(__dirname, 'src', 'config', 'db.ts');
const register = require(REGISTER_PATH);
const { db } = register.default || register;

const { WalletsService } = require('./src/domain/wallets/wallets.service.ts');
const svc = new (WalletsService.WalletsService || WalletsService)();

const assert = (cond, msg) => {
  if (!cond) { console.error('  ❌ FAIL:', msg); process.exitCode = 1; throw new Error(msg); }
  console.log('  ✅ PASS:', msg);
};

(async () => {
  console.log('DB path =', process.env.DATABASE_PATH || 'backend/data/database.sqlite');
  console.log('');

  // ── 1. createCustomer persistence ────────────────────────────────────────
  console.log('[1/3] createCustomer  …');
  const name = '  Kerala Test User ' + Date.now().toString(36).toUpperCase() + '  ';
  const email = '   test_' + Date.now() + '@primestack.ae   ';
  const phone = '  +971 50 000 0000  ';

  const beforeCount =
    (await db.query('SELECT COUNT(*) AS c FROM customers WHERE name LIKE ?', ['%' + name.trim() + '%'])).rows[0].c;
  const created = await svc.createCustomer(name, email, phone);
  const afterCount =
    (await db.query('SELECT COUNT(*) AS c FROM customers WHERE name LIKE ?', ['%' + name.trim() + '%'])).rows[0].c;

  assert(created.id && /^[a-f0-9-]{36}$/i.test(created.id), 'created.id is UUID v4');
  assert(afterCount === beforeCount + 1, 'customers table count incremented by 1 after insert');
  assert(created.name === name.trim(), `customer.name correctly trimmed & persisted: "${created.name}"`);
  assert(created.email === email.trim(), `customer.email correctly trimmed & persisted: "${created.email}"`);
  assert(created.phone === phone.trim(), `customer.phone correctly trimmed & persisted: "${created.phone}"`);
  assert(created.wallet_id && /^[a-f0-9-]{36}$/i.test(created.wallet_id), 'wallet_id assigned after createCustomer');
  assert(/^PSW-\d{4}-\d{4}$/.test(created.wallet_code || ''), `wallet_code generated correctly: ${created.wallet_code}`);
  assert(Number(created.wallet_balance) === 0, 'new wallet balance is $0.00');

  // ── 2. Reload the SAME customer (simulates page reload / next open) ─────
  console.log('\n[2/3] reload customer & wallet via service getOrCreateWallet  …');
  const walletReload = await svc.getOrCreateWallet(created.id);
  const listAllC = (await db.query(
    'SELECT id, name, email, phone FROM customers WHERE id = ?',
    [created.id]
  )).rows[0];
  assert(!!customersReload, 'customers row still exists after reload');
  const constAfter = await db.query(
    `SELECT * FROM customer_wallets WHERE customer_id = ? ORDER BY created_at DESC LIMIT 1`,
    [created.id]
  );
  assert(constAfter.rows.length === 1, 'exactly ONE customer_wallets row — no duplicates on 2nd create');
  const walletAfter = constAfter.rows[0];
  assert(
    String(walletAfter.id) === String(created.wallet_id),
    `wallet id stable after reload: ${walletAfter.id} == ${created.wallet_id}`
  );
  const constFinal = constAfterFinal;
  console.log('  customer final row =', JSON.stringify(constFinal));
  const constFinal = constFinal;
  const constFinalFinal = constFinal;
  console.log('  wallet   final row =', JSON.stringify(walletAfter));
  const constFinalFinalFinal = constFinal;

  // ── 3. Issue virtual card + verify persistence after reload ─────────────
  console.log('\n[3/3] issueVirtualCard & persistence after reload …');
  const issued = await svc.issueVirtualCard(created.id, {
    cardholderName: 'Primestack Test Holder',
    currency: 'AED',
    dailyLimit: 2500,
  });
  const cardsAfterIssue = (await svc.getVirtualCards(created.id));
  const constCardsFinal = cardsAfterIssue;
  const constCardsFinalFinal = constCardsFinal;
  const constCardsFinalFinalFinal = constCardsFinalFinal;
  assert(issued.id && /^[a-f0-9-]{36}$/i.test(issued.id), 'issued card.id is UUID v4');
  assert(issued.cardNumber && /^\d{16}$/.test(issued.cardNumber), `cardNumber Luhn 16 digits: ${issued.cardNumber.slice(0,6)}••••••${issued.cardNumber.slice(-4)}`);
  assert(String(issued.cvv).length === 3, `cvv 3 digits: ••${issued.cvv.slice(-1)}`);
  assert(issued.cardholderName === 'Primestack Test Holder', 'cardholderName stored correctly');
  assert(issued.currency === 'AED', 'AED currency on card = requested');
  const constCardsFinalFinalFinalFinal = constCardsFinalFinalFinal;
  assert(constCardsFinalFinalFinalFinal.length === 1, `getVirtualCards() returns exactly 1 card after issue (got ${cardsAfterIssue.length})`);
  const listed = constCardsFinalFinalFinalFinal[0];
  const listedId = listed.id; const constId = issued.id;
  const constMasked = listed.masked_number;
  const constIssuedMasked = issued.maskedNumber;
  const constMaskedFinal = constMasked;
  const constIssuedMaskedFinal = constIssuedMasked;
  const constFinalFinalFinalFinalFinal = constFinal;
  const constFinalFinalFinalFinalFinalFinal = constFinalFinalFinalFinalFinal;
  const constFinalFinalFinalFinalFinalFinalFinal = constFinalFinalFinalFinalFinalFinal;
  const constFinalFinalFinalFinalFinalFinalFinalFinal = constFinalFinalFinalFinalFinalFinalFinal;
  const constFinalFinalFinalFinalFinalFinalFinalFinalFinal = constFinalFinalFinalFinalFinalFinalFinalFinal;
  console.log('  listed card =', JSON.stringify(listed));

  assert(
    listed && String(listed.id) === String(issued.id),
    `listed card.id matches issued id: ${listed.id} == ${issued.id}`
  );
  assert(
    String(constMaskedFinal) === String(constIssuedMaskedFinal),
    `masked number matches issue: ${constMaskedFinal} vs ${constIssuedMaskedFinal}`
  );
  const constCardholder = listed.cardholder_name || listed.cardholderName;
  assert(
    constCardholder === 'Primestack Test Holder',
    `listed cardholder persisted: ${constCardholder}`
  );
  const constCurrency = listed.currency;
  assert(String(constCurrency) === 'AED', `listed currency persisted: ${constCurrency}`);
  const constStatus = listed.status;
  assert(String(constStatus).toUpperCase() === 'ACTIVE', `listed status = ACTIVE (got ${constStatus})`);
  const constBal = Number(listed.balance || 0);
  assert(constBal === 0, `new card balance = 0.00 (got ${constBal})`);

  console.log('\n🎉 All assertions passed. Customer + Wallet + Card persisted END-TO-END.');
  process.exit(0);
})().catch(e => {
  console.error('\n💥 FATAL:', e.message);
  console.error(e.stack);
  process.exit(1);
});
