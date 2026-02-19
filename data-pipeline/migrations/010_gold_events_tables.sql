-- Migration: 010_gold_events_tables.sql
-- Description: Events grouping and analytics tables
-- Created: 2026-01-31
-- Purpose: Support events API endpoints for grouping related markets
--
-- Tables created:
--   1. events_snapshot - Event groupings with metadata
--   2. event_markets - Event-to-market mapping
--   3. events_aggregate_metrics - Platform-level event statistics

-- =====================================================
-- Table 1: events_snapshot
-- Purpose: Store event groupings with metadata
-- Update Frequency: Every 15 minutes
-- =====================================================
CREATE TABLE IF NOT EXISTS predictions_gold.events_snapshot (
    id BIGSERIAL PRIMARY KEY,
    snapshot_at TIMESTAMP NOT NULL DEFAULT NOW(),
    event_id VARCHAR(255) NOT NULL,
    platform VARCHAR(20) NOT NULL,
    title TEXT NOT NULL,
    category VARCHAR(50),
    image_url VARCHAR(500),
    market_count INTEGER DEFAULT 0,
    total_volume NUMERIC(20,2) DEFAULT 0,
    volume_24h NUMERIC(20,2) DEFAULT 0,
    volume_1_week NUMERIC(20,2) DEFAULT 0,
    start_time TIMESTAMP,
    end_time TIMESTAMP,
    status VARCHAR(20) DEFAULT 'open',
    tags JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_events_snapshot_platform 
    ON predictions_gold.events_snapshot(snapshot_at DESC, platform);
CREATE INDEX IF NOT EXISTS idx_events_event_lookup 
    ON predictions_gold.events_snapshot(event_id, platform, snapshot_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_snapshot_unique 
    ON predictions_gold.events_snapshot(event_id, platform, snapshot_at);

-- =====================================================
-- Table 2: event_markets
-- Purpose: Map markets to their parent events
-- Update Frequency: Every 15 minutes
-- =====================================================
CREATE TABLE IF NOT EXISTS predictions_gold.event_markets (
    id BIGSERIAL PRIMARY KEY,
    event_id VARCHAR(255) NOT NULL,
    platform VARCHAR(20) NOT NULL,
    market_id UUID NOT NULL,
    market_title TEXT,
    market_slug VARCHAR(255),
    yes_price NUMERIC(10,6),
    volume_total NUMERIC(20,2),
    volume_24h NUMERIC(20,2),
    rank_in_event INTEGER,
    snapshot_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_event_markets_lookup 
    ON predictions_gold.event_markets(event_id, platform, snapshot_at DESC);
CREATE INDEX IF NOT EXISTS idx_market_to_event 
    ON predictions_gold.event_markets(market_id, event_id);
CREATE INDEX IF NOT EXISTS idx_event_markets_snapshot 
    ON predictions_gold.event_markets(snapshot_at DESC);

-- =====================================================
-- Table 3: events_aggregate_metrics
-- Purpose: Pre-computed platform-level event statistics
-- Update Frequency: Every 15 minutes
-- =====================================================
CREATE TABLE IF NOT EXISTS predictions_gold.events_aggregate_metrics (
    id BIGSERIAL PRIMARY KEY,
    snapshot_at TIMESTAMP NOT NULL DEFAULT NOW(),
    platform VARCHAR(20),
    total_events INTEGER,
    total_markets INTEGER,
    total_volume NUMERIC(20,2),
    volume_24h NUMERIC(20,2),
    avg_markets_per_event NUMERIC(10,2)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_events_aggregate_snapshot 
    ON predictions_gold.events_aggregate_metrics(snapshot_at DESC, platform);
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_aggregate_unique 
    ON predictions_gold.events_aggregate_metrics(snapshot_at, platform);

-- =====================================================
-- Comments for documentation
-- =====================================================
COMMENT ON TABLE predictions_gold.events_snapshot IS 
    'Event groupings with metadata - groups related markets together';

COMMENT ON TABLE predictions_gold.event_markets IS 
    'Event-to-market mapping table linking markets to their parent events';

COMMENT ON TABLE predictions_gold.events_aggregate_metrics IS 
    'Platform-level aggregate statistics for events';
