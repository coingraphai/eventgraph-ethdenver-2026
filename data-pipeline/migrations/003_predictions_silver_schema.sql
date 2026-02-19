-- =============================================================================
-- Predictions Terminal - Silver Layer Schema (Normalized Entities)
-- =============================================================================
-- Optimized for:
-- 1. Fast analytical queries with proper indexing strategy
-- 2. Cross-source market matching and arbitrage detection
-- 3. Time-series queries for price and volume analysis
-- 4. Efficient joins between related entities
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS predictions_silver;

-- =============================================================================
-- UNIFIED MARKETS TABLE
-- =============================================================================
-- Core entity table joining all prediction markets across sources

CREATE TABLE IF NOT EXISTS predictions_silver.markets (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Source identification (composite unique)
    source VARCHAR(50) NOT NULL,
    source_market_id VARCHAR(500) NOT NULL,
    
    -- Identifiers
    slug VARCHAR(500),
    condition_id VARCHAR(255),             -- Polymarket condition ID
    question_id VARCHAR(255),              -- Alternative ID formats
    
    -- Basic info
    title TEXT NOT NULL,
    description TEXT,
    question TEXT,                         -- The actual question being asked
    
    -- Category/Classification
    category_id VARCHAR(100),
    category_name VARCHAR(255),
    tags TEXT[],                           -- Array for efficient containment queries
    
    -- Status
    status VARCHAR(50) DEFAULT 'active',   -- 'active', 'closed', 'resolved', 'paused'
    is_active BOOLEAN DEFAULT true,
    is_resolved BOOLEAN DEFAULT false,
    resolution_value VARCHAR(100),         -- 'yes', 'no', or numeric
    
    -- Outcomes (denormalized for query performance)
    outcomes JSONB NOT NULL DEFAULT '[]',  -- [{id, name, token_id, price}]
    outcome_count INTEGER DEFAULT 2,
    
    -- Current pricing (denormalized for fast reads)
    yes_price DECIMAL(10, 6),
    no_price DECIMAL(10, 6),
    last_trade_price DECIMAL(10, 6),
    mid_price DECIMAL(10, 6),
    spread DECIMAL(10, 6),
    
    -- Volume metrics (updated hourly)
    volume_24h DECIMAL(24, 6) DEFAULT 0,
    volume_7d DECIMAL(24, 6) DEFAULT 0,
    volume_30d DECIMAL(24, 6) DEFAULT 0,
    volume_total DECIMAL(24, 6) DEFAULT 0,
    
    -- Liquidity metrics
    liquidity DECIMAL(24, 6) DEFAULT 0,
    open_interest DECIMAL(24, 6) DEFAULT 0,
    
    -- Trade activity
    trade_count_24h INTEGER DEFAULT 0,
    trade_count_total INTEGER DEFAULT 0,
    unique_traders INTEGER DEFAULT 0,
    
    -- Timing
    created_at_source TIMESTAMPTZ,         -- When created on source platform
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    resolution_date TIMESTAMPTZ,
    last_trade_at TIMESTAMPTZ,
    
    -- Media/Links
    image_url TEXT,
    icon_url TEXT,
    source_url TEXT,
    rules_url TEXT,
    
    -- Source-specific metadata (flexible storage)
    extra_data JSONB DEFAULT '{}',
    
    -- Tracking
    body_hash VARCHAR(64),
    first_seen_at TIMESTAMPTZ DEFAULT NOW(),
    last_updated_at TIMESTAMPTZ DEFAULT NOW(),
    update_count INTEGER DEFAULT 1,
    
    -- Constraints
    UNIQUE (source, source_market_id)
);

-- =============================================================================
-- MARKETS INDEXES - Optimized for analytical queries
-- =============================================================================

-- Primary lookup patterns
CREATE INDEX idx_markets_source_active 
    ON predictions_silver.markets (source, is_active) 
    WHERE is_active = true;

CREATE INDEX idx_markets_status 
    ON predictions_silver.markets (status, source);

-- Text search on title (using trigram for fuzzy matching)
CREATE INDEX idx_markets_title_trgm 
    ON predictions_silver.markets USING gin (title gin_trgm_ops);

-- Category filtering
CREATE INDEX idx_markets_category 
    ON predictions_silver.markets (category_name, source);

