-- =============================================================================
-- Migration: 013_fix_event_markets_schema.sql
-- Description: Fix critical issues in event_markets table for API compatibility
-- Date: 2026-02-02
-- Priority: P0/P1 - Immediate fixes for production issues
-- =============================================================================

-- Issue 1: UUID type causes pydantic validation errors in API
-- Issue 2: Missing no_price, liquidity, status, end_date columns
-- Issue 3: Snapshot bloat - need latest-only view for API queries

SET search_path TO predictions_gold, public;

BEGIN;

-- =============================================================================
-- FIX 1: Change market_id from UUID to VARCHAR
-- =============================================================================
-- UUIDs cause serialization errors in FastAPI/Pydantic
-- VARCHAR supports all platform ID formats (hex strings, numbers, tickers)

ALTER TABLE predictions_gold.event_markets 
    ALTER COLUMN market_id TYPE VARCHAR(500) USING market_id::TEXT;

COMMENT ON COLUMN predictions_gold.event_markets.market_id IS 
    'Platform-agnostic market identifier. Supports UUIDs, hex strings, numeric IDs, and tickers.';

-- =============================================================================
-- FIX 2: Add missing columns for complete market representation
-- =============================================================================

-- Add no_price (complement of yes_price)
ALTER TABLE predictions_gold.event_markets
    ADD COLUMN IF NOT EXISTS no_price NUMERIC(10, 6);

COMMENT ON COLUMN predictions_gold.event_markets.no_price IS 
    'No/False outcome price (0-1 range). Computed as 1 - yes_price if not provided.';

-- Add mid_price (average of yes/no)
ALTER TABLE predictions_gold.event_markets
    ADD COLUMN IF NOT EXISTS mid_price NUMERIC(10, 6);

COMMENT ON COLUMN predictions_gold.event_markets.mid_price IS 
    'Mid-market price: (yes_price + no_price) / 2';

-- Add liquidity (available for Polymarket, null for others)
ALTER TABLE predictions_gold.event_markets
    ADD COLUMN IF NOT EXISTS liquidity NUMERIC(20, 2);

COMMENT ON COLUMN predictions_gold.event_markets.liquidity IS 
    'Market liquidity in USD. Available for Polymarket, NULL for other platforms.';

-- Add status (active, closed, resolved)
ALTER TABLE predictions_gold.event_markets
    ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active';

COMMENT ON COLUMN predictions_gold.event_markets.status IS 
    'Market status: active (trading), closed (no new trades), resolved (outcome determined)';

-- Add end_date
ALTER TABLE predictions_gold.event_markets
    ADD COLUMN IF NOT EXISTS end_date TIMESTAMPTZ;

COMMENT ON COLUMN predictions_gold.event_markets.end_date IS 
    'Market close/expiration date. NULL for markets without fixed end date.';

-- Add source_market_id for traceability
ALTER TABLE predictions_gold.event_markets
    ADD COLUMN IF NOT EXISTS source_market_id VARCHAR(500);

COMMENT ON COLUMN predictions_gold.event_markets.source_market_id IS 
    'Original market ID from source platform (before UUID conversion)';

-- Add data quality score
ALTER TABLE predictions_gold.event_markets
    ADD COLUMN IF NOT EXISTS data_quality_score INTEGER DEFAULT 100;

COMMENT ON COLUMN predictions_gold.event_markets.data_quality_score IS 
    'Data completeness score (0-100). 100 = all fields populated, decreases for missing data.';

-- =============================================================================
-- FIX 3: Create indexes for better query performance
-- =============================================================================

-- Index for latest snapshot lookup (used by API)
CREATE INDEX IF NOT EXISTS idx_event_markets_latest 
    ON predictions_gold.event_markets (event_id, market_id, platform, snapshot_at DESC);

-- Index for platform-specific queries
CREATE INDEX IF NOT EXISTS idx_event_markets_platform_event 
    ON predictions_gold.event_markets (platform, event_id, snapshot_at DESC);

-- =============================================================================
-- FIX 4: Create view for latest snapshot only (API optimization)
-- =============================================================================

CREATE OR REPLACE VIEW predictions_gold.event_markets_latest AS
SELECT DISTINCT ON (event_id, market_id, platform)
    id,
    event_id,
    platform,
    market_id,
    market_title,
    market_slug,
    yes_price,
    no_price,
    mid_price,
    volume_total,
    volume_24h,
    liquidity,
    status,
    end_date,
    rank_in_event,
    source_url,
    source_market_id,
    data_quality_score,
    snapshot_at
FROM predictions_gold.event_markets
ORDER BY event_id, market_id, platform, snapshot_at DESC;

COMMENT ON VIEW predictions_gold.event_markets_latest IS 
    'Latest snapshot of each market per event. Use this view in API queries to avoid snapshot bloat.';

