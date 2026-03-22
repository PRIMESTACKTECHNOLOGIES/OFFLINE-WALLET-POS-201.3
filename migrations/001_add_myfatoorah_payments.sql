-- Add MyFatoorah payments table to receive payment data
-- Run this in your PostgreSQL database

CREATE TABLE IF NOT EXISTS myfatoorah_payments (
    id SERIAL PRIMARY KEY,
    invoice_id BIGINT UNIQUE NOT NULL,
    invoice_reference VARCHAR(128),
    customer_name VARCHAR(255),
    customer_mobile VARCHAR(50),
    transaction_date TIMESTAMP WITH TIME ZONE,
    payment_gateway VARCHAR(50),
    reference_id VARCHAR(255),
    track_id VARCHAR(255),
    transaction_id VARCHAR(255),
    payment_id VARCHAR(255),
    authorization_id VARCHAR(255),
    amount DECIMAL(12, 2) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING', -- PENDING, PAID, FAILED, CANCELLED
    payment_url TEXT,
    raw_webhook_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for faster lookups
CREATE INDEX idx_myfatoorah_invoice_ref ON myfatoorah_payments(invoice_reference);
CREATE INDEX idx_myfatoorah_status ON myfatoorah_payments(status);
CREATE INDEX idx_myfatoorah_created ON myfatoorah_payments(created_at DESC);

-- Also add offline_orders table for the queue system
CREATE TABLE IF NOT EXISTS offline_orders (
    id SERIAL PRIMARY KEY,
    order_id VARCHAR(128) UNIQUE NOT NULL,
    amount DECIMAL(12, 2) NOT NULL,
    customer_name VARCHAR(255),
    customer_mobile VARCHAR(50) NOT NULL,
    description TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING', -- PENDING, LINK_SENT, PAID, CANCELLED
    myfatoorah_invoice_id BIGINT,
    payment_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    paid_at TIMESTAMP WITH TIME ZONE,
    FOREIGN KEY (myfatoorah_invoice_id) REFERENCES myfatoorah_payments(invoice_id)
);

CREATE INDEX idx_offline_orders_status ON offline_orders(status);
CREATE INDEX idx_offline_orders_mobile ON offline_orders(customer_mobile);

COMMENT ON TABLE myfatoorah_payments IS 'Stores MyFatoorah payment data received via webhooks';
COMMENT ON TABLE offline_orders IS 'Stores offline POS orders waiting for payment links';
