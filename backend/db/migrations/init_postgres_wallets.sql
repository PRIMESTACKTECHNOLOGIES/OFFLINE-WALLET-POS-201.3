-- PostgreSQL schema for customers, wallets, merchants, merchant_wallets, and ledger entries
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE
);

CREATE TABLE IF NOT EXISTS customer_wallets (
  id UUID PRIMARY KEY,
  customer_id UUID REFERENCES customers(id),
  balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency VARCHAR(10) NOT NULL DEFAULT 'USD',
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS merchants (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS merchant_wallets (
  id UUID PRIMARY KEY,
  merchant_id UUID REFERENCES merchants(id),
  balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency VARCHAR(10) NOT NULL DEFAULT 'USD',
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ledger_entries (
  id UUID PRIMARY KEY,
  wallet_type VARCHAR(20) NOT NULL,
  wallet_id UUID NOT NULL,
  direction VARCHAR(10) NOT NULL,
  amount NUMERIC(14,2) NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'USD',
  reason VARCHAR(50) NOT NULL,
  reference TEXT,
  meta JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for common lookups
CREATE INDEX IF NOT EXISTS idx_customer_wallets_customer_id ON customer_wallets(customer_id);
CREATE INDEX IF NOT EXISTS idx_merchant_wallets_merchant_id ON merchant_wallets(merchant_id);
CREATE INDEX IF NOT EXISTS idx_ledger_wallet ON ledger_entries(wallet_id, wallet_type);
