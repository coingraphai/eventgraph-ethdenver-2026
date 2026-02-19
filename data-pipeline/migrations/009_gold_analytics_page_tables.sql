-- Migration: 009_gold_analytics_page_tables.sql
-- Description: Phase 4 - Gold tables for ANALYTICS PAGE
-- Created: 2025-01-31
-- 
-- Tables created:
--   1. platform_market_share_timeseries - Daily platform market share evolution
--   2. volume_distribution_histogram - Markets grouped by volume ranges
--   3. market_lifecycle_funnel - Market lifecycle stage analysis
--   4. hourly_activity_heatmap - Trading activity by hour/day
--   5. top_traders_leaderboard - Top traders by volume/profit
--   6. category_performance_metrics - Category-level performance metrics
--   7. resolution_accuracy_tracker - Market resolution accuracy tracking
--
-- Dependencies: predictions_silver.markets, predictions_silver.trades, predictions_silver.prices

-- =====================================================
-- Table 1: platform_market_share_timeseries
-- Purpose: Daily snapshots of platform market share
-- Update Frequency: Daily
-- =====================================================
CREATE TABLE IF NOT EXISTS predictions_gold.platform_market_share_timeseries (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL,
    source VARCHAR(50) NOT NULL,
    
    -- Market counts
    total_markets INTEGER NOT NULL DEFAULT 0,
    active_markets INTEGER NOT NULL DEFAULT 0,
    new_markets_today INTEGER NOT NULL DEFAULT 0,
    resolved_markets_today INTEGER NOT NULL DEFAULT 0,
    
    -- Volume metrics
    volume_24h DECIMAL(20, 2) NOT NULL DEFAULT 0,
    volume_7d DECIMAL(20, 2) NOT NULL DEFAULT 0,
    volume_30d DECIMAL(20, 2) NOT NULL DEFAULT 0,
    volume_total DECIMAL(20, 2) NOT NULL DEFAULT 0,
    
    -- Market share percentages
    market_share_by_count DECIMAL(5, 2),
    market_share_by_volume DECIMAL(5, 2),
    
    -- Growth metrics
    growth_rate_markets DECIMAL(10, 4),  -- Day-over-day % change
    growth_rate_volume DECIMAL(10, 4),
    
    -- Metadata
    snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT platform_market_share_unique UNIQUE (date, source)
);

CREATE INDEX IF NOT EXISTS idx_platform_market_share_date 
    ON predictions_gold.platform_market_share_timeseries(date DESC);
CREATE INDEX IF NOT EXISTS idx_platform_market_share_source 
    ON predictions_gold.platform_market_share_timeseries(source);

-- =====================================================
-- Table 2: volume_distribution_histogram
-- Purpose: Markets binned by volume ranges
-- Update Frequency: Every 15 minutes (warm)
-- =====================================================
CREATE TABLE IF NOT EXISTS predictions_gold.volume_distribution_histogram (
    id SERIAL PRIMARY KEY,
    
    -- Bin definition
    bin_index INTEGER NOT NULL,
    volume_range_min DECIMAL(20, 2) NOT NULL,
    volume_range_max DECIMAL(20, 2) NOT NULL,
    bin_label VARCHAR(50) NOT NULL,  -- e.g., "$0-$100", "$100-$1K"
    
    -- Counts
    market_count INTEGER NOT NULL DEFAULT 0,
    
    -- Source breakdown
    polymarket_count INTEGER DEFAULT 0,
    kalshi_count INTEGER DEFAULT 0,
    limitless_count INTEGER DEFAULT 0,
    
    -- Aggregate metrics for this bin
    total_volume DECIMAL(20, 2) DEFAULT 0,
    avg_yes_price DECIMAL(10, 4),
    
    -- Statistical metrics
    percentile DECIMAL(5, 2),  -- What percentile does this bin represent
    
    -- Metadata
    snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT volume_histogram_unique UNIQUE (bin_index, snapshot_at)
);

CREATE INDEX IF NOT EXISTS idx_volume_histogram_snapshot 
    ON predictions_gold.volume_distribution_histogram(snapshot_at DESC);
CREATE INDEX IF NOT EXISTS idx_volume_histogram_bin 
    ON predictions_gold.volume_distribution_histogram(bin_index);

