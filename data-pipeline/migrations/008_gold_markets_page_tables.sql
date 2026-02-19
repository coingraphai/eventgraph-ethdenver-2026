-- Migration: 008_gold_markets_page_tables.sql
-- Description: Phase 3 - Gold tables for MARKETS/EXPLORE PAGE
-- Created: 2025-01-17
-- 
-- Tables created:
--   1. recently_resolved_markets - Markets that resolved recently
--   2. category_breakdown_by_platform - 2D category x platform aggregation
--   3. market_search_cache - Pre-computed search index for fast filtering
--   4. filter_aggregates - Cached filter counts for sidebar
--
-- Dependencies: predictions_silver.markets, predictions_silver.prices

-- =====================================================
-- Table 1: recently_resolved_markets
-- Purpose: Show recently resolved markets with outcomes
-- Update Frequency: Every 15 minutes (warm)
-- =====================================================
CREATE TABLE IF NOT EXISTS predictions_gold.recently_resolved_markets (
    id SERIAL PRIMARY KEY,
    market_id VARCHAR(255) NOT NULL,
    market_slug VARCHAR(255),
    question TEXT NOT NULL,
    source VARCHAR(50) NOT NULL,
    category_name VARCHAR(100),
    
    -- Resolution details
    outcome VARCHAR(50),  -- 'yes', 'no', 'other'
    resolution_details JSONB,  -- Full resolution data
    resolved_at TIMESTAMPTZ,
    
    -- Market stats at resolution
    final_yes_price DECIMAL(10, 4),
    final_no_price DECIMAL(10, 4),
    total_volume DECIMAL(20, 2),
    trade_count INTEGER,
    
    -- Time context
    market_duration_days INTEGER,  -- Days from creation to resolution
    
    -- Metadata
    snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT recently_resolved_unique UNIQUE (market_id, resolved_at)
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_recently_resolved_resolved_at 
    ON predictions_gold.recently_resolved_markets(resolved_at DESC);
CREATE INDEX IF NOT EXISTS idx_recently_resolved_source 
    ON predictions_gold.recently_resolved_markets(source);
CREATE INDEX IF NOT EXISTS idx_recently_resolved_category 
    ON predictions_gold.recently_resolved_markets(category_name);
CREATE INDEX IF NOT EXISTS idx_recently_resolved_outcome 
    ON predictions_gold.recently_resolved_markets(outcome);

-- =====================================================
-- Table 2: category_breakdown_by_platform
-- Purpose: 2D aggregation showing category distribution per platform
-- Update Frequency: Every 15 minutes (warm)
-- =====================================================
CREATE TABLE IF NOT EXISTS predictions_gold.category_breakdown_by_platform (
    id SERIAL PRIMARY KEY,
    
    -- Dimensions
    source VARCHAR(50) NOT NULL,
    category_name VARCHAR(100) NOT NULL,
    
    -- Metrics
    market_count INTEGER NOT NULL DEFAULT 0,
    active_market_count INTEGER NOT NULL DEFAULT 0,
    total_volume_24h DECIMAL(20, 2) NOT NULL DEFAULT 0,
    total_volume_all_time DECIMAL(20, 2) NOT NULL DEFAULT 0,
    
    -- Percentages
    pct_of_platform_markets DECIMAL(5, 2),  -- % of this platform's markets
    pct_of_category_markets DECIMAL(5, 2),  -- % of this category's markets
    pct_of_platform_volume DECIMAL(5, 2),   -- % of this platform's volume
    
    -- Volume trend (7-day sparkline data)
    volume_trend_7d JSONB,  -- [{date: '2025-01-10', volume: 1000}, ...]
    
    -- Performance metrics
    avg_market_volume DECIMAL(20, 2),
    avg_yes_price DECIMAL(10, 4),
    
    -- Metadata
    snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT category_platform_unique UNIQUE (source, category_name, snapshot_at)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_category_platform_source 
    ON predictions_gold.category_breakdown_by_platform(source);
CREATE INDEX IF NOT EXISTS idx_category_platform_category 
    ON predictions_gold.category_breakdown_by_platform(category_name);
CREATE INDEX IF NOT EXISTS idx_category_platform_snapshot 
    ON predictions_gold.category_breakdown_by_platform(snapshot_at DESC);

-- =====================================================
-- Table 3: market_search_cache
-- Purpose: Pre-indexed market data for fast text search
-- Update Frequency: Every 15 minutes (warm)
-- =====================================================
CREATE TABLE IF NOT EXISTS predictions_gold.market_search_cache (
    id SERIAL PRIMARY KEY,
    market_id VARCHAR(255) NOT NULL,
    
    -- Searchable fields (combined for full-text)
    question TEXT NOT NULL,
    description TEXT,
    category_name VARCHAR(100),
    
    -- Full-text search vectors
    search_vector TSVECTOR,
    
    -- Quick filter fields
    source VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL,  -- 'active', 'resolved', 'closed'
    yes_price DECIMAL(10, 4),
    volume_24h DECIMAL(20, 2) DEFAULT 0,
    
    -- Ranking signals
    popularity_score DECIMAL(10, 4),  -- Based on volume + trades
    recency_score DECIMAL(10, 4),     -- Based on creation date
    activity_score DECIMAL(10, 4),    -- Based on recent activity
    
    -- Timestamps
    end_date TIMESTAMPTZ,
    created_at_source TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT market_search_unique UNIQUE (market_id)
);

-- Full-text search index
CREATE INDEX IF NOT EXISTS idx_market_search_fts 
    ON predictions_gold.market_search_cache USING GIN(search_vector);
CREATE INDEX IF NOT EXISTS idx_market_search_source 
    ON predictions_gold.market_search_cache(source);
CREATE INDEX IF NOT EXISTS idx_market_search_status 
    ON predictions_gold.market_search_cache(status);
CREATE INDEX IF NOT EXISTS idx_market_search_category 
    ON predictions_gold.market_search_cache(category_name);
CREATE INDEX IF NOT EXISTS idx_market_search_volume 
    ON predictions_gold.market_search_cache(volume_24h DESC);
CREATE INDEX IF NOT EXISTS idx_market_search_popularity 
    ON predictions_gold.market_search_cache(popularity_score DESC);

-- =====================================================
-- Table 4: filter_aggregates
-- Purpose: Pre-computed filter counts for sidebar UI
-- Update Frequency: Every 5 minutes (hot)
-- =====================================================
CREATE TABLE IF NOT EXISTS predictions_gold.filter_aggregates (
    id SERIAL PRIMARY KEY,
    
    -- Filter dimension
    filter_type VARCHAR(50) NOT NULL,  -- 'source', 'category', 'status', 'volume_range'
    filter_value VARCHAR(100) NOT NULL,
    
    -- Counts
    total_count INTEGER NOT NULL DEFAULT 0,
    active_count INTEGER NOT NULL DEFAULT 0,
    
    -- Display metadata
    display_name VARCHAR(100),
    icon VARCHAR(50),
    sort_order INTEGER DEFAULT 0,
    
    -- Metadata
    snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT filter_aggregates_unique UNIQUE (filter_type, filter_value, snapshot_at)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_filter_aggregates_type 
    ON predictions_gold.filter_aggregates(filter_type);
CREATE INDEX IF NOT EXISTS idx_filter_aggregates_snapshot 
    ON predictions_gold.filter_aggregates(snapshot_at DESC);

-- =====================================================
-- Table 5: watchlist_popular_markets
-- Purpose: Track most-watched/popular markets
-- Update Frequency: Every 15 minutes (warm)
-- =====================================================
CREATE TABLE IF NOT EXISTS predictions_gold.watchlist_popular_markets (
    id SERIAL PRIMARY KEY,
    market_id VARCHAR(255) NOT NULL,
    
    -- Market info
    question TEXT NOT NULL,
    source VARCHAR(50) NOT NULL,
    category_name VARCHAR(100),
    
    -- Popularity signals
    view_count INTEGER DEFAULT 0,        -- Page views (if tracked)
    bookmark_count INTEGER DEFAULT 0,    -- User bookmarks
    share_count INTEGER DEFAULT 0,       -- Social shares
    trade_count_24h INTEGER DEFAULT 0,   -- Recent trades
    unique_traders_24h INTEGER DEFAULT 0, -- Unique traders
    
    -- Market state
    yes_price DECIMAL(10, 4),
    volume_24h DECIMAL(20, 2) DEFAULT 0,
    price_change_24h DECIMAL(10, 4),
    
    -- Composite popularity score
    popularity_rank INTEGER,
    popularity_score DECIMAL(10, 4),
    
    -- Timestamps
    end_date TIMESTAMPTZ,
    snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT watchlist_popular_unique UNIQUE (market_id, snapshot_at)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_watchlist_popular_rank 
    ON predictions_gold.watchlist_popular_markets(popularity_rank);
CREATE INDEX IF NOT EXISTS idx_watchlist_popular_source 
    ON predictions_gold.watchlist_popular_markets(source);
CREATE INDEX IF NOT EXISTS idx_watchlist_popular_snapshot 
    ON predictions_gold.watchlist_popular_markets(snapshot_at DESC);

-- =====================================================
-- Comments for documentation
-- =====================================================
COMMENT ON TABLE predictions_gold.recently_resolved_markets IS 
    'Markets that have resolved recently, showing outcomes and final stats';

COMMENT ON TABLE predictions_gold.category_breakdown_by_platform IS 
    '2D aggregation of categories by platform with volume trends';

COMMENT ON TABLE predictions_gold.market_search_cache IS 
    'Pre-indexed market data optimized for full-text search';

COMMENT ON TABLE predictions_gold.filter_aggregates IS 
    'Pre-computed filter counts for sidebar filter UI';

COMMENT ON TABLE predictions_gold.watchlist_popular_markets IS 
    'Most popular/watched markets based on engagement signals';
