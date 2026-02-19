-- =============================================================================
-- Predictions Terminal - Gold Layer (Analytics Views & Aggregations)
-- =============================================================================
-- Optimized for:
-- 1. Dashboard queries with sub-second response times
-- 2. Pre-aggregated metrics to avoid expensive JOINs
-- 3. Materialized views with smart refresh strategies
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS predictions_gold;

-- =============================================================================
-- MARKET OVERVIEW - Real-time market dashboard
-- =============================================================================
-- Refreshed every 5 minutes during market hours

CREATE MATERIALIZED VIEW IF NOT EXISTS predictions_gold.market_overview AS
SELECT 
    m.id,
    m.source,
    m.source_market_id,
    m.slug,
    m.title,
    m.category_name,
    m.status,
    m.is_active,
    
    -- Current pricing
    m.yes_price,
    m.no_price,
    m.spread,
    
    -- Volume metrics
    m.volume_24h,
    m.volume_total,
    m.liquidity,
    
    -- Activity
    m.trade_count_24h,
    m.last_trade_at,
    
    -- Timing
    m.end_date,
    m.created_at_source,
    
    -- Computed fields
    CASE 
        WHEN m.end_date IS NOT NULL THEN m.end_date - NOW()
        ELSE NULL 
    END AS time_to_expiry,
    
    -- Volume rank within source
    RANK() OVER (
        PARTITION BY m.source 
        ORDER BY m.volume_24h DESC NULLS LAST
    ) AS volume_rank_in_source,
    
    -- Overall volume rank
    RANK() OVER (
        ORDER BY m.volume_24h DESC NULLS LAST
    ) AS volume_rank_overall,
    
    m.last_updated_at,
    NOW() AS refreshed_at

FROM predictions_silver.markets m
WHERE m.is_active = true
ORDER BY m.volume_24h DESC NULLS LAST;

-- Unique index for concurrent refresh
CREATE UNIQUE INDEX IF NOT EXISTS idx_market_overview_id 
    ON predictions_gold.market_overview (id);

CREATE INDEX IF NOT EXISTS idx_market_overview_source 
    ON predictions_gold.market_overview (source, volume_rank_in_source);

CREATE INDEX IF NOT EXISTS idx_market_overview_volume 
    ON predictions_gold.market_overview (volume_rank_overall);

-- =============================================================================
-- VOLUME DAILY - Daily volume aggregations
-- =============================================================================
-- Refreshed daily at midnight UTC

CREATE MATERIALIZED VIEW IF NOT EXISTS predictions_gold.volume_daily AS
SELECT 
    DATE(t.traded_at) AS trade_date,
    t.source,
    t.source_market_id,
    m.title AS market_title,
    m.category_name,
    
    -- Volume metrics
    COUNT(*) AS trade_count,
    SUM(t.total_value) AS total_volume,
    AVG(t.price) AS avg_price,
    MIN(t.price) AS min_price,
    MAX(t.price) AS max_price,
    
    -- VWAP (Volume Weighted Average Price)
    SUM(t.price * t.quantity) / NULLIF(SUM(t.quantity), 0) AS vwap,
    
    -- Unique traders
    COUNT(DISTINCT t.maker_address) AS unique_makers,
    COUNT(DISTINCT t.taker_address) AS unique_takers,
    
    -- Buy/Sell breakdown
    SUM(CASE WHEN t.side = 'buy' THEN t.total_value ELSE 0 END) AS buy_volume,
    SUM(CASE WHEN t.side = 'sell' THEN t.total_value ELSE 0 END) AS sell_volume,
    
    NOW() AS refreshed_at

FROM predictions_silver.trades t
LEFT JOIN predictions_silver.markets m 
    ON t.source = m.source AND t.source_market_id = m.source_market_id
WHERE t.traded_at >= NOW() - INTERVAL '90 days'
GROUP BY 
    DATE(t.traded_at),
    t.source,
    t.source_market_id,
    m.title,
    m.category_name
ORDER BY trade_date DESC, total_volume DESC;

CREATE UNIQUE INDEX IF NOT EXISTS idx_volume_daily_pk 
    ON predictions_gold.volume_daily (trade_date, source, source_market_id);

CREATE INDEX IF NOT EXISTS idx_volume_daily_date 
    ON predictions_gold.volume_daily (trade_date DESC);

