-- =============================================================================
-- Limitless Exchange Data Ingestion - Initial Schema Migration
-- =============================================================================
-- This migration creates the 3-layer storage model with limitless_ prefix:
-- 1. Bronze Layer (limitless_bronze) - Immutable raw JSON storage
-- 2. Silver Layer (limitless_silver) - Normalized entity tables
-- 3. Gold Layer (limitless_gold) - Analytics-ready materialized views
-- =============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- BRONZE LAYER - Raw API Response Storage
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS limitless_bronze;

-- Main raw response table - append-only, immutable
CREATE TABLE IF NOT EXISTS limitless_bronze.api_responses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Source identification
    source VARCHAR(100) NOT NULL DEFAULT 'limitless_exchange',
    endpoint_name VARCHAR(200) NOT NULL,
    
    -- Request details
    url_path TEXT NOT NULL,
    query_params JSONB DEFAULT '{}',
    
    -- Response details
    body_json JSONB NOT NULL,
    body_hash VARCHAR(64) NOT NULL,
    
    -- Metadata
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    run_id UUID,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraint for idempotent inserts (deduplication)
    CONSTRAINT unique_body_hash UNIQUE (body_hash)
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_limitless_bronze_endpoint 
    ON limitless_bronze.api_responses(endpoint_name);
