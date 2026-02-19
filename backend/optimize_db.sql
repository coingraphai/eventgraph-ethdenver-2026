-- Database Optimization Script for Faster Event Analytics
-- Run this to speed up event page loading

-- ============================================================================
-- INDEXES (Quick win - run these first)
-- ============================================================================

-- 1. Event lookups (event_id + platform)
CREATE INDEX IF NOT EXISTS idx_events_snapshot_lookup 
ON predictions_gold.events_snapshot(event_id, platform, snapshot_at DESC);

-- 2. Market event_slug lookups (JSONB index)
CREATE INDEX IF NOT EXISTS idx_markets_event_slug 
ON predictions_silver.markets USING gin((extra_data -> 'event_slug'));

-- 3. Market market_slug lookups (JSONB index)
CREATE INDEX IF NOT EXISTS idx_markets_market_slug 
ON predictions_silver.markets USING gin((extra_data -> 'market_slug'));

-- 4. Platform + volume sorting
CREATE INDEX IF NOT EXISTS idx_markets_platform_volume 
ON predictions_silver.markets(source, volume_24h DESC NULLS LAST) 
WHERE is_active = true;

-- 5. Source market ID lookups
CREATE INDEX IF NOT EXISTS idx_markets_source_market_id 
ON predictions_silver.markets(source_market_id) 
WHERE is_active = true;

-- ============================================================================
-- ADD COMPUTED FIELDS (Optional - for even faster loading)
-- ============================================================================

-- Add pre-computed analytics fields to events_snapshot
ALTER TABLE predictions_gold.events_snapshot 
ADD COLUMN IF NOT EXISTS avg_price NUMERIC(10,4),
ADD COLUMN IF NOT EXISTS total_liquidity NUMERIC(20,2),
ADD COLUMN IF NOT EXISTS avg_momentum NUMERIC(5,2),
ADD COLUMN IF NOT EXISTS total_trades_24h INTEGER,
ADD COLUMN IF NOT EXISTS whale_volume_24h NUMERIC(20,2),
ADD COLUMN IF NOT EXISTS buy_sell_ratio NUMERIC(10,2);

-- ============================================================================
-- MARKET ANALYTICS CACHE TABLE (Optional - for instant loading)
-- ============================================================================

-- Create table to cache market-level analytics
CREATE TABLE IF NOT EXISTS predictions_gold.market_analytics_cache (
    market_id VARCHAR(255) PRIMARY KEY,
    platform VARCHAR(50) NOT NULL,
    event_id VARCHAR(255),
    market_slug VARCHAR(255),
    question TEXT,
    yes_price NUMERIC(10,4),
    no_price NUMERIC(10,4),
    volume_24h NUMERIC(20,2),
    volume_total NUMERIC(20,2),
    liquidity NUMERIC(20,2),
    momentum_score NUMERIC(5,2),
    trade_count_24h INTEGER,
    whale_trades_volume NUMERIC(20,2),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for event lookups
CREATE INDEX IF NOT EXISTS idx_market_cache_event 
ON predictions_gold.market_analytics_cache(event_id, platform);

-- ============================================================================
-- VACUUM AND ANALYZE (Run after adding indexes)
-- ============================================================================

-- Update statistics for query planner
ANALYZE predictions_gold.events_snapshot;
ANALYZE predictions_silver.markets;

-- Reclaim space
VACUUM ANALYZE predictions_gold.events_snapshot;
VACUUM ANALYZE predictions_silver.markets;
