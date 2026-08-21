const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = path.join(__dirname, 'data', 'database.sqlite');
const DB_EXISTS = fs.existsSync(DB_PATH);
const TOTAL_TXN = 5_000_000;
const TX_PER_COMMIT = 5000;

console.log('=== 5M TRANSACTION GENERATOR V5 (real schemas) ===');
console.log('Target DB:', DB_PATH);
console.log('DB exists:', DB_EXISTS);
console.log('Total TXN:', TOTAL_TXN.toLocaleString());
console.log('TX per commit:', TX_PER_COMMIT);

function fmtComma(n) { let s = String(n), o = ''; for (let i = 0; i < s.length; i++) { if (i > 0 && (s.length - i) % 3 === 0) o += ','; o += s.charAt(i); } return o; }

const MERCHANTS = [
  { merchant_id: 'MRC-1001', terminal_ids: ['T2013-001','T2013-002'], name: 'PRIMESTACK TECHNOLOGIES LLC', addr: '1000 N WEST ST #400\nWILMINGTON, DE 19801', phone: '+1 (302) 555-0100', floor_limit: 500000 },
  { merchant_id: 'MRC-1002', terminal_ids: ['T2013-003'], name: 'QVS ONE MEMBER COMPANY LIMITED', addr: 'KHU PHO TIEU LONG, PHUONG TIEU GIANG\nTHANH PHO TU SON, TINH BAC NINH, VIET NAM', phone: '0901 561 203', floor_limit: 200000000 },
  { merchant_id: 'MRC-1003', terminal_ids: ['T2013-004','T2013-005'], name: 'GLOBAL RETAIL HUB PTE LTD', addr: '1 RAFFLES PLACE #20-61\nSINGAPORE 048616', phone: '+65 6123 4567', floor_limit: 1000000 }
];
const MERCHANT_BY_TERMINAL = {};
MERCHANTS.forEach(m => m.terminal_ids.forEach(t => MERCHANT_BY_TERMINAL[t] = m));
const TERMINAL_ALL = MERCHANTS.flatMap(m => m.terminal_ids);

const CURRENCIES = ['USD','EUR','GBP','AED'];
const CURRENCY_SYMBOLS = { USD: '$', EUR: '\u20ac', GBP: '\u00a3', AED: 'AED' };
const CARD_BRANDS = ['VISA','MASTERCARD','AMEX','DISCOVER','UNIONPAY'];
const ENTRY_MODES = ['CHIP','NFC','MANUAL','MAGSTRIPE'];
const STATUSES = ['SETTLED','SYNCED','APPROVED','AUTHORIZED'];
const CVM_RESULTS = ['SIGNATURE','PIN','PIN_AND_SIGNATURE','NO_CVM','CONSUMER_DEVICE'];
const TXN_TYPES = ['SALE','REFUND','PREAUTH','COMPLETION'];
const READER_SOURCES = ['INTERNAL','EXTERNAL','MOBILE','WEB_BROWSER'];

const CARD_BIN_PREFIX = { VISA: ['4'], MASTERCARD: ['51','52','53','54','55','2221','2720'], AMEX: ['34','37'], DISCOVER: ['6011','65','644','645','646','647','648','649'], UNIONPAY: ['62'] };
const CARD_PROGRAMS = { VISA: ['VISA CLASSIC','VISA GOLD','VISA PLATINUM','VISA SIGNATURE','VISA INFINITE'], MASTERCARD: ['MC STANDARD','MC GOLD','MC PLATINUM','MC WORLD','MC WORLD ELITE'], AMEX: ['AMEX GREEN','AMEX GOLD','AMEX PLATINUM','AMEX CENTURION'], DISCOVER: ['DISCOVER IT','DISCOVER CHROME','DISCOVER MORE'], UNIONPAY: ['UP PLATINUM','UP DIAMOND','UP CLASSIC'] };

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
const CARD_I = buildIdx([0.50,0.30,0.10,0.07,0.03]);
const ENTRY_I = buildIdx([0.45,0.35,0.15,0.05]);
const STATUS_I = buildIdx([0.70,0.20,0.08,0.02]);
const CURRENCY_I = buildIdx([0.80,0.10,0.05,0.05]);
const CVM_I = buildIdx([0.40,0.30,0.15,0.10,0.05]);
const TXN_TYPE_I = buildIdx([0.85,0.07,0.05,0.03]);
const READER_I = buildIdx([0.60,0.20,0.15,0.05]);
const MERCHANT_W = [0.70,0.22,0.08];
const MERCHANT_I = buildIdx(MERCHANT_W);
const MERCHANT_TUPLE_I = (() => {
  const tuples = [];
  MERCHANTS.forEach((m, mi) => m.terminal_ids.forEach(tid => tuples.push({ merchant_id: m.merchant_id, terminal_id: tid, mi })));
  const N = 100000;
  const arr = new Uint16Array(N);
  let j = 0;
  for (let mi = 0; mi < MERCHANTS.length; mi++) {
    const m = MERCHANTS[mi];
    const perTerm = Math.round(MERCHANT_W[mi] * N / m.terminal_ids.length);
    for (const tid of m.terminal_ids) {
      const tupIdx = tuples.findIndex(t => t.terminal_id === tid);
      const lim = (mi === MERCHANTS.length-1 && tid === m.terminal_ids[m.terminal_ids.length-1]) ? N : j + perTerm;
      while (j < lim) arr[j++] = tupIdx;
    }
  }
  while (j < N) arr[j++] = 0;
  return { arr, tuples };
})();

