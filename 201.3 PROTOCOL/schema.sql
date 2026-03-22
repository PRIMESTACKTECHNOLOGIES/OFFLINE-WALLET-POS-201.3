CREATE TABLE pos2013_transactions ( 
   id              UUID PRIMARY KEY, 
   merchant_id     VARCHAR(64) NOT NULL, 
   terminal_id     VARCHAR(64) NOT NULL, 
   batch_id        VARCHAR(64) NOT NULL, 
   local_txn_id    VARCHAR(64) NOT NULL, 
   stan            VARCHAR(6)  NOT NULL, 
   amount_minor    BIGINT      NOT NULL, 
   currency        VARCHAR(3)  NOT NULL, 
   pan_masked      VARCHAR(32) NOT NULL, 
   txn_type        VARCHAR(16) NOT NULL, 
   auth_mode       VARCHAR(32) NOT NULL, 
   entry_mode      VARCHAR(16) NOT NULL, 
   rrn             VARCHAR(32), 
   auth_code       VARCHAR(16), 
   status          VARCHAR(16) NOT NULL, -- PENDING / APPROVED / DECLINED / SYNCED 
   emv_data        JSONB, 
   txn_timestamp   TIMESTAMP WITH TIME ZONE NOT NULL, 
   created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(), 
   updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(), 
   UNIQUE (merchant_id, terminal_id, batch_id, local_txn_id) 
 );

 CREATE TABLE pos2013_batches (
    batch_id        VARCHAR(64) NOT NULL,
    merchant_id     VARCHAR(64) NOT NULL,
    terminal_id     VARCHAR(64) NOT NULL,
    protocol_version VARCHAR(16) NOT NULL,
    status          VARCHAR(16) NOT NULL, -- RECEIVED, PROCESSED, FAILED
    settlement_code VARCHAR(6),           -- The 6-digit code returned to POS
    txn_count       INTEGER DEFAULT 0,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (merchant_id, terminal_id, batch_id)
 );
