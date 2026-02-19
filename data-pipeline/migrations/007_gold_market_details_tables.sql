-- ============================================================================
-- Migration: 007_gold_market_details_tables.sql
-- Description: Phase 2 Gold Layer - Market Details Page Tables
-- Created: 2026-01-31
-- ============================================================================

-- These tables support the MARKET DETAILS page in the frontend:
-- 1. market_detail_cache - Full cached market details for fast loading
-- 2. market_price_history - Price chart data (hourly/daily snapshots)
-- 3. market_trade_activity - Recent trade activity per market
-- 4. market_orderbook_depth - Aggregated orderbook depth
-- 5. related_markets - Similar/related markets
-- 6. market_statistics - Win rates, accuracy, performance metrics

SET search_path TO predictions_gold, public;

-- ============================================================================
-- 1. MARKET DETAIL CACHE
-- Full market details cached for fast frontend loading
-- ============================================================================

CREATE TABLE IF NOT EXISTS predictions_gold.market_detail_cache (
    -- Identifiers
    market_id UUID PRIMARY KEY,
    source VARCHAR(50) NOT NULL,
    source_market_id VARCHAR(255) NOT NULL,
    slug VARCHAR(500),
    
    -- Basic Info
    title TEXT NOT NULL,
    description TEXT,
    question TEXT,
    category VARCHAR(255),
    tags TEXT[],
    image_url TEXT,
    
    -- Status
    status VARCHAR(50),
    is_active BOOLEAN DEFAULT true,
    is_resolved BOOLEAN DEFAULT false,
    resolution_value VARCHAR(100),
    
    -- Outcomes (JSON for flexibility)
    outcomes JSONB DEFAULT '[]'::jsonb,
    outcome_count INTEGER DEFAULT 2,
    
    -- Current Prices
    yes_price NUMERIC(10,4),
    no_price NUMERIC(10,4),
    last_price NUMERIC(10,4),
    mid_price NUMERIC(10,4),
    
    -- Price Changes (calculated)
    price_change_1h NUMERIC(10,4) DEFAULT 0,
    price_change_24h NUMERIC(10,4) DEFAULT 0,
    price_change_7d NUMERIC(10,4) DEFAULT 0,
    price_change_pct_1h NUMERIC(8,2) DEFAULT 0,
    price_change_pct_24h NUMERIC(8,2) DEFAULT 0,
    price_change_pct_7d NUMERIC(8,2) DEFAULT 0,
    
    -- Volume Metrics
    volume_24h NUMERIC(20,2) DEFAULT 0,
    volume_7d NUMERIC(20,2) DEFAULT 0,
    volume_30d NUMERIC(20,2) DEFAULT 0,
    volume_total NUMERIC(20,2) DEFAULT 0,
    volume_change_pct_24h NUMERIC(8,2) DEFAULT 0,
    
    -- Liquidity
    liquidity NUMERIC(20,2) DEFAULT 0,
    liquidity_change_24h NUMERIC(20,2) DEFAULT 0,
    spread NUMERIC(10,4) DEFAULT 0,
    
    -- Activity Metrics
    trade_count_24h INTEGER DEFAULT 0,
    trade_count_7d INTEGER DEFAULT 0,
    unique_traders_24h INTEGER DEFAULT 0,
    
    -- Time Info
    created_at TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    time_to_close INTERVAL,
    
    -- Cache Metadata
    cached_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    cache_version INTEGER DEFAULT 1,
    
    -- Constraints
    CONSTRAINT market_detail_source_id_unique UNIQUE (source, source_market_id)
);

