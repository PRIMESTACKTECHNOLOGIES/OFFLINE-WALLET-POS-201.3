const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const DB_PATH = path.join(__dirname, 'data', 'database.sqlite');
const TOTAL_TXN = 5_000_000;
const TX_PER_COMMIT = 5000;
const LUT_SIZE = 200000;

const MERCHANTS = [
  { id: 'MRC-1001', terminals: ['T2013-001', 'T2013-002'] },
  { id: 'MRC-1002', terminals: ['T2013-003', 'T2013-004'] },
  { id: 'MRC-1003', terminals: ['T2013-005'] },
];
const MERCHANT_NAMES = {
  'MRC-1001':'PRIMESTACK TECHNOLOGIES LLC',
  'MRC-1002':'QVS ONE MEMBER COMPANY LIMITED',
  'MRC-1003':'GLOBAL RETAIL HUB PTE LTD',
};
const MERCHANT_ADDRS = {
  'MRC-1001':'Wilmington, DE, USA',
  'MRC-1002':'Tu Son, Bac Ninh, Vietnam',
  'MRC-1003':'Marina Bay, Singapore',
};
const MERCHANT_PHONES = {
  'MRC-1001':'+1 (302) 555-0142',
  'MRC-1002':'+84 901 561 203',
  'MRC-1003':'+65 6225 1234',
};

const CARD_BRANDS = ['VISA','MASTERCARD','AMEX','DISCOVER','UNIONPAY'];
const CARD_WEIGHTS = [0.50,0.30,0.10,0.07,0.03];
const ENTRY_MODES = ['CHIP_INSERT','NFC_CONTACTLESS','MANUAL','MAGSTRIPE'];
const ENTRY_WEIGHTS = [0.45,0.35,0.15,0.05];
const AUTH_MODES = ['OFFLINE_AUTH','ONLINE_AUTH','STANDIN'];
const AUTH_WEIGHTS = [0.60,0.35,0.05];
const STATUSES = ['SETTLED','SYNCED','APPROVED','AUTHORIZED'];
const STATUS_WEIGHTS = [0.70,0.20,0.08,0.02];
const CURRENCIES = ['USD','EUR','GBP','AED'];
const CURRENCY_WEIGHTS = [0.80,0.10,0.05,0.05];
const CVM_RESULTS = ['SIGNATURE','PIN','NO_CVM','PIN_SIGNATURE'];
const CVM_WEIGHTS = [0.40,0.35,0.20,0.05];
const TXN_TYPES = ['SALE','REFUND','PREAUTH','CAPTURE'];
const TXN_TYPE_WEIGHTS = [0.92,0.05,0.02,0.01];
const READER_SOURCES = ['ACR122U','BUILTIN_NFC','USB_PINPAD','MOTO_VT'];
const READER_WEIGHTS = [0.40,0.30,0.20,0.10];
const CARD_PROGRAMS = ['STANDARD','GOLD','PLATINUM','SIGNATURE','INFINITE','CHARGE'];

const CARDHOLDER_FIRST = ['John','Mary','James','Patricia','Robert','Jennifer','Michael','Linda','David','Elizabeth','William','Barbara','Richard','Susan','Joseph','Jessica','Thomas','Sarah','Charles','Karen','Christopher','Nancy','Daniel','Lisa','Matthew','Betty','Anthony','Margaret','Mark','Sandra','Nguyen','Tran','Le','Pham','Ahmed','Mohammed','Li','Wang','Zhang','Omar','Hassan','Karim','Sofia','Maria','Anna','Elena','Ivan','Alex','Dmitri','Olga'];
const CARDHOLDER_LAST = ['Smith','Johnson','Williams','Brown','Jones','Garcia','Miller','Davis','Rodriguez','Martinez','Hernandez','Lopez','Gonzalez','Wilson','Anderson','Thomas','Taylor','Moore','Jackson','Martin','Lee','Perez','Thompson','White','Harris','Sanchez','Clark','Ramirez','Lewis','Robinson','Nguyen','Wang','Li','Zhang','Khan','Ahmed','Ali','Hassan','Ivanov','Petrov','Sokolov','Popov','Dubois','Muller','Schmidt','Weber','Fischer'];

