-- Complete Protocol 201.3 Schema for SQLite
-- This includes all fields for real live offline transactions with 6-digit STAN

-- Merchants table
CREATE TABLE IF NOT EXISTS merchants (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    api_key TEXT UNIQUE,
    test_mode BOOLEAN DEFAULT TRUE,
    paypal_client_id TEXT,
    paypal_client_secret TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Terminals table
CREATE TABLE IF NOT EXISTS terminals (
    id TEXT PRIMARY KEY,
    merchant_id TEXT NOT NULL,
    terminal_id TEXT NOT NULL,
    name TEXT NOT NULL,
    terminal_secret TEXT NOT NULL,
    offline_enabled BOOLEAN DEFAULT TRUE,
    last_stan INTEGER DEFAULT 0,
    last_batch_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (merchant_id) REFERENCES merchants(id),
    UNIQUE (merchant_id, terminal_id)
);

-- Batches table (Protocol 201.3)
CREATE TABLE IF NOT EXISTS pos2013_batches (
    batch_id TEXT NOT NULL,
    merchant_id TEXT NOT NULL,
    terminal_id TEXT NOT NULL,
    protocol_version TEXT DEFAULT '201.3',
    status TEXT NOT NULL, -- RECEIVED, PROCESSED, FAILED
    settlement_code TEXT, -- 6-digit code returned to POS
    txn_count INTEGER DEFAULT 0,
    total_amount_minor BIGINT DEFAULT 0,
    signature TEXT,
    nonce TEXT,
    upload_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    processed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (merchant_id, terminal_id, batch_id)
);

-- Transactions table (Protocol 201.3)
CREATE TABLE IF NOT EXISTS pos2013_transactions (
    id TEXT PRIMARY KEY,
    merchant_id TEXT NOT NULL,
    terminal_id TEXT NOT NULL,
    batch_id TEXT NOT NULL,
    local_txn_id TEXT NOT NULL, -- Idempotency key
    stan TEXT(6) NOT NULL, -- 6-digit System Trace Audit Number
    amount_minor BIGINT NOT NULL,
    currency TEXT(3) NOT NULL,
    pan_masked TEXT(32) NOT NULL,
    txn_type TEXT(16) NOT NULL, -- SALE, REFUND, VOID
    auth_mode TEXT(32) NOT NULL, -- OFFLINE_APPROVED, OFFLINE_DECLINED, ONLINE_APPROVED, ONLINE_DECLINED
    entry_mode TEXT(16) NOT NULL, -- CHIP, SWIPE, CONTACTLESS, MANUAL
    rrn TEXT(32), -- Retrieval Reference Number
    auth_code TEXT(16), -- Authorization Code
    status TEXT(16) NOT NULL, -- PENDING, APPROVED, DECLINED, SYNCED
    emv_data TEXT, -- JSON EMV chip data
    txn_timestamp DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (merchant_id, terminal_id, batch_id) REFERENCES pos2013_batches(merchant_id, terminal_id, batch_id),
    UNIQUE (merchant_id, terminal_id, batch_id, local_txn_id)
);

-- Payment codes table (for live redemption)
CREATE TABLE IF NOT EXISTS payment_codes (
    id TEXT PRIMARY KEY,
    code TEXT(6) UNIQUE NOT NULL,
    amount_minor BIGINT NOT NULL,
    currency TEXT(3) DEFAULT 'USD',
    used BOOLEAN DEFAULT FALSE,
    used_at DATETIME,
    used_by_merchant TEXT,
    reference TEXT,
    stan TEXT(6),
    pan_masked TEXT(32),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_transactions_merchant ON pos2013_transactions(merchant_id);
CREATE INDEX IF NOT EXISTS idx_transactions_terminal ON pos2013_transactions(terminal_id);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON pos2013_transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_stan ON pos2013_transactions(stan);
CREATE INDEX IF NOT EXISTS idx_batches_merchant ON pos2013_batches(merchant_id);
CREATE INDEX IF NOT EXISTS idx_batches_status ON pos2013_batches(status);
CREATE INDEX IF NOT EXISTS idx_payment_codes_code ON payment_codes(code);

-- Insert default merchant
INSERT OR IGNORE INTO merchants (id, name, api_key, test_mode) 
VALUES ('MRC-1001', 'Default Merchant', 'sk_test_mock_key_12345', TRUE);

-- Insert default terminal
INSERT OR IGNORE INTO terminals (id, merchant_id, terminal_id, name, terminal_secret, last_stan) 
VALUES ('TERM-UUID-001', 'MRC-1001', 'T2013-001', 'Main Terminal', 'secret_term_001', 0);

-- Insert sample payment codes for testing
INSERT OR IGNORE INTO payment_codes (id, code, amount_minor, currency, reference) 
VALUES 
    (lower(hex(randomblob(16))), '123456', 10000, 'USD', 'REF-001'),
    (lower(hex(randomblob(16))), '999999', 5050, 'USD', 'REF-002'),
    (lower(hex(randomblob(16))), '888888', 1000, 'USD', 'REF-003');
