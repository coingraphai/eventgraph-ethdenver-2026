-- Intelligence Dashboard Cache Table
-- Stores snapshots of dashboard data for faster serving

CREATE TABLE IF NOT EXISTS intelligence_cache (
    id SERIAL PRIMARY KEY,
    cache_key VARCHAR(100) UNIQUE NOT NULL,
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    version INTEGER DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_intelligence_cache_key ON intelligence_cache(cache_key);
CREATE INDEX IF NOT EXISTS idx_intelligence_cache_expires ON intelligence_cache(expires_at);

-- Historical snapshots for trend analysis
CREATE TABLE IF NOT EXISTS intelligence_snapshots (
    id SERIAL PRIMARY KEY,
    snapshot_time TIMESTAMPTZ DEFAULT NOW(),
    total_markets INTEGER,
    total_volume DECIMAL(20, 2),
    platform_data JSONB,
    category_data JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_intelligence_snapshots_time ON intelligence_snapshots(snapshot_time DESC);

-- Keep only last 30 days of snapshots
-- Can be run as a scheduled job
-- DELETE FROM intelligence_snapshots WHERE snapshot_time < NOW() - INTERVAL '30 days';

COMMENT ON TABLE intelligence_cache IS 'Stores cached dashboard data to reduce API calls';
COMMENT ON TABLE intelligence_snapshots IS 'Historical snapshots for trend charts and analytics';