function buildIdx(weights, N = 100000) {
  const arr = new Uint16Array(N);
  let acc = 0, j = 0;
  for (let i = 0; i < weights.length; i++) {
    const end = acc + Math.round(weights[i] * N);
    const lim = (i === weights.length - 1) ? N : end;
    while (j < lim) arr[j++] = i;
    acc = end;
  }
  while (j < N) arr[j++] = weights.length - 1;
  return arr;
}
const CARD_I = buildIdx(CARD_WEIGHTS);
const ENTRY_I = buildIdx(ENTRY_WEIGHTS);
const AUTH_I = buildIdx(AUTH_WEIGHTS);
const STATUS_I = buildIdx(STATUS_WEIGHTS);
const CURRENCY_I = buildIdx(CURRENCY_WEIGHTS);
const CVM_I = buildIdx(CVM_WEIGHTS);
const TXN_TYPE_I = buildIdx(TXN_TYPE_WEIGHTS);
const READER_I = buildIdx(READER_WEIGHTS);
const MERCHANT_I = buildIdx([0.70, 0.22, 0.08], 100000);

function uuid4Fast() {
  const hx = '0123456789abcdef';
  let o = '';
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) { o += '-'; continue; }
    if (i === 14) { o += '4'; continue; }
    if (i === 19) { o += hx[8 + ((Math.random() * 4) | 0)]; continue; }
    o += hx[((Math.random() * 16) | 0)];
  }
  return o;
}
function hex12Fast() {
  const hx = '0123456789ABCDEF';
  let o = '';
  for (let i = 0; i < 12; i++) o += hx[((Math.random() * 16) | 0)];
  return o;
}
function hex24Fast() {
  const hx = '0123456789abcdef';
  let o = '';
  for (let i = 0; i < 24; i++) o += hx[((Math.random() * 16) | 0)];
  return o;
}
function hex64Fast() {
  const hx = '0123456789abcdef';
  let o = '';
  for (let i = 0; i < 64; i++) o += hx[((Math.random() * 16) | 0)];
  return o;
}
function randi(m) { return ((Math.random() * m) | 0); }
function randiR(min, max) { return min + (((Math.random() * (max - min + 1)) | 0)); }
function pad2(n) { return n < 10 ? '0' + n : '' + n; }
function pad4(n) {
  if (n < 10) return '000' + n;
  if (n < 100) return '00' + n;
  if (n < 1000) return '0' + n;
  return '' + n;
}
function pad6(n) {
  if (n < 10) return '00000' + n;
  if (n < 100) return '0000' + n;
  if (n < 1000) return '000' + n;
  if (n < 10000) return '00' + n;
  if (n < 100000) return '0' + n;
  return '' + n;
}
function pad12(n) {
  if (n >= 100000000000) return '' + n;
  return pad6(Math.floor(n / 1000000)) + pad6(n % 1000000);
}

function luhnValid(d) {
  let s = 0, a = false;
  for (let i = d.length - 1; i >= 0; i--) {
    let n = d.charCodeAt(i) - 48;
    if (a) { n *= 2; if (n > 9) n -= 9; }
    s += n; a = !a;
  }
  return s % 10 === 0;
}

function genPanForBrand(brandIdx) {
  const brand = CARD_BRANDS[brandIdx];
  let pr, ln;
  if (brand === 'VISA') { pr = ['4']; ln = 16; }
  else if (brand === 'MASTERCARD') { pr = ['51','52','53','54','55','22','23','24','25','26','27']; ln = 16; }
  else if (brand === 'AMEX') { pr = ['34','37']; ln = 15; }
  else if (brand === 'DISCOVER') { pr = ['6011','65','644','645','646','647','648','649']; ln = 16; }
  else { pr = ['62','81']; ln = 16; }
  const p = pr[randi(pr.length)];
  let d = p;
  while (d.length < ln - 1) d += String.fromCharCode(48 + randi(10));
  for (let c = 0; c <= 9; c++) { if (luhnValid(d + c)) { d += c; break; } }
  if (d.length < ln) d += '0';
  return d;
}

