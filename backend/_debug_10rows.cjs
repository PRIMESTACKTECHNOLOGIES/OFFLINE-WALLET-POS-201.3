const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');

const DB_PATH = path.join(__dirname, 'data', 'database.sqlite');
const db = new sqlite3.Database(DB_PATH);

db.serialize(() => {
  db.run('PRAGMA journal_mode=WAL');
  db.run('PRAGMA synchronous=OFF');
  db.run('PRAGMA foreign_keys=OFF');

  const insTxnSql = `INSERT INTO pos2013_transactions
    (id,merchant_id,terminal_id,batch_id,local_txn_id,stan,amount_minor,currency,
     pan_masked,txn_type,auth_mode,entry_mode,card_brand,reader_source,cvm_result,
     pin_verified,rrn,auth_code,status,txn_timestamp,created_at,updated_at,emv_data)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;

  const insRcptSql = `INSERT INTO receipts
    (receipt_id,transaction_id,merchant_id,terminal_id,batch_id,receipt_data,
     receipt_created_at,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?)`;

  const insBatchSql = `INSERT INTO pos2013_batches
    (batch_id,merchant_id,terminal_id,batch_status,txn_count,total_amount_minor,
     currency,batch_seq,upload_timestamp,signature,nonce,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`;

  const insTxn = db.prepare(insTxnSql);
  const insRcpt = db.prepare(insRcptSql);
  const insBatch = db.prepare(insBatchSql);

  insTxn.on('error', (e) => console.error('[insTxn ERROR]', e.message));
  insRcpt.on('error', (e) => console.error('[insRcpt ERROR]', e.message));
  insBatch.on('error', (e) => console.error('[insBatch ERROR]', e.message));

  function uid() { return crypto.randomUUID(); }
  function hex(n) { return crypto.randomBytes(n).toString('hex'); }

  const now = new Date().toISOString();

  console.log('[TEST] Starting 3-row direct test with per-statement callbacks...');

  db.run('BEGIN', function(err) {
    if (err) { console.error('[BEGIN ERR]', err.message); return; }
    console.log('[BEGIN] ok');

    let remaining = 9;
    function doneOne(label, i) {
      return function(err) {
        if (err) console.error(`[${label} #${i} ERR]`, err.message, this?.sql || '');
        else console.log(`[${label} #${i}] ok`);
        remaining--;
        if (remaining <= 0) {
          console.log('[COMMIT] attempting');
          db.run('COMMIT', function(errC) {
            if (errC) console.error('[COMMIT ERR]', errC.message);
            else console.log('[COMMIT] ok');
            db.get('SELECT COUNT(*) c FROM pos2013_transactions',(_,r)=>console.log('[FINAL] TX count:',r?.c));
            db.get('SELECT COUNT(*) c FROM receipts',(_,r)=>console.log('[FINAL] RCPT count:',r?.c));
            db.get('SELECT COUNT(*) c FROM pos2013_batches',(_,r)=>console.log('[FINAL] Batch count:',r?.c));
            db.close();
          });
        }
      };
    }

    for (let i = 0; i < 3; i++) {
      const id = uid();
      const mid = 'MRC-1001';
      const tid = 'T2013-001';
      const bid = 'B-'+hex(6);
      const rid = 'RCP-'+hex(6);
      const stan = String(Math.floor(100000+Math.random()*900000));
      const auth = String(Math.floor(1000+Math.random()*9000));
      const rrn = hex(6).toUpperCase();
      const amt = 2500 + i*100;
      const pinV = 0;
      const emvD = JSON.stringify({cardholder_name:'TEST CUSTOMER',card_program:'VISA CLASSIC',expiry_mm_yy:'12/28',pi_id:'pi_test',cvv_provided:1});

      insTxn.run(id,mid,tid,bid,'LCL-'+i,stan,amt,'USD',
        '4323-****-****-2727','SALE','OFFLINE','CHIP','VISA','INTERNAL','SIGNATURE',
        pinV,rrn,auth,'SETTLED',now,now,now,emvD, doneOne('TX',i));

      const rcptD = `{"receiptId":"${rid}","thermalCombined":"TEST\\nRECEIPT\\n${i}","thermalCustomer":"TEST\\nCUSTOMER\\nCOPY\\n${i}","thermalMerchant":"TEST\\nMERCHANT\\nCOPY\\n${i}","browserCombined":"","browserCustomer":"","browserMerchant":"","plainCustomer":"","plainMerchant":"","fullTx":{"id":"${id}"}}`;

      insRcpt.run(rid,id,mid,tid,bid,rcptD,now,now,now, doneOne('RCPT',i));

      insBatch.run(bid,mid,tid,'SETTLED',1,amt,'USD',i+1,now,hex(32),hex(12),now,now, doneOne('BATCH',i));
    }
  });
});
