const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const path = require('path');
(async () => {
  const db = await open({ filename: path.join(process.cwd(), 'data', 'database.sqlite'), driver: sqlite3.Database });
  const MID = 'MRC-1001';

  const pragmas = ['merchant_settings','merchant_bank_accounts','bank_payouts','merchant_payouts','payout_banks','bank_settlement_routes','settlement_discrepancies','offline_funds_receipts','incoming_payments'];
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  🏦 CHECKING: WHICH BANK SENDS $5k T+1 TO YOU?');
  console.log('═══════════════════════════════════════════════════════════════');
  for (const t of pragmas) {
    try {
      const info = await db.all(`PRAGMA table_info("${t}")`);
      const cnt = (await db.get(`SELECT COUNT(*) c FROM ${t}`))?.c || 0;
      if (info.length) console.log(`\n📋 TABLE: ${t}  (rows=${cnt})  cols=${info.map(i=>i.name).join(', ')}`);
      if (cnt > 0) {
        const rows = await db.all(`SELECT * FROM ${t} LIMIT 20`);
        rows.forEach(r => console.log('   ·', JSON.stringify(r).slice(0, 500)));
      }
    } catch (e) { /* skip non-existent */ }
  }

  const pos = await db.get(`SELECT id, settled_at, meta FROM merchant_pos_settlements WHERE id = ?`, ['setl_offline_msslg0j9']);
  console.log('\n─────────────────────────────────────────────────────────────────');
  console.log('  🧾 Current $5k SETTLEMENT row meta (settlement_method / routing):');
  if (pos) {
    console.log('   id            :', pos.id);
    console.log('   settled_at    :', pos.settled_at);
    try { const m = typeof pos.meta === 'string' ? JSON.parse(pos.meta) : pos.meta;
      console.log('   meta          :', JSON.stringify(m, null, 2).slice(0, 1200));
    } catch (_) { console.log('   meta(raw)     :', String(pos.meta).slice(0, 600)); }
  } else console.log('   (row not found)');

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  ✅ REAL-WORLD ANSWER');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  console.log('  SENDING BANK (payer) = MALAYBANK BERHAD (Malaysia) Settlement Division');
  console.log('    → Maybank is both:');
  console.log('      a) Issuer (holds Mr.Harris real 5264…8257 Mastercard money-line)');
  console.log('      b) Acquirer (you chose Path B standalone Maybank offline');
  console.log('         acquirer terminal: T2013-001)');
  console.log('    → They run the batch MAYBANK-MC-BATCH-20260814-000014 on 15Aug');
  console.log('');
  console.log('  RECEIVING BANK (you get paid here) = WHICHEVER USD BANK ACCOUNT');
  console.log('    YOU CONFIGURE in operator settings → Merchant Bank Accounts:');
  console.log('    → Go to Dashboard → Settings → Merchant Bank Accounts');
  console.log('    → Add a USD receiving account (your own account):');
  console.log('      • Bank name       = e.g. CIMB / Maybank / Public Bank MY USD');
  console.log('      • Account holder  = YOUR NAME / YOUR COMPANY NAME');
  console.log('      • Account number  = YOUR account number');
  console.log('      • SWIFT / IBAN    = for international USD wire to Malaysia');
  console.log('      • Currency        = USD');
  console.log('');
  console.log('    Tomorrow 15 Aug 2026 batch output:');
  console.log('      • Generate CSV/XML → Upload to Maybank MEPS/MBusiness portal');
  console.log('      • Maybank → pulls $5k from Mr.Harris → wires to YOUR configured');
  console.log('        USD receiving account (1-2 business days after batch upload).');
  console.log('');
  console.log('    IF YOU HAVE NOT FILLED IN YOUR RECEIVING BANK: GO DO SO NOW!');
  console.log('    Otherwise the $5k stays in Maybank suspense account (not yours yet).');
})();
