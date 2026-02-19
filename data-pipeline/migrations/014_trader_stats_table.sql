-- Migration 014: Trader Statistics Table
-- Tracks trader performance across platforms for leaderboard

CREATE TABLE IF NOT EXISTS trader_stats (
    id SERIAL PRIMARY KEY,
    wallet_address TEXT NOT NULL,
    platform TEXT NOT NULL,
    
    -- Performance metrics
    total_pnl DECIMAL(15, 2) DEFAULT 0,
    pnl_24h DECIMAL(15, 2) DEFAULT 0,
    pnl_7d DECIMAL(15, 2) DEFAULT 0,
    pnl_30d DECIMAL(15, 2) DEFAULT 0,
    
    -- Trading activity
    total_volume DECIMAL(15, 2) DEFAULT 0,
    volume_24h DECIMAL(15, 2) DEFAULT 0,
    volume_7d DECIMAL(15, 2) DEFAULT 0,
    volume_30d DECIMAL(15, 2) DEFAULT 0,
    
    -- Trade counts
    total_trades INTEGER DEFAULT 0,
    trades_24h INTEGER DEFAULT 0,
    trades_7d INTEGER DEFAULT 0,
    trades_30d INTEGER DEFAULT 0,
    
    -- Win statistics
    total_wins INTEGER DEFAULT 0,
    total_losses INTEGER DEFAULT 0,
    win_rate DECIMAL(5, 4) DEFAULT 0,
    
    -- Other metrics
    avg_position_size DECIMAL(15, 2) DEFAULT 0,
    largest_win DECIMAL(15, 2) DEFAULT 0,
    largest_loss DECIMAL(15, 2) DEFAULT 0,
    roi_percent DECIMAL(10, 4) DEFAULT 0,
    sharpe_ratio DECIMAL(10, 4) DEFAULT 0,
    max_drawdown_percent DECIMAL(10, 4) DEFAULT 0,
    consistency_score DECIMAL(5, 4) DEFAULT 0,
    
    -- Trading style indicators
    avg_hold_duration_hours DECIMAL(10, 2) DEFAULT 0,
    is_whale BOOLEAN DEFAULT FALSE,
    is_active_7d BOOLEAN DEFAULT FALSE,
    strategy_type TEXT, -- 'scalper', 'swing_trader', 'long_term', 'arbitrageur', 'mixed'
    
    -- Market specialization (top 3 markets by volume)
    top_market_1 TEXT,
    top_market_1_volume DECIMAL(15, 2) DEFAULT 0,
    top_market_2 TEXT,
    top_market_2_volume DECIMAL(15, 2) DEFAULT 0,
    top_market_3 TEXT,
    top_market_3_volume DECIMAL(15, 2) DEFAULT 0,
    
    -- Timestamps
    first_trade_at TIMESTAMP,
    last_trade_at TIMESTAMP,
    last_updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT unique_wallet_platform UNIQUE (wallet_address, platform)
);

-- Indexes for fast leaderboard queries
CREATE INDEX IF NOT EXISTS idx_trader_stats_pnl ON trader_stats(total_pnl DESC);
CREATE INDEX IF NOT EXISTS idx_trader_stats_platform ON trader_stats(platform);
CREATE INDEX IF NOT EXISTS idx_trader_stats_wallet ON trader_stats(wallet_address);
CREATE INDEX IF NOT EXISTS idx_trader_stats_updated ON trader_stats(last_updated_at DESC);

-- Index for time-based PnL queries
CREATE INDEX IF NOT EXISTS idx_trader_stats_pnl_24h ON trader_stats(pnl_24h DESC);
CREATE INDEX IF NOT EXISTS idx_trader_stats_pnl_7d ON trader_stats(pnl_7d DESC);
CREATE INDEX IF NOT EXISTS idx_trader_stats_pnl_30d ON trader_stats(pnl_30d DESC);

-- Composite index for filtered leaderboard queries
CREATE INDEX IF NOT EXISTS idx_trader_stats_platform_pnl ON trader_stats(platform, total_pnl DESC);

-- Index for whale queries
CREATE INDEX IF NOT EXISTS idx_trader_stats_whale ON trader_stats(is_whale, total_pnl DESC) WHERE is_whale = TRUE;

-- Index for active traders
CREATE INDEX IF NOT EXISTS idx_trader_stats_active ON trader_stats(is_active_7d, total_pnl DESC) WHERE is_active_7d = TRUE;

-- Index for strategy type filtering
CREATE INDEX IF NOT EXISTS idx_trader_stats_strategy ON trader_stats(strategy_type, total_pnl DESC);

COMMENT ON TABLE trader_stats IS 'Aggregated trader performance statistics across prediction market platforms';
COMMENT ON COLUMN trader_stats.wallet_address IS 'Trader wallet address or user ID';
COMMENT ON COLUMN trader_stats.platform IS 'Platform: polymarket, kalshi, limitless';
COMMENT ON COLUMN trader_stats.total_pnl IS 'Total profit/loss in USD';
COMMENT ON COLUMN trader_stats.win_rate IS 'Percentage of winning trades (0-1)';
COMMENT ON COLUMN trader_stats.roi_percent IS 'Return on investment percentage';