-- =====================================================
-- Table 3: market_lifecycle_funnel
-- Purpose: Track markets through lifecycle stages
-- Update Frequency: Every 15 minutes (warm)
-- =====================================================
CREATE TABLE IF NOT EXISTS predictions_gold.market_lifecycle_funnel (
    id SERIAL PRIMARY KEY,
    
    -- Stage definition
    stage VARCHAR(50) NOT NULL,  -- 'created', 'active', 'volume_1k', 'volume_10k', 'resolved'
    stage_order INTEGER NOT NULL,
    
    -- Counts
    market_count INTEGER NOT NULL DEFAULT 0,
    
    -- Source breakdown
    polymarket_count INTEGER DEFAULT 0,
    kalshi_count INTEGER DEFAULT 0,
    limitless_count INTEGER DEFAULT 0,
    
    -- Metrics
    avg_time_in_stage_hours DECIMAL(10, 2),
    conversion_rate_to_next DECIMAL(5, 2),  -- % that move to next stage
    
    -- Metadata
    snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT lifecycle_funnel_unique UNIQUE (stage, snapshot_at)
);

CREATE INDEX IF NOT EXISTS idx_lifecycle_funnel_snapshot 
    ON predictions_gold.market_lifecycle_funnel(snapshot_at DESC);
CREATE INDEX IF NOT EXISTS idx_lifecycle_funnel_stage 
    ON predictions_gold.market_lifecycle_funnel(stage_order);

-- =====================================================
-- Table 4: hourly_activity_heatmap
-- Purpose: 24x7 heatmap of trading activity
-- Update Frequency: Daily
-- =====================================================
CREATE TABLE IF NOT EXISTS predictions_gold.hourly_activity_heatmap (
    id SERIAL PRIMARY KEY,
    
    -- Time dimensions
    hour_of_day INTEGER NOT NULL CHECK (hour_of_day >= 0 AND hour_of_day < 24),
    day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week < 7),  -- 0=Sunday
    
    -- Activity metrics
    trade_count INTEGER NOT NULL DEFAULT 0,
    unique_traders INTEGER NOT NULL DEFAULT 0,
    total_volume DECIMAL(20, 2) NOT NULL DEFAULT 0,
    
    -- Market activity
    active_markets INTEGER NOT NULL DEFAULT 0,
    
    -- Intensity score (normalized 0-1)
    activity_intensity DECIMAL(5, 4),
    
    -- Metadata
    week_start DATE NOT NULL,  -- Which week this data represents
    snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT activity_heatmap_unique UNIQUE (hour_of_day, day_of_week, week_start)
);

CREATE INDEX IF NOT EXISTS idx_activity_heatmap_week 
    ON predictions_gold.hourly_activity_heatmap(week_start DESC);
CREATE INDEX IF NOT EXISTS idx_activity_heatmap_coords 
    ON predictions_gold.hourly_activity_heatmap(hour_of_day, day_of_week);

-- =====================================================
-- Table 5: top_traders_leaderboard
-- Purpose: Ranked list of top traders
-- Update Frequency: Every 15 minutes (warm)
-- =====================================================
CREATE TABLE IF NOT EXISTS predictions_gold.top_traders_leaderboard (
    id SERIAL PRIMARY KEY,
    
    -- Trader identification
    trader_address VARCHAR(255) NOT NULL,
    trader_rank INTEGER NOT NULL,
    
    -- Trading metrics (all-time)
    total_trades INTEGER NOT NULL DEFAULT 0,
    total_volume DECIMAL(20, 2) NOT NULL DEFAULT 0,
    
    -- Recent activity (24h)
    trades_24h INTEGER DEFAULT 0,
    volume_24h DECIMAL(20, 2) DEFAULT 0,
    
    -- Performance (if calculable)
    win_rate DECIMAL(5, 2),  -- % of profitable trades
    avg_trade_size DECIMAL(20, 2),
    
    -- Market preferences
    favorite_source VARCHAR(50),
    favorite_category VARCHAR(100),
    markets_traded_count INTEGER DEFAULT 0,
    
    -- Metadata
    snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT top_traders_unique UNIQUE (trader_address, snapshot_at),
    CONSTRAINT top_traders_rank_check CHECK (trader_rank >= 1 AND trader_rank <= 100)
);

CREATE INDEX IF NOT EXISTS idx_top_traders_rank 
    ON predictions_gold.top_traders_leaderboard(trader_rank);
CREATE INDEX IF NOT EXISTS idx_top_traders_snapshot 
    ON predictions_gold.top_traders_leaderboard(snapshot_at DESC);
CREATE INDEX IF NOT EXISTS idx_top_traders_address 
    ON predictions_gold.top_traders_leaderboard(trader_address);

