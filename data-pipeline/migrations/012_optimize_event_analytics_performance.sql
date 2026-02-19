-- ============================================================================
-- Migration 012: Optimize Event Analytics Page Performance
-- ============================================================================
-- Purpose: Speed up event detail page loading with targeted indexes and 
--          computed fields based on actual query patterns
-- Date: 2026-02-01
-- ============================================================================

BEGIN;

-- ============================================================================
-- PART 1: CRITICAL INDEXES FOR EVENT PAGE QUERIES (HIGHEST IMPACT)
-- ============================================================================

-- 1. Composite index for event lookup + sorting by volume
--    Use case: Finding all markets for an event, sorted by volume
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_event_markets_event_volume 
ON predictions_gold.event_markets(event_id, platform, volume_24h DESC NULLS LAST)
WHERE snapshot_at = (SELECT MAX(snapshot_at) FROM predictions_gold.event_markets);

-- 2. JSONB GIN index for event_slug lookups in Silver (for market details)
--    Use case: Polymarket uses event_slug to group markets
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_markets_event_slug_gin 
ON predictions_silver.markets USING gin((extra_data -> 'event_slug'));

-- 3. JSONB GIN index for event_ticker lookups in Silver (for Kalshi)
--    Use case: Kalshi uses event_ticker to group markets
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_markets_event_ticker_gin 
ON predictions_silver.markets USING gin((extra_data -> 'event_ticker'));

-- 4. Composite index for active markets by source and volume
--    Use case: Finding top markets for an event from Silver layer
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_markets_source_active_volume 
ON predictions_silver.markets(source, is_active, volume_7d DESC NULLS LAST)
WHERE is_active = true;

