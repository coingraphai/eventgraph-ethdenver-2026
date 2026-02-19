-- =============================================================================
-- Predictions Terminal - Performance Optimization & Maintenance
-- =============================================================================
-- Additional indexes, statistics, and maintenance procedures
-- =============================================================================

-- =============================================================================
-- ADDITIONAL PERFORMANCE INDEXES
-- =============================================================================

-- Partial index for active markets only (most common query)
CREATE INDEX IF NOT EXISTS idx_markets_active_hot 
    ON predictions_silver.markets (source, volume_24h DESC, yes_price)
    INCLUDE (title, category_name, end_date)
    WHERE is_active = true AND volume_24h > 0;

-- Covering index for market list queries
CREATE INDEX IF NOT EXISTS idx_markets_list_cover 
    ON predictions_silver.markets (source, is_active, status)
    INCLUDE (title, yes_price, no_price, volume_24h, end_date, slug);

-- Trades: composite for market trade history API
CREATE INDEX IF NOT EXISTS idx_trades_market_history 
    ON predictions_silver.trades (source_market_id, traded_at DESC)
    INCLUDE (side, price, quantity, total_value);

-- =============================================================================
-- STATISTICS CONFIGURATION
-- =============================================================================

-- Increase statistics targets for frequently filtered columns
ALTER TABLE predictions_silver.markets 
    ALTER COLUMN source SET STATISTICS 1000;
ALTER TABLE predictions_silver.markets 
    ALTER COLUMN category_name SET STATISTICS 500;
ALTER TABLE predictions_silver.markets 
    ALTER COLUMN status SET STATISTICS 100;

ALTER TABLE predictions_silver.trades 
    ALTER COLUMN source SET STATISTICS 1000;
ALTER TABLE predictions_silver.trades 
    ALTER COLUMN source_market_id SET STATISTICS 1000;

-- =============================================================================
-- HELPER FUNCTIONS
-- =============================================================================

-- Function to get market with latest price in one query
CREATE OR REPLACE FUNCTION predictions_silver.get_market_with_price(
    p_source VARCHAR(50),
    p_market_id VARCHAR(500)
)
RETURNS TABLE (
    market_id UUID,
    title TEXT,
    yes_price DECIMAL,
    no_price DECIMAL,
    volume_24h DECIMAL,
    latest_price_time TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        m.id,
        m.title,
        COALESCE(p.yes_price, m.yes_price) AS yes_price,
        COALESCE(p.no_price, m.no_price) AS no_price,
        m.volume_24h,
        p.snapshot_at AS latest_price_time
    FROM predictions_silver.markets m
    LEFT JOIN LATERAL (
        SELECT pp.yes_price, pp.no_price, pp.snapshot_at
        FROM predictions_silver.prices pp
        WHERE pp.source = m.source 
          AND pp.source_market_id = m.source_market_id
        ORDER BY pp.snapshot_at DESC
        LIMIT 1
    ) p ON true
    WHERE m.source = p_source 
      AND m.source_market_id = p_market_id;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to calculate volume for time range
CREATE OR REPLACE FUNCTION predictions_silver.calculate_volume(
    p_source_market_id VARCHAR(500),
    p_hours INTEGER DEFAULT 24
)
RETURNS TABLE (
    trade_count BIGINT,
    total_volume DECIMAL,
    avg_price DECIMAL,
    vwap DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*)::BIGINT,
        SUM(t.total_value),
        AVG(t.price),
        SUM(t.price * t.quantity) / NULLIF(SUM(t.quantity), 0)
    FROM predictions_silver.trades t
    WHERE t.source_market_id = p_source_market_id
      AND t.traded_at >= NOW() - (p_hours || ' hours')::INTERVAL;
END;
$$ LANGUAGE plpgsql STABLE;

-- =============================================================================
-- MAINTENANCE PROCEDURES
-- =============================================================================

-- Procedure to maintain partitions (create future, drop old)
CREATE OR REPLACE PROCEDURE predictions_silver.maintain_trade_partitions()
LANGUAGE plpgsql AS $$
DECLARE
    v_next_month DATE;
    v_month_after DATE;
    v_partition_name TEXT;
    v_sql TEXT;
BEGIN
    -- Create partition for next month if it doesn't exist
    v_next_month := DATE_TRUNC('month', NOW() + INTERVAL '1 month')::DATE;
    v_month_after := DATE_TRUNC('month', NOW() + INTERVAL '2 months')::DATE;
    v_partition_name := 'trades_' || TO_CHAR(v_next_month, 'YYYY_MM');
    
    -- Check if partition exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'predictions_silver'
          AND c.relname = v_partition_name
    ) THEN
        v_sql := FORMAT(
            'CREATE TABLE predictions_silver.%I PARTITION OF predictions_silver.trades FOR VALUES FROM (%L) TO (%L)',
            v_partition_name,
            v_next_month,
            v_month_after
        );
        EXECUTE v_sql;
        RAISE NOTICE 'Created partition: %', v_partition_name;
    END IF;
