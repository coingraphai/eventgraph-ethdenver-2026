-- =============================================================================
-- Migration 006: Hybrid Approach - Views & Performance Optimization
-- =============================================================================
-- Purpose: Add convenience views per source while keeping combined tables
-- Benefits: Easy source-specific queries + cross-source analytics
-- =============================================================================

-- =============================================================================
-- CONVENIENCE VIEWS: One view per source
-- =============================================================================

-- Polymarket markets view
CREATE OR REPLACE VIEW predictions_silver.polymarket_markets AS
SELECT * FROM predictions_silver.markets 
WHERE source = 'polymarket';

COMMENT ON VIEW predictions_silver.polymarket_markets IS 
'Convenience view for Polymarket markets only. Use for source-specific queries.';

-- Kalshi markets view
CREATE OR REPLACE VIEW predictions_silver.kalshi_markets AS
SELECT * FROM predictions_silver.markets 
WHERE source = 'kalshi';

COMMENT ON VIEW predictions_silver.kalshi_markets IS 
'Convenience view for Kalshi markets only. Use for source-specific queries.';

-- Limitless markets view
CREATE OR REPLACE VIEW predictions_silver.limitless_markets AS
SELECT * FROM predictions_silver.markets 
WHERE source = 'limitless';

COMMENT ON VIEW predictions_silver.limitless_markets IS 
'Convenience view for Limitless markets only. Use for source-specific queries.';

-- Polymarket trades view
CREATE OR REPLACE VIEW predictions_silver.polymarket_trades AS
SELECT * FROM predictions_silver.trades 
WHERE source = 'polymarket';

-- Kalshi trades view
CREATE OR REPLACE VIEW predictions_silver.kalshi_trades AS
SELECT * FROM predictions_silver.trades 
WHERE source = 'kalshi';

-- Limitless trades view
CREATE OR REPLACE VIEW predictions_silver.limitless_trades AS
SELECT * FROM predictions_silver.trades 
WHERE source = 'limitless';

-- =============================================================================
-- PARTIAL INDEXES: Improve performance for source-specific queries
-- =============================================================================

-- Markets indexes per source
CREATE INDEX IF NOT EXISTS idx_polymarket_markets_title 
    ON predictions_silver.markets(title)
    WHERE source = 'polymarket';

CREATE INDEX IF NOT EXISTS idx_kalshi_markets_title 
    ON predictions_silver.markets(title)
    WHERE source = 'kalshi';

CREATE INDEX IF NOT EXISTS idx_limitless_markets_title 
    ON predictions_silver.markets(title)
    WHERE source = 'limitless';

-- Active markets per source
CREATE INDEX IF NOT EXISTS idx_polymarket_markets_active 
    ON predictions_silver.markets(source_market_id, last_updated_at)
    WHERE source = 'polymarket' AND is_active = true;

CREATE INDEX IF NOT EXISTS idx_kalshi_markets_active 
    ON predictions_silver.markets(source_market_id, last_updated_at)
    WHERE source = 'kalshi' AND is_active = true;

CREATE INDEX IF NOT EXISTS idx_limitless_markets_active 
    ON predictions_silver.markets(source_market_id, last_updated_at)
    WHERE source = 'limitless' AND is_active = true;

-- Trades indexes per source
CREATE INDEX IF NOT EXISTS idx_polymarket_trades_time 
    ON predictions_silver.trades(traded_at DESC)
    WHERE source = 'polymarket';

CREATE INDEX IF NOT EXISTS idx_kalshi_trades_time 
    ON predictions_silver.trades(traded_at DESC)
    WHERE source = 'kalshi';

CREATE INDEX IF NOT EXISTS idx_limitless_trades_time 
    ON predictions_silver.trades(traded_at DESC)
    WHERE source = 'limitless';

-- Market-specific trade lookups per source
CREATE INDEX IF NOT EXISTS idx_polymarket_trades_market 
    ON predictions_silver.trades(source_market_id, traded_at DESC)
    WHERE source = 'polymarket';

CREATE INDEX IF NOT EXISTS idx_kalshi_trades_market 
    ON predictions_silver.trades(source_market_id, traded_at DESC)
    WHERE source = 'kalshi';

CREATE INDEX IF NOT EXISTS idx_limitless_trades_market 
    ON predictions_silver.trades(source_market_id, traded_at DESC)
    WHERE source = 'limitless';