CREATE INDEX IF NOT EXISTS idx_volume_daily_source 
    ON predictions_gold.volume_daily (source, trade_date DESC);

-- =============================================================================
-- VOLUME HOURLY - Hourly aggregations for recent activity
-- =============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS predictions_gold.volume_hourly AS
SELECT 
    DATE_TRUNC('hour', t.traded_at) AS trade_hour,
    t.source,
    t.source_market_id,
    
    COUNT(*) AS trade_count,
    SUM(t.total_value) AS total_volume,
    AVG(t.price) AS avg_price,
    
    -- Price range
    MIN(t.price) AS low_price,
    MAX(t.price) AS high_price,
    
    -- First and last price (for OHLC)
    (ARRAY_AGG(t.price ORDER BY t.traded_at ASC))[1] AS open_price,
    (ARRAY_AGG(t.price ORDER BY t.traded_at DESC))[1] AS close_price,
    
    NOW() AS refreshed_at

FROM predictions_silver.trades t
WHERE t.traded_at >= NOW() - INTERVAL '7 days'
GROUP BY 
    DATE_TRUNC('hour', t.traded_at),
    t.source,
    t.source_market_id
ORDER BY trade_hour DESC;

CREATE UNIQUE INDEX IF NOT EXISTS idx_volume_hourly_pk 
    ON predictions_gold.volume_hourly (trade_hour, source, source_market_id);

CREATE INDEX IF NOT EXISTS idx_volume_hourly_market 
    ON predictions_gold.volume_hourly (source_market_id, trade_hour DESC);

-- =============================================================================
-- CROSS-PLATFORM ARBITRAGE OPPORTUNITIES
-- =============================================================================
-- Refreshed every 15 minutes

CREATE MATERIALIZED VIEW IF NOT EXISTS predictions_gold.arbitrage_opportunities AS
SELECT 
    mm.id AS mapping_id,
    mm.canonical_title,
    mm.canonical_question,
    
    -- Polymarket data
    mm.polymarket_market_id,
    pm.yes_price AS polymarket_yes,
    pm.volume_24h AS polymarket_volume,
    
    -- Kalshi data
    mm.kalshi_market_id,
    km.yes_price AS kalshi_yes,
    km.volume_24h AS kalshi_volume,
    
    -- Limitless data
    mm.limitless_market_id,
    lm.yes_price AS limitless_yes,
    lm.volume_24h AS limitless_volume,
    
    -- Arbitrage calculations
    GREATEST(
        COALESCE(pm.yes_price, 0),
        COALESCE(km.yes_price, 0),
        COALESCE(lm.yes_price, 0)
    ) AS max_yes_price,
    
    LEAST(
        COALESCE(pm.yes_price, 1),
        COALESCE(km.yes_price, 1),
        COALESCE(lm.yes_price, 1)
    ) AS min_yes_price,
    
    GREATEST(
        COALESCE(pm.yes_price, 0),
        COALESCE(km.yes_price, 0),
        COALESCE(lm.yes_price, 0)
    ) - LEAST(
        COALESCE(pm.yes_price, 1),
        COALESCE(km.yes_price, 1),
        COALESCE(lm.yes_price, 1)
    ) AS price_spread,
    
    -- Source with highest/lowest price
    CASE 
        WHEN pm.yes_price = GREATEST(COALESCE(pm.yes_price, 0), COALESCE(km.yes_price, 0), COALESCE(lm.yes_price, 0)) THEN 'polymarket'
        WHEN km.yes_price = GREATEST(COALESCE(pm.yes_price, 0), COALESCE(km.yes_price, 0), COALESCE(lm.yes_price, 0)) THEN 'kalshi'
        ELSE 'limitless'
    END AS highest_price_source,
    
    CASE 
        WHEN pm.yes_price = LEAST(COALESCE(pm.yes_price, 1), COALESCE(km.yes_price, 1), COALESCE(lm.yes_price, 1)) THEN 'polymarket'
        WHEN km.yes_price = LEAST(COALESCE(pm.yes_price, 1), COALESCE(km.yes_price, 1), COALESCE(lm.yes_price, 1)) THEN 'kalshi'
        ELSE 'limitless'
    END AS lowest_price_source,
    
    mm.match_score,
    mm.is_verified,
    NOW() AS refreshed_at