-- Tags array containment
CREATE INDEX idx_markets_tags 
    ON predictions_silver.markets USING gin (tags);

-- Volume ranking (most common sort)
CREATE INDEX idx_markets_volume_24h 
    ON predictions_silver.markets (volume_24h DESC NULLS LAST) 
    WHERE is_active = true;

CREATE INDEX idx_markets_volume_total 
    ON predictions_silver.markets (volume_total DESC NULLS LAST);

-- Price filtering
CREATE INDEX idx_markets_yes_price 
    ON predictions_silver.markets (yes_price) 
    WHERE is_active = true;

-- Time-based queries
CREATE INDEX idx_markets_end_date 
    ON predictions_silver.markets (end_date) 
    WHERE end_date IS NOT NULL AND is_active = true;

CREATE INDEX idx_markets_last_updated 
    ON predictions_silver.markets (last_updated_at DESC);

-- Slug lookup (for API/URL routing)
CREATE INDEX idx_markets_slug 
    ON predictions_silver.markets (slug) 
    WHERE slug IS NOT NULL;

-- Composite for common dashboard queries
CREATE INDEX idx_markets_dashboard 
    ON predictions_silver.markets (source, is_active, volume_24h DESC) 
    INCLUDE (title, yes_price, no_price, end_date);

-- =============================================================================
-- EVENTS TABLE (Market Groupings)
-- =============================================================================
-- Events group multiple related markets (e.g., "2024 Election" groups many markets)

CREATE TABLE IF NOT EXISTS predictions_silver.events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Source identification
    source VARCHAR(50) NOT NULL,
    source_event_id VARCHAR(255) NOT NULL,
    
    -- Basic info
    title TEXT NOT NULL,
    description TEXT,
    slug VARCHAR(500),
    
    -- Classification
    category_id VARCHAR(100),
    category_name VARCHAR(255),
    tags TEXT[],
    
    -- Status
    status VARCHAR(50) DEFAULT 'active',
    is_active BOOLEAN DEFAULT true,
    
    -- Aggregated metrics (computed from child markets)
    market_count INTEGER DEFAULT 0,
    total_volume DECIMAL(24, 6) DEFAULT 0,
    total_liquidity DECIMAL(24, 6) DEFAULT 0,
    
    -- Timing
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    
    -- Media
    image_url TEXT,
    icon_url TEXT,
    
    -- Metadata
    extra_data JSONB DEFAULT '{}',
    
    -- Tracking
    first_seen_at TIMESTAMPTZ DEFAULT NOW(),
    last_updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE (source, source_event_id)
);

CREATE INDEX idx_events_source_active 
    ON predictions_silver.events (source, is_active);

CREATE INDEX idx_events_title_trgm 
    ON predictions_silver.events USING gin (title gin_trgm_ops);

-- =============================================================================
-- TRADES TABLE
-- =============================================================================
-- Individual trade records - high volume, optimized for time-series queries

CREATE TABLE IF NOT EXISTS predictions_silver.trades (
    id UUID DEFAULT gen_random_uuid(),
    
    -- Source identification
    source VARCHAR(50) NOT NULL,
    source_trade_id VARCHAR(255),
    
    -- Market reference
    market_id UUID,                        -- FK to markets (nullable for speed)
    source_market_id VARCHAR(500) NOT NULL,
    
    -- Trade details
    side VARCHAR(10) NOT NULL,             -- 'buy', 'sell'
    outcome VARCHAR(255),                  -- 'yes', 'no', or outcome name
    outcome_index INTEGER,                 -- 0, 1, 2... for multi-outcome
    
    -- Pricing
    price DECIMAL(10, 6) NOT NULL,
    quantity DECIMAL(24, 6) NOT NULL,
    total_value DECIMAL(24, 6),            -- price * quantity
    fee DECIMAL(24, 6) DEFAULT 0,
    
    -- Parties
    maker_address VARCHAR(255),
    taker_address VARCHAR(255),
    
    -- Blockchain data (if applicable)
    block_number BIGINT,
    transaction_hash VARCHAR(255),
    log_index INTEGER,
    
    -- Timing
    traded_at TIMESTAMPTZ NOT NULL,
    
    -- Tracking
    ingested_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Primary key must include partition column
    PRIMARY KEY (id, traded_at),
    
    -- Composite unique for deduplication (must include partition key)
    UNIQUE (source, source_trade_id, traded_at)
) PARTITION BY RANGE (traded_at);