-- =====================================================
-- Table 6: category_performance_metrics
-- Purpose: Performance metrics per category
-- Update Frequency: Every 15 minutes (warm)
-- =====================================================
CREATE TABLE IF NOT EXISTS predictions_gold.category_performance_metrics (
    id SERIAL PRIMARY KEY,
    
    -- Category
    category_name VARCHAR(100) NOT NULL,
    
    -- Market metrics
    total_markets INTEGER NOT NULL DEFAULT 0,
    active_markets INTEGER NOT NULL DEFAULT 0,
    resolved_markets INTEGER NOT NULL DEFAULT 0,
    
    -- Volume metrics
    total_volume_24h DECIMAL(20, 2) NOT NULL DEFAULT 0,
    total_volume_7d DECIMAL(20, 2) NOT NULL DEFAULT 0,
    total_volume_all_time DECIMAL(20, 2) NOT NULL DEFAULT 0,
    avg_market_volume DECIMAL(20, 2),
    
    -- Trading metrics
    total_trades_24h INTEGER DEFAULT 0,
    avg_trades_per_market DECIMAL(10, 2),
    
    -- Price metrics
    avg_yes_price DECIMAL(10, 4),
    avg_volatility DECIMAL(10, 4),  -- Std dev of prices
    
    -- Resolution metrics
    resolution_rate DECIMAL(5, 2),  -- % resolved vs total
    avg_time_to_resolution_days DECIMAL(10, 2),
    
    -- Growth
    growth_rate_7d DECIMAL(10, 4),
    growth_rate_30d DECIMAL(10, 4),
    
    -- Ranking
    popularity_rank INTEGER,
    
    -- Metadata
    snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT category_performance_unique UNIQUE (category_name, snapshot_at)
);

CREATE INDEX IF NOT EXISTS idx_category_performance_snapshot 
    ON predictions_gold.category_performance_metrics(snapshot_at DESC);
CREATE INDEX IF NOT EXISTS idx_category_performance_rank 
    ON predictions_gold.category_performance_metrics(popularity_rank);
CREATE INDEX IF NOT EXISTS idx_category_performance_category 
    ON predictions_gold.category_performance_metrics(category_name);

-- =====================================================
-- Table 7: resolution_accuracy_tracker
-- Purpose: Track prediction accuracy and resolution patterns
-- Update Frequency: Daily
-- =====================================================
CREATE TABLE IF NOT EXISTS predictions_gold.resolution_accuracy_tracker (
    id SERIAL PRIMARY KEY,
    
    -- Time period
    date DATE NOT NULL,
    
    -- Overall metrics
    total_resolved_markets INTEGER NOT NULL DEFAULT 0,
    
    -- Resolution outcomes
    resolved_yes INTEGER DEFAULT 0,
    resolved_no INTEGER DEFAULT 0,
    resolved_other INTEGER DEFAULT 0,
    
    -- Accuracy metrics (comparing final price to resolution)
    avg_final_price_yes_markets DECIMAL(10, 4),
    avg_final_price_no_markets DECIMAL(10, 4),
    accuracy_score DECIMAL(5, 2),  -- How well final prices predicted outcome
    
    -- Market characteristics
    avg_days_to_resolution DECIMAL(10, 2),
    avg_volume_resolved_markets DECIMAL(20, 2),
    
    -- Source breakdown
    polymarket_resolved INTEGER DEFAULT 0,
    kalshi_resolved INTEGER DEFAULT 0,
    limitless_resolved INTEGER DEFAULT 0,
    
    -- Category breakdown (top 3)
    top_category_1 VARCHAR(100),
    top_category_1_count INTEGER,
    top_category_2 VARCHAR(100),
    top_category_2_count INTEGER,
    top_category_3 VARCHAR(100),
    top_category_3_count INTEGER,
    
    -- Metadata
    snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT resolution_accuracy_unique UNIQUE (date)
);

CREATE INDEX IF NOT EXISTS idx_resolution_accuracy_date 
    ON predictions_gold.resolution_accuracy_tracker(date DESC);

-- =====================================================
-- Comments for documentation
-- =====================================================
COMMENT ON TABLE predictions_gold.platform_market_share_timeseries IS 
    'Daily snapshots of platform market share by count and volume';

COMMENT ON TABLE predictions_gold.volume_distribution_histogram IS 
    'Markets grouped into volume bins for distribution analysis';

COMMENT ON TABLE predictions_gold.market_lifecycle_funnel IS 
    'Funnel analysis of markets through lifecycle stages';

COMMENT ON TABLE predictions_gold.hourly_activity_heatmap IS 
    '24x7 heatmap showing trading activity patterns by hour and day';

COMMENT ON TABLE predictions_gold.top_traders_leaderboard IS 
    'Ranked leaderboard of top traders by volume and activity';

COMMENT ON TABLE predictions_gold.category_performance_metrics IS 
    'Performance metrics and statistics per category';

COMMENT ON TABLE predictions_gold.resolution_accuracy_tracker IS 
    'Daily tracking of prediction accuracy and resolution patterns';