function luhnDigit(prefix) {
  let sum = 0, alt = false;
  for (let i = prefix.length - 1; i >= 0; i--) {
    let d = parseInt(prefix.charAt(i), 10);
    if (alt) { d *= 2; if (d > 9) d -= 9; }
    sum += d; alt = !alt;
  }
  return ((Math.ceil(sum / 10) * 10) - sum) % 10;
}
function genPan(brand) {
  const prefixes = CARD_BIN_PREFIX[brand];
  const pfx = prefixes[Math.floor(Math.random()*prefixes.length)];
  const totalLen = (brand === 'AMEX') ? 15 : 16;
  const middleLen = totalLen - pfx.length - 1;
  let s = pfx;
  for (let i = 0; i < middleLen; i++) s += Math.floor(Math.random()*10);
  return s + luhnDigit(s);
}
function maskPan(pan, brand) {
  if (brand === 'AMEX') return pan.slice(0,4)+'-****-**-'+pan.slice(11);
  return pan.slice(0,4)+'-****-****-'+pan.slice(12);
}
const HEX_CHARS = '0123456789abcdef';
function hexFast(n) { let o = ''; for (let i = 0; i < n; i++) o += HEX_CHARS[Math.floor(Math.random()*16)]; return o; }
function uuid4Fast() {
  return hexFast(8)+'-'+hexFast(4)+'-4'+hexFast(3)+'-'+HEX_CHARS[(Math.floor(Math.random()*4)+8)]+hexFast(3)+'-'+hexFast(12);
}
function randInt(min, max) { return Math.floor(Math.random() * (max-min+1)) + min; }
function randChoice(arr) { return arr[Math.floor(Math.random()*arr.length)]; }
function logNormalSample(mu, sigma) {
  const u1 = Math.random() || 1e-9; const u2 = Math.random();
  const z = Math.sqrt(-2*Math.log(u1)) * Math.cos(2*Math.PI*u2);
  return Math.exp(mu + sigma * z);
}
const FIRST_NAMES = ['NGUYEN','TRAN','LE','PHAM','HUYNH','HO','NGO','DUONG','LY','VU','JOHN','JAMES','ROBERT','MICHAEL','WILLIAM','DAVID','RICHARD','JOSEPH','THOMAS','CHARLES','CHRISTOPHER','DANIEL','MATTHEW','ANTHONY','MARK','DONALD','STEVEN','PAUL','ANDREW','JOSHUA','KENNETH','KEVIN','BRIAN','GEORGE','TIMOTHY','RONALD','EDWARD','JASON','JEFFREY','RYAN','JACOB','GARY','NICHOLAS','ERIC','JONATHAN','STEPHEN','LARRY','JUSTIN','SCOTT','MOHAMMED','AHMED','ALI','FATIMA','AISHA','MARIA','GARCIA','RODRIGUEZ','MARTINEZ','HERNANDEZ','LOPEZ','GONZALEZ','WILSON','ANDERSON','THOMAS','TAYLOR','MOORE','JACKSON','MARTIN','LEE','WHITE','HARRIS','CLARK','LEWIS','WALKER','YOUNG','KING','WRIGHT','SCOTT','TORRES','NGUYEN','HILL','FLORES','GREEN','ADAMS','NELSON','BAKER','HALL','RIVERA','CAMPBELL','MITCHELL','CARTER','ROBERTS','GOMEZ','PHILLIPS','EVANS','TURNER','DIAZ','PARKER','CRUZ','EDWARDS','COLLINS','REYES','STEWART','MORRIS','MORALES','MURPHY','COOK','ROGERS','GUTIERREZ','ORTIZ','MORGAN','COOPER','PETERSON','BAILEY','REED','KELLY','HOWARD','RAMESH','SURESH','VIJAY','ANAND','PRIYA','DEEPA','SUNITA','KAVITA','MINJIE','YING','WEI','WANG','LI','ZHANG','LIU','CHEN','YANG','HUANG','ZHOU','WU','XU','TANAKA','SUZUKI','Takahashi','ITO','WATANABE','KIM','LEE','PARK','CHOI','JEONG','ABDULLAH','HASSAN','IBRAHIM','KHALID','SARA','NOOR','LINA','OMAR','ALEXANDRU','ION','MIHAI','ANDREEA','MARIA','ELENA','CRISTIAN','ALEKSEY','MIKHAIL','IVAN','DMITRI','SERGEY','ANDREY','OLGA','TATIANA','NADEZHDA','IRINA','MUELLER','SCHMIDT','SCHNEIDER','FISCHER','WEBER','MEYER','WAGNER','BECKER','SCHULTZ','HOFFMANN','MARTIN','SIMON','DUPONT','DUBOIS','LEROUX','MOREAU','LAURENT','BONJOUR','DUMONT','MARTIN','GARCIA','MARTINEZ','LOPEZ','SANCHEZ','GOMEZ','FERNANDEZ','MORENO','JIMENEZ','ALVAREZ','ROMERO','RUSSO','FERRARI','ROSSI','BIANCHI','MARINO','GRECO','BRUNO','GALLI','CONTI','DE LUCA','MANCINI','COLOMBO'];
const LAST_NAMES = ['NGUYEN','TRAN','LE','PHAM','HUYNH','HO','NGO','DUONG','LY','VU','DANG','BUI','DO','HOANG','VUONG','DINH','DAO','PHAN','MAC','TRINH','SMITH','JOHNSON','WILLIAMS','BROWN','JONES','GARCIA','MILLER','DAVIS','RODRIGUEZ','MARTINEZ','HERNANDEZ','LOPEZ','GONZALEZ','WILSON','ANDERSON','THOMAS','TAYLOR','MOORE','JACKSON','MARTIN','LEE','PEREZ','THOMPSON','WHITE','HARRIS','SANCHEZ','CLARK','RAMIREZ','LEWIS','ROBINSON','WALKER','YOUNG','ALLEN','KING','WRIGHT','SCOTT','TORRES','NGUYEN','HILL','FLORES','GREEN','ADAMS','NELSON','BAKER','HALL','RIVERA','CAMPBELL','MITCHELL','CARTER','ROBERTS','GOMEZ','PHILLIPS','EVANS','TURNER','DIAZ','PARKER','CRUZ','EDWARDS','COLLINS','REYES','STEWART','MORRIS','MORALES','MURPHY','COOK','ROGERS','GUTIERREZ','ORTIZ','MORGAN','COOPER','PETERSON','BAILEY','REED','KELLY','HOWARD','RAMOS','KIM','LIM','TAN','CHEN','WONG','LOW','TANAKA','SUZUKI','TAKAHASHI','ITO','WATANABE','SATO','YAMAMOTO','NAKAMURA','KOBYASHI','KATO','PARK','CHOI','JEONG','KIM','LEE','LIM','HONG','SHIN','JANG','AHMED','KHAN','ALI','HUSSAIN','RAZA','IQBAL','FAROOQ','ZAFAR','MEMON','BALOCH','PATEL','DESAI','SHAH','TRIVEDI','KAPADIA','MEHTA','VYAS','RAO','REDDY','VARMA','MENON','NAIR','IYER','KRISHNAN','VENKATRAMAN','SHARMA','VERMA','GUPTA','MISHRA','SRIVASTAVA','SINGH','KUMAR','PANDEY','CHAUDHARY','YADAV','MUELLER','SCHMIDT','SCHNEIDER','FISCHER','WEBER','MEYER','WAGNER','BECKER','HOFFMANN','SCHULZ','KRAUSE','DUPONT','DUBOIS','LEROUX','MOREAU','LAURENT','SIMON','MARTIN','BERNARD','PETIT','DURAND','LEROUX','MOREAU','GARCIA','MARTINEZ','LOPEZ','SANCHEZ','GOMEZ','FERNANDEZ','MORENO','JIMENEZ','ALVAREZ','ROMERO','TORRES','DIAZ','PEREZ','RUIZ','RUSSO','FERRARI','ROSSI','BIANCHI','ROMANO','COLOMBO','RICCI','MARINO','GRECO','BRUNO','GALLI','CONTI','DE LUCA','MANCINI','COSTANTINI','BALDINI','CAPPARELLI','ANDERSSON','JOHANSSON','KARLSSON','NILSSON','ERIKSSON','LARSSON','OLSSON','PERSSON','SVENSSON','GUSTAFSSON','PETTERSSON','JENSEN','HANSEN','POULSEN','ANDERSEN','CHRISTENSEN','LARSEN','SORENSEN','RASMUSSEN','JORGENSEN','PEDERSEN','NIELSEN','MORTENSEN'];