-- Create monthly partitions for trades (last 12 months + future)
CREATE TABLE predictions_silver.trades_2025_01 
    PARTITION OF predictions_silver.trades 
    FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');

CREATE TABLE predictions_silver.trades_2025_02 
    PARTITION OF predictions_silver.trades 
    FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');

CREATE TABLE predictions_silver.trades_2025_03 
    PARTITION OF predictions_silver.trades 
    FOR VALUES FROM ('2025-03-01') TO ('2025-04-01');

CREATE TABLE predictions_silver.trades_2025_04 
    PARTITION OF predictions_silver.trades 
    FOR VALUES FROM ('2025-04-01') TO ('2025-05-01');

CREATE TABLE predictions_silver.trades_2025_05 
    PARTITION OF predictions_silver.trades 
    FOR VALUES FROM ('2025-05-01') TO ('2025-06-01');

CREATE TABLE predictions_silver.trades_2025_06 
    PARTITION OF predictions_silver.trades 
    FOR VALUES FROM ('2025-06-01') TO ('2025-07-01');

CREATE TABLE predictions_silver.trades_2025_07 
    PARTITION OF predictions_silver.trades 
    FOR VALUES FROM ('2025-07-01') TO ('2025-08-01');

CREATE TABLE predictions_silver.trades_2025_08 
    PARTITION OF predictions_silver.trades 
    FOR VALUES FROM ('2025-08-01') TO ('2025-09-01');

CREATE TABLE predictions_silver.trades_2025_09 
    PARTITION OF predictions_silver.trades 
    FOR VALUES FROM ('2025-09-01') TO ('2025-10-01');

CREATE TABLE predictions_silver.trades_2025_10 
    PARTITION OF predictions_silver.trades 
    FOR VALUES FROM ('2025-10-01') TO ('2025-11-01');

CREATE TABLE predictions_silver.trades_2025_11 
    PARTITION OF predictions_silver.trades 
    FOR VALUES FROM ('2025-11-01') TO ('2025-12-01');

CREATE TABLE predictions_silver.trades_2025_12 
    PARTITION OF predictions_silver.trades 
    FOR VALUES FROM ('2025-12-01') TO ('2026-01-01');

CREATE TABLE predictions_silver.trades_2026_01 
    PARTITION OF predictions_silver.trades 
    FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');

CREATE TABLE predictions_silver.trades_2026_02 
    PARTITION OF predictions_silver.trades 
    FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');

CREATE TABLE predictions_silver.trades_2026_03 
    PARTITION OF predictions_silver.trades 
    FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');

-- Default partition for overflow
CREATE TABLE predictions_silver.trades_default 
    PARTITION OF predictions_silver.trades DEFAULT;

-- =============================================================================
-- TRADES INDEXES
-- =============================================================================

-- Time-series queries (most common)
CREATE INDEX idx_trades_time 
    ON predictions_silver.trades (traded_at DESC);

-- Market-specific trade history
CREATE INDEX idx_trades_market_time 
    ON predictions_silver.trades (source_market_id, traded_at DESC);

-- Source filtering
CREATE INDEX idx_trades_source_time 
    ON predictions_silver.trades (source, traded_at DESC);

-- Volume analysis by market
CREATE INDEX idx_trades_market_volume 
    ON predictions_silver.trades (source_market_id, total_value DESC NULLS LAST);

-- Trader analysis
CREATE INDEX idx_trades_maker 
    ON predictions_silver.trades (maker_address, traded_at DESC) 
    WHERE maker_address IS NOT NULL;

CREATE INDEX idx_trades_taker 
    ON predictions_silver.trades (taker_address, traded_at DESC) 
    WHERE taker_address IS NOT NULL;

-- =============================================================================
-- PRICES TABLE (Time-Series Snapshots)
-- =============================================================================
-- Price snapshots taken at regular intervals for charting and analysis