-- Indexes for market_detail_cache
CREATE INDEX IF NOT EXISTS idx_market_detail_source ON predictions_gold.market_detail_cache(source);
CREATE INDEX IF NOT EXISTS idx_market_detail_category ON predictions_gold.market_detail_cache(category);
CREATE INDEX IF NOT EXISTS idx_market_detail_active ON predictions_gold.market_detail_cache(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_market_detail_cached_at ON predictions_gold.market_detail_cache(cached_at);
CREATE INDEX IF NOT EXISTS idx_market_detail_slug ON predictions_gold.market_detail_cache(slug);

COMMENT ON TABLE predictions_gold.market_detail_cache IS 
    'Cached full market details for fast frontend loading. Updated every 5 minutes.';


-- ============================================================================
-- 2. MARKET PRICE HISTORY
-- Price chart data with hourly/daily granularity
-- ============================================================================

CREATE TABLE IF NOT EXISTS predictions_gold.market_price_history (
    -- Composite primary key
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    market_id UUID NOT NULL,
    source VARCHAR(50) NOT NULL,
    source_market_id VARCHAR(255) NOT NULL,
    
    -- Time bucket
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    granularity VARCHAR(20) NOT NULL, -- '1h', '4h', '1d', '1w'
    
    -- OHLCV Data
    open_price NUMERIC(10,4),
    high_price NUMERIC(10,4),
    low_price NUMERIC(10,4),
    close_price NUMERIC(10,4),
    volume NUMERIC(20,2) DEFAULT 0,
    trade_count INTEGER DEFAULT 0,
    
    -- Additional metrics
    vwap NUMERIC(10,4), -- Volume Weighted Average Price
    spread_avg NUMERIC(10,4),
    liquidity_avg NUMERIC(20,2),
    
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Unique constraint on market + period
    CONSTRAINT market_price_history_unique UNIQUE (source_market_id, period_start, granularity)
);

-- Partitioning note: Consider partitioning by period_start for large datasets

-- Indexes for market_price_history
CREATE INDEX IF NOT EXISTS idx_price_history_market ON predictions_gold.market_price_history(market_id);
CREATE INDEX IF NOT EXISTS idx_price_history_source_market ON predictions_gold.market_price_history(source_market_id);
CREATE INDEX IF NOT EXISTS idx_price_history_period ON predictions_gold.market_price_history(period_start DESC);
CREATE INDEX IF NOT EXISTS idx_price_history_granularity ON predictions_gold.market_price_history(granularity);
CREATE INDEX IF NOT EXISTS idx_price_history_lookup ON predictions_gold.market_price_history(source_market_id, granularity, period_start DESC);

COMMENT ON TABLE predictions_gold.market_price_history IS 
    'Historical price data for charts. Supports multiple granularities (1h, 4h, 1d, 1w).';


-- ============================================================================
-- 3. MARKET TRADE ACTIVITY
-- Recent trade activity aggregated per market
-- ============================================================================

CREATE TABLE IF NOT EXISTS predictions_gold.market_trade_activity (
    -- Identifiers
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    market_id UUID NOT NULL,
    source VARCHAR(50) NOT NULL,
    source_market_id VARCHAR(255) NOT NULL,
    
    -- Aggregation window
    window_start TIMESTAMPTZ NOT NULL,
    window_end TIMESTAMPTZ NOT NULL,
    window_hours INTEGER NOT NULL, -- 1, 6, 24, 168 (7 days)
    
    -- Trade Statistics
    total_trades INTEGER DEFAULT 0,
    buy_trades INTEGER DEFAULT 0,
    sell_trades INTEGER DEFAULT 0,
    
    -- Volume
    total_volume NUMERIC(20,2) DEFAULT 0,
    buy_volume NUMERIC(20,2) DEFAULT 0,
    sell_volume NUMERIC(20,2) DEFAULT 0,
    avg_trade_size NUMERIC(20,2) DEFAULT 0,
    max_trade_size NUMERIC(20,2) DEFAULT 0,
    
    -- Price Impact
    price_at_start NUMERIC(10,4),
    price_at_end NUMERIC(10,4),
    price_change NUMERIC(10,4) DEFAULT 0,
    price_change_pct NUMERIC(8,2) DEFAULT 0,
    
    -- Trader Activity
    unique_traders INTEGER DEFAULT 0,
    new_traders INTEGER DEFAULT 0, -- First time trading this market
    
    -- Recent Trades List (top 10 for display)
    recent_trades JSONB DEFAULT '[]'::jsonb,
    
    -- Constraints
    CONSTRAINT market_trade_activity_unique UNIQUE (source_market_id, window_hours, snapshot_timestamp)
);

-- Indexes for market_trade_activity
CREATE INDEX IF NOT EXISTS idx_trade_activity_market ON predictions_gold.market_trade_activity(market_id);
CREATE INDEX IF NOT EXISTS idx_trade_activity_source_market ON predictions_gold.market_trade_activity(source_market_id);
CREATE INDEX IF NOT EXISTS idx_trade_activity_snapshot ON predictions_gold.market_trade_activity(snapshot_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_trade_activity_window ON predictions_gold.market_trade_activity(window_hours);

COMMENT ON TABLE predictions_gold.market_trade_activity IS 
    'Aggregated trade activity per market for different time windows (1h, 6h, 24h, 7d).';


-- ============================================================================
-- 4. MARKET ORDERBOOK DEPTH
-- Aggregated orderbook depth for visualization
-- ============================================================================

CREATE TABLE IF NOT EXISTS predictions_gold.market_orderbook_depth (
    -- Identifiers
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    market_id UUID NOT NULL,
    source VARCHAR(50) NOT NULL,
    source_market_id VARCHAR(255) NOT NULL,
    
    -- Best Bid/Ask
    best_bid NUMERIC(10,4),
    best_ask NUMERIC(10,4),
    spread NUMERIC(10,4),
    spread_pct NUMERIC(8,4),
    mid_price NUMERIC(10,4),
    
    -- Depth at levels (aggregated)
    bid_depth_1pct NUMERIC(20,2) DEFAULT 0, -- Volume within 1% of mid
    bid_depth_2pct NUMERIC(20,2) DEFAULT 0,
    bid_depth_5pct NUMERIC(20,2) DEFAULT 0,
    ask_depth_1pct NUMERIC(20,2) DEFAULT 0,
    ask_depth_2pct NUMERIC(20,2) DEFAULT 0,
    ask_depth_5pct NUMERIC(20,2) DEFAULT 0,
    
    -- Total depth
    total_bid_depth NUMERIC(20,2) DEFAULT 0,
    total_ask_depth NUMERIC(20,2) DEFAULT 0,
    imbalance_ratio NUMERIC(8,4) DEFAULT 0, -- (bid - ask) / (bid + ask)
    
    -- Order counts
    bid_order_count INTEGER DEFAULT 0,
    ask_order_count INTEGER DEFAULT 0,
    
    -- Depth visualization data (price levels with sizes)
    bid_levels JSONB DEFAULT '[]'::jsonb, -- [{price, size, cumulative}]
    ask_levels JSONB DEFAULT '[]'::jsonb,
    
    -- Constraints
    CONSTRAINT market_orderbook_unique UNIQUE (source_market_id, snapshot_timestamp)
);

-- Indexes for market_orderbook_depth
CREATE INDEX IF NOT EXISTS idx_orderbook_market ON predictions_gold.market_orderbook_depth(market_id);
CREATE INDEX IF NOT EXISTS idx_orderbook_source_market ON predictions_gold.market_orderbook_depth(source_market_id);
CREATE INDEX IF NOT EXISTS idx_orderbook_snapshot ON predictions_gold.market_orderbook_depth(snapshot_timestamp DESC);

COMMENT ON TABLE predictions_gold.market_orderbook_depth IS 
    'Aggregated orderbook depth snapshots for orderbook visualization.';


-- ============================================================================
-- 5. RELATED MARKETS
-- Similar/related markets for recommendations
-- ============================================================================

CREATE TABLE IF NOT EXISTS predictions_gold.related_markets (
    -- Identifiers
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    market_id UUID NOT NULL,
    source VARCHAR(50) NOT NULL,
    source_market_id VARCHAR(255) NOT NULL,
    
    -- Related market
    related_market_id UUID NOT NULL,
    related_source VARCHAR(50) NOT NULL,
    related_source_market_id VARCHAR(255) NOT NULL,
    related_title TEXT,
    related_category VARCHAR(255),
    related_yes_price NUMERIC(10,4),
    related_volume_24h NUMERIC(20,2),
    
    -- Relationship
    relationship_type VARCHAR(50) NOT NULL, -- 'same_category', 'same_topic', 'correlated', 'opposite'
    similarity_score NUMERIC(5,4) DEFAULT 0, -- 0-1 score
    correlation NUMERIC(5,4), -- Price correlation if applicable
    
    -- Ranking
    rank INTEGER NOT NULL,
    
    -- Metadata
    computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT related_markets_unique UNIQUE (source_market_id, related_source_market_id),
    CONSTRAINT related_markets_rank_check CHECK (rank >= 1 AND rank <= 20)
);

-- Indexes for related_markets
CREATE INDEX IF NOT EXISTS idx_related_market ON predictions_gold.related_markets(market_id);
CREATE INDEX IF NOT EXISTS idx_related_source_market ON predictions_gold.related_markets(source_market_id);
CREATE INDEX IF NOT EXISTS idx_related_type ON predictions_gold.related_markets(relationship_type);
CREATE INDEX IF NOT EXISTS idx_related_computed ON predictions_gold.related_markets(computed_at);

COMMENT ON TABLE predictions_gold.related_markets IS 
    'Related/similar markets for the "Related Markets" section on market detail page.';


-- ============================================================================
-- 6. MARKET STATISTICS
-- Performance metrics, win rates, prediction accuracy
-- ============================================================================

CREATE TABLE IF NOT EXISTS predictions_gold.market_statistics (
    -- Identifiers
    market_id UUID PRIMARY KEY,
    source VARCHAR(50) NOT NULL,
    source_market_id VARCHAR(255) NOT NULL,
    
    -- Resolution Stats (for resolved markets)
    is_resolved BOOLEAN DEFAULT false,
    resolution_value VARCHAR(100),
    resolved_at TIMESTAMPTZ,
    final_price NUMERIC(10,4),
    
    -- Price Journey
    initial_price NUMERIC(10,4), -- First recorded price
    peak_price NUMERIC(10,4),    -- Highest price
    trough_price NUMERIC(10,4),  -- Lowest price
    price_at_resolution NUMERIC(10,4),
    
    -- Volatility Metrics
    volatility_24h NUMERIC(10,4) DEFAULT 0,
    volatility_7d NUMERIC(10,4) DEFAULT 0,
    volatility_30d NUMERIC(10,4) DEFAULT 0,
    max_daily_move NUMERIC(10,4) DEFAULT 0,
    
    -- Trading Activity Lifetime
    total_trades INTEGER DEFAULT 0,
    total_volume NUMERIC(20,2) DEFAULT 0,
    unique_traders INTEGER DEFAULT 0,
    avg_daily_volume NUMERIC(20,2) DEFAULT 0,
    peak_daily_volume NUMERIC(20,2) DEFAULT 0,
    
    -- Market Quality Metrics
    avg_spread NUMERIC(10,4) DEFAULT 0,
    avg_liquidity NUMERIC(20,2) DEFAULT 0,
    days_active INTEGER DEFAULT 0,
    
    -- Prediction Accuracy (how well price predicted outcome)
    prediction_accuracy_score NUMERIC(5,4), -- 0-1, how close final price was to outcome
    price_efficiency_score NUMERIC(5,4),    -- How quickly price converged to resolution
    
    -- Timestamps
    first_trade_at TIMESTAMPTZ,
    last_trade_at TIMESTAMPTZ,
    computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT market_statistics_source_unique UNIQUE (source, source_market_id)
);

-- Indexes for market_statistics
CREATE INDEX IF NOT EXISTS idx_statistics_source ON predictions_gold.market_statistics(source);
CREATE INDEX IF NOT EXISTS idx_statistics_resolved ON predictions_gold.market_statistics(is_resolved);
CREATE INDEX IF NOT EXISTS idx_statistics_computed ON predictions_gold.market_statistics(computed_at);

COMMENT ON TABLE predictions_gold.market_statistics IS 
    'Lifetime statistics and performance metrics for each market.';


-- ============================================================================
-- GRANTS
-- ============================================================================

-- Grant permissions (adjust role name as needed)
-- GRANT SELECT ON ALL TABLES IN SCHEMA predictions_gold TO readonly_role;
-- GRANT ALL ON ALL TABLES IN SCHEMA predictions_gold TO app_role;


-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

-- Summary of tables created:
-- 1. market_detail_cache - Full market cache for fast loading
-- 2. market_price_history - OHLCV price data for charts
-- 3. market_trade_activity - Trade activity aggregates
-- 4. market_orderbook_depth - Orderbook depth snapshots
-- 5. related_markets - Related market recommendations
-- 6. market_statistics - Lifetime performance metrics