function buildReceiptJson({ id, receipt_id, local_txn_id, merchant_id, terminal_id, batch_id, stan, amount_minor, currency, pan_masked, card_brand, txn_type, auth_mode, entry_mode, cvm_result, pin_verified, rrn, auth_code, status, txn_iso, customer_name, expiry, card_program, cvv_provided, reader_source }) {
  const m = MERCHANT_BY_TERMINAL[terminal_id];
  const currency_sym = CURRENCY_SYMBOLS[currency] || currency;
  const intAmt = Math.floor(amount_minor / 100);
  const dec = amount_minor % 100;
  const decStr = String(100+dec).slice(1);
  const amtStr = currency_sym + ' ' + fmtComma(intAmt) + '.' + decStr;
  const amtStrSmall = amtStr.padStart(40);
  const idShort = id.slice(0,8).toUpperCase();
  const rcptNoShort = 'RCP-'+idShort;
  const dt_short = new Date(txn_iso).toISOString().replace('T',' ').substring(0,19);
  const batchSeqShort = batch_id.slice(0,10);
  const pinStr = pin_verified ? 'YES' : 'NO';
  const floorStr = (m.floor_limit/100).toFixed(0);
  const customerCopy = '\n========================================\n'
    + m.name+'\n'+m.addr+'\nPHONE: '+m.phone+'\n'
    + '========================================\n'
    + '           ** CUSTOMER COPY **\n'
    + '========================================\n'
    + 'RECEIPT NO:     '+rcptNoShort+'\nDATE/TIME:      '+dt_short
    + '\n----------------------------------------\nCARDHOLDER DETAILS\nNAME:           '+customer_name
    + '\n----------------------------------------\nCARD DETAILS\nCARD BRAND:     '+card_brand
    + '\nCARD NO:        '+pan_masked+'\nEXPIRY:         '+expiry
    + '\nENTRY MODE:     '+entry_mode+'\nPIN VERIFIED:   '+pinStr
    + '\nCVM:            '+cvm_result
    + '\n----------------------------------------\nTOTAL TRANSACTION AMOUNT\n'+amtStrSmall
    + '\n----------------------------------------\nTRANSACTION DETAILS\nTXN TYPE:       '+txn_type
    + '\nAUTH MODE:      '+auth_mode+'\nPROTOCOL:       VER 101.1 PATH B\nSTAN:           '+stan
    + '\nRRN:            '+rrn+'\nAUTH CODE:      '+auth_code
    + '\nTERMINAL ID:    '+terminal_id+'\nMERCHANT ID:    '+merchant_id
    + '\nBATCH:          '+batchSeqShort+'\nSTAN:           '+stan
    + '\nFLOOR LIMIT:    '+currency_sym+' '+floorStr+'\nREADER:         '+reader_source
    + '\n========================================\n'
    + '         ** APPROVED  / VERIFIED **\n'
    + '========================================\n'
    + 'SIGNATURE: _____________________________\n'
    + 'Cardholder acknowledges the final amount\n'
    + 'stated above in the declared currency.\n'
    + 'I agree to be bound by the cardholder\n'
    + 'agreement and merchant T&C.\n'
    + '\nPrinted: '+dt_short+'\n';
  const merchantCopy = customerCopy.replace('** CUSTOMER COPY **','** MERCHANT COPY **');
  const combined = merchantCopy + '\n\n' + customerCopy;
  const fullTx = JSON.stringify({
    id, local_txn_id, merchant_id, terminal_id, batch_id, stan,
    amount_minor, currency, pan_masked, card_brand, txn_type, auth_mode, entry_mode,
    reader_source, cvm_result, pin_verified, rrn, auth_code, status, txn_timestamp: txn_iso,
    protocol_version: '101.1', settlement_code: status === 'SETTLED' ? auth_code : null,
    batch_status: 'SETTLED',
    merchant_name: m.name, merchant_address: m.addr, merchant_phone: m.phone,
    customer_name, expiry_mm_yy: expiry, card_program, cvv_provided: cvv_provided ? 1 : 0,
    terminal_floor_limit_permanent: m.floor_limit, currency_symbol: currency_sym,
    batch_seq: batchSeqShort, upload_timestamp: txn_iso
  });
  const plainMerchant = merchantCopy.replace(/[=-\n]{10,}/g,'\n').replace(/\n{3,}/g,'\n\n');
  const plainCustomer = customerCopy.replace(/[=-\n]{10,}/g,'\n').replace(/\n{3,}/g,'\n\n');
  function esc(s) { return s.replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/\n/g,'\\n'); }
  return '{"receiptId":"'+receipt_id+'",'
    +'"thermalCombined":"'+esc(combined)+'",'
    +'"thermalCustomer":"'+esc(customerCopy)+'",'
    +'"thermalMerchant":"'+esc(merchantCopy)+'",'
    +'"browserCombined":"'+esc(combined.replace(/\n/g,'<br/>'))+'",'
    +'"browserCustomer":"'+esc(customerCopy.replace(/\n/g,'<br/>'))+'",'
    +'"browserMerchant":"'+esc(merchantCopy.replace(/\n/g,'<br/>'))+'",'
    +'"plainCustomer":"'+esc(plainCustomer)+'",'
    +'"plainMerchant":"'+esc(plainMerchant)+'",'
    +'"fullTx":'+fullTx+'}';
}