CREATE TABLE IF NOT EXISTS predictions_silver.prices (
    id UUID DEFAULT gen_random_uuid(),
    
    -- Source identification
    source VARCHAR(50) NOT NULL,
    source_market_id VARCHAR(500) NOT NULL,
    
    -- Market reference (optional FK for joins)
    market_id UUID,
    
    -- Price data
    yes_price DECIMAL(10, 6),
    no_price DECIMAL(10, 6),
    mid_price DECIMAL(10, 6),
    
    -- Spread
    best_bid DECIMAL(10, 6),
    best_ask DECIMAL(10, 6),
    spread DECIMAL(10, 6),
    
    -- Volume in period
    volume_1h DECIMAL(24, 6) DEFAULT 0,
    trade_count_1h INTEGER DEFAULT 0,
    
    -- OHLCV for candles (if available)
    open_price DECIMAL(10, 6),
    high_price DECIMAL(10, 6),
    low_price DECIMAL(10, 6),
    close_price DECIMAL(10, 6),
    
    -- Timestamp (the snapshot time)
    snapshot_at TIMESTAMPTZ NOT NULL,
    
    -- Composite primary key for time-series
    PRIMARY KEY (source, source_market_id, snapshot_at)
) PARTITION BY RANGE (snapshot_at);

-- Create weekly partitions for prices (more granular than trades)
CREATE TABLE predictions_silver.prices_2026_w01 
    PARTITION OF predictions_silver.prices 
    FOR VALUES FROM ('2025-12-30') TO ('2026-01-06');

CREATE TABLE predictions_silver.prices_2026_w02 
    PARTITION OF predictions_silver.prices 
    FOR VALUES FROM ('2026-01-06') TO ('2026-01-13');

CREATE TABLE predictions_silver.prices_2026_w03 
    PARTITION OF predictions_silver.prices 
    FOR VALUES FROM ('2026-01-13') TO ('2026-01-20');

CREATE TABLE predictions_silver.prices_2026_w04 
    PARTITION OF predictions_silver.prices 
    FOR VALUES FROM ('2026-01-20') TO ('2026-01-27');

CREATE TABLE predictions_silver.prices_2026_w05 
    PARTITION OF predictions_silver.prices 
    FOR VALUES FROM ('2026-01-27') TO ('2026-02-03');

CREATE TABLE predictions_silver.prices_2026_w06 
    PARTITION OF predictions_silver.prices 
    FOR VALUES FROM ('2026-02-03') TO ('2026-02-10');

CREATE TABLE predictions_silver.prices_2026_w07 
    PARTITION OF predictions_silver.prices 
    FOR VALUES FROM ('2026-02-10') TO ('2026-02-17');

CREATE TABLE predictions_silver.prices_2026_w08 
    PARTITION OF predictions_silver.prices 
    FOR VALUES FROM ('2026-02-17') TO ('2026-02-24');

CREATE TABLE predictions_silver.prices_default 
    PARTITION OF predictions_silver.prices DEFAULT;

-- =============================================================================
-- PRICES INDEXES
-- =============================================================================

-- Primary time-series query
CREATE INDEX idx_prices_market_time 
    ON predictions_silver.prices (source_market_id, snapshot_at DESC);

-- Cross-market time slice
CREATE INDEX idx_prices_time 
    ON predictions_silver.prices (snapshot_at DESC);

-- =============================================================================
-- ORDERBOOK SNAPSHOTS
-- =============================================================================
-- Orderbook depth at specific points in time

CREATE TABLE IF NOT EXISTS predictions_silver.orderbooks (
    id UUID DEFAULT gen_random_uuid(),
    
    -- Source identification
    source VARCHAR(50) NOT NULL,
    source_market_id VARCHAR(500) NOT NULL,
    
    -- Market reference
    market_id UUID,
    
    -- Top of book (denormalized for fast queries)
    best_bid DECIMAL(10, 6),
    best_ask DECIMAL(10, 6),
    spread DECIMAL(10, 6),
    mid_price DECIMAL(10, 6),
    
    -- Depth metrics
    bid_depth_10pct DECIMAL(24, 6),        -- Liquidity within 10% of mid
    ask_depth_10pct DECIMAL(24, 6),
    total_bid_depth DECIMAL(24, 6),
    total_ask_depth DECIMAL(24, 6),
    
    -- Full orderbook (top N levels)
    bids JSONB,                            -- [{price, size, orders}]
    asks JSONB,                            -- [{price, size, orders}]
    
    -- Timestamp
    snapshot_at TIMESTAMPTZ NOT NULL,
    
    PRIMARY KEY (source, source_market_id, snapshot_at)
) PARTITION BY RANGE (snapshot_at);

