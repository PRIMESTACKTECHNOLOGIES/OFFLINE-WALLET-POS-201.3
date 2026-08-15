const path = require('path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const dbPath = path.join(__dirname, '..', 'data', 'database.sqlite');

(async function main() {
  const db = await open({ filename: dbPath, driver: sqlite3.Database });
  const run = async (sql, params = []) => { try { return (await db.all(sql, params)) || []; } catch (e) { return [{ ERROR: e.message.slice(0,120) }]; } };

  console.log('=== CUSTOMERS + WALLETS (all columns) ===');
  const colsCust = await run('PRAGMA table_info(customers)');
  console.log('customers columns:', colsCust.map(c => c.name).join(','));
  const colsCW = await run('PRAGMA table_info(customer_wallets)');
  console.log('customer_wallets columns:', colsCW.map(c => c.name).join(','));
  const colsCCW = await run('PRAGMA table_info(customer_crypto_wallets)');
  console.log('customer_crypto_wallets columns:', colsCCW.map(c => c.name).join(','));
  const colsMW = await run('PRAGMA table_info(merchant_wallets)');
  console.log('merchant_wallets columns:', colsMW.map(c => c.name).join(','));

  const customers = await run('SELECT * FROM customers ORDER BY COALESCE(created_at, id) ASC');
  for (const c of customers) {
    console.log('\nCUSTOMER:', JSON.stringify(c));
    const fiats = await run('SELECT * FROM customer_wallets WHERE customer_id = ?', [c.id]);
    fiats.forEach(f => console.log('  fiat   ', JSON.stringify(f)));
    const cryptos = await run('SELECT * FROM customer_crypto_wallets WHERE customer_id = ?', [c.id]);
    cryptos.forEach(k => console.log('  crypto ', JSON.stringify(k)));
  }

  console.log('\n=== MERCHANT_WALLETS rows ===');
  (await run('SELECT * FROM merchant_wallets')).forEach(mw => console.log(JSON.stringify(mw)));
  console.log('\n=== MERCHANT_BUSINESS_INFO rows ===');
  (await run('SELECT * FROM merchant_business_info')).forEach(mw => console.log(JSON.stringify(mw)));
  console.log('\n=== MERCHANT_SETTINGS rows ===');
  (await run('SELECT * FROM merchant_settings')).forEach(mw => console.log(JSON.stringify(mw)));

  console.log('\n=== SUM TOTALS ===');
  const one = async (sql, params=[]) => { const r = await run(sql, params); return r && r[0] ? Number(Object.values(r[0])[0] || 0) : 0; };
  console.log('Customer fiat total:              ', await one("SELECT COALESCE(SUM(balance),0) FROM customer_wallets"));
  console.log('Customer USDT  total (internal):  ', await one("SELECT COALESCE(SUM(balance),0) FROM customer_crypto_wallets WHERE crypto_coin='USDT'"));
  console.log('Customer BTC   total (internal):  ', await one("SELECT COALESCE(SUM(balance),0) FROM customer_crypto_wallets WHERE crypto_coin='BTC'"));
  console.log('Customer ETH   total (internal):  ', await one("SELECT COALESCE(SUM(balance),0) FROM customer_crypto_wallets WHERE crypto_coin='ETH'"));
  console.log('Merchant fiat total:               ', await one("SELECT COALESCE(SUM(balance),0) FROM merchant_wallets"));
  console.log('Merchant crypto USDT total:        ', await one("SELECT COALESCE(SUM(balance),0) FROM merchant_crypto_balances WHERE crypto_coin='USDT'"));

  console.log('\n=== ADMIN USERS ===');
  (await run('SELECT id,username,email,role,name FROM admin_users')).forEach(a => console.log(JSON.stringify(a)));

  console.log('\n=== PRODUCTS ===');
  (await run('SELECT * FROM products')).forEach(p => console.log(JSON.stringify(p)));

  console.log('\n=== TERMINALS ===');
  (await run('SELECT * FROM terminals')).forEach(t => console.log(JSON.stringify(t)));

  await db.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
