-- Migration: merchant_crypto_balances

CREATE TABLE IF NOT EXISTS merchant_crypto_balances (
  id TEXT PRIMARY KEY,
  merchant_id TEXT,
  asset VARCHAR(20) NOT NULL,
  amount NUMERIC(24,8) NOT NULL,
  meta JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_merchant_crypto_balances_merchant ON merchant_crypto_balances(merchant_id);