-- 5. Source market ID lookup optimization (already exists but ensure it's there)
--    Use case: Direct market lookups by ID
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_markets_source_market_id_active 
ON predictions_silver.markets(source_market_id, source)
WHERE is_active = true;

-- ============================================================================
-- PART 2: EVENTS_SNAPSHOT OPTIMIZATION
-- ============================================================================

-- 6. Add category to the main lookup index for filtered queries
--    Use case: Event listing pages filtered by category
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_events_snapshot_category_volume 
ON predictions_gold.events_snapshot(platform, category, volume_24h DESC NULLS LAST)
WHERE status = 'open';

-- 7. Event status filtering (open vs resolved)
--    Use case: Filtering active events
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_events_snapshot_status 
ON predictions_gold.events_snapshot(status, platform, volume_24h DESC NULLS LAST);

-- ============================================================================
-- PART 3: ADD PRE-COMPUTED ANALYTICS FIELDS TO EVENTS_SNAPSHOT
-- ============================================================================
-- These will be populated during Gold aggregation to avoid real-time computation

-- Add analytics fields if they don't exist
ALTER TABLE predictions_gold.events_snapshot 
ADD COLUMN IF NOT EXISTS avg_yes_price NUMERIC(10,4),
ADD COLUMN IF NOT EXISTS price_movement_24h NUMERIC(10,4),
ADD COLUMN IF NOT EXISTS trade_count_estimate INTEGER,
ADD COLUMN IF NOT EXISTS top_market_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS top_market_title TEXT;

COMMENT ON COLUMN predictions_gold.events_snapshot.avg_yes_price IS 
'Liquidity-weighted average YES price across all markets in the event';

COMMENT ON COLUMN predictions_gold.events_snapshot.price_movement_24h IS 
'Average price change across markets in last 24h (for trending detection)';

COMMENT ON COLUMN predictions_gold.events_snapshot.trade_count_estimate IS 
'Estimated number of trades across all markets (if available)';

COMMENT ON COLUMN predictions_gold.events_snapshot.top_market_id IS 
'Market ID of the highest volume market in this event';

COMMENT ON COLUMN predictions_gold.events_snapshot.top_market_title IS 
'Title of the highest volume market (for quick display)';

-- ============================================================================
-- PART 4: EVENT_MARKETS OPTIMIZATION
-- ============================================================================

-- 8. Add rank index for "top markets in event" queries
--    Use case: Getting top 5 markets for an event preview
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_event_markets_rank 
ON predictions_gold.event_markets(event_id, rank_in_event)
WHERE rank_in_event <= 10;

-- 9. Platform-specific market lookups
--    Use case: Platform-filtered market lists
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_event_markets_platform_volume 
ON predictions_gold.event_markets(platform, volume_24h DESC NULLS LAST);

-- ============================================================================
-- PART 5: OPTIONAL - MATERIALIZED VIEW FOR TRENDING EVENTS
-- ============================================================================
-- Pre-compute trending events to avoid expensive queries

DROP MATERIALIZED VIEW IF EXISTS predictions_gold.trending_events_cache CASCADE;

CREATE MATERIALIZED VIEW predictions_gold.trending_events_cache AS
SELECT 
    e.event_id,
    e.platform,
    e.title,
    e.category,
    e.image_url,
    e.source_url,
    e.market_count,
    e.volume_24h,
    e.total_volume,
    e.total_liquidity,
    e.end_time,
    e.status,
    e.snapshot_at,
    -- Trending score: combines volume and recency
    (e.volume_24h * 1.0 / NULLIF(e.total_volume, 0) * 100) AS momentum_score,
    -- Extract time to expiry
    EXTRACT(EPOCH FROM (e.end_time - NOW())) / 3600 AS hours_to_expiry
FROM predictions_gold.events_snapshot e
WHERE e.status = 'open'
  AND e.snapshot_at = (SELECT MAX(snapshot_at) FROM predictions_gold.events_snapshot)
ORDER BY e.volume_24h DESC NULLS LAST
LIMIT 1000;

-- Index on the materialized view
CREATE INDEX idx_trending_cache_platform ON predictions_gold.trending_events_cache(platform);
CREATE INDEX idx_trending_cache_category ON predictions_gold.trending_events_cache(category);
CREATE INDEX idx_trending_cache_momentum ON predictions_gold.trending_events_cache(momentum_score DESC NULLS LAST);

COMMENT ON MATERIALIZED VIEW predictions_gold.trending_events_cache IS 
'Cached view of top 1000 trending events with momentum scores. Refresh after each Gold aggregation.';

-- ============================================================================
-- PART 6: STATISTICS UPDATE
-- ============================================================================

-- Update table statistics for query planner optimization
ANALYZE predictions_gold.events_snapshot;
ANALYZE predictions_gold.event_markets;
ANALYZE predictions_silver.markets;

-- ============================================================================
-- PART 7: VACUUM (Run separately if needed - can be time consuming)
-- ============================================================================

-- Uncomment to run VACUUM (may take several minutes on large tables)
-- VACUUM ANALYZE predictions_gold.events_snapshot;
-- VACUUM ANALYZE predictions_gold.event_markets;
-- VACUUM ANALYZE predictions_silver.markets;

COMMIT;

-- ============================================================================
-- POST-MIGRATION VERIFICATION
-- ============================================================================

-- Run this to verify indexes were created:
-- SELECT schemaname, tablename, indexname, indexdef 
-- FROM pg_indexes 
-- WHERE schemaname IN ('predictions_gold', 'predictions_silver')
-- AND indexname LIKE '%012%' OR indexname IN (
--   'idx_event_markets_event_volume',
--   'idx_markets_event_slug_gin',
--   'idx_markets_event_ticker_gin',
--   'idx_events_snapshot_category_volume'
-- )
-- ORDER BY tablename, indexname;

-- ============================================================================
-- REFRESH MATERIALIZED VIEW (run after each Gold aggregation)
-- ============================================================================

-- Add this to your gold_aggregator.py after events_snapshot is populated:
-- REFRESH MATERIALIZED VIEW CONCURRENTLY predictions_gold.trending_events_cache;