const LUT_SIZE = 200000;
console.log('[PRE] Building LUTs (size =', LUT_SIZE+')...');
const LUT_PAN = new Array(LUT_SIZE);
const LUT_MASKED_PAN = new Array(LUT_SIZE);
const LUT_BRAND_OF_PAN = new Array(LUT_SIZE);
for (let i = 0; i < LUT_SIZE; i++) {
  const brand = CARD_BRANDS[CARD_I[(Math.random()*1e9) % 100000]];
  const pan = genPan(brand);
  LUT_PAN[i] = pan;
  LUT_MASKED_PAN[i] = maskPan(pan, brand);
  LUT_BRAND_OF_PAN[i] = brand;
}
const LUT_AMOUNT = new Int32Array(LUT_SIZE);
for (let i = 0; i < LUT_SIZE; i++) {
  const raw = logNormalSample(3.8, 0.9);
  LUT_AMOUNT[i] = Math.max(50, Math.min(1000000, Math.floor(raw*100)));
}
const LUT_ISO = new Array(LUT_SIZE);
const LUT_ISO_SHORT = new Array(LUT_SIZE);
const LUT_BATCH_DATE = new Array(LUT_SIZE);
const START_DATE_T = Date.parse('2024-08-20T00:00:00Z');
const END_DATE_T = Date.parse('2026-08-20T23:59:59Z');
const RANGE_MS = END_DATE_T - START_DATE_T;
for (let i = 0; i < LUT_SIZE; i++) {
  const t = START_DATE_T + Math.floor(Math.random()*RANGE_MS);
  const d = new Date(t);
  LUT_ISO[i] = d.toISOString();
  LUT_ISO_SHORT[i] = d.toISOString().replace('T',' ').substring(0,19);
  LUT_BATCH_DATE[i] = d.toISOString().substring(0,10).replace(/-/g,'');
}
const LUT_CUST = new Array(LUT_SIZE);
for (let i = 0; i < LUT_SIZE; i++) {
  LUT_CUST[i] = FIRST_NAMES[Math.floor(Math.random()*FIRST_NAMES.length)] + ' ' + LAST_NAMES[Math.floor(Math.random()*LAST_NAMES.length)];
}
const LUT_AUTH = new Array(LUT_SIZE);
const LUT_STAN = new Array(LUT_SIZE);
const LUT_RRN = new Array(LUT_SIZE);
const LUT_EXP_MM = new Uint8Array(LUT_SIZE);
const LUT_EXP_YY = new Uint8Array(LUT_SIZE);
const LUT_EXP_STR = new Array(LUT_SIZE);
const LUT_PROG = new Array(LUT_SIZE);
for (let i = 0; i < LUT_SIZE; i++) {
  let a; do { a = Math.floor(1000+Math.random()*9000); } while (a === 0);
  LUT_AUTH[i] = String(a);
  LUT_STAN[i] = String(Math.floor(100000+Math.random()*900000));
  LUT_RRN[i] = hexFast(6).toUpperCase();
  const mm = 1+Math.floor(Math.random()*12);
  const yy = 24+Math.floor(Math.random()*8);
  LUT_EXP_MM[i] = mm; LUT_EXP_YY[i] = yy;
  LUT_EXP_STR[i] = String(100+mm).slice(1) + '/' + String(yy);
  const brandIdx = Math.floor(Math.random()*CARD_BRANDS.length);
  const brand = CARD_BRANDS[brandIdx];
  const progs = CARD_PROGRAMS[brand];
  LUT_PROG[i] = progs[Math.floor(Math.random()*progs.length)];
}
const LUT_MERCHANT_TUPLE = new Array(LUT_SIZE);
for (let i = 0; i < LUT_SIZE; i++) {
  const tupIdx = MERCHANT_TUPLE_I.arr[Math.floor(Math.random()*100000)];
  LUT_MERCHANT_TUPLE[i] = MERCHANT_TUPLE_I.tuples[tupIdx];
}
console.log('[PRE] LUTs built.');