-- =============================================================================
-- GOLD LAYER: Analytics materialized views
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS predictions_gold;

-- Market summary by source (for dashboards)
DROP MATERIALIZED VIEW IF EXISTS predictions_gold.market_summary CASCADE;
CREATE MATERIALIZED VIEW predictions_gold.market_summary AS
SELECT 
    source,
    COUNT(*) as total_markets,
    COUNT(*) FILTER (WHERE is_active) as active_markets,
    COUNT(*) FILTER (WHERE NOT is_active) as inactive_markets,
    SUM(volume_24h) as total_volume_24h,
    AVG(volume_24h) as avg_volume_24h,
    MAX(volume_24h) as max_volume_24h,
    SUM(liquidity) as total_liquidity,
    AVG(liquidity) as avg_liquidity,
    MAX(last_updated_at) as latest_update,
    COUNT(*) FILTER (WHERE first_seen_at > NOW() - INTERVAL '24 hours') as markets_created_24h,
    COUNT(*) FILTER (WHERE last_updated_at > NOW() - INTERVAL '1 hour') as markets_updated_1h
FROM predictions_silver.markets
GROUP BY source;

CREATE UNIQUE INDEX ON predictions_gold.market_summary(source);

COMMENT ON MATERIALIZED VIEW predictions_gold.market_summary IS 
'Aggregated market statistics per source. Refresh hourly for dashboards.';

-- Trade activity summary
DROP MATERIALIZED VIEW IF EXISTS predictions_gold.trade_summary CASCADE;
CREATE MATERIALIZED VIEW predictions_gold.trade_summary AS
SELECT 
    source,
    COUNT(*) as total_trades,
    COUNT(DISTINCT source_market_id) as markets_with_trades,
    MIN(traded_at) as first_trade,
    MAX(traded_at) as latest_trade,
    COUNT(*) FILTER (WHERE traded_at > NOW() - INTERVAL '1 hour') as trades_last_hour,
    COUNT(*) FILTER (WHERE traded_at > NOW() - INTERVAL '24 hours') as trades_last_24h,
    COUNT(*) FILTER (WHERE side = 'buy') as buy_trades,
    COUNT(*) FILTER (WHERE side = 'sell') as sell_trades,
    AVG(price) as avg_price,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price) as median_price
FROM predictions_silver.trades
GROUP BY source;

CREATE UNIQUE INDEX ON predictions_gold.trade_summary(source);

COMMENT ON MATERIALIZED VIEW predictions_gold.trade_summary IS 
'Trade activity statistics per source. Refresh every 15 minutes.';

-- Cross-source market comparison (for arbitrage detection)
DROP MATERIALIZED VIEW IF EXISTS predictions_gold.similar_markets CASCADE;
CREATE MATERIALIZED VIEW predictions_gold.similar_markets AS
WITH normalized_titles AS (
    SELECT 
        id,
        source,
        source_market_id,
        title,
        volume_24h,
        liquidity,
        is_active,
        -- Normalize title for matching
        LOWER(REGEXP_REPLACE(title, '[^a-zA-Z0-9\s]', '', 'g')) as normalized_title
    FROM predictions_silver.markets
    WHERE is_active = true
)
SELECT 
    m1.source as source_1,
    m1.title as title_1,
    m1.source_market_id as market_id_1,
    m1.volume_24h as volume_1,
    m2.source as source_2,
    m2.title as title_2,
    m2.source_market_id as market_id_2,
    m2.volume_24h as volume_2,
    -- Similarity score (simple word overlap)
    (LENGTH(m1.normalized_title) - LENGTH(REPLACE(m1.normalized_title, m2.normalized_title, ''))) 
        / NULLIF(LENGTH(m1.normalized_title), 0)::float as similarity
FROM normalized_titles m1
JOIN normalized_titles m2 
    ON m1.source < m2.source  -- Avoid duplicates
    AND m1.normalized_title = m2.normalized_title  -- Exact match after normalization
WHERE m1.is_active AND m2.is_active;

COMMENT ON MATERIALIZED VIEW predictions_gold.similar_markets IS 
'Markets with similar titles across different sources. Use for arbitrage detection.';

