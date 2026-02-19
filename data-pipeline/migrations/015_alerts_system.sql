-- Migration 015: Alerts System
-- Add alerts table for user notification preferences

-- Create alerts table
CREATE TABLE IF NOT EXISTS alerts (
    id SERIAL PRIMARY KEY,
    user_email VARCHAR(255) NOT NULL,
    alert_type VARCHAR(50) NOT NULL, -- 'arbitrage', 'price_movement', 'market_close', 'new_market'
    alert_name VARCHAR(255) NOT NULL,
    
    -- Alert conditions stored as JSONB for flexibility
    conditions JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- Example: {"min_spread": 25, "min_confidence": "high"} for arbitrage
    -- Example: {"platform": "poly", "category": "politics"} for new_market
    
    status VARCHAR(20) DEFAULT 'active', -- 'active', 'paused', 'triggered'
    
    -- Notification channels
    email_enabled BOOLEAN DEFAULT true,
    telegram_enabled BOOLEAN DEFAULT false,
    telegram_chat_id VARCHAR(100),
    
    -- Tracking
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_triggered_at TIMESTAMP,
    trigger_count INTEGER DEFAULT 0,
    
    CONSTRAINT valid_alert_type CHECK (alert_type IN ('arbitrage', 'price_movement', 'market_close', 'new_market', 'volume_spike'))
);

-- Create index for efficient querying
CREATE INDEX idx_alerts_user_email ON alerts(user_email);
CREATE INDEX idx_alerts_status ON alerts(status);
CREATE INDEX idx_alerts_type ON alerts(alert_type);

-- Create alert history table for audit trail
CREATE TABLE IF NOT EXISTS alert_notifications (
    id SERIAL PRIMARY KEY,
    alert_id INTEGER REFERENCES alerts(id) ON DELETE CASCADE,
    notification_type VARCHAR(20) NOT NULL, -- 'email', 'telegram'
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) DEFAULT 'sent', -- 'sent', 'failed', 'pending'
    message_preview TEXT,
    error_message TEXT
);

CREATE INDEX idx_alert_notifications_alert_id ON alert_notifications(alert_id);
CREATE INDEX idx_alert_notifications_sent_at ON alert_notifications(sent_at DESC);

COMMENT ON TABLE alerts IS 'User alert preferences for price movements, arbitrage, and market events';
COMMENT ON TABLE alert_notifications IS 'History of sent alert notifications';