-- =============================================================================
-- FIX 5: Backfill computed fields
-- =============================================================================

-- Compute no_price from yes_price where missing
UPDATE predictions_gold.event_markets
SET no_price = 1 - yes_price
WHERE yes_price IS NOT NULL 
  AND no_price IS NULL
  AND yes_price BETWEEN 0 AND 1;

-- Compute mid_price
UPDATE predictions_gold.event_markets
SET mid_price = (yes_price + COALESCE(no_price, 1 - yes_price)) / 2.0
WHERE yes_price IS NOT NULL 
  AND mid_price IS NULL;

-- Set default yes_price for markets with NULL (use 0.5 = 50/50 odds)
UPDATE predictions_gold.event_markets
SET yes_price = 0.5,
    no_price = 0.5,
    mid_price = 0.5
WHERE yes_price IS NULL;

-- Copy source_market_id if not set
UPDATE predictions_gold.event_markets em
SET source_market_id = market_id
WHERE source_market_id IS NULL;

-- Calculate data quality score
-- 100 points base, deduct 10 for each missing critical field
UPDATE predictions_gold.event_markets
SET data_quality_score = 100
    - (CASE WHEN yes_price IS NULL THEN 15 ELSE 0 END)
    - (CASE WHEN no_price IS NULL THEN 10 ELSE 0 END)
    - (CASE WHEN volume_total IS NULL OR volume_total = 0 THEN 10 ELSE 0 END)
    - (CASE WHEN volume_24h IS NULL THEN 5 ELSE 0 END)
    - (CASE WHEN market_title IS NULL OR market_title = '' THEN 20 ELSE 0 END)
    - (CASE WHEN end_date IS NULL THEN 5 ELSE 0 END)
    - (CASE WHEN liquidity IS NULL AND platform = 'polymarket' THEN 10 ELSE 0 END);

-- =============================================================================
-- FIX 6: Create helper function for data quality monitoring
-- =============================================================================

CREATE OR REPLACE FUNCTION predictions_gold.get_data_quality_stats()
RETURNS TABLE (
    platform VARCHAR(50),
    total_markets BIGINT,
    avg_quality_score NUMERIC(5,2),
    markets_with_prices BIGINT,
    markets_with_volume BIGINT,
    markets_with_liquidity BIGINT,
    last_updated TIMESTAMP
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        em.platform,
        COUNT(DISTINCT em.market_id) as total_markets,
        AVG(em.data_quality_score)::NUMERIC(5,2) as avg_quality_score,
        COUNT(DISTINCT em.market_id) FILTER (WHERE em.yes_price IS NOT NULL) as markets_with_prices,
        COUNT(DISTINCT em.market_id) FILTER (WHERE em.volume_total > 0) as markets_with_volume,
        COUNT(DISTINCT em.market_id) FILTER (WHERE em.liquidity IS NOT NULL) as markets_with_liquidity,
        MAX(em.snapshot_at)::TIMESTAMP as last_updated
    FROM predictions_gold.event_markets_latest em
    GROUP BY em.platform
    ORDER BY total_markets DESC;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION predictions_gold.get_data_quality_stats() IS 
    'Monitor data quality and completeness across platforms';

COMMIT;

-- =============================================================================
-- Verification Queries
-- =============================================================================

-- Check data quality by platform
SELECT * FROM predictions_gold.get_data_quality_stats();

-- Sample markets from latest view
SELECT 
    platform,
    event_id,
    market_title,
    yes_price,
    no_price,
    volume_total,
    data_quality_score
FROM predictions_gold.event_markets_latest
WHERE platform = 'polymarket'
LIMIT 5;

-- Count snapshots vs latest
SELECT 
    'Total snapshots' as metric,
    COUNT(*) as count
FROM predictions_gold.event_markets
UNION ALL
SELECT 
    'Latest only' as metric,
    COUNT(*) as count
FROM predictions_gold.event_markets_latest;

-- =============================================================================
-- Rollback Script (if needed)
-- =============================================================================
/*
BEGIN;

-- Drop view
DROP VIEW IF EXISTS predictions_gold.event_markets_latest;

-- Drop function
DROP FUNCTION IF EXISTS predictions_gold.get_data_quality_stats();

-- Remove new columns
ALTER TABLE predictions_gold.event_markets
    DROP COLUMN IF EXISTS no_price,
    DROP COLUMN IF EXISTS mid_price,
    DROP COLUMN IF EXISTS liquidity,
    DROP COLUMN IF EXISTS status,
    DROP COLUMN IF EXISTS end_date,
    DROP COLUMN IF EXISTS source_market_id,
    DROP COLUMN IF EXISTS data_quality_score;

-- Revert market_id to UUID (if needed)
-- ALTER TABLE predictions_gold.event_markets 
--     ALTER COLUMN market_id TYPE UUID USING market_id::UUID;

COMMIT;
*/