console.log('[PRE] Building LUTs (size = ' + LUT_SIZE + ')...');

const LUT_PAN = [];
const LUT_MASKED_PAN = [];
const LUT_BRAND_OF_PAN = new Uint8Array(LUT_SIZE);
for (let i = 0; i < LUT_SIZE; i++) {
  const bi = CARD_I[randi(100000)];
  const pan = genPanForBrand(bi);
  LUT_PAN.push(pan);
  LUT_MASKED_PAN.push(CARD_BRANDS[bi] === 'AMEX'
    ? pan.slice(0,4) + '-******-' + pan.slice(10)
    : pan.slice(0,4) + '-****-****-' + pan.slice(-4));
  LUT_BRAND_OF_PAN[i] = bi;
}

const LUT_AMOUNT = new Int32Array(LUT_SIZE);
for (let i = 0; i < LUT_SIZE; i++) {
  const mu = 3.8, sig = 0.9;
  let u1 = 0, u2 = 0;
  while (u1 === 0) u1 = Math.random();
  while (u2 === 0) u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  let a = Math.exp(mu + sig * z);
  a = Math.max(1, Math.min(999999, Math.round(a)));
  LUT_AMOUNT[i] = ((a * 100) | 0);
}

const LUT_ISO = new Array(LUT_SIZE);
const LUT_ISO_SHORT = new Array(LUT_SIZE);
const LUT_BATCH_DATE = new Array(LUT_SIZE);
(function genDates() {
  const s0 = new Date('2024-08-20T00:00:00Z').getTime();
  const e0 = new Date('2026-08-20T23:59:59Z').getTime();
  const sp = e0 - s0;
  for (let i = 0; i < LUT_SIZE; i++) {
    const t = new Date(s0 + Math.random() * sp);
    const iso = t.toISOString();
    LUT_ISO[i] = iso;
    const y = iso.slice(0,4), m = iso.slice(5,7), d = iso.slice(8,10);
    const hh = iso.slice(11,13), mm = iso.slice(14,16), ss = iso.slice(17,19);
    LUT_ISO_SHORT[i] = m + '/' + d + '/' + y + ', ' + hh + ':' + mm + ':' + ss;
    LUT_BATCH_DATE[i] = y + m + d;
  }
})();

const LUT_CUST = new Array(LUT_SIZE);
for (let i = 0; i < LUT_SIZE; i++) {
  const f = CARDHOLDER_FIRST[randi(CARDHOLDER_FIRST.length)];
  const l = CARDHOLDER_LAST[randi(CARDHOLDER_LAST.length)];
  LUT_CUST[i] = f + ' ' + l;
}

const LUT_AUTH = new Array(LUT_SIZE);
const LUT_STAN = new Array(LUT_SIZE);
const LUT_RRN = new Array(LUT_SIZE);
const LUT_EXP_MM = new Array(LUT_SIZE);
const LUT_EXP_YY = new Array(LUT_SIZE);
const LUT_EXP_STR = new Array(LUT_SIZE);
const LUT_PROG = new Array(LUT_SIZE);
for (let i = 0; i < LUT_SIZE; i++) {
  LUT_AUTH[i] = pad4(randiR(1, 9999));
  LUT_STAN[i] = pad6(randiR(1, 999999));
  LUT_RRN[i] = pad12(randiR(1, 999999999999));
  const mm = pad2(randiR(1, 12));
  const yy = '' + randiR(25, 32);
  LUT_EXP_MM[i] = mm; LUT_EXP_YY[i] = yy; LUT_EXP_STR[i] = mm + '/' + yy;
  LUT_PROG[i] = CARD_PROGRAMS[randi(CARD_PROGRAMS.length)];
}

