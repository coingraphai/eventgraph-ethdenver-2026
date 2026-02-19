-- Production Cache Tables
-- Persistent storage for all platform data with instant recovery on restart
-- Created: 2026-02-06

-- =============================================================================
-- MAIN CACHE TABLE - Stores all platform data snapshots
-- =============================================================================
CREATE TABLE IF NOT EXISTS production_cache (
    id SERIAL PRIMARY KEY,
    
    -- Cache identification
    cache_key VARCHAR(100) UNIQUE NOT NULL,  -- e.g., 'polymarket_events', 'kalshi_markets'
    platform VARCHAR(50) NOT NULL,            -- polymarket, kalshi, limitless, opiniontrade
    data_type VARCHAR(50) NOT NULL,           -- events, markets, categories, market_detail
    
    -- Cached data (JSONB for fast querying)
    data JSONB NOT NULL,
    
    -- Metadata
    item_count INTEGER DEFAULT 0,             -- Number of events/markets
    total_volume DECIMAL(20, 2) DEFAULT 0,    -- Aggregate volume
    
    -- Timestamps
    fetched_at TIMESTAMPTZ DEFAULT NOW(),     -- When data was fetched from API
    created_at TIMESTAMPTZ DEFAULT NOW(),     -- When row was created
    updated_at TIMESTAMPTZ DEFAULT NOW(),     -- Last update
    expires_at TIMESTAMPTZ,                   -- When cache expires (for TTL)
    
    -- Status
    is_valid BOOLEAN DEFAULT TRUE,            -- Whether data is usable
    fetch_status VARCHAR(20) DEFAULT 'success', -- success, partial, failed
    error_message TEXT,                       -- Last error if any
    
    -- Version for optimistic locking
    version INTEGER DEFAULT 1
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_production_cache_key ON production_cache(cache_key);
CREATE INDEX IF NOT EXISTS idx_production_cache_platform ON production_cache(platform);
CREATE INDEX IF NOT EXISTS idx_production_cache_type ON production_cache(data_type);
CREATE INDEX IF NOT EXISTS idx_production_cache_expires ON production_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_production_cache_valid ON production_cache(is_valid) WHERE is_valid = TRUE;

-- =============================================================================
-- CACHE HISTORY - Keeps last N snapshots for trend analysis and fallback
-- =============================================================================
CREATE TABLE IF NOT EXISTS cache_history (
    id SERIAL PRIMARY KEY,
    
    cache_key VARCHAR(100) NOT NULL,
    platform VARCHAR(50) NOT NULL,
    data_type VARCHAR(50) NOT NULL,
    
    -- Snapshot data
    data JSONB NOT NULL,
    item_count INTEGER DEFAULT 0,
    total_volume DECIMAL(20, 2) DEFAULT 0,
    
    -- Timestamps
    snapshot_time TIMESTAMPTZ DEFAULT NOW(),
    
    -- Keep data lean - only store for 24 hours of fallback
    CONSTRAINT cache_history_retention CHECK (snapshot_time > NOW() - INTERVAL '24 hours')
);

-- Index for fallback queries
CREATE INDEX IF NOT EXISTS idx_cache_history_key_time ON cache_history(cache_key, snapshot_time DESC);

-- =============================================================================
-- CACHE METRICS - Track cache performance
-- =============================================================================
CREATE TABLE IF NOT EXISTS cache_metrics (
    id SERIAL PRIMARY KEY,
    
    cache_key VARCHAR(100) NOT NULL,
    
    -- Timing metrics
    fetch_duration_ms INTEGER,                -- How long API call took
    transform_duration_ms INTEGER,            -- How long data transformation took
    
    -- Result metrics
    items_fetched INTEGER,
    items_cached INTEGER,
    
    -- Status
    status VARCHAR(20) NOT NULL,              -- success, timeout, error
    error_type VARCHAR(50),                   -- Type of error if failed
    
    -- Timestamp
    recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for metrics queries
CREATE INDEX IF NOT EXISTS idx_cache_metrics_key_time ON cache_metrics(cache_key, recorded_at DESC);

-- Cleanup old metrics (keep 7 days)
-- Can be run as a scheduled job:
-- DELETE FROM cache_metrics WHERE recorded_at < NOW() - INTERVAL '7 days';

-- =============================================================================
-- INITIAL DATA SEEDS (empty caches to prevent null errors)
-- =============================================================================
INSERT INTO production_cache (cache_key, platform, data_type, data, item_count, is_valid, fetch_status)
VALUES 
    ('polymarket_events', 'polymarket', 'events', '[]'::jsonb, 0, TRUE, 'pending'),
    ('kalshi_events', 'kalshi', 'events', '[]'::jsonb, 0, TRUE, 'pending'),
    ('limitless_events', 'limitless', 'events', '[]'::jsonb, 0, TRUE, 'pending'),
    ('opiniontrade_events', 'opiniontrade', 'events', '[]'::jsonb, 0, TRUE, 'pending'),
    ('polymarket_categories', 'polymarket', 'categories', '[]'::jsonb, 0, TRUE, 'pending'),
    ('kalshi_categories', 'kalshi', 'categories', '[]'::jsonb, 0, TRUE, 'pending'),
    ('limitless_categories', 'limitless', 'categories', '[]'::jsonb, 0, TRUE, 'pending'),
    ('opiniontrade_categories', 'opiniontrade', 'categories', '[]'::jsonb, 0, TRUE, 'pending')
ON CONFLICT (cache_key) DO NOTHING;

-- =============================================================================
-- COMMENTS
-- =============================================================================
COMMENT ON TABLE production_cache IS 'Primary cache storage - loads instantly on startup, never empty';
COMMENT ON TABLE cache_history IS 'Historical snapshots for fallback if current data fails';
COMMENT ON TABLE cache_metrics IS 'Performance tracking for cache operations';
COMMENT ON COLUMN production_cache.fetch_status IS 'success=full data, partial=some errors, failed=API down';
