const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const DB_PATH = path.join(__dirname, 'data', 'database.sqlite');
const TOTAL_TXN = 5_000_000;
const BATCH_SIZE = 2000;
const TOTAL_BATCHES_INSERT = Math.ceil(TOTAL_TXN / BATCH_SIZE);

const MERCHANTS = [
  { id: 'MRC-1001', terminals: ['T2013-001', 'T2013-002'] },
  { id: 'MRC-1002', terminals: ['T2013-003', 'T2013-004'] },
  { id: 'MRC-1003', terminals: ['T2013-005'] },
];
const MERCHANT_WEIGHTS = [0.70, 0.22, 0.08];

const CARD_BRANDS = ['VISA', 'MASTERCARD', 'AMEX', 'DISCOVER', 'UNIONPAY'];
const CARD_WEIGHTS = [0.50, 0.30, 0.10, 0.07, 0.03];

const ENTRY_MODES = ['CHIP_INSERT', 'NFC_CONTACTLESS', 'MANUAL', 'MAGSTRIPE'];
const ENTRY_WEIGHTS = [0.45, 0.35, 0.15, 0.05];

const AUTH_MODES = ['OFFLINE_AUTH', 'ONLINE_AUTH', 'STANDIN'];
const AUTH_WEIGHTS = [0.60, 0.35, 0.05];

const STATUSES = ['SETTLED', 'SYNCED', 'APPROVED', 'AUTHORIZED'];
const STATUS_WEIGHTS = [0.70, 0.20, 0.08, 0.02];

const CURRENCIES = ['USD', 'EUR', 'GBP', 'AED'];
const CURRENCY_WEIGHTS = [0.80, 0.10, 0.05, 0.05];

const CVM_RESULTS = ['SIGNATURE', 'PIN', 'NO_CVM', 'PIN_SIGNATURE'];
const CVM_WEIGHTS = [0.40, 0.35, 0.20, 0.05];

const TXN_TYPES = ['SALE', 'REFUND', 'PREAUTH', 'CAPTURE'];
const TXN_TYPE_WEIGHTS = [0.92, 0.05, 0.02, 0.01];

const READER_SOURCES = ['ACR122U', 'BUILTIN_NFC', 'USB_PINPAD', 'MOTO_VT'];
const READER_WEIGHTS = [0.40, 0.30, 0.20, 0.10];

const MERCHANT_NAMES = {
  'MRC-1001': 'PRIMESTACK TECHNOLOGIES LLC',
  'MRC-1002': 'QVS ONE MEMBER COMPANY LIMITED',
  'MRC-1003': 'GLOBAL RETAIL HUB PTE LTD',
};
const MERCHANT_ADDRS = {
  'MRC-1001': 'Wilmington, DE, USA',
  'MRC-1002': 'Từ Sơn, Bắc Ninh, Việt Nam',
  'MRC-1003': 'Marina Bay, Singapore',
};
const MERCHANT_PHONES = {
  'MRC-1001': '+1 (302) 555-0142',
  'MRC-1002': '+84 901 561 203',
  'MRC-1003': '+65 6225 1234',
};

const CARDHOLDER_FIRST = ['John','Mary','James','Patricia','Robert','Jennifer','Michael','Linda','David','Elizabeth','William','Barbara','Richard','Susan','Joseph','Jessica','Thomas','Sarah','Charles','Karen','Christopher','Nancy','Daniel','Lisa','Matthew','Betty','Anthony','Margaret','Mark','Sandra','Nguyen','Tran','Le','Pham','Ahmed','Mohammed','Li','Wang','Zhang','Omar','Hassan','Karim','Sofia','Maria','Anna','Elena','Ivan','Alex','Dmitri','Olga'];
const CARDHOLDER_LAST = ['Smith','Johnson','Williams','Brown','Jones','Garcia','Miller','Davis','Rodriguez','Martinez','Hernandez','Lopez','Gonzalez','Wilson','Anderson','Thomas','Taylor','Moore','Jackson','Martin','Lee','Perez','Thompson','White','Harris','Sanchez','Clark','Ramirez','Lewis','Robinson','Nguyen','Wang','Li','Zhang','Khan','Ahmed','Ali','Hassan','Ivanov','Petrov','Sokolov','Popov','Dubois','Martin','Bernard','Thomas','Müller','Schmidt','Weber','Fischer'];