const LUT_MERCHANT_TUPLE = new Array(LUT_SIZE);
for (let i = 0; i < LUT_SIZE; i++) {
  const mi = MERCHANT_I[randi(100000)];
  const m = MERCHANTS[mi];
  const ti = randi(m.terminals.length);
  LUT_MERCHANT_TUPLE[i] = { merchant_id: m.id, terminal_id: m.terminals[ti] };
}
console.log('[PRE] LUTs built.');

function buildReceiptJson(id, merchant_id, terminal_id, batch_id, local_txn_id, stan,
                          amount_minor, currency, pan_masked, card_brand, txn_type,
                          auth_mode, entry_mode, reader_source, cvm_result, pin_verified,
                          rrn, auth_code, status, txn_iso, dt_short, customer_name,
                          expiry, exp_mm, exp_yy, pi_id, card_program, cvvProvided) {
  const mName = MERCHANT_NAMES[merchant_id];
  const mAddr = MERCHANT_ADDRS[merchant_id];
  const mPhone = MERCHANT_PHONES[merchant_id];
  const idShort = id.slice(0,8).toUpperCase();
  const intAmt = Math.floor(amount_minor / 100);
  const decAmt = Math.round(amount_minor - intAmt * 100);
  const decStr = decAmt < 10 ? '0' + decAmt : '' + decAmt;
  const amtStr = currency + ' ' + intAmt.toLocaleString('en-US') + '.' + decStr;
  const pinStr = pin_verified ? 'YES' : 'NO';

  const custT = mName.toUpperCase()+'\\n'+mAddr+'\\nTEL: '+mPhone+
    '\\n════════════════════════════════════════\\n*** CUSTOMER COPY ***\\n'+
    'RECEIPT NO:     RCP-'+idShort+'\\nDATE/TIME:      '+dt_short+
    '\\n────────────────────────────────────────\\nCARDHOLDER DETAILS\\nNAME:           '+customer_name+
    '\\n────────────────────────────────────────\\nCARD DETAILS\\nCARD BRAND:     '+card_brand+
    '\\nCARD NO:        '+pan_masked+'\\nEXPIRY:         '+expiry+
    '\\nENTRY MODE:     '+entry_mode+'\\nPIN VERIFIED:   '+pinStr+
    '\\nCVM:            '+cvm_result+
    '\\n────────────────────────────────────────\\nTOTAL TRANSACTION AMOUNT\\n'+amtStr+
    '\\n────────────────────────────────────────\\nTRANSACTION DETAILS\\nTXN TYPE:       '+txn_type+
    '\\nAUTH MODE:      '+auth_mode+'\\nPROTOCOL:       VER 101.1 PATH B\\nSTAN:           '+stan+
    '\\nRRN:            '+rrn+'\\nAUTH CODE:      '+auth_code+
    '\\nTERMINAL:       '+terminal_id+'\\nMERCHANT ID:    '+merchant_id+
    '\\n────────────────────────────────────────\\nBATCH & SETTLEMENT\\nBATCH ID:       '+batch_id+
    '\\nBATCH STATUS:   RECEIVED\\n────────────────────────────────────────\\n✓✓✓  APPROVED / AUTHORIZED  ✓✓✓\\n'+
    '════════════════════════════════════════\\nCARDHOLDER SIGNATURE:\\n\\n  ______________________________________\\n\\n'+
    'Thank you for your business!\\nKEEP THIS RECEIPT FOR YOUR RECORDS\\n*** END OF RECEIPT ***\\n';
  const merchT = custT.replace('CUSTOMER COPY', 'MERCHANT COPY');
  const combT = custT + '\\n\\n--- MERCHANT COPY SEPARATOR ---\\n\\n' + merchT;

  const emvD = '{"customer_name":"' + customer_name + '","card_program":"' + card_program +
               '","cvv_provided":' + cvvProvided + ',"expiry_mm":"' + exp_mm +
               '","expiry_yy":"' + exp_yy + '","pan":"' + pan_masked +
               '","pi_id":"' + pi_id + '"}';

  const ft = '"id":"'+id+'","local_txn_id":"'+local_txn_id+'","merchant_id":"'+merchant_id+
    '","terminal_id":"'+terminal_id+'","batch_id":"'+batch_id+'","stan":"'+stan+'","amount_minor":'+
    amount_minor+',"currency":"'+currency+'","pan_masked":"'+pan_masked+'","card_brand":"'+card_brand+
    '","txn_type":"'+txn_type+'","auth_mode":"'+auth_mode+'","entry_mode":"'+entry_mode+
    '","reader_source":"'+reader_source+'","cvm_result":"'+cvm_result+'","pin_verified":'+pin_verified+
    ',"rrn":"'+rrn+'","auth_code":"'+auth_code+'","status":"'+status+'","txn_timestamp":"'+txn_iso+
    '","protocol_version":"101.1","merchant_name":"'+mName+'","merchant_address":"'+mAddr+
    '","merchant_phone":"'+mPhone+'","receipt_footer":"Thank you for your business!",'+
    '"customer_name":"'+customer_name+'","expiry_mm_yy":"'+expiry+'","cvv_provided":'+cvvProvided+
    ',"terminal_floor_limit_permanent":5000,"emv_data":'+emvD;

  return '{"receiptId":"RCP-'+id+'","thermalCombined":"'+combT+'","thermalCustomer":"'+custT+
         '","thermalMerchant":"'+merchT+'","browserCombined":"'+combT+'","browserCustomer":"'+custT+
         '","browserMerchant":"'+merchT+'","plainCustomer":"'+custT+'","plainMerchant":"'+merchT+
         '","fullTx":{'+ft+'}}';
}

