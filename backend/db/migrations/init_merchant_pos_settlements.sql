-- Migration: merchant_pos_settlements

CREATE TABLE IF NOT EXISTS merchant_pos_settlements (
  id TEXT PRIMARY KEY,
  merchant_id TEXT,
  ledger_entry_id TEXT,
  amount NUMERIC(14,2) NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'USD',
  status VARCHAR(20) NOT NULL DEFAULT 'unsettled',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  settled_at DATETIME,
  meta JSON
);

CREATE INDEX IF NOT EXISTS idx_merchant_pos_settlements_merchant ON merchant_pos_settlements(merchant_id);
