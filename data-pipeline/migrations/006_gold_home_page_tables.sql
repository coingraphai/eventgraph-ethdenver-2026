-- =============================================================================
-- Predictions Terminal - Gold Layer: HOME PAGE Analytics Tables
-- =============================================================================
-- Phase 1: Critical frontend components for main dashboard
-- Refreshed: Hot tables (5min), Warm tables (15min)
-- =============================================================================

-- =============================================================================
-- TABLE 1: MARKET METRICS SUMMARY
-- =============================================================================
-- Component: MarketMetrics (card metrics on home page)
-- Update Frequency: Every 5 minutes (hot)
-- Purpose: Combined platform statistics with growth indicators

CREATE TABLE IF NOT EXISTS predictions_gold.market_metrics_summary (
    -- Snapshot metadata
    snapshot_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    snapshot_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Combined metrics (all platforms)
    total_markets INTEGER NOT NULL,
    total_open_markets INTEGER NOT NULL,
    combined_volume_24h DECIMAL(24, 6) NOT NULL DEFAULT 0,
    combined_volume_7d DECIMAL(24, 6) NOT NULL DEFAULT 0,
    avg_volume_per_market DECIMAL(24, 6) NOT NULL DEFAULT 0,
    
    -- Polymarket metrics
    polymarket_open_markets INTEGER DEFAULT 0,
    polymarket_volume_24h DECIMAL(24, 6) DEFAULT 0,
    polymarket_growth_24h_pct DECIMAL(10, 2) DEFAULT 0,
    polymarket_market_share_pct DECIMAL(10, 2) DEFAULT 0,
    
    -- Kalshi metrics
    kalshi_open_markets INTEGER DEFAULT 0,
    kalshi_volume_24h DECIMAL(24, 6) DEFAULT 0,
    kalshi_growth_24h_pct DECIMAL(10, 2) DEFAULT 0,
    kalshi_market_share_pct DECIMAL(10, 2) DEFAULT 0,
    
    -- Limitless metrics
    limitless_open_markets INTEGER DEFAULT 0,
    limitless_volume_24h DECIMAL(24, 6) DEFAULT 0,
    limitless_growth_24h_pct DECIMAL(10, 2) DEFAULT 0,
    limitless_market_share_pct DECIMAL(10, 2) DEFAULT 0,
    
    -- Trend indicators
    trend_direction VARCHAR(10) NOT NULL, -- 'up', 'down', 'stable'
    change_pct_24h DECIMAL(10, 2) DEFAULT 0,
    change_pct_7d DECIMAL(10, 2) DEFAULT 0,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for latest snapshot lookup
CREATE INDEX idx_market_metrics_timestamp 
    ON predictions_gold.market_metrics_summary (snapshot_timestamp DESC);


-- =============================================================================
-- TABLE 2: TOP MARKETS SNAPSHOT
-- =============================================================================
-- Component: TopMarketsChart (bar chart showing top 10 markets by volume)
-- Update Frequency: Every 5 minutes (hot)
-- Purpose: Pre-calculated top markets for fast rendering

CREATE TABLE IF NOT EXISTS predictions_gold.top_markets_snapshot (
    -- Snapshot metadata
    snapshot_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    snapshot_id UUID NOT NULL,
    
    -- Market identification
    market_id UUID NOT NULL REFERENCES predictions_silver.markets(id),
    rank INTEGER NOT NULL CHECK (rank BETWEEN 1 AND 10),
    
    -- Display data
    title TEXT NOT NULL,
    title_short VARCHAR(50) NOT NULL, -- Truncated for UI
    platform VARCHAR(50) NOT NULL,
    
    -- Volume metrics (pre-formatted)
    volume_total_usd DECIMAL(24, 6) DEFAULT 0,
    volume_24h_usd DECIMAL(24, 6) NOT NULL,
    volume_millions DECIMAL(10, 2) NOT NULL, -- For chart labels
    
    -- Classification
    category VARCHAR(255),
    tags TEXT[],
    
    -- Media
    image_url TEXT,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    PRIMARY KEY (snapshot_timestamp, rank)
);

-- Index for latest top 10
CREATE INDEX idx_top_markets_latest 
    ON predictions_gold.top_markets_snapshot (snapshot_timestamp DESC, rank);

-- Index for market tracking over time
CREATE INDEX idx_top_markets_by_market 
    ON predictions_gold.top_markets_snapshot (market_id, snapshot_timestamp DESC);


-- =============================================================================
-- TABLE 3: CATEGORY DISTRIBUTION
-- =============================================================================
-- Component: CategoryDistribution (pie chart showing market breakdown)
-- Update Frequency: Every 15 minutes (warm)
-- Purpose: Category distribution with platform breakdown

CREATE TABLE IF NOT EXISTS predictions_gold.category_distribution (
    -- Snapshot metadata
    snapshot_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    snapshot_id UUID NOT NULL,
    
    -- Category data
    category VARCHAR(255) NOT NULL,
    display_order INTEGER NOT NULL, -- For consistent UI rendering
    
    -- Counts
    market_count INTEGER NOT NULL,
    percentage DECIMAL(5, 2) NOT NULL, -- Pre-calculated percentage
    
    -- Platform breakdown
    polymarket_count INTEGER DEFAULT 0,
    kalshi_count INTEGER DEFAULT 0,
    limitless_count INTEGER DEFAULT 0,
    
    -- Volume metrics
    total_volume_24h DECIMAL(24, 6) DEFAULT 0,
    avg_volume_per_market DECIMAL(24, 6) DEFAULT 0,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    PRIMARY KEY (snapshot_timestamp, category)
);

-- Index for latest snapshot
CREATE INDEX idx_category_dist_latest 
    ON predictions_gold.category_distribution (snapshot_timestamp DESC, display_order);

-- Index for category tracking
CREATE INDEX idx_category_dist_by_category 
    ON predictions_gold.category_distribution (category, snapshot_timestamp DESC);


-- =============================================================================
-- TABLE 4: VOLUME TRENDS
-- =============================================================================
-- Component: VolumeTrends (line chart showing market volume trends)
-- Update Frequency: Every 15 minutes (warm)
-- Purpose: Volume analysis with trend indicators for top markets

CREATE TABLE IF NOT EXISTS predictions_gold.volume_trends (
    -- Snapshot metadata
    snapshot_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    snapshot_id UUID NOT NULL,
    
    -- Market identification
    market_id UUID NOT NULL REFERENCES predictions_silver.markets(id),
    title TEXT NOT NULL,
    title_short VARCHAR(50) NOT NULL,
    platform VARCHAR(50) NOT NULL,
    
    -- Volume metrics
    volume_24h DECIMAL(24, 6) NOT NULL,
    volume_7d DECIMAL(24, 6) NOT NULL,
    volume_weekly_avg DECIMAL(24, 6) NOT NULL,
    volume_monthly_avg DECIMAL(24, 6) NOT NULL,
    
    -- Trend analysis
    trend_direction VARCHAR(10) NOT NULL, -- 'up', 'down', 'stable'
    trend_strength DECIMAL(5, 2) NOT NULL, -- 0-100 confidence score
    volume_change_24h_pct DECIMAL(10, 2) DEFAULT 0,
    volume_change_7d_pct DECIMAL(10, 2) DEFAULT 0,
    
    -- Ranking
    rank_by_volume INTEGER NOT NULL,
    rank_by_trend INTEGER NOT NULL,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    PRIMARY KEY (snapshot_timestamp, market_id)
);

-- Index for latest trends
CREATE INDEX idx_volume_trends_latest 
    ON predictions_gold.volume_trends (snapshot_timestamp DESC, rank_by_volume);

-- Index for market tracking
CREATE INDEX idx_volume_trends_by_market 
    ON predictions_gold.volume_trends (market_id, snapshot_timestamp DESC);

-- Index for trend filtering
CREATE INDEX idx_volume_trends_by_trend 
    ON predictions_gold.volume_trends (snapshot_timestamp DESC, trend_direction, rank_by_trend);


-- =============================================================================
-- TABLE 5: HIGH VOLUME ACTIVITY FEED
-- =============================================================================
-- Component: ActivityFeed (real-time activity stream on home page)
-- Update Frequency: Every 5 minutes (hot)
-- Purpose: Detect and display significant market events

CREATE TABLE IF NOT EXISTS predictions_gold.high_volume_activity (
    -- Activity metadata
    activity_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Market identification
    market_id UUID NOT NULL REFERENCES predictions_silver.markets(id),
    title TEXT NOT NULL,
    title_short VARCHAR(50) NOT NULL,
    platform VARCHAR(50) NOT NULL,
    
    -- Activity type
    activity_type VARCHAR(50) NOT NULL, -- 'volume_spike', 'price_move', 'new_market', 'closing_soon'
    activity_description TEXT NOT NULL, -- Human-readable description
    
    -- Metrics
    volume_24h DECIMAL(24, 6) DEFAULT 0,
    volume_change_pct DECIMAL(10, 2) DEFAULT 0,
    price_change_pct DECIMAL(10, 2) DEFAULT 0,
    current_price DECIMAL(10, 6),
    
    -- Importance scoring
    importance_score INTEGER NOT NULL DEFAULT 50, -- 0-100, higher = more important
    
    -- Display metadata
    category VARCHAR(255),
    image_url TEXT,
    time_to_close INTERVAL, -- For "closing soon" activities
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for latest activity (feed display)
CREATE INDEX idx_high_volume_activity_latest 
    ON predictions_gold.high_volume_activity (detected_at DESC, importance_score DESC);

-- Index for filtering by type
CREATE INDEX idx_high_volume_activity_type 
    ON predictions_gold.high_volume_activity (activity_type, detected_at DESC);

-- Index for market tracking
CREATE INDEX idx_high_volume_activity_market 
    ON predictions_gold.high_volume_activity (market_id, detected_at DESC);


-- =============================================================================
-- TABLE 6: PLATFORM COMPARISON
-- =============================================================================
-- Component: PlatformVolumeComparison (bar chart comparing platforms)
-- Update Frequency: Every 15 minutes (warm)
-- Purpose: Side-by-side platform statistics

CREATE TABLE IF NOT EXISTS predictions_gold.platform_comparison (
    -- Snapshot metadata
    snapshot_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    snapshot_id UUID NOT NULL,
    
    -- Platform identification
    platform VARCHAR(50) NOT NULL,
    display_order INTEGER NOT NULL, -- For consistent UI ordering
    
    -- Market counts
    total_markets INTEGER NOT NULL,
    active_markets INTEGER NOT NULL,
    resolved_markets_24h INTEGER DEFAULT 0,
    
    -- Volume metrics (pre-formatted for display)
    volume_24h DECIMAL(24, 6) NOT NULL,
    volume_7d DECIMAL(24, 6) NOT NULL,
    volume_millions DECIMAL(10, 2) NOT NULL, -- For chart labels
    avg_volume_thousands DECIMAL(10, 2) NOT NULL, -- Per market
    
    -- Growth indicators
    growth_24h_pct DECIMAL(10, 2) DEFAULT 0,
    growth_7d_pct DECIMAL(10, 2) DEFAULT 0,
    market_share_pct DECIMAL(5, 2) DEFAULT 0,
    
    -- Activity metrics
    trade_count_24h INTEGER DEFAULT 0,
    unique_traders_24h INTEGER DEFAULT 0,
    avg_trade_size DECIMAL(24, 6) DEFAULT 0,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    PRIMARY KEY (snapshot_timestamp, platform)
);

-- Index for latest comparison
CREATE INDEX idx_platform_comparison_latest 
    ON predictions_gold.platform_comparison (snapshot_timestamp DESC, display_order);

-- Index for platform tracking
CREATE INDEX idx_platform_comparison_by_platform 
    ON predictions_gold.platform_comparison (platform, snapshot_timestamp DESC);


-- =============================================================================
-- TABLE 7: TRENDING CATEGORIES
-- =============================================================================
-- Component: TrendingCategories (tag cloud or trending list)
-- Update Frequency: Every 15 minutes (warm)
-- Purpose: Show which categories are gaining traction

CREATE TABLE IF NOT EXISTS predictions_gold.trending_categories (
    -- Snapshot metadata
    snapshot_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    snapshot_id UUID NOT NULL,
    
    -- Category data
    category VARCHAR(255) NOT NULL,
    rank INTEGER NOT NULL CHECK (rank BETWEEN 1 AND 8), -- Top 8 trending
    
    -- Metrics
    market_count INTEGER NOT NULL,
    volume_24h DECIMAL(24, 6) NOT NULL,
    volume_change_24h_pct DECIMAL(10, 2) DEFAULT 0,
    
    -- Trend indicators
    trend_direction VARCHAR(10) NOT NULL, -- 'up', 'down', 'stable'
    trend_score INTEGER NOT NULL, -- 0-100, higher = hotter trend
    
    -- Display metrics
    percentage_of_total DECIMAL(5, 2) NOT NULL,
    rank_change INTEGER DEFAULT 0, -- +/- from previous snapshot
    
    -- Platform distribution
    polymarket_count INTEGER DEFAULT 0,
    kalshi_count INTEGER DEFAULT 0,
    limitless_count INTEGER DEFAULT 0,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    PRIMARY KEY (snapshot_timestamp, rank)
);

-- Index for latest trending
CREATE INDEX idx_trending_categories_latest 
    ON predictions_gold.trending_categories (snapshot_timestamp DESC, rank);

-- Index for category tracking
CREATE INDEX idx_trending_categories_by_category 
    ON predictions_gold.trending_categories (category, snapshot_timestamp DESC);


-- =============================================================================
-- HELPER FUNCTIONS
-- =============================================================================

-- Function to calculate trend direction from percentage change
CREATE OR REPLACE FUNCTION predictions_gold.calculate_trend_direction(change_pct DECIMAL)
RETURNS VARCHAR(10) AS $$
BEGIN
    IF change_pct > 5 THEN
        RETURN 'up';
    ELSIF change_pct < -5 THEN
        RETURN 'down';
    ELSE
        RETURN 'stable';
    END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to truncate title for display
CREATE OR REPLACE FUNCTION predictions_gold.truncate_title(title TEXT, max_length INTEGER DEFAULT 50)
RETURNS VARCHAR AS $$
BEGIN
    IF LENGTH(title) <= max_length THEN
        RETURN title;
    ELSE
        RETURN LEFT(title, max_length - 3) || '...';
    END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to format volume in millions
CREATE OR REPLACE FUNCTION predictions_gold.format_volume_millions(volume DECIMAL)
RETURNS DECIMAL(10, 2) AS $$
BEGIN
    RETURN ROUND(volume / 1000000, 2);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to format volume in thousands
CREATE OR REPLACE FUNCTION predictions_gold.format_volume_thousands(volume DECIMAL)
RETURNS DECIMAL(10, 2) AS $$
BEGIN
    RETURN ROUND(volume / 1000, 2);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- =============================================================================
-- CLEANUP FUNCTION (Runs daily)
-- =============================================================================

CREATE OR REPLACE FUNCTION predictions_gold.cleanup_old_snapshots()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER := 0;
    temp_count INTEGER;
BEGIN
    -- Clean up market_metrics_summary (90 days)
    DELETE FROM predictions_gold.market_metrics_summary
    WHERE created_at < NOW() - INTERVAL '90 days';
    GET DIAGNOSTICS temp_count = ROW_COUNT;
    deleted_count := deleted_count + temp_count;
    
    -- Clean up top_markets_snapshot (90 days)
    DELETE FROM predictions_gold.top_markets_snapshot
    WHERE created_at < NOW() - INTERVAL '90 days';
    GET DIAGNOSTICS temp_count = ROW_COUNT;
    deleted_count := deleted_count + temp_count;
    
    -- Clean up category_distribution (90 days)
    DELETE FROM predictions_gold.category_distribution
    WHERE created_at < NOW() - INTERVAL '90 days';
    GET DIAGNOSTICS temp_count = ROW_COUNT;
    deleted_count := deleted_count + temp_count;
    
    -- Clean up volume_trends (90 days)
    DELETE FROM predictions_gold.volume_trends
    WHERE created_at < NOW() - INTERVAL '90 days';
    GET DIAGNOSTICS temp_count = ROW_COUNT;
    deleted_count := deleted_count + temp_count;
    
    -- Clean up high_volume_activity (30 days only - activity feed)
    DELETE FROM predictions_gold.high_volume_activity
    WHERE created_at < NOW() - INTERVAL '30 days';
    GET DIAGNOSTICS temp_count = ROW_COUNT;
    deleted_count := deleted_count + temp_count;
    
    -- Clean up platform_comparison (90 days)
    DELETE FROM predictions_gold.platform_comparison
    WHERE created_at < NOW() - INTERVAL '90 days';
    GET DIAGNOSTICS temp_count = ROW_COUNT;
    deleted_count := deleted_count + temp_count;
    
    -- Clean up trending_categories (90 days)
    DELETE FROM predictions_gold.trending_categories
    WHERE created_at < NOW() - INTERVAL '90 days';
    GET DIAGNOSTICS temp_count = ROW_COUNT;
    deleted_count := deleted_count + temp_count;
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- COMMENTS (Documentation)
-- =============================================================================

COMMENT ON TABLE predictions_gold.market_metrics_summary IS 
'Aggregated platform statistics for MarketMetrics component. Updated every 5 minutes.';

COMMENT ON TABLE predictions_gold.top_markets_snapshot IS 
'Top 10 markets by volume for TopMarketsChart component. Updated every 5 minutes.';

COMMENT ON TABLE predictions_gold.category_distribution IS 
'Category breakdown for CategoryDistribution pie chart. Updated every 15 minutes.';

COMMENT ON TABLE predictions_gold.volume_trends IS 
'Volume trend analysis for VolumeTrends line chart. Updated every 15 minutes.';

COMMENT ON TABLE predictions_gold.high_volume_activity IS 
'Significant market events for ActivityFeed component. Updated every 5 minutes.';

COMMENT ON TABLE predictions_gold.platform_comparison IS 
'Platform statistics for PlatformVolumeComparison bar chart. Updated every 15 minutes.';

COMMENT ON TABLE predictions_gold.trending_categories IS 
'Top 8 trending categories for TrendingCategories component. Updated every 15 minutes.';

COMMENT ON FUNCTION predictions_gold.cleanup_old_snapshots() IS 
'Removes snapshots older than retention period. Run daily via scheduler.';

-- =============================================================================
-- END OF MIGRATION
-- =============================================================================
