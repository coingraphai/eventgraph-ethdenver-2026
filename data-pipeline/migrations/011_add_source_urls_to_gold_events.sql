-- Migration: 011_add_source_urls_to_gold_events.sql
-- Description: Add source_url field to Gold events tables
-- Created: 2026-01-31
-- Purpose: Include market URLs for frontend display

-- Add source_url to events_snapshot (will be NULL for event-level, set for single-market events)
ALTER TABLE predictions_gold.events_snapshot 
ADD COLUMN IF NOT EXISTS source_url VARCHAR(500);

-- Add source_url to event_markets (market-specific URL)
ALTER TABLE predictions_gold.event_markets 
ADD COLUMN IF NOT EXISTS source_url VARCHAR(500);

-- Create index for URL lookups
CREATE INDEX IF NOT EXISTS idx_events_snapshot_url 
    ON predictions_gold.events_snapshot(source_url) 
    WHERE source_url IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_event_markets_url 
    ON predictions_gold.event_markets(source_url) 
    WHERE source_url IS NOT NULL;

COMMENT ON COLUMN predictions_gold.events_snapshot.source_url IS 'URL to the event or representative market on the platform';
COMMENT ON COLUMN predictions_gold.event_markets.source_url IS 'URL to the specific market on the platform';
