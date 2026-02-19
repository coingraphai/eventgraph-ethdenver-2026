-- =============================================================================
-- Predictions Terminal - Bronze Layer Schema (Multi-Source)
-- =============================================================================
-- Optimized for:
-- 1. High-throughput ingestion with minimal locking
-- 2. Efficient deduplication via content hashing
-- 3. Source-based partitioning for query performance
-- 4. Time-based partitioning for data lifecycle management
-- =============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- For fuzzy text search

-- =============================================================================
-- BRONZE SCHEMA - Raw API Response Storage
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS predictions_bronze;

-- Drop existing if migrating
DROP TABLE IF EXISTS predictions_bronze.api_responses CASCADE;

-- Main raw response table - partitioned by source for optimal query performance
CREATE TABLE predictions_bronze.api_responses (
    id UUID DEFAULT gen_random_uuid(),
    
    -- Source identification
    source VARCHAR(50) NOT NULL,           -- 'polymarket', 'kalshi', 'limitless'
    endpoint_name VARCHAR(200) NOT NULL,   -- 'markets', 'trades', 'prices', 'orderbook'
    
    -- Request details
    url_path TEXT NOT NULL,
    query_params JSONB DEFAULT '{}',
    
    -- Response details
    body_json JSONB NOT NULL,
    body_hash VARCHAR(64) NOT NULL,        -- SHA-256 truncated for dedup
    http_status INTEGER DEFAULT 200,
    response_size_bytes INTEGER,
    
    -- Ingestion metadata
    ingestion_type VARCHAR(20) NOT NULL DEFAULT 'delta',  -- 'static', 'delta'
    run_id UUID,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    PRIMARY KEY (source, fetched_at, id)
) PARTITION BY LIST (source);

-- Create partitions for each source
CREATE TABLE predictions_bronze.api_responses_polymarket 
    PARTITION OF predictions_bronze.api_responses 
    FOR VALUES IN ('polymarket');

CREATE TABLE predictions_bronze.api_responses_kalshi 
    PARTITION OF predictions_bronze.api_responses 
    FOR VALUES IN ('kalshi');

CREATE TABLE predictions_bronze.api_responses_limitless 
    PARTITION OF predictions_bronze.api_responses 
    FOR VALUES IN ('limitless');

-- Future sources
CREATE TABLE predictions_bronze.api_responses_opiniontrade 
    PARTITION OF predictions_bronze.api_responses 
    FOR VALUES IN ('opiniontrade');

-- =============================================================================
-- BRONZE LAYER INDEXES - Optimized for common query patterns
-- =============================================================================

-- Deduplication lookup (most critical for write performance)
CREATE UNIQUE INDEX IF NOT EXISTS idx_bronze_dedup 
    ON predictions_bronze.api_responses (body_hash, source);

-- Endpoint queries
CREATE INDEX IF NOT EXISTS idx_bronze_endpoint 
    ON predictions_bronze.api_responses (source, endpoint_name, fetched_at DESC);

-- Time-based queries (for data freshness checks)
CREATE INDEX IF NOT EXISTS idx_bronze_fetched 
    ON predictions_bronze.api_responses (fetched_at DESC);

-- Run tracking
CREATE INDEX IF NOT EXISTS idx_bronze_run_id 
    ON predictions_bronze.api_responses (run_id) 
    WHERE run_id IS NOT NULL;

-- JSONB GIN index for body queries (use sparingly - expensive)
CREATE INDEX IF NOT EXISTS idx_bronze_body_gin 
    ON predictions_bronze.api_responses USING gin (body_json jsonb_path_ops);

-- =============================================================================
-- INGESTION STATE TRACKING
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS predictions_ingestion;

-- Track ingestion state per source + endpoint combination
CREATE TABLE IF NOT EXISTS predictions_ingestion.sync_state (
    id SERIAL PRIMARY KEY,
    source VARCHAR(50) NOT NULL,
    endpoint_name VARCHAR(200) NOT NULL,
    
    -- Last successful sync
    last_success_at TIMESTAMPTZ,
    last_success_run_id UUID,
    
    -- Cursor/pagination state
    last_cursor TEXT,
    last_page INTEGER DEFAULT 0,
    last_offset BIGINT DEFAULT 0,
    
    -- Time-based incremental markers
    last_record_timestamp TIMESTAMPTZ,
    last_record_id VARCHAR(255),
    
    -- High watermark for delta detection
    high_watermark JSONB DEFAULT '{}',
    
    -- Error tracking
    consecutive_errors INTEGER DEFAULT 0,
    last_error_at TIMESTAMPTZ,
    last_error_message TEXT,
    
    -- Statistics
    total_records_fetched BIGINT DEFAULT 0,
    total_records_stored BIGINT DEFAULT 0,
    total_duplicates_skipped BIGINT DEFAULT 0,
    total_runs INTEGER DEFAULT 0,
    
    -- Scheduling
    next_scheduled_at TIMESTAMPTZ,
    is_running BOOLEAN DEFAULT FALSE,
    current_run_id UUID,
    
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE (source, endpoint_name)
);

-- Run history for debugging and monitoring
CREATE TABLE IF NOT EXISTS predictions_ingestion.run_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source VARCHAR(50) NOT NULL,
    endpoint_name VARCHAR(200),            -- NULL for full source runs
    ingestion_type VARCHAR(20) NOT NULL,   -- 'static', 'delta'
    
    -- Timing
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    duration_seconds DECIMAL(10, 3),
    
    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'running',  -- 'running', 'success', 'failed', 'partial'
    error_message TEXT,
    
    -- Statistics
    records_fetched INTEGER DEFAULT 0,
    records_stored INTEGER DEFAULT 0,
    records_updated INTEGER DEFAULT 0,
    duplicates_skipped INTEGER DEFAULT 0,
    api_calls_made INTEGER DEFAULT 0,
    
    -- Resource usage
    bytes_transferred BIGINT DEFAULT 0,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for recent runs lookup
CREATE INDEX IF NOT EXISTS idx_run_history_recent 
    ON predictions_ingestion.run_history (source, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_run_history_status 
    ON predictions_ingestion.run_history (status, started_at DESC);

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE predictions_bronze.api_responses IS 
    'Append-only raw API responses from all prediction market sources. Partitioned by source for query isolation.';

COMMENT ON TABLE predictions_ingestion.sync_state IS 
    'Tracks the last successful sync state per source/endpoint for incremental ingestion.';

COMMENT ON TABLE predictions_ingestion.run_history IS 
    'Audit log of all ingestion runs for monitoring and debugging.';