function serial(db, steps, done) {
  let i = 0;
  function next() {
    if (i >= steps.length) { done(); return; }
    const fn = steps[i++];
    fn(next);
  }
  next();
}

function run() {
  console.log('=== 5M TRANSACTION GENERATOR V4 ===');
  console.log('Target DB:', DB_PATH);
  console.log('DB exists:', fs.existsSync(DB_PATH));
  console.log('Total TXN:', TOTAL_TXN.toLocaleString());
  console.log('TX per commit:', TX_PER_COMMIT);

  if (!fs.existsSync(path.dirname(DB_PATH))) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  }

  const db = new sqlite3.Database(DB_PATH);

  db.on('error', (e) => console.error('[DB ERROR]', e.message));

  serial(db, [
    (n) => db.run('PRAGMA journal_mode = WAL;', () => n()),
    (n) => db.run('PRAGMA synchronous = OFF;', () => n()),
    (n) => db.run('PRAGMA temp_store = MEMORY;', () => n()),
    (n) => db.run('PRAGMA cache_size = -3000000;', () => n()),
    (n) => db.run('PRAGMA mmap_size = 3221225472;', () => n()),
    (n) => db.run('PRAGMA page_size = 4096;', () => n()),
    (n) => db.run('PRAGMA foreign_keys = OFF;', () => n()),
    (n) => db.run('PRAGMA secure_delete = OFF;', () => {
      console.log('[OK] SQLite pragmas applied');
      n();
    }),
    (n) => {
      const ensureTxCols = [
        'ALTER TABLE pos2013_transactions ADD COLUMN updated_at TEXT DEFAULT CURRENT_TIMESTAMP',
        'ALTER TABLE pos2013_transactions ADD COLUMN settled_at TEXT',
        'ALTER TABLE pos2013_transactions ADD COLUMN processor_reference TEXT',
        'ALTER TABLE pos2013_transactions ADD COLUMN auth_code_ref2 TEXT',
        'ALTER TABLE pos2013_transactions ADD COLUMN webhook_trace TEXT',
      ];
      let ci = 0;
      (function nx() {
        if (ci >= ensureTxCols.length) { n(); return; }
        db.run(ensureTxCols[ci++], () => nx());
      })();
    },
  ], () => {
    console.log('[OK] Schema migrations applied');
    startLoading(db);
  });
}