CREATE INDEX IF NOT EXISTS idx_limitless_bronze_fetched 
    ON limitless_bronze.api_responses(fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_limitless_bronze_run_id 
    ON limitless_bronze.api_responses(run_id);
CREATE INDEX IF NOT EXISTS idx_limitless_bronze_body 
    ON limitless_bronze.api_responses USING gin(body_json);

COMMENT ON TABLE limitless_bronze.api_responses IS 
    'Append-only raw API responses from Limitless Exchange. Consider partitioning by fetched_at for large datasets.';

-- =============================================================================
-- INGESTION STATE MANAGEMENT
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS limitless_ingestion;

-- Track ingestion state per endpoint
CREATE TABLE IF NOT EXISTS limitless_ingestion.endpoint_state (
    endpoint_id VARCHAR(200) PRIMARY KEY,
    
    -- Last successful run
    last_success_at TIMESTAMPTZ,
    last_success_run_id UUID,
    
    -- Pagination state
    last_cursor TEXT,
    last_page INTEGER DEFAULT 0,
    
    -- Time-based incremental state
    last_seen_updated_at TIMESTAMPTZ,
    last_seen_created_at TIMESTAMPTZ,
    
    -- Error tracking
    error_count INTEGER DEFAULT 0,
    last_error_at TIMESTAMPTZ,
    last_error_message TEXT,
    
    -- Scheduling
    next_run_at TIMESTAMPTZ,
    is_running BOOLEAN DEFAULT FALSE,
    current_run_id UUID,
    
    -- Statistics
    total_records_fetched BIGINT DEFAULT 0,
    total_runs INTEGER DEFAULT 0,
    
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Run history for auditing
CREATE TABLE IF NOT EXISTS limitless_ingestion.run_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    run_id UUID NOT NULL,
    endpoint_id VARCHAR(200) NOT NULL,
    
    -- Run details
    mode VARCHAR(50) NOT NULL, -- 'backfill', 'incremental', 'snapshot'
    started_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    
    -- Results
    status VARCHAR(50) NOT NULL, -- 'running', 'success', 'failed', 'partial'
    records_fetched INTEGER DEFAULT 0,
    records_inserted INTEGER DEFAULT 0,
    records_updated INTEGER DEFAULT 0,
    pages_fetched INTEGER DEFAULT 0,
    
    -- Errors
    error_message TEXT,
    error_details JSONB,
    
    -- Performance
    duration_seconds DOUBLE PRECISION,
    
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_limitless_run_history_run ON limitless_ingestion.run_history(run_id);
CREATE INDEX IF NOT EXISTS idx_limitless_run_history_endpoint ON limitless_ingestion.run_history(endpoint_id);
CREATE INDEX IF NOT EXISTS idx_limitless_run_history_started ON limitless_ingestion.run_history(started_at DESC);

-- =============================================================================
-- SILVER LAYER - Normalized Entity Tables
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS limitless_silver;

-- Categories
CREATE TABLE IF NOT EXISTS limitless_silver.categories (
    id VARCHAR(200) PRIMARY KEY,
    slug VARCHAR(200),
    title VARCHAR(500),
    
    -- Audit
    body_hash VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_limitless_categories_slug ON limitless_silver.categories(slug);

-- Tokens (collateral tokens)
CREATE TABLE IF NOT EXISTS limitless_silver.tokens (
    id VARCHAR(200) PRIMARY KEY,
    symbol VARCHAR(50) NOT NULL,
    title VARCHAR(200),
    image_url TEXT,
    address VARCHAR(100),
    decimals INTEGER,
    chain_id INTEGER,
    price_usd NUMERIC(30, 10),
    
    -- Audit
    body_hash VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_limitless_tokens_symbol ON limitless_silver.tokens(symbol);
CREATE INDEX IF NOT EXISTS idx_limitless_tokens_address ON limitless_silver.tokens(address);

-- Markets (main entity)
CREATE TABLE IF NOT EXISTS limitless_silver.markets (
    id VARCHAR(200) PRIMARY KEY,
    slug VARCHAR(500) NOT NULL UNIQUE,
    title TEXT NOT NULL,
    description TEXT,
    
    -- Classification
    category_id VARCHAR(200),
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    
    -- Collateral
    collateral_token_id VARCHAR(200),
    
    -- Volume & Trading
    liquidity NUMERIC(30, 10),
    volume NUMERIC(30, 10),
    
    -- Timestamps
    deadline TIMESTAMPTZ,
    resolution_date TIMESTAMPTZ,
    
    -- Pricing (JSONB for outcome prices)
    outcome_prices JSONB,
    
    -- Audit
    body_hash VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_limitless_markets_slug ON limitless_silver.markets(slug);
CREATE INDEX IF NOT EXISTS idx_limitless_markets_status ON limitless_silver.markets(status);
CREATE INDEX IF NOT EXISTS idx_limitless_markets_category ON limitless_silver.markets(category_id);
CREATE INDEX IF NOT EXISTS idx_limitless_markets_volume ON limitless_silver.markets(volume DESC);
CREATE INDEX IF NOT EXISTS idx_limitless_markets_deadline ON limitless_silver.markets(deadline);

-- Trades from /feed endpoint
CREATE TABLE IF NOT EXISTS limitless_silver.trades (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Unique identifier
    body_hash VARCHAR(64) NOT NULL UNIQUE,
    
    -- Timestamp
    trade_timestamp TIMESTAMPTZ,
    
    -- Market reference
    market_id VARCHAR(200),
    market_slug VARCHAR(500),
    
    -- Trader info
    trader_address VARCHAR(100),
    trader_name VARCHAR(200),
    trader_image_url TEXT,
    
    -- Trade details
    trade_type VARCHAR(50),  -- buy/sell/claim
    side VARCHAR(20),        -- yes/no
    contracts NUMERIC(30, 10),
    price NUMERIC(20, 10),
    total_value NUMERIC(30, 10),
    
    -- Blockchain
    tx_hash VARCHAR(100),
    
    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_limitless_trades_timestamp ON limitless_silver.trades(trade_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_limitless_trades_market ON limitless_silver.trades(market_id);
CREATE INDEX IF NOT EXISTS idx_limitless_trades_trader ON limitless_silver.trades(trader_address);
CREATE INDEX IF NOT EXISTS idx_limitless_trades_type ON limitless_silver.trades(trade_type);
CREATE INDEX IF NOT EXISTS idx_limitless_trades_tx ON limitless_silver.trades(tx_hash);

-- =============================================================================
-- GOLD LAYER - Analytics & Materialized Views
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS limitless_gold;

-- Market summary view
CREATE OR REPLACE VIEW limitless_gold.market_summary AS
SELECT 
    m.id,
    m.slug,
    m.title,
    m.status,
    m.category_id,
    m.liquidity,
    m.volume,
    m.deadline,
    m.resolution_date,
    m.outcome_prices,
    m.updated_at,
    c.title as category_name
FROM limitless_silver.markets m
LEFT JOIN limitless_silver.categories c ON c.id = m.category_id;

-- Trade volume by hour
CREATE MATERIALIZED VIEW IF NOT EXISTS limitless_gold.trade_volume_hourly AS
SELECT 
    date_trunc('hour', trade_timestamp) as hour,
    market_id,
    market_slug,
    COUNT(*) as trade_count,
    SUM(total_value) as total_volume,
    AVG(total_value) as avg_trade_size,
    COUNT(*) FILTER (WHERE side = 'yes') as yes_trades,
    COUNT(*) FILTER (WHERE side = 'no') as no_trades,
    COUNT(DISTINCT trader_address) as unique_traders
FROM limitless_silver.trades
WHERE trade_timestamp IS NOT NULL
GROUP BY 1, 2, 3
ORDER BY 1 DESC;

CREATE UNIQUE INDEX IF NOT EXISTS idx_limitless_mv_trade_volume 
    ON limitless_gold.trade_volume_hourly(hour, market_id);

-- Trader activity summary
CREATE MATERIALIZED VIEW IF NOT EXISTS limitless_gold.trader_activity AS
SELECT 
    trader_address,
    trader_name,
    COUNT(*) as total_trades,
    SUM(total_value) as total_volume,
    AVG(total_value) as avg_trade_size,
    COUNT(DISTINCT market_id) as markets_traded,
    MIN(trade_timestamp) as first_trade,
    MAX(trade_timestamp) as last_trade,
    COUNT(*) FILTER (WHERE trade_type = 'buy') as buy_count,
    COUNT(*) FILTER (WHERE trade_type = 'sell') as sell_count
FROM limitless_silver.trades
WHERE trader_address IS NOT NULL
GROUP BY trader_address, trader_name
ORDER BY total_volume DESC NULLS LAST;

CREATE UNIQUE INDEX IF NOT EXISTS idx_limitless_mv_trader_activity 
    ON limitless_gold.trader_activity(trader_address);

-- Category stats
CREATE MATERIALIZED VIEW IF NOT EXISTS limitless_gold.category_stats AS
SELECT 
    c.id as category_id,
    c.title as category_name,
    COUNT(DISTINCT m.id) as market_count,
    SUM(m.volume) as total_volume,
    AVG(m.volume) as avg_volume,
    SUM(m.liquidity) as total_liquidity
FROM limitless_silver.categories c
LEFT JOIN limitless_silver.markets m ON m.category_id = c.id
GROUP BY c.id, c.title
ORDER BY market_count DESC;

CREATE UNIQUE INDEX IF NOT EXISTS idx_limitless_mv_category_stats 
    ON limitless_gold.category_stats(category_id);

-- =============================================================================
-- HELPER FUNCTIONS
-- =============================================================================

-- Function to refresh all materialized views
CREATE OR REPLACE FUNCTION limitless_gold.refresh_all_views()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY limitless_gold.trade_volume_hourly;
    REFRESH MATERIALIZED VIEW CONCURRENTLY limitless_gold.trader_activity;
    REFRESH MATERIALIZED VIEW CONCURRENTLY limitless_gold.category_stats;
END;
$$ LANGUAGE plpgsql;

-- Function to get ingestion lag
CREATE OR REPLACE FUNCTION limitless_ingestion.get_lag_seconds(p_endpoint_id VARCHAR)
RETURNS INTEGER AS $$
SELECT EXTRACT(EPOCH FROM (NOW() - last_success_at))::INTEGER
FROM limitless_ingestion.endpoint_state
WHERE endpoint_id = p_endpoint_id;
$$ LANGUAGE sql;

-- =============================================================================
-- CLEANUP & MAINTENANCE
-- =============================================================================

-- Function to clean old bronze data (configurable retention)
CREATE OR REPLACE FUNCTION limitless_bronze.cleanup_old_responses(
    retention_days INTEGER DEFAULT 90
)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM limitless_bronze.api_responses
    WHERE fetched_at < NOW() - (retention_days || ' days')::INTERVAL;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON SCHEMA limitless_bronze IS 'Limitless Exchange - Raw API response storage';
COMMENT ON SCHEMA limitless_silver IS 'Limitless Exchange - Normalized entity tables';
COMMENT ON SCHEMA limitless_gold IS 'Limitless Exchange - Analytics views';
COMMENT ON SCHEMA limitless_ingestion IS 'Limitless Exchange - Ingestion state tracking';