-- Top markets across all sources
DROP MATERIALIZED VIEW IF EXISTS predictions_gold.top_markets CASCADE;
CREATE MATERIALIZED VIEW predictions_gold.top_markets AS
SELECT 
    source,
    source_market_id,
    title,
    description,
    volume_24h,
    liquidity,
    is_active,
    last_updated_at,
    ROW_NUMBER() OVER (ORDER BY volume_24h DESC NULLS LAST) as global_rank,
    ROW_NUMBER() OVER (PARTITION BY source ORDER BY volume_24h DESC NULLS LAST) as source_rank
FROM predictions_silver.markets
WHERE is_active = true
LIMIT 500;

CREATE INDEX ON predictions_gold.top_markets(source, source_rank);
CREATE INDEX ON predictions_gold.top_markets(global_rank);

COMMENT ON MATERIALIZED VIEW predictions_gold.top_markets IS 
'Top 500 markets by volume across all sources. Includes global and per-source rankings.';

-- =============================================================================
-- HELPER FUNCTION: Refresh all materialized views
-- =============================================================================

DROP FUNCTION IF EXISTS predictions_gold.refresh_all_views();

CREATE OR REPLACE FUNCTION predictions_gold.refresh_all_views()
RETURNS TABLE(view_name text, refresh_duration interval, rows_affected bigint) 
LANGUAGE plpgsql AS $$
DECLARE
    start_time timestamp;
    view_row_count bigint;
BEGIN
    -- Market summary
    start_time := clock_timestamp();
    REFRESH MATERIALIZED VIEW CONCURRENTLY predictions_gold.market_summary;
    GET DIAGNOSTICS view_row_count = ROW_COUNT;
    view_name := 'market_summary';
    refresh_duration := clock_timestamp() - start_time;
    rows_affected := view_row_count;
    RETURN NEXT;
    
    -- Trade summary
    start_time := clock_timestamp();
    REFRESH MATERIALIZED VIEW CONCURRENTLY predictions_gold.trade_summary;
    GET DIAGNOSTICS view_row_count = ROW_COUNT;
    view_name := 'trade_summary';
    refresh_duration := clock_timestamp() - start_time;
    rows_affected := view_row_count;
    RETURN NEXT;
    
    -- Similar markets
    start_time := clock_timestamp();
    REFRESH MATERIALIZED VIEW predictions_gold.similar_markets;
    GET DIAGNOSTICS view_row_count = ROW_COUNT;
    view_name := 'similar_markets';
    refresh_duration := clock_timestamp() - start_time;
    rows_affected := view_row_count;
    RETURN NEXT;
    
    -- Top markets
    start_time := clock_timestamp();
    REFRESH MATERIALIZED VIEW predictions_gold.top_markets;
    GET DIAGNOSTICS view_row_count = ROW_COUNT;
    view_name := 'top_markets';
    refresh_duration := clock_timestamp() - start_time;
    rows_affected := view_row_count;
    RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION predictions_gold.refresh_all_views() IS 
'Refresh all Gold layer materialized views. Call this hourly via scheduler.';

-- =============================================================================
-- USAGE EXAMPLES
-- =============================================================================

COMMENT ON SCHEMA predictions_gold IS 
'Gold layer: Analytics and aggregated views for dashboards and reporting.

USAGE EXAMPLES:

-- Query specific source (using views)
SELECT * FROM predictions_silver.polymarket_markets WHERE title ILIKE ''%bitcoin%'';
SELECT * FROM predictions_silver.kalshi_markets WHERE is_active = true;
SELECT * FROM predictions_silver.limitless_trades ORDER BY traded_at DESC LIMIT 10;

-- Cross-source analytics (using combined tables)
SELECT source, COUNT(*), AVG(volume_24h) 
FROM predictions_silver.markets 
GROUP BY source;

-- Dashboard data (using materialized views)
SELECT * FROM predictions_gold.market_summary;
SELECT * FROM predictions_gold.top_markets WHERE global_rank <= 10;

-- Arbitrage detection
SELECT * FROM predictions_gold.similar_markets WHERE similarity > 0.8;

-- Refresh analytics
SELECT * FROM predictions_gold.refresh_all_views();
';

-- =============================================================================
-- GRANT PERMISSIONS (optional - uncomment if needed)
-- =============================================================================

-- GRANT SELECT ON ALL TABLES IN SCHEMA predictions_silver TO readonly_user;
-- GRANT SELECT ON ALL TABLES IN SCHEMA predictions_gold TO readonly_user;
-- GRANT EXECUTE ON FUNCTION predictions_gold.refresh_all_views() TO analytics_user;