const db = new sqlite3.Database(DB_PATH);

let processed = 0;
let startT = Date.now();
let lastStatusT = startT;
let pendingStmt = null;
let anyError = false;

db.serialize(() => {
  db.run('PRAGMA journal_mode=WAL');
  db.run('PRAGMA synchronous=OFF');
  db.run('PRAGMA temp_store=MEMORY');
  db.run('PRAGMA mmap_size=3000000000');
  db.run('PRAGMA cache_size=-800000');
  db.run('PRAGMA foreign_keys=OFF');
  console.log('[OK] SQLite pragmas applied');

  console.log('[PRE] Cleaning any prior partial data...');
  db.run('DELETE FROM pos2013_transactions');
  db.run('DELETE FROM receipts');
  db.run('DELETE FROM pos2013_batches');
  console.log('[OK] Old partial rows deleted');

  const seedingDb = db;
  MERCHANTS.forEach(m => {
    seedingDb.run("INSERT OR IGNORE INTO terminals (terminal_id,merchant_id,terminal_status,created_at,updated_at) VALUES (?,?,?,?,?)",
      [m.terminal_ids[0], m.merchant_id, 'ACTIVE', new Date().toISOString(), new Date().toISOString()]);
    if (m.terminal_ids[1]) seedingDb.run("INSERT OR IGNORE INTO terminals (terminal_id,merchant_id,terminal_status,created_at,updated_at) VALUES (?,?,?,?,?)",
      [m.terminal_ids[1], m.merchant_id, 'ACTIVE', new Date().toISOString(), new Date().toISOString()]);
  });
  console.log('[OK] Merchants & terminals seeded');
});