function pickWeighted(arr, weights) {
  const r = Math.random();
  let acc = 0;
  for (let i = 0; i < arr.length; i++) {
    acc += weights[i];
    if (r <= acc) return arr[i];
  }
  return arr[arr.length - 1];
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : ((r & 0x3) | 0x8);
    return v.toString(16);
  });
}

function luhnCheck(digits) {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = parseInt(digits[i], 10);
    if (alt) { n *= 2; if (n > 9) n -= 9; }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

function genPan(brand) {
  let prefix, len;
  switch (brand) {
    case 'VISA': prefix = ['4']; len = 16; break;
    case 'MASTERCARD': prefix = ['51','52','53','54','55','22','23','24','25','26','27']; len = 16; break;
    case 'AMEX': prefix = ['34','37']; len = 15; break;
    case 'DISCOVER': prefix = ['6011','65','644','645','646','647','648','649']; len = 16; break;
    case 'UNIONPAY': prefix = ['62','81']; len = 16; break;
    default: prefix = ['4']; len = 16;
  }
  const p = prefix[randInt(0, prefix.length - 1)];
  let digits = p;
  while (digits.length < len - 1) digits += randInt(0, 9);
  for (let c = 0; c <= 9; c++) {
    if (luhnCheck(digits + c)) { digits += c; break; }
  }
  if (digits.length === len - 1) digits += '0';
  return digits;
}

function maskPan(pan, brand) {
  if (brand === 'AMEX') {
    return `${pan.slice(0,4)}-******-${pan.slice(10)}`;
  }
  return `${pan.slice(0,4)}-****-****-${pan.slice(-4)}`;
}

function genLogNormalAmountMinor() {
  const mu = 3.8;
  const sigma = 0.9;
  let u1 = 0, u2 = 0;
  while (u1 === 0) u1 = Math.random();
  while (u2 === 0) u2 = Math.random();
  const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  let amount = Math.exp(mu + sigma * z);
  amount = Math.max(1, Math.min(999999, Math.round(amount)));
  return amount * 100;
}

function genAuthCode() {
  return String(randInt(1, 9999)).padStart(4, '0');
}

function genStan() {
  return String(randInt(1, 999999)).padStart(6, '0');
}

function genRrn() {
  return String(randInt(1, 999999999999)).padStart(12, '0');
}

function genRandomDate(startDate, endDate) {
  const start = startDate.getTime();
  const end = endDate.getTime();
  const t = start + Math.random() * (end - start);
  const d = new Date(t);
  return d.toISOString();
}

const START_DATE = new Date('2024-08-20T00:00:00Z');
const END_DATE = new Date('2026-08-20T23:59:59Z');

function genExpiry() {
  const mm = String(randInt(1, 12)).padStart(2, '0');
  const yy = String(randInt(25, 32));
  return { mm, yy, str: `${mm}/${yy}` };
}

function hmacSha256(key, msg) {
  return crypto.createHmac('sha256', key).update(msg).digest('hex');
}

function buildCompactReceipt(tx) {
  const mName = MERCHANT_NAMES[tx.merchant_id] || 'DEFAULT STORE';
  const mAddr = MERCHANT_ADDRS[tx.merchant_id] || '';
  const mPhone = MERCHANT_PHONES[tx.merchant_id] || '';
  const amtStr = (tx.amount_minor / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const dateStr = new Date(tx.txn_timestamp).toLocaleString('en-US', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  });

  const custLines = [
    `${mName.toUpperCase()}`,
    mAddr,
    `TEL: ${mPhone}`,
    '════════════════════════════════════════',
    '*** CUSTOMER COPY ***',
    `RECEIPT NO:     RCP-${tx.id.slice(0,8).toUpperCase()}`,
    `DATE/TIME:      ${dateStr}`,
    '────────────────────────────────────────',
    'CARDHOLDER DETAILS',
    `NAME:           ${tx.customer_name || 'NOT PROVIDED'}`,
    '────────────────────────────────────────',
    'CARD DETAILS',
    `CARD BRAND:     ${tx.card_brand}`,
    `CARD NO:        ${tx.pan_masked}`,
    `EXPIRY:         ${tx.expiry_mm_yy || 'MM/YY'}`,
    `ENTRY MODE:     ${tx.entry_mode}`,
    `PIN VERIFIED:   ${tx.pin_verified ? 'YES' : 'NO'}`,
    `CVM:            ${tx.cvm_result || 'N/A'}`,
    '────────────────────────────────────────',
    'TOTAL TRANSACTION AMOUNT',
    `${tx.currency} ${amtStr}`,
    '────────────────────────────────────────',
    'TRANSACTION DETAILS',
    `TXN TYPE:       ${tx.txn_type}`,
    `AUTH MODE:      ${tx.auth_mode}`,
    `PROTOCOL:       VER 101.1 PATH B`,
    `STAN:           ${tx.stan}`,
    `RRN:            ${tx.rrn || 'N/A'}`,
    `AUTH CODE:      ${tx.auth_code}`,
    `TERMINAL:       ${tx.terminal_id}`,
    `MERCHANT ID:    ${tx.merchant_id}`,
    '────────────────────────────────────────',
    'BATCH & SETTLEMENT',
    `BATCH ID:       ${tx.batch_id}`,
    `BATCH STATUS:   RECEIVED`,
    '────────────────────────────────────────',
    '✓✓✓  APPROVED / AUTHORIZED  ✓✓✓',
    '════════════════════════════════════════',
    'CARDHOLDER SIGNATURE:',
    '',
    '  ______________________________________',
    '',
    'Thank you for your business!',
    'KEEP THIS RECEIPT FOR YOUR RECORDS',
    '*** END OF RECEIPT ***',
    '', '', ''
  ].join('\n');

  const merchLines = custLines.replace('CUSTOMER COPY', 'MERCHANT COPY');

  const fullTx = {
    id: tx.id,
    local_txn_id: tx.local_txn_id,
    merchant_id: tx.merchant_id,
    terminal_id: tx.terminal_id,
    batch_id: tx.batch_id,
    stan: tx.stan,
    amount_minor: tx.amount_minor,
    currency: tx.currency,
    pan_masked: tx.pan_masked,
    card_brand: tx.card_brand,
    txn_type: tx.txn_type,
    auth_mode: tx.auth_mode,
    entry_mode: tx.entry_mode,
    reader_source: tx.reader_source,
    cvm_result: tx.cvm_result,
    pin_verified: tx.pin_verified,
    rrn: tx.rrn,
    auth_code: tx.auth_code,
    status: tx.status,
    txn_timestamp: tx.txn_timestamp,
    protocol_version: '101.1',
    merchant_name: mName,
    merchant_address: mAddr,
    merchant_phone: mPhone,
    receipt_footer: 'Thank you for your business!',
    customer_name: tx.customer_name,
    expiry_mm_yy: tx.expiry_mm_yy,
    cvv_provided: tx.entry_mode === 'MANUAL' ? 1 : 0,
    terminal_floor_limit_permanent: 5000
  };

  return {
    receiptId: `RCP-${tx.id}`,
    thermalCombined: custLines + '\n\n--- MERCHANT COPY ---\n\n' + merchLines,
    thermalCustomer: custLines,
    thermalMerchant: merchLines,
    browserCombined: custLines + '\n\n--- MERCHANT COPY ---\n\n' + merchLines,
    browserCustomer: custLines,
    browserMerchant: merchLines,
    plainCustomer: custLines,
    plainMerchant: merchLines,
    fullTx: fullTx
  };
}

function pickMerchantAndTerminal() {
  const midx = (() => {
    const r = Math.random();
    if (r < MERCHANT_WEIGHTS[0]) return 0;
    if (r < MERCHANT_WEIGHTS[0] + MERCHANT_WEIGHTS[1]) return 1;
    return 2;
  })();
  const m = MERCHANTS[midx];
  const tidx = randInt(0, m.terminals.length - 1);
  return { merchant_id: m.id, terminal_id: m.terminals[tidx] };
}

function ensureTerminalsAndMerchants(db) {
  const terminals = [];
  for (const m of MERCHANTS) {
    for (const t of m.terminals) {
      terminals.push({ merchant_id: m.id, terminal_id: t, name: `Terminal ${t}` });
    }
  }
  const stmt = db.prepare(`INSERT OR IGNORE INTO terminals (id, merchant_id, terminal_id, name, terminal_secret, offline_enabled) VALUES (?, ?, ?, ?, ?, 1)`);
  db.serialize(() => {
    for (const t of terminals) {
      stmt.run(uuidv4(), t.merchant_id, t.terminal_id, t.name, 'secret_' + t.terminal_id.split('-')[1] || 'term');
    }
  });
  const stmt2 = db.prepare(`INSERT OR IGNORE INTO merchant_settings (merchant_id, api_key, webhook_url, test_mode, merchant_name, support_email) VALUES (?, ?, '', 0, ?, ?)`);
  for (const m of MERCHANTS) {
    stmt2.run(m.id, `offline_secret_${m.id.split('-')[1] || '001'}`, MERCHANT_NAMES[m.id], `support@${m.id.toLowerCase()}.com`);
  }
  const stmt3 = db.prepare(`INSERT OR IGNORE INTO merchant_business_info (merchant_id, business_name, business_address, business_phone, receipt_footer) VALUES (?, ?, ?, ?, ?)`);
  for (const m of MERCHANTS) {
    stmt3.run(m.id, MERCHANT_NAMES[m.id], MERCHANT_ADDRS[m.id], MERCHANT_PHONES[m.id], 'Thank you for your business!');
  }
}

let batchCounter = 0;
function getBatchId(merchant_id, terminal_id, date) {
  const d = new Date(date);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  batchCounter = (batchCounter + 1) % 1000000;
  return `BATCH-${merchant_id}-${terminal_id}-${y}${m}${day}-${String(batchCounter).padStart(6, '0')}`;
}

async function run() {
  console.log('=== 5M TRANSACTION GENERATOR START ===');
  console.log('Target DB:', DB_PATH);
  console.log('Exists:', fs.existsSync(DB_PATH));
  console.log('Target count:', TOTAL_TXN.toLocaleString());
  console.log('Batch size:', BATCH_SIZE);
  console.log('Batches:', TOTAL_BATCHES_INSERT);

  if (!fs.existsSync(path.dirname(DB_PATH))) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  }

  const db = new sqlite3.Database(DB_PATH);

  db.serialize(() => {
    db.run('PRAGMA journal_mode = WAL;');
    db.run('PRAGMA synchronous = OFF;');
    db.run('PRAGMA temp_store = MEMORY;');
    db.run('PRAGMA cache_size = -2000000;');
    db.run('PRAGMA mmap_size = 2147483648;');
    db.run('PRAGMA page_size = 8192;');
    db.run('PRAGMA foreign_keys = OFF;');
  });

  console.log('SQLite pragmas applied (WAL, sync=OFF, cache=2GB, mmap=2GB)');

  ensureTerminalsAndMerchants(db);
  console.log('Merchants & terminals seeded');

  const insertTxn = db.prepare(`INSERT INTO pos2013_transactions
    (id, merchant_id, terminal_id, batch_id, local_txn_id, stan, amount_minor, currency,
     pan_masked, txn_type, auth_mode, entry_mode, card_brand, reader_source, cvm_result,
     pin_verified, rrn, auth_code, status, txn_timestamp, created_at, emv_data)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

  const insertRcpt = db.prepare(`INSERT INTO receipts
    (id, receipt_id, transaction_id, merchant_id, receipt_data, generated_at)
    VALUES (?,?,?,?,?,?)`);

  const insertBatch = db.prepare(`INSERT OR IGNORE INTO pos2013_batches
    (id, batch_id, merchant_id, terminal_id, protocol_version, status, txn_count, total_amount_minor,
     signature, nonce, upload_timestamp, created_at, batch_seq)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);

  const batchSet = new Set();

  const startTime = Date.now();
  let processed = 0;
  let lastReport = 0;

  for (let bigBatch = 0; bigBatch < TOTAL_BATCHES_INSERT; bigBatch++) {
    const thisBatchSize = Math.min(BATCH_SIZE, TOTAL_TXN - processed);

    db.run('BEGIN TRANSACTION');

    for (let i = 0; i < thisBatchSize; i++) {
      const id = uuidv4();
      const { merchant_id, terminal_id } = pickMerchantAndTerminal();
      const txn_timestamp = genRandomDate(START_DATE, END_DATE);
      const batch_id = getBatchId(merchant_id, terminal_id, txn_timestamp);
      const local_txn_id = `TXN-${uuidv4().slice(0, 16)}`;
      const stan = genStan();
      const amount_minor = genLogNormalAmountMinor();
      const currency = pickWeighted(CURRENCIES, CURRENCY_WEIGHTS);
      const card_brand = pickWeighted(CARD_BRANDS, CARD_WEIGHTS);
      const pan = genPan(card_brand);
      const pan_masked = maskPan(pan, card_brand);
      const txn_type = pickWeighted(TXN_TYPES, TXN_TYPE_WEIGHTS);
      const auth_mode = pickWeighted(AUTH_MODES, AUTH_WEIGHTS);
      const entry_mode = pickWeighted(ENTRY_MODES, ENTRY_WEIGHTS);
      const reader_source = pickWeighted(READER_SOURCES, READER_WEIGHTS);
      const cvm_result = pickWeighted(CVM_RESULTS, CVM_WEIGHTS);
      const pin_verified = cvm_result === 'PIN' || cvm_result === 'PIN_SIGNATURE' ? 1 : 0;
      const rrn = genRrn();
      const auth_code = genAuthCode();
      const status = pickWeighted(STATUSES, STATUS_WEIGHTS);
      const expiry = genExpiry();
      const custFirst = CARDHOLDER_FIRST[randInt(0, CARDHOLDER_FIRST.length - 1)];
      const custLast = CARDHOLDER_LAST[randInt(0, CARDHOLDER_LAST.length - 1)];
      const customer_name = `${custFirst} ${custLast}`;

      const emv = {
        customer_name,
        card_program: card_brand === 'AMEX' ? 'CHARGE' : (Math.random() < 0.15 ? 'GOLD' : (Math.random() < 0.3 ? 'PLATINUM' : 'STANDARD')),
        cvv_provided: entry_mode === 'MANUAL',
        expiry_mm: expiry.mm,
        expiry_yy: expiry.yy,
        pan: pan_masked,
        pi_id: crypto.randomBytes(6).toString('hex').toUpperCase()
      };

      insertTxn.run(
        id, merchant_id, terminal_id, batch_id, local_txn_id, stan, amount_minor, currency,
        pan_masked, txn_type, auth_mode, entry_mode, card_brand, reader_source, cvm_result,
        pin_verified, rrn, auth_code, status, txn_timestamp, txn_timestamp, JSON.stringify(emv)
      );

      const rcptId = uuidv4();
      const receipt_data = buildCompactReceipt({
        id, merchant_id, terminal_id, batch_id, local_txn_id, stan, amount_minor, currency,
        pan_masked, card_brand, txn_type, auth_mode, entry_mode, reader_source, cvm_result,
        pin_verified, rrn, auth_code, status, txn_timestamp, customer_name, expiry_mm_yy: expiry.str
      });
      insertRcpt.run(rcptId, `RCP-${id}`, id, merchant_id, JSON.stringify(receipt_data), txn_timestamp);

      if (!batchSet.has(batch_id)) {
        batchSet.add(batch_id);
        const bId = uuidv4();
        const nonce = crypto.randomBytes(12).toString('hex');
        const sigMsg = `${batch_id}|${merchant_id}|${terminal_id}|${nonce}|101.3`;
        const signature = hmacSha256('offline_secret_001', sigMsg);
        insertBatch.run(
          bId, batch_id, merchant_id, terminal_id, '201.3', 'SETTLED', randInt(200, 1500),
          randInt(1_000_000, 50_000_000), signature, nonce, txn_timestamp, txn_timestamp, randInt(1, 9999)
        );
      }

      processed++;
    }

    db.run('COMMIT');

    const now = Date.now();
    if (now - lastReport > 5000 || processed >= TOTAL_TXN) {
      const elapsedSec = (now - startTime) / 1000;
      const rate = processed / elapsedSec;
      const remain = TOTAL_TXN - processed;
      const etaSec = remain / rate;
      const pct = (processed / TOTAL_TXN * 100).toFixed(2);
      const dbMb = fs.existsSync(DB_PATH) ? (fs.statSync(DB_PATH).size / 1024 / 1024).toFixed(1) : '?';
      console.log(`[${pct}%] ${processed.toLocaleString()}/${TOTAL_TXN.toLocaleString()} | ${rate.toFixed(0)} tx/s | ETA: ${etaSec.toFixed(0)}s | DB: ${dbMb} MB | batches: ${batchSet.size}`);
      lastReport = now;
    }
  }

  console.log('\n=== All inserts committed. Rebuilding indices & running VACUUM... ===');

  db.run('PRAGMA foreign_keys = ON;');
  db.serialize(() => {
    db.run(`CREATE INDEX IF NOT EXISTS idx_tx_merchant ON pos2013_transactions(merchant_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_tx_terminal ON pos2013_transactions(terminal_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_tx_batch ON pos2013_transactions(batch_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_tx_status ON pos2013_transactions(status)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_tx_timestamp ON pos2013_transactions(txn_timestamp)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_tx_authcode ON pos2013_transactions(auth_code)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_tx_brand ON pos2013_transactions(card_brand)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_rx_txn ON receipts(transaction_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_rx_merchant ON receipts(merchant_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_b_merchant ON pos2013_batches(merchant_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_b_status ON pos2013_batches(status)`);
  });
  console.log('Indices created');

  db.run('PRAGMA journal_mode = DELETE;', () => {
    console.log('Journal mode reset to DELETE');
  });

  db.close(() => {
    const finalSize = fs.existsSync(DB_PATH) ? (fs.statSync(DB_PATH).size / 1024 / 1024 / 1024).toFixed(2) : '?';
    const elapsedMin = ((Date.now() - startTime) / 1000 / 60).toFixed(2);
    console.log('\n========== FINISHED ==========');
    console.log(`Total time: ${elapsedMin} minutes`);
    console.log(`Final DB size: ${finalSize} GB`);
    console.log(`Batches created: ${batchSet.size}`);
    console.log('==============================');
  });
}

run().catch(e => {
  console.error('FATAL ERROR:', e);
  process.exit(1);
});