END;
$$;

-- Procedure to update market volume statistics
CREATE OR REPLACE PROCEDURE predictions_silver.update_market_volumes()
LANGUAGE plpgsql AS $$
BEGIN
    -- Update 24h volume
    UPDATE predictions_silver.markets m
    SET 
        volume_24h = COALESCE(v.volume, 0),
        trade_count_24h = COALESCE(v.trade_count, 0),
        last_updated_at = NOW()
    FROM (
        SELECT 
            source_market_id,
            source,
            SUM(total_value) AS volume,
            COUNT(*) AS trade_count
        FROM predictions_silver.trades
        WHERE traded_at >= NOW() - INTERVAL '24 hours'
        GROUP BY source_market_id, source
    ) v
    WHERE m.source = v.source 
      AND m.source_market_id = v.source_market_id;
    
    -- Update 7d volume
    UPDATE predictions_silver.markets m
    SET volume_7d = COALESCE(v.volume, 0)
    FROM (
        SELECT 
            source_market_id,
            source,
            SUM(total_value) AS volume
        FROM predictions_silver.trades
        WHERE traded_at >= NOW() - INTERVAL '7 days'
        GROUP BY source_market_id, source
    ) v
    WHERE m.source = v.source 
      AND m.source_market_id = v.source_market_id;
      
    COMMIT;
END;
$$;

-- Procedure to vacuum analyze after large loads
CREATE OR REPLACE PROCEDURE predictions_silver.post_load_maintenance()
LANGUAGE plpgsql AS $$
BEGIN
    -- Analyze tables for query planner
    ANALYZE predictions_silver.markets;
    ANALYZE predictions_silver.trades;
    ANALYZE predictions_silver.prices;
    
    RAISE NOTICE 'Completed post-load maintenance';
END;
$$;

-- =============================================================================
-- QUERY PERFORMANCE VIEWS (optional - requires pg_stat_statements extension)
-- =============================================================================

-- Skipping pg_stat_statements based views - not available on all managed databases

-- =============================================================================
-- TABLE SIZE MONITORING
-- =============================================================================

-- Simple table size view that works on all PostgreSQL instances
CREATE OR REPLACE VIEW predictions_gold.table_sizes AS
SELECT 
    t.schemaname || '.' || t.relname AS table_name,
    pg_size_pretty(pg_total_relation_size(t.relid)) AS total_size,
    pg_size_pretty(pg_relation_size(t.relid)) AS table_size,
    pg_size_pretty(pg_indexes_size(t.relid)) AS index_size,
    t.n_live_tup AS row_count,
    t.last_vacuum,
    t.last_analyze
FROM pg_stat_user_tables t
WHERE t.schemaname IN ('predictions_silver', 'predictions_gold', 'bronze')
ORDER BY pg_total_relation_size(t.relid) DESC;

-- =============================================================================
-- GRANTS (adjust based on your roles)
-- =============================================================================

-- Read-only role for analytics
-- CREATE ROLE predictions_reader;
-- GRANT USAGE ON SCHEMA predictions_silver TO predictions_reader;
-- GRANT USAGE ON SCHEMA predictions_gold TO predictions_reader;
-- GRANT SELECT ON ALL TABLES IN SCHEMA predictions_silver TO predictions_reader;
-- GRANT SELECT ON ALL TABLES IN SCHEMA predictions_gold TO predictions_reader;

-- Write role for ingestion
-- CREATE ROLE predictions_writer;
-- GRANT USAGE ON SCHEMA predictions_bronze TO predictions_writer;
-- GRANT USAGE ON SCHEMA predictions_silver TO predictions_writer;
-- GRANT USAGE ON SCHEMA predictions_ingestion TO predictions_writer;
-- GRANT ALL ON ALL TABLES IN SCHEMA predictions_bronze TO predictions_writer;
-- GRANT ALL ON ALL TABLES IN SCHEMA predictions_silver TO predictions_writer;
-- GRANT ALL ON ALL TABLES IN SCHEMA predictions_ingestion TO predictions_writer;