const INS_TXN_COLS =
  `INSERT INTO pos2013_transactions
  (id,merchant_id,terminal_id,batch_id,local_txn_id,stan,amount_minor,currency,
   pan_masked,txn_type,auth_mode,entry_mode,card_brand,reader_source,cvm_result,
   pin_verified,rrn,auth_code,status,emv_data,txn_timestamp,created_at,updated_at,settled_at,processor_reference,auth_code_ref2,webhook_trace)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;

const INS_RCPT_COLS =
  `INSERT INTO receipts
  (id,receipt_id,transaction_id,merchant_id,receipt_data,generated_at)
  VALUES (?,?,?,?,?,?)`;

const INS_BATCH_COLS =
  `INSERT INTO pos2013_batches
  (id,batch_id,merchant_id,terminal_id,protocol_version,status,settlement_code,txn_count,total_amount_minor,signature,nonce,batch_seq,upload_timestamp,created_at,updated_at)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;

let insTxn, insRcpt, insBatch;

const batchesInDB = new Set();
const batchTotals = new Map();
const batchTxCounts = new Map();
const batchTerminalMap = new Map();
const batchMerchantMap = new Map();
const batchSeqCounters = new Map();

function nextSeq(merchant_id) {
  const cur = batchSeqCounters.get(merchant_id) || 1;
  batchSeqCounters.set(merchant_id, cur+1);
  return cur;
}
function batchSign(batch_id, merchant_id, terminal_id, nonce) {
  return crypto.createHmac('sha256','pos-offline-hmac-key-2024-protocol-2013').update(batch_id+merchant_id+terminal_id+nonce).digest('hex');
}

function serial(ops, done) {
  let i = 0;
  function next() {
    if (i >= ops.length || anyError) { done(); return; }
    const fn = ops[i++];
    fn(next);
  }
  next();
}

function flushPendingBatchWrites() {
  // insert batches we haven't yet inserted
  for (const batch_id of batchTxCounts.keys()) {
    if (batchesInDB.has(batch_id)) continue;
    const tc = batchTxCounts.get(batch_id) || 0;
    const ta = batchTotals.get(batch_id) || 0;
    if (tc < 1) continue;
    const mid = batchMerchantMap.get(batch_id);
    const tid = batchTerminalMap.get(batch_id);
    const nowi = new Date().toISOString();
    const nonce = hexFast(12);
    const seq = nextSeq(mid);
    const signature = batchSign(batch_id, mid, tid, nonce);
    insBatch.run(
      uuid4Fast(),
      batch_id,
      mid,
      tid,
      '201.3',
      'SETTLED',
      signature.slice(0,8).toUpperCase(),
      tc,
      ta,
      signature,
      nonce,
      seq,
      nowi,
      nowi,
      nowi,
      (err) => { if (err) { console.error('[INS-BATCH ERR]', err.message); anyError = true; } }
    );
    batchesInDB.add(batch_id);
  }
}

