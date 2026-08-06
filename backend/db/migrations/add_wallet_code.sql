-- Migration: add wallet_code to customer_wallets (portable for SQLite/Postgres)

-- Add column (SQLite/Postgres compatible)
ALTER TABLE customer_wallets ADD COLUMN wallet_code TEXT;

-- Backfill with PSW-####-#### format for existing rows missing a code
-- Note: uses SQLite random(); for Postgres adjust to gen_random_uuid or set via application script.
UPDATE customer_wallets
SET wallet_code = 'PSW-' || (abs(random()) % 9000 + 1000) || '-' || (abs(random()) % 9000 + 1000)
WHERE wallet_code IS NULL;

-- Create unique index to enforce uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_wallets_wallet_code ON customer_wallets(wallet_code);
