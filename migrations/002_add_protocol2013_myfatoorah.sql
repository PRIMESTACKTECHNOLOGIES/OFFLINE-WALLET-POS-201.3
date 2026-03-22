-- Migration: Add MyFatoorah support to Protocol 201.3
-- This extends your existing Protocol 201.3 with MyFatoorah payment links

-- Table for Protocol 201.3 + MyFatoorah transactions
CREATE TABLE IF NOT EXISTS protocol2013_myfatoorah_transactions (
    id SERIAL PRIMARY KEY,
    local_txn_id VARCHAR(64) UNIQUE NOT NULL,
    stan VARCHAR(6) NOT NULL,
    batch_id VARCHAR(64) NOT NULL,
    merchant_id VARCHAR(64) NOT NULL,
    terminal_id VARCHAR(64) NOT NULL,
    amount_minor BIGINT NOT NULL,
    currency VARCHAR(3) DEFAULT 'AED',
    customer_phone VARCHAR(50) NOT NULL,
    customer_name VARCHAR(255),
    description TEXT,
    myfatoorah_invoice_id BIGINT,
    payment_url TEXT,
    settlement_code VARCHAR(6),
    status VARCHAR(20) DEFAULT 'PENDING', -- PENDING, LINK_SENT, PAID, FAILED, CANCELLED
    txn_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    paid_at TIMESTAMP WITH TIME ZONE,
    raw_webhook_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_p2013mf_batch ON protocol2013_myfatoorah_transactions(batch_id);
CREATE INDEX idx_p2013mf_status ON protocol2013_myfatoorah_transactions(status);
CREATE INDEX idx_p2013mf_invoice ON protocol2013_myfatoorah_transactions(myfatoorah_invoice_id);

-- Add transaction type to distinguish from card transactions
ALTER TABLE pos2013_transactions ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20) DEFAULT 'CARD';
-- Options: CARD, MYFATOORAH_LINK, CASH, etc.

COMMENT ON TABLE protocol2013_myfatoorah_transactions IS 
'Protocol 201.3 transactions using MyFatoorah payment links instead of direct card processing';