FROM predictions_silver.market_mappings mm
LEFT JOIN predictions_silver.markets pm 
    ON pm.source = 'polymarket' AND pm.source_market_id = mm.polymarket_market_id
LEFT JOIN predictions_silver.markets km 
    ON km.source = 'kalshi' AND km.source_market_id = mm.kalshi_market_id
LEFT JOIN predictions_silver.markets lm 
    ON lm.source = 'limitless' AND lm.source_market_id = mm.limitless_market_id
WHERE mm.is_active = true
    AND (pm.is_active = true OR km.is_active = true OR lm.is_active = true)
ORDER BY price_spread DESC NULLS LAST;

CREATE UNIQUE INDEX IF NOT EXISTS idx_arbitrage_mapping_id 
    ON predictions_gold.arbitrage_opportunities (mapping_id);

CREATE INDEX IF NOT EXISTS idx_arbitrage_spread 
    ON predictions_gold.arbitrage_opportunities (price_spread DESC NULLS LAST);

-- =============================================================================
-- TRENDING MARKETS - Most active markets in last 24h
-- =============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS predictions_gold.trending_markets AS
WITH recent_activity AS (
    SELECT 
        source_market_id,
        source,
        COUNT(*) AS trade_count_24h,
        SUM(total_value) AS volume_24h,
        COUNT(DISTINCT maker_address) + COUNT(DISTINCT taker_address) AS unique_traders
    FROM predictions_silver.trades
    WHERE traded_at >= NOW() - INTERVAL '24 hours'
    GROUP BY source_market_id, source
),
previous_activity AS (
    SELECT 
        source_market_id,
        source,
        COUNT(*) AS trade_count_prev,
        SUM(total_value) AS volume_prev
    FROM predictions_silver.trades
    WHERE traded_at >= NOW() - INTERVAL '48 hours'
      AND traded_at < NOW() - INTERVAL '24 hours'
    GROUP BY source_market_id, source
)
SELECT 
    m.id,
    m.source,
    m.source_market_id,
    m.title,
    m.category_name,
    m.yes_price,
    m.end_date,
    
    -- Current activity
    COALESCE(ra.trade_count_24h, 0) AS trade_count_24h,
    COALESCE(ra.volume_24h, 0) AS volume_24h,
    COALESCE(ra.unique_traders, 0) AS unique_traders_24h,
    
    -- Growth metrics
    CASE 
        WHEN COALESCE(pa.volume_prev, 0) > 0 
        THEN ((COALESCE(ra.volume_24h, 0) - pa.volume_prev) / pa.volume_prev) * 100
        ELSE NULL 
    END AS volume_growth_pct,
    
    CASE 
        WHEN COALESCE(pa.trade_count_prev, 0) > 0 
        THEN ((COALESCE(ra.trade_count_24h, 0) - pa.trade_count_prev)::DECIMAL / pa.trade_count_prev) * 100
        ELSE NULL 
    END AS activity_growth_pct,
    
    -- Trending score (composite)
    (
        COALESCE(ra.volume_24h, 0) * 0.5 +
        COALESCE(ra.trade_count_24h, 0) * 100 * 0.3 +
        COALESCE(ra.unique_traders, 0) * 1000 * 0.2
    ) AS trending_score,
    
    -- Rank
    RANK() OVER (ORDER BY COALESCE(ra.volume_24h, 0) DESC) AS volume_rank,
    
    NOW() AS refreshed_at

FROM predictions_silver.markets m
LEFT JOIN recent_activity ra 
    ON m.source = ra.source AND m.source_market_id = ra.source_market_id
LEFT JOIN previous_activity pa 
    ON m.source = pa.source AND m.source_market_id = pa.source_market_id
WHERE m.is_active = true
    AND COALESCE(ra.trade_count_24h, 0) > 0
ORDER BY trending_score DESC NULLS LAST
LIMIT 500;

CREATE UNIQUE INDEX IF NOT EXISTS idx_trending_id 
    ON predictions_gold.trending_markets (id);

CREATE INDEX IF NOT EXISTS idx_trending_score 
    ON predictions_gold.trending_markets (trending_score DESC);

