-- Migrations: payouts (portable between SQLite/Postgres where possible)

CREATE TABLE IF NOT EXISTS merchant_payouts (
  id TEXT PRIMARY KEY,
  merchant_id TEXT,
  amount NUMERIC(14,2) NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'USD',
  bank_account TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  meta JSON
);

CREATE TABLE IF NOT EXISTS merchant_crypto_withdrawals (
  id TEXT PRIMARY KEY,
  merchant_id TEXT,
  amount_usd NUMERIC(14,2) NOT NULL,
  asset VARCHAR(20) NOT NULL,
  address TEXT NOT NULL,
  network VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  meta JSON
);