function doNextChunk() {
  if (anyError) { console.log('[FATAL] Aborting due to prior error.'); finish(); return; }
  const remaining = TOTAL_TXN - processed;
  const goal = Math.min(TX_PER_COMMIT, remaining);
  if (goal <= 0) { finish(); return; }

  const chunkOps = [];
  let chunkError = null;
  let chunkRows = 0;
  for (let i = 0; i < goal; i++) {
    const r = Math.floor(Math.random()*LUT_SIZE);
    const r2 = Math.floor(Math.random()*LUT_SIZE);
    const r3 = Math.floor(Math.random()*LUT_SIZE);
    const r4 = Math.floor(Math.random()*LUT_SIZE);
    const r5 = Math.floor(Math.random()*LUT_SIZE);
    const r6 = Math.floor(Math.random()*LUT_SIZE);
    const r7 = Math.floor(Math.random()*LUT_SIZE);
    const card_brand = LUT_BRAND_OF_PAN[r];
    const pan_masked = LUT_MASKED_PAN[r];
    const card_program = LUT_PROG[r6];
    const tup = LUT_MERCHANT_TUPLE[r2];
    const merchant_id = tup.merchant_id;
    const terminal_id = tup.terminal_id;
    const currency = CURRENCIES[CURRENCY_I[Math.floor(Math.random()*100000)]];
    const entry_mode = ENTRY_MODES[ENTRY_I[Math.floor(Math.random()*100000)]];
    const status = STATUSES[STATUS_I[Math.floor(Math.random()*100000)]];
    const txn_type = TXN_TYPES[TXN_TYPE_I[Math.floor(Math.random()*100000)]];
    const cvm_result = CVM_RESULTS[CVM_I[Math.floor(Math.random()*100000)]];
    const reader_source = READER_SOURCES[READER_I[Math.floor(Math.random()*100000)]];
    const pin_verified = (entry_mode === 'CHIP' && Math.random() < 0.6) ? 1 : 0;
    const amount_minor = LUT_AMOUNT[r3];
    const txn_iso = LUT_ISO[r4];
    const txn_iso_short = LUT_ISO_SHORT[r4];
    const batch_date = LUT_BATCH_DATE[r4];
    const auth_code = LUT_AUTH[r5];
    const stan = LUT_STAN[r];
    const rrn = LUT_RRN[r6];
    const expiry = LUT_EXP_STR[r7];
    const customer_name = LUT_CUST[r7];
    const cvv_provided = (entry_mode === 'MANUAL') ? 1 : 0;
    const auth_mode = (entry_mode === 'MANUAL' || entry_mode === 'WEB_BROWSER') ? 'MOTO' : 'OFFLINE_PIN';

    const terminalShort = terminal_id.slice(terminal_id.length-3);
    const batch_id = 'B2013'+batch_date+'-'+terminalShort+'-'+(LUT_AUTH[r2]).slice(0,3);

    const id = uuid4Fast();
    const local_txn_id = 'LCL-'+hexFast(8);
    const receipt_id = 'RCP-'+hexFast(10);

    batchTotals.set(batch_id, (batchTotals.get(batch_id) || 0) + amount_minor);
    batchTxCounts.set(batch_id, (batchTxCounts.get(batch_id) || 0) + 1);
    batchMerchantMap.set(batch_id, merchant_id);
    batchTerminalMap.set(batch_id, terminal_id);

    const emv_data = '{"cardholder_name":"'+customer_name.replace(/"/g,'\\"')+'","card_program":"'+card_program+'","expiry_mm_yy":"'+expiry+'","cvv_provided":'+cvv_provided+',"pi_id":"pi_'+hexFast(10)+'"}';
    const emv_ref2 = 'EMVREF-'+hexFast(12);

    const settled_at = (status === 'SETTLED') ? txn_iso : null;
    const processor_reference = (status === 'SETTLED' || status === 'SYNCED') ? 'PROC-'+hexFast(18).toUpperCase() : null;
    const webhook_trace_s = status === 'SYNCED' ? 'WHK:RESP=200;ID=wh_'+hexFast(10)+';TS='+txn_iso : null;

    insTxn.run(
      id, merchant_id, terminal_id, batch_id, local_txn_id, stan,
      amount_minor, currency, pan_masked, txn_type, auth_mode, entry_mode,
      card_brand, reader_source, cvm_result, pin_verified, rrn, auth_code,
      status, emv_data, txn_iso, txn_iso, txn_iso, settled_at, processor_reference, auth_code, webhook_trace_s,
      function(err) {
        if (err) { chunkError = err; console.error('[INS-TXN ERR]', err.message, 'sql=', this?.sql?.substring(0,200)); anyError = true; }
        else chunkRows++;
      }
    );

    const rcptJson = buildReceiptJson({
      id, receipt_id, local_txn_id, merchant_id, terminal_id, batch_id, stan,
      amount_minor, currency, pan_masked, card_brand, txn_type, auth_mode, entry_mode,
      cvm_result, pin_verified, rrn, auth_code, status, txn_iso, customer_name, expiry,
      card_program, cvv_provided, reader_source
    });
    insRcpt.run(
      uuid4Fast(),
      receipt_id,
      id,
      merchant_id,
      rcptJson,
      txn_iso,
      function(err) {
        if (err) { chunkError = err; console.error('[INS-RCPT ERR]', err.message); anyError = true; }
      }
    );

    if (!batchesInDB.has(batch_id) && (batchTxCounts.get(batch_id) >= 50 || i === goal-1)) {
      const mid = merchant_id;
      const tid = terminal_id;
      const nowi = txn_iso;
      const nonce = hexFast(12);
      const seq = nextSeq(mid);
      const signature = batchSign(batch_id, mid, tid, nonce);
      const tc = batchTxCounts.get(batch_id) || 0;
      const ta = batchTotals.get(batch_id) || 0;
      insBatch.run(
        uuid4Fast(), batch_id, mid, tid, '201.3', 'SETTLED',
        signature.slice(0,8).toUpperCase(), tc, ta, signature, nonce, seq, nowi, nowi, nowi,
        function(err) {
          if (err) { chunkError = err; console.error('[INS-BATCH ERR]', err.message); anyError = true; }
          else batchesInDB.add(batch_id);
        }
      );
    }
  }

  setTimeout(function waitForPending() {
    if (chunkRows < goal && !chunkError && !anyError) { setTimeout(waitForPending, 15); return; }
    if (chunkError || anyError) {
      console.log('[CHUNK FAILED AT] processed=',processed,'chunkRows=',chunkRows,'/',goal);
      finish(); return;
    }
    processed += chunkRows;
    const nowT = Date.now();
    if (nowT - lastStatusT > 5000) {
      const elapsed = (nowT - startT) / 1000;
      const txPerSec = Math.round(processed / elapsed);
      const eta = txPerSec > 0 ? Math.round((TOTAL_TXN - processed)/txPerSec) : 0;
      let dbMB = 0;
      try { dbMB = fs.existsSync(DB_PATH) ? (fs.statSync(DB_PATH).size + (fs.existsSync(DB_PATH+'-wal') ? fs.statSync(DB_PATH+'-wal').size : 0)) / 1048576 : 0; } catch (e) {}
      const pct = ((processed/TOTAL_TXN)*100).toFixed(2);
      console.log('['+pct+'%] '+processed.toLocaleString()+'/'+TOTAL_TXN.toLocaleString()+' | '+txPerSec+' tx/s | ETA: '+eta+'s | DB: '+dbMB.toFixed(1)+' MB | batches: '+batchesInDB.size);
      lastStatusT = nowT;
    }
    setImmediate(doNextChunk);
  }, 30);
}

function finish() {
  console.log('[FINAL] Inserting remaining batch summaries...');
  flushPendingBatchWrites();
  console.log('[FINAL] Building indices...');
  const steps = [];
  [
    'CREATE INDEX IF NOT EXISTS idx_tx_merchant_time ON pos2013_transactions(merchant_id,txn_timestamp)',
    'CREATE INDEX IF NOT EXISTS idx_tx_terminal_time ON pos2013_transactions(terminal_id,txn_timestamp)',
    'CREATE INDEX IF NOT EXISTS idx_tx_batch ON pos2013_transactions(batch_id)',
    'CREATE INDEX IF NOT EXISTS idx_tx_status ON pos2013_transactions(status)',
    'CREATE INDEX IF NOT EXISTS idx_tx_auth_code ON pos2013_transactions(auth_code)',
    'CREATE INDEX IF NOT EXISTS idx_tx_card_brand ON pos2013_transactions(card_brand)',
    'CREATE INDEX IF NOT EXISTS idx_rcpt_tx ON receipts(transaction_id)',
    'CREATE INDEX IF NOT EXISTS idx_rcpt_merchant ON receipts(merchant_id)',
    'CREATE INDEX IF NOT EXISTS idx_rcpt_receipt ON receipts(receipt_id)',
    'CREATE INDEX IF NOT EXISTS idx_batch_merchant_time ON pos2013_batches(merchant_id,upload_timestamp)',
    'CREATE INDEX IF NOT EXISTS idx_batch_status ON pos2013_batches(status)',
    'CREATE INDEX IF NOT EXISTS idx_batch_id ON pos2013_batches(batch_id)',
    'ANALYZE'
  ].forEach(sql => steps.push(cb => db.run(sql, () => cb())));
  steps.push(cb => db.run('PRAGMA wal_checkpoint(TRUNCATE)', () => cb()));
  steps.push(cb => db.run('PRAGMA journal_mode=DELETE', () => cb()));
  serial(steps, () => {
    const totalSeconds = (Date.now()-startT)/1000;
    console.log('\n=== DONE ===');
    console.log('Total time:', totalSeconds.toFixed(1)+'s');
    console.log('Total tx processed:', processed.toLocaleString());
    console.log('Total throughput:', Math.round(processed/totalSeconds)+' tx/s');
    db.close((err) => { if (err) console.error('close err',err.message); process.exit(anyError ? 1 : 0); });
  });
}

function start() {
  insTxn = db.prepare(INS_TXN_COLS);
  insRcpt = db.prepare(INS_RCPT_COLS);
  insBatch = db.prepare(INS_BATCH_COLS);
  insTxn.on('error', (e) => { console.error('[insTxn STATEMENT ERROR]', e.message); anyError = true; });
  insRcpt.on('error', (e) => { console.error('[insRcpt STATEMENT ERROR]', e.message); anyError = true; });
  insBatch.on('error', (e) => { console.error('[insBatch STATEMENT ERROR]', e.message); anyError = true; });
  console.log('[OK] Statements prepared');
  startT = Date.now();
  lastStatusT = startT;
  doNextChunk();
}

setTimeout(start, 500);