-- =============================================================================
-- SOURCE STATISTICS - Overall stats per platform
-- =============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS predictions_gold.source_stats AS
SELECT 
    m.source,
    
    -- Market counts
    COUNT(*) AS total_markets,
    COUNT(*) FILTER (WHERE m.is_active = true) AS active_markets,
    COUNT(*) FILTER (WHERE m.is_resolved = true) AS resolved_markets,
    
    -- Volume
    SUM(m.volume_24h) AS total_volume_24h,
    SUM(m.volume_total) AS total_volume_all_time,
    AVG(m.volume_24h) AS avg_volume_24h_per_market,
    
    -- Liquidity
    SUM(m.liquidity) AS total_liquidity,
    AVG(m.liquidity) AS avg_liquidity_per_market,
    
    -- Categories
    COUNT(DISTINCT m.category_name) AS unique_categories,
    
    -- Last update
    MAX(m.last_updated_at) AS last_data_update,
    
    NOW() AS refreshed_at

FROM predictions_silver.markets m
GROUP BY m.source
ORDER BY total_volume_24h DESC;

CREATE UNIQUE INDEX IF NOT EXISTS idx_source_stats_source 
    ON predictions_gold.source_stats (source);

-- =============================================================================
-- PRICE HISTORY SUMMARY - Pre-aggregated for charts
-- =============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS predictions_gold.price_summary_hourly AS
SELECT 
    p.source,
    p.source_market_id,
    DATE_TRUNC('hour', p.snapshot_at) AS hour,
    
    -- OHLCV
    (ARRAY_AGG(p.yes_price ORDER BY p.snapshot_at ASC))[1] AS open,
    MAX(p.yes_price) AS high,
    MIN(p.yes_price) AS low,
    (ARRAY_AGG(p.yes_price ORDER BY p.snapshot_at DESC))[1] AS close,
    SUM(p.volume_1h) AS volume,
    
    -- Stats
    AVG(p.spread) AS avg_spread,
    COUNT(*) AS snapshot_count,
    
    NOW() AS refreshed_at

FROM predictions_silver.prices p
WHERE p.snapshot_at >= NOW() - INTERVAL '30 days'
GROUP BY 
    p.source,
    p.source_market_id,
    DATE_TRUNC('hour', p.snapshot_at)
ORDER BY hour DESC;

CREATE UNIQUE INDEX IF NOT EXISTS idx_price_summary_pk 
    ON predictions_gold.price_summary_hourly (source, source_market_id, hour);

CREATE INDEX IF NOT EXISTS idx_price_summary_market 
    ON predictions_gold.price_summary_hourly (source_market_id, hour DESC);

-- =============================================================================
-- REFRESH FUNCTIONS
-- =============================================================================

-- Function to refresh all materialized views
CREATE OR REPLACE FUNCTION predictions_gold.refresh_all_views()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY predictions_gold.market_overview;
    REFRESH MATERIALIZED VIEW CONCURRENTLY predictions_gold.volume_daily;
    REFRESH MATERIALIZED VIEW CONCURRENTLY predictions_gold.volume_hourly;
    REFRESH MATERIALIZED VIEW CONCURRENTLY predictions_gold.trending_markets;
    REFRESH MATERIALIZED VIEW CONCURRENTLY predictions_gold.source_stats;
    REFRESH MATERIALIZED VIEW CONCURRENTLY predictions_gold.price_summary_hourly;
    -- Arbitrage view refreshed separately (less frequently)
END;
$$ LANGUAGE plpgsql;

-- Function to refresh only fast-changing views
CREATE OR REPLACE FUNCTION predictions_gold.refresh_hot_views()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY predictions_gold.market_overview;
    REFRESH MATERIALIZED VIEW CONCURRENTLY predictions_gold.trending_markets;
END;
$$ LANGUAGE plpgsql;

-- Function to refresh arbitrage view
CREATE OR REPLACE FUNCTION predictions_gold.refresh_arbitrage_view()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY predictions_gold.arbitrage_opportunities;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON MATERIALIZED VIEW predictions_gold.market_overview IS 
    'Real-time market dashboard data. Refresh every 5 minutes.';

COMMENT ON MATERIALIZED VIEW predictions_gold.volume_daily IS 
    'Daily volume aggregations for last 90 days. Refresh daily.';

COMMENT ON MATERIALIZED VIEW predictions_gold.arbitrage_opportunities IS 
    'Cross-platform arbitrage detection. Refresh every 15 minutes.';

COMMENT ON MATERIALIZED VIEW predictions_gold.trending_markets IS 
    'Top 500 trending markets by activity. Refresh every 10 minutes.';