-- Weekly partitions
CREATE TABLE predictions_silver.orderbooks_2026_w04 
    PARTITION OF predictions_silver.orderbooks 
    FOR VALUES FROM ('2026-01-20') TO ('2026-01-27');

CREATE TABLE predictions_silver.orderbooks_2026_w05 
    PARTITION OF predictions_silver.orderbooks 
    FOR VALUES FROM ('2026-01-27') TO ('2026-02-03');

CREATE TABLE predictions_silver.orderbooks_default 
    PARTITION OF predictions_silver.orderbooks DEFAULT;

-- Index for time-series queries
CREATE INDEX idx_orderbooks_market_time 
    ON predictions_silver.orderbooks (source_market_id, snapshot_at DESC);

-- =============================================================================
-- CROSS-PLATFORM MARKET MAPPINGS
-- =============================================================================
-- Links equivalent markets across different platforms for arbitrage detection

CREATE TABLE IF NOT EXISTS predictions_silver.market_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Canonical identifier
    canonical_id VARCHAR(255) NOT NULL,
    canonical_title TEXT,
    canonical_question TEXT,
    
    -- Source market references (NULL if not available on that platform)
    polymarket_market_id VARCHAR(500),
    kalshi_market_id VARCHAR(500),
    limitless_market_id VARCHAR(500),
    opiniontrade_market_id VARCHAR(500),
    
    -- Matching metadata
    match_method VARCHAR(50),              -- 'exact', 'fuzzy', 'manual', 'ml'
    match_score DECIMAL(5, 4),             -- 0.0 to 1.0 confidence
    
    -- Price comparison (latest)
    polymarket_yes_price DECIMAL(10, 6),
    kalshi_yes_price DECIMAL(10, 6),
    limitless_yes_price DECIMAL(10, 6),
    
    -- Arbitrage opportunity (computed)
    max_price_diff DECIMAL(10, 6),
    has_arbitrage BOOLEAN DEFAULT false,
    
    -- Status
    is_verified BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    
    -- Tracking
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Ensure uniqueness per source
    UNIQUE (polymarket_market_id),
    UNIQUE (kalshi_market_id),
    UNIQUE (limitless_market_id)
);

CREATE INDEX idx_mappings_arbitrage 
    ON predictions_silver.market_mappings (has_arbitrage, max_price_diff DESC) 
    WHERE is_active = true AND has_arbitrage = true;

CREATE INDEX idx_mappings_polymarket 
    ON predictions_silver.market_mappings (polymarket_market_id) 
    WHERE polymarket_market_id IS NOT NULL;

CREATE INDEX idx_mappings_kalshi 
    ON predictions_silver.market_mappings (kalshi_market_id) 
    WHERE kalshi_market_id IS NOT NULL;

-- =============================================================================
-- CATEGORIES TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS predictions_silver.categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    source VARCHAR(50) NOT NULL,
    source_category_id VARCHAR(100) NOT NULL,
    
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255),
    description TEXT,
    
    -- Hierarchy
    parent_id UUID REFERENCES predictions_silver.categories(id),
    level INTEGER DEFAULT 0,
    
    -- Stats (computed)
    market_count INTEGER DEFAULT 0,
    active_market_count INTEGER DEFAULT 0,
    
    -- Media
    icon_url TEXT,
    
    -- Tracking
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE (source, source_category_id)
);

CREATE INDEX idx_categories_source ON predictions_silver.categories (source);

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE predictions_silver.markets IS 
    'Unified market data across all prediction market platforms. Denormalized for query performance.';

COMMENT ON TABLE predictions_silver.trades IS 
    'All trades across platforms. Partitioned by month for efficient time-range queries.';

COMMENT ON TABLE predictions_silver.prices IS 
    'Hourly price snapshots for charting. Partitioned by week.';

COMMENT ON TABLE predictions_silver.market_mappings IS 
    'Cross-platform market matching for arbitrage detection and unified views.';

COMMENT ON COLUMN predictions_silver.markets.extra_data IS 
    'Source-specific fields that don''t fit the unified schema. Query with ->> operator.';