function startLoading(db) {
  const termIns = db.prepare(`INSERT OR IGNORE INTO terminals (id,merchant_id,terminal_id,name,terminal_secret,offline_enabled,floor_limit,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)`);
  const setIns = db.prepare(`INSERT OR IGNORE INTO merchant_settings (merchant_id,api_key,webhook_url,test_mode,merchant_name,support_email,updated_at) VALUES (?,?,?,?,?,?,?)`);
  const bizIns = db.prepare(`INSERT OR IGNORE INTO merchant_business_info (merchant_id,business_name,business_address,business_phone,receipt_footer,updated_at) VALUES (?,?,?,?,?,?)`);
  const now = new Date().toISOString();
  db.serialize(() => {
    db.run('BEGIN');
    for (const m of MERCHANTS) {
      for (const t of m.terminals) {
        termIns.run(uuid4Fast(), m.id, t, 'Terminal ' + t, 'secret_' + (t.replace(/[^0-9]/g,'').slice(-3) || '001'), 1, 5000, now, now);
      }
      setIns.run(m.id, 'offline_secret_' + (m.id.split('-')[1] || '001'), '', 0, MERCHANT_NAMES[m.id], 'support@'+m.id.toLowerCase()+'.com', now);
      bizIns.run(m.id, MERCHANT_NAMES[m.id], MERCHANT_ADDRS[m.id], MERCHANT_PHONES[m.id], 'Thank you for your business!', now);
    }
    db.run('COMMIT');
  });
  console.log('[OK] Merchants & terminals seeded');

  const TXN_SQL = `INSERT INTO pos2013_transactions
    (id,merchant_id,terminal_id,batch_id,local_txn_id,stan,amount_minor,currency,
     pan_masked,txn_type,auth_mode,entry_mode,card_brand,reader_source,cvm_result,
     pin_verified,rrn,auth_code,status,txn_timestamp,created_at,updated_at,emv_data)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;
  const RCPT_SQL = `INSERT INTO receipts
    (id,receipt_id,transaction_id,merchant_id,receipt_data,generated_at)
    VALUES (?,?,?,?,?,?)`;
  const BATCH_SQL = `INSERT OR IGNORE INTO pos2013_batches
    (id,batch_id,merchant_id,terminal_id,protocol_version,status,txn_count,
     total_amount_minor,signature,nonce,upload_timestamp,created_at,updated_at,batch_seq)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;

  const insTxn = db.prepare(TXN_SQL);
  const insRcpt = db.prepare(RCPT_SQL);
  const insBatch = db.prepare(BATCH_SQL);

  insTxn.on('error', e => console.error('[TXN STMT ERR]', e.message));
  insRcpt.on('error', e => console.error('[RCPT STMT ERR]', e.message));
  insBatch.on('error', e => console.error('[BATCH STMT ERR]', e.message));

  console.log('[OK] Statements prepared');

  const batchSeen = new Set();
  let processed = 0;
  let failedInBegin = false;
  const START = Date.now();
  let lastReport = START;
  let seqCtr = 0;

  function doNextChunk() {
    if (processed >= TOTAL_TXN) return finish();
    const goal = Math.min(TX_PER_COMMIT, TOTAL_TXN - processed);

    db.run('BEGIN', (begErr) => {
      if (begErr) { console.error('BEGIN FAILED:', begErr.message); return setTimeout(doNextChunk, 100); }
      failedInBegin = false;
      try {
        for (let n = 0; n < goal; n++) {
          const li = randi(LUT_SIZE);
          const bi = LUT_BRAND_OF_PAN[li];
          const ei = ENTRY_I[randi(100000)];
          const ai = AUTH_I[randi(100000)];
          const si = STATUS_I[randi(100000)];
          const ci = CURRENCY_I[randi(100000)];
          const cvi = CVM_I[randi(100000)];
          const tti = TXN_TYPE_I[randi(100000)];
          const ri = READER_I[randi(100000)];

          const id = uuid4Fast();
          const mt = LUT_MERCHANT_TUPLE[li];
          const merchant_id = mt.merchant_id;
          const terminal_id = mt.terminal_id;
          const txn_iso = LUT_ISO[li];
          const dt_short = LUT_ISO_SHORT[li];
          const bd = LUT_BATCH_DATE[li];
          seqCtr = (seqCtr + 1) & 0x000FFFFF;
          const batch_id = 'BATCH-' + merchant_id + '-' + terminal_id + '-' + bd + '-' + pad6(seqCtr);
          const local_txn_id = 'TXN-' + hex12Fast();
          const stan = LUT_STAN[li];
          const amount_minor = LUT_AMOUNT[li];
          const currency = CURRENCIES[ci];
          const pan_masked = LUT_MASKED_PAN[li];
          const card_brand = CARD_BRANDS[bi];
          const txn_type = TXN_TYPES[tti];
          const auth_mode = AUTH_MODES[ai];
          const entry_mode = ENTRY_MODES[ei];
          const reader_source = READER_SOURCES[ri];
          const cvm_result = CVM_RESULTS[cvi];
          const pin_verified = (cvi === 1 || cvi === 3) ? 1 : 0;
          const rrn = LUT_RRN[li];
          const auth_code = LUT_AUTH[li];
          const status = STATUSES[si];
          const customer_name = LUT_CUST[li];
          const exp_mm = LUT_EXP_MM[li];
          const exp_yy = LUT_EXP_YY[li];
          const expiry = LUT_EXP_STR[li];
          const pi_id = hex12Fast();
          const card_program = LUT_PROG[li];
          const cvvProvided = (entry_mode === 'MANUAL') ? 1 : 0;

          const emvD = '{"customer_name":"' + customer_name + '","card_program":"' + card_program +
                       '","cvv_provided":' + cvvProvided + ',"expiry_mm":"' + exp_mm +
                       '","expiry_yy":"' + exp_yy + '","pan":"' + pan_masked +
                       '","pi_id":"' + pi_id + '"}';

          insTxn.run(id, merchant_id, terminal_id, batch_id, local_txn_id, stan,
                     amount_minor, currency, pan_masked, txn_type, auth_mode, entry_mode,
                     card_brand, reader_source, cvm_result, pin_verified, rrn, auth_code,
                     status, txn_iso, txn_iso, txn_iso, emvD);

          const rcptId = uuid4Fast();
          const rcpt = buildReceiptJson(id, merchant_id, terminal_id, batch_id, local_txn_id,
                     stan, amount_minor, currency, pan_masked, card_brand, txn_type, auth_mode,
                     entry_mode, reader_source, cvm_result, pin_verified, rrn, auth_code, status,
                     txn_iso, dt_short, customer_name, expiry, exp_mm, exp_yy, pi_id,
                     card_program, cvvProvided);
          insRcpt.run(rcptId, 'RCP-' + id, id, merchant_id, rcpt, txn_iso);

          if (!batchSeen.has(batch_id)) {
            batchSeen.add(batch_id);
            const bId = uuid4Fast();
            const nonce = hex24Fast();
            const sig = hex64Fast();
            insBatch.run(bId, batch_id, merchant_id, terminal_id, '201.3', 'SETTLED',
                         randiR(200, 1500), randiR(1_000_000, 50_000_000),
                         sig, nonce, txn_iso, txn_iso, txn_iso, randiR(1, 9999));
          }

          processed++;
        }
      } catch (rtErr) {
        console.error('[RUNTIME ERR in chunk]:', rtErr.message, rtErr.stack);
        failedInBegin = true;
      }
      db.run('COMMIT', (cErr) => {
        if (cErr) {
          console.error('[COMMIT FAIL]', cErr.message, '| failedInBegin=', failedInBegin, '| processed so far=', processed);
          return setTimeout(doNextChunk, 200);
        }
        const now = Date.now();
        if (now - lastReport > 5000 || processed >= TOTAL_TXN) {
          const el = (now - START) / 1000;
          const rate = processed / el;
          const remain = TOTAL_TXN - processed;
          const eta = rate > 0 ? remain / rate : 0;
          const pct = (processed / TOTAL_TXN * 100).toFixed(2);
          let mb = '?';
          try { mb = (fs.statSync(DB_PATH).size / 1024 / 1024).toFixed(1); } catch(_) {}
          console.log(`[${pct}%] ${processed.toLocaleString()}/${TOTAL_TXN.toLocaleString()} | ${rate.toFixed(0)} tx/s | ETA: ${eta.toFixed(0)}s | DB: ${mb} MB | batches: ${batchSeen.size}`);
          lastReport = now;
        }
        setImmediate(doNextChunk);
      });
    });
  }

  function finish() {
    console.log('\n[DONE] All ' + TOTAL_TXN.toLocaleString() + ' rows inserted. Building indices...');
    const idxStart = Date.now();
    const indices = [
      'CREATE INDEX IF NOT EXISTS idx_tx_merchant ON pos2013_transactions(merchant_id)',
      'CREATE INDEX IF NOT EXISTS idx_tx_terminal ON pos2013_transactions(terminal_id)',
      'CREATE INDEX IF NOT EXISTS idx_tx_batch ON pos2013_transactions(batch_id)',
      'CREATE INDEX IF NOT EXISTS idx_tx_status ON pos2013_transactions(status)',
      'CREATE INDEX IF NOT EXISTS idx_tx_time ON pos2013_transactions(txn_timestamp)',
      'CREATE INDEX IF NOT EXISTS idx_tx_auth ON pos2013_transactions(auth_code)',
      'CREATE INDEX IF NOT EXISTS idx_tx_brand ON pos2013_transactions(card_brand)',
      'CREATE INDEX IF NOT EXISTS idx_rx_txid ON receipts(transaction_id)',
      'CREATE INDEX IF NOT EXISTS idx_rx_merchant ON receipts(merchant_id)',
      'CREATE INDEX IF NOT EXISTS idx_rx_rcptid ON receipts(receipt_id)',
      'CREATE INDEX IF NOT EXISTS idx_b_batchid ON pos2013_batches(batch_id)',
      'CREATE INDEX IF NOT EXISTS idx_b_merchant ON pos2013_batches(merchant_id)',
    ];
    let i = 0;
    (function nextIdx() {
      if (i >= indices.length) {
        const el = ((Date.now() - idxStart) / 1000).toFixed(1);
        console.log('[OK] All indices built in ' + el + 's');
        console.log('[...] Running ANALYZE...');
        db.run('ANALYZE', () => {
          console.log('[OK] ANALYZE complete');
          console.log('[...] Resetting journal_mode...');
          db.run('PRAGMA journal_mode = DELETE;', () => {
            db.close(() => {
              const totalMin = ((Date.now() - START) / 1000 / 60).toFixed(2);
              let gb = '?';
              try { gb = (fs.statSync(DB_PATH).size / 1024 / 1024 / 1024).toFixed(2); } catch(_) {}
              console.log('\n================ FINISHED ================');
              console.log('Total time : ' + totalMin + ' minutes');
              console.log('Final DB   : ' + DB_PATH);
              console.log('DB size    : ' + gb + ' GB');
              console.log('TXN rows   : ' + TOTAL_TXN.toLocaleString());
              console.log('RCPT rows  : ' + TOTAL_TXN.toLocaleString());
              console.log('Batches    : ' + batchSeen.size.toLocaleString());
              console.log('Merchants  : 3 (MRC-1001, MRC-1002, MRC-1003)');
              console.log('===========================================');
              process.exit(0);
            });
          });
        });
        return;
      }
      const s = indices[i++];
      console.log('  idx [' + i + '/' + indices.length + ']: ' + s.split(' ').slice(2, 5).join(' '));
      db.run(s, (e) => { if (e) console.warn('  idx warn:', e.message); nextIdx(); });
    })();
  }

  doNextChunk();
}

run();
