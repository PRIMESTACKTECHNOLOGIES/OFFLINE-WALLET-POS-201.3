const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

function openDb(dbPath) {
  return {
    db: new sqlite3.Database(dbPath),
    run(sql, params = []) {
      return new Promise((resolve, reject) => {
        this.db.run(sql, params, function(err) {
          if (err) reject(err);
          else resolve({ changes: this.changes, lastID: this.lastID });
        });
      });
    },
    all(sql, params = []) {
      return new Promise((resolve, reject) => {
        this.db.all(sql, params, (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
    },
    close() { this.db.close(); }
  };
}

function simulateNewCreateCustomer(dbAccess, name, email, phone) {
  const trimmedName = (name || '').trim();
  if (!trimmedName) throw new Error('Customer name is required');
  if (trimmedName.length < 2) throw new Error('Customer name must be at least 2 characters');
  if (trimmedName.length > 120) throw new Error('Customer name too long (max 120 chars)');

  const safeEmail = email && email.trim() ? email.trim() : null;
  const safePhone = phone && phone.trim() ? phone.trim() : null;
  return { trimmedName, safeEmail, safePhone };
}

function generateWalletCode() {
  return 'PSW-' + Math.floor(Math.random()*9000+1000) + '-' + Math.floor(Math.random()*9000+1000);
}

(async () => {
  const correctDb = path.join(__dirname, 'data', 'database.sqlite');
  const dbo = openDb(correctDb);

  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try { fn(); console.log('  ✅ PASS:', name); passed++; }
    catch (e) { console.log('  ❌ FAIL:', name, '→', e.message); failed++; }
  }

  console.log('');
  console.log('═══ TEST 1: Service Layer Name Validation ═══');
  // Test trimming
  test('whitespace-only name rejected', () => {
    try { simulateNewCreateCustomer(dbo, '   ', null, null); throw new Error('should have thrown'); }
    catch (e) { if (!e.message.includes('required')) throw e; }
  });
  test('empty name rejected', () => {
    try { simulateNewCreateCustomer(dbo, '', null, null); throw new Error('should have thrown'); }
    catch (e) { if (!e.message.includes('required')) throw e; }
  });
  test('1-char name rejected', () => {
    try { simulateNewCreateCustomer(dbo, 'A', null, null); throw new Error('should have thrown'); }
    catch (e) { if (!e.message.includes('at least')) throw e; }
  });
  test('2-char name accepted', () => {
    const r = simulateNewCreateCustomer(dbo, 'AB', null, null);
    if (r.trimmedName !== 'AB') throw new Error('trim mismatch');
  });
  test('name trimmed', () => {
    const r = simulateNewCreateCustomer(dbo, '   John Doe   ', '  jd@x.com  ', '  123  ');
    if (r.trimmedName !== 'John Doe') throw new Error('name trim failed');
    if (r.safeEmail !== 'jd@x.com') throw new Error('email trim failed: ' + r.safeEmail);
    if (r.safePhone !== '123') throw new Error('phone trim failed');
  });
  test('>120 char name rejected', () => {
    try { simulateNewCreateCustomer(dbo, 'A'.repeat(121), null, null); throw new Error('should have thrown'); }
    catch (e) { if (!e.message.includes('too long')) throw e; }
  });
  test('null/undefined values become NULL (not undefined string)', () => {
    const r = simulateNewCreateCustomer(dbo, 'Valid Name', undefined, undefined);
    if (r.safeEmail !== null) throw new Error('email should be null, was: ' + JSON.stringify(r.safeEmail));
    if (r.safePhone !== null) throw new Error('phone should be null');
  });
  test('empty email/phone become null', () => {
    const r = simulateNewCreateCustomer(dbo, 'Valid Name', '   ', '  ');
    if (r.safeEmail !== null) throw new Error('empty email should normalize to null');
    if (r.safePhone !== null) throw new Error('empty phone should normalize to null');
  });

  console.log('');
  console.log('═══ TEST 2: Explicit Column SELECT (getCustomers-style query) ═══');
  const custs = await dbo.all(`
    SELECT c.id, c.name, c.email, c.phone, c.created_at, c.updated_at,
           w.id AS wallet_id, w.wallet_code, w.balance AS wallet_balance
    FROM customers c
    LEFT JOIN customer_wallets w ON w.customer_id = c.id
    ORDER BY c.created_at DESC
    LIMIT 3
  `);
  test('getCustomers returns explicit name column', () => {
    if (!custs.length) throw new Error('no customers');
    custs.forEach(c => {
      if (!('name' in c)) throw new Error('name column missing from SELECT');
      if (typeof c.name !== 'string') throw new Error('name is not a string: ' + typeof c.name);
      if (!c.name.trim()) throw new Error('name is empty for customer ' + c.id.slice(0,8));
    });
  });
  console.log('  Sample rows with explicit columns:');
  custs.forEach(c => console.log('    ', c.id.slice(0,8)+'…', '→ name='+JSON.stringify(c.name), 'wallet='+c.wallet_code));

  console.log('');
  console.log('═══ TEST 3: End-to-End INSERT + VERIFY (NEW service logic) ═══');
  const testCases = [
    { inName: '   Jane Marie Smith   ', inEmail: '  JANE@EXAMPLE.COM  ', inPhone: '  +1 555-0100  ', expect: 'Jane Marie Smith' },
    { inName: 'Bob', inEmail: null, inPhone: null, expect: 'Bob' },
    { inName: '  ' + 'A'.repeat(80) + '  ', inEmail: null, inPhone: null, expect: null } // 80 A's after trim — well within 120 limit
  ];

  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i];
    console.log(`  Case ${i+1}: input name=${JSON.stringify(tc.inName)}`);
    const validated = simulateNewCreateCustomer(dbo, tc.inName, tc.inEmail, tc.inPhone);

    const id = uuidv4();
    await dbo.run(
      'INSERT INTO customers (id, name, email, phone) VALUES (?, ?, ?, ?)',
      [id, validated.trimmedName, validated.safeEmail, validated.safePhone]
    );
    const walletId = uuidv4();
    await dbo.run(
      'INSERT INTO customer_wallets (id, customer_id, balance, currency, wallet_code) VALUES (?, ?, 0, ?, ?)',
      [walletId, id, 'USD', generateWalletCode()]
    );

    // Verify using EXPLICIT column select (NEW service logic)
    const rows = await dbo.all(
      'SELECT id, name, email, phone, created_at, updated_at FROM customers WHERE id = ?', [id]
    );
    const cust = rows[0];
    test(`Verify ${tc.expect || 'long name'} — name persists`, () => {
      if (!cust) throw new Error('customer not found after INSERT');
      if (!cust.name) throw new Error('DB WRITE VERIFICATION FAILED: name is NULL/empty');
      const expected = tc.expect || validated.trimmedName;
      if (cust.name !== expected) throw new Error(`name mismatch: got ${JSON.stringify(cust.name)} expected ${JSON.stringify(expected)}`);
    });
    test(`Verify ${tc.expect || 'long name'} — email/phone normalized`, () => {
      if (validated.safeEmail !== null && cust.email !== validated.safeEmail) throw new Error('email mismatch');
      if (validated.safeEmail === null && cust.email !== null) throw new Error('email should be NULL, was: ' + cust.email);
    });

    // Cleanup
    await dbo.run('DELETE FROM customer_wallets WHERE id = ?', [walletId]);
    await dbo.run('DELETE FROM customers WHERE id = ?', [id]);
  }

  console.log('');
  console.log('═══ TEST 4: Full getCustomers() JOIN with NEW explicit columns ═══');
  const allCusts = await dbo.all(`
    SELECT c.id, c.name, c.email, c.phone, c.created_at, c.updated_at,
           w.id AS wallet_id, w.wallet_code, w.balance AS wallet_balance
    FROM customers c
    LEFT JOIN customer_wallets w ON w.customer_id = c.id
    ORDER BY c.created_at DESC
  `);
  test('All customers have non-empty name field after explicit SELECT', () => {
    const bad = allCusts.filter(c => !c.name || !c.name.trim());
    if (bad.length) throw new Error(`${bad.length} customers with NULL/empty name: ${bad.map(c => c.id.slice(0,8)).join(', ')}`);
  });
  console.log('  Total customers checked:', allCusts.length);

  dbo.close();
  console.log('');
  console.log('═══════════════════════════════════════════');
  console.log(`  RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('═══════════════════════════════════════════');
  if (failed > 0) process.exit(1);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
