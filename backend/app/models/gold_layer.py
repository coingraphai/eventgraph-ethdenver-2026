"""
SQLAlchemy models for predictions_gold schema tables
Maps to the Gold layer analytics tables in PostgreSQL
"""
from sqlalchemy import Column, String, Integer, Numeric, TIMESTAMP, Boolean, Text, JSON, BigInteger, DateTime, func, ARRAY
from sqlalchemy.dialects.postgresql import UUID, TSVECTOR, JSONB
from datetime import datetime
from uuid import uuid4

from app.database.session import Base


# ============================================
# HOME PAGE COMPONENTS
# ============================================

class MarketMetricsSummary(Base):
    """Market metrics summary for dashboard header"""
    __tablename__ = "market_metrics_summary"
    __table_args__ = {"schema": "predictions_gold"}
    
    snapshot_timestamp = Column(TIMESTAMP, primary_key=True)
    total_markets = Column(Integer)
    combined_volume_24h = Column(Numeric(20, 2))
    avg_volume_per_market = Column(Numeric(20, 2))
    polymarket_open_markets = Column(Integer)
    polymarket_volume_24h = Column(Numeric(20, 2))
    polymarket_growth_24h_pct = Column(Numeric(6, 2))
    kalshi_open_markets = Column(Integer)
    kalshi_volume_24h = Column(Numeric(20, 2))
    kalshi_growth_24h_pct = Column(Numeric(6, 2))
    limitless_open_markets = Column(Integer)
    limitless_volume_24h = Column(Numeric(20, 2))
    limitless_growth_24h_pct = Column(Numeric(6, 2))
    trend_direction = Column(String(10))
    change_pct_24h = Column(Numeric(6, 2))
    change_pct_7d = Column(Numeric(6, 2))


class TopMarketsSnapshot(Base):
    """Top 10 markets by volume (snapshot every 5 minutes)"""
    __tablename__ = "top_markets_snapshot"
    __table_args__ = {"schema": "predictions_gold"}
    
    snapshot_timestamp = Column(TIMESTAMP, primary_key=True)
    snapshot_id = Column(UUID(as_uuid=True), nullable=False)
    market_id = Column(UUID(as_uuid=True), primary_key=True)
    rank = Column(Integer, nullable=False)
    title = Column(Text, nullable=False)
    title_short = Column(String(50), nullable=False)
    platform = Column(String(50), nullable=False)
    volume_total_usd = Column(Numeric(24, 6), nullable=False)
    volume_24h_usd = Column(Numeric(24, 6), nullable=False)
    volume_millions = Column(Numeric(10, 2), nullable=False)
    category = Column(String(255))
    tags = Column(ARRAY(String))
    image_url = Column(Text)
    created_at = Column(TIMESTAMP)


class CategoryDistribution(Base):
    """Category distribution for pie chart"""
    __tablename__ = "category_distribution"
    __table_args__ = {"schema": "predictions_gold"}
    
    snapshot_timestamp = Column(TIMESTAMP, primary_key=True)
    snapshot_id = Column(UUID(as_uuid=True), primary_key=True)
    category = Column(String(100), primary_key=True)
    display_order = Column(Integer)
    market_count = Column(Integer)
    percentage = Column(Numeric(5, 2))
    polymarket_count = Column(Integer)
    kalshi_count = Column(Integer)
    limitless_count = Column(Integer)
    total_volume_24h = Column(Numeric(20, 2))
    avg_volume_per_market = Column(Numeric(20, 2))
    created_at = Column(TIMESTAMP)


class VolumeTrends(Base):
    """Volume trends over time"""
    __tablename__ = "volume_trends"
    __table_args__ = {"schema": "predictions_gold"}
    
    snapshot_timestamp = Column(TIMESTAMP, primary_key=True)
    snapshot_id = Column(UUID(as_uuid=True), primary_key=True)
    market_id = Column(UUID(as_uuid=True), primary_key=True)
    title = Column(Text)
    title_short = Column(String(255))
    platform = Column(String(50))
    volume_24h = Column(Numeric(20, 2))
    volume_7d = Column(Numeric(20, 2))
    volume_weekly_avg = Column(Numeric(20, 2))
    volume_monthly_avg = Column(Numeric(20, 2))
    trend_direction = Column(String(50))
    trend_strength = Column(Numeric(10, 2))
    volume_change_24h_pct = Column(Numeric(10, 2))
    volume_change_7d_pct = Column(Numeric(10, 2))
    rank_by_volume = Column(Integer)
    rank_by_trend = Column(Integer)
    created_at = Column(TIMESTAMP)


class HighVolumeActivity(Base):
    """High volume activity feed"""
    __tablename__ = "high_volume_activity"
    __table_args__ = {"schema": "predictions_gold"}
    
    activity_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    detected_at = Column(TIMESTAMP, nullable=False)
    market_id = Column(UUID(as_uuid=True), nullable=False)
    title = Column(Text, nullable=False)
    title_short = Column(String(50), nullable=False)
    platform = Column(String(50), nullable=False)
    activity_type = Column(String(50), nullable=False)
    activity_description = Column(Text, nullable=False)
    volume_24h = Column(Numeric(24, 6))
    volume_change_pct = Column(Numeric(10, 2))
    price_change_pct = Column(Numeric(10, 2))
    current_price = Column(Numeric(10, 6))
    importance_score = Column(Integer, nullable=False)
    category = Column(String(255))
    image_url = Column(Text)
    time_to_close = Column(String)  # INTERVAL type
    created_at = Column(TIMESTAMP)


class PlatformComparison(Base):
    """Platform comparison metrics"""
    __tablename__ = "platform_comparison"
    __table_args__ = {"schema": "predictions_gold"}
    
    snapshot_timestamp = Column(TIMESTAMP, primary_key=True)
    snapshot_id = Column(UUID(as_uuid=True), nullable=False)
    platform = Column(String(50), primary_key=True)
    display_order = Column(Integer, nullable=False)
    total_markets = Column(Integer, nullable=False)
    active_markets = Column(Integer, nullable=False)
    resolved_markets_24h = Column(Integer)
    volume_24h = Column(Numeric(24, 6), nullable=False)
    volume_7d = Column(Numeric(24, 6), nullable=False)
    volume_millions = Column(Numeric(10, 2), nullable=False)
    avg_volume_thousands = Column(Numeric(10, 2), nullable=False)
    growth_24h_pct = Column(Numeric(10, 2))
    growth_7d_pct = Column(Numeric(10, 2))
    market_share_pct = Column(Numeric(5, 2))
    trade_count_24h = Column(Integer)
    unique_traders_24h = Column(Integer)
    avg_trade_size = Column(Numeric(24, 6))
    created_at = Column(TIMESTAMP)


class TrendingCategories(Base):
    """Trending categories (top 8)"""
    __tablename__ = "trending_categories"
    __table_args__ = {"schema": "predictions_gold"}
    
    snapshot_timestamp = Column(TIMESTAMP, primary_key=True)
    snapshot_id = Column(UUID(as_uuid=True), primary_key=True)
    category = Column(String(100), primary_key=True)
    rank = Column(Integer)
    market_count = Column(Integer)
    volume_24h = Column(Numeric(20, 2))
    volume_change_24h_pct = Column(Numeric(10, 2))
    trend_direction = Column(String(10))
    trend_score = Column(Integer)
    percentage_of_total = Column(Numeric(10, 2))
    rank_change = Column(Integer)
    polymarket_count = Column(Integer)
    kalshi_count = Column(Integer)
    limitless_count = Column(Integer)
    created_at = Column(TIMESTAMP)


# ============================================
# MARKET DETAIL PAGE COMPONENTS
# ============================================

class MarketDetailCache(Base):
    """Cached market details"""
    __tablename__ = "market_detail_cache"
    __table_args__ = {"schema": "predictions_gold"}
    
    market_id = Column(UUID(as_uuid=True), primary_key=True)
    cached_at = Column(TIMESTAMP, primary_key=True)
    source = Column(String(50))
    source_market_id = Column(String(255))
    question = Column(Text)
    description = Column(Text)
    category = Column(String(100))
    end_date = Column(TIMESTAMP)
    total_volume = Column(Numeric(20, 2))
    volume_24h = Column(Numeric(20, 2))
    yes_price = Column(Numeric(10, 4))
    no_price = Column(Numeric(10, 4))
    liquidity = Column(Numeric(20, 2))
    created_at = Column(TIMESTAMP)
    status = Column(String(50))
    image_url = Column(Text)


class MarketPriceHistory(Base):
    """Market price history (OHLC candles)"""
    __tablename__ = "market_price_history"
    __table_args__ = {"schema": "predictions_gold"}
    
    source_market_id = Column(String(255), primary_key=True)
    period_start = Column(TIMESTAMP, primary_key=True)
    period_end = Column(TIMESTAMP)
    open_price = Column(Numeric(10, 4))
    high_price = Column(Numeric(10, 4))
    low_price = Column(Numeric(10, 4))
    close_price = Column(Numeric(10, 4))
    volume_period = Column(Numeric(20, 2))
    trade_count = Column(Integer)


class MarketTradeActivity(Base):
    """Market trade activity (hourly aggregation)"""
    __tablename__ = "market_trade_activity"
    __table_args__ = {"schema": "predictions_gold"}
    
    source_market_id = Column(String(255), primary_key=True)
    hour_start = Column(TIMESTAMP, primary_key=True)
    trade_count = Column(Integer)
    total_volume = Column(Numeric(20, 2))
    buy_volume = Column(Numeric(20, 2))
    sell_volume = Column(Numeric(20, 2))
    unique_traders = Column(Integer)
    avg_trade_size = Column(Numeric(20, 2))


class MarketOrderbookDepth(Base):
    """Market orderbook depth"""
    __tablename__ = "market_orderbook_depth"
    __table_args__ = {"schema": "predictions_gold"}
    
    market_id = Column(UUID(as_uuid=True), primary_key=True)
    snapshot_at = Column(TIMESTAMP, primary_key=True)
    bids = Column(JSON)
    asks = Column(JSON)
    spread = Column(Numeric(10, 4))
    total_bid_depth = Column(Numeric(20, 2))
    total_ask_depth = Column(Numeric(20, 2))
    mid_price = Column(Numeric(10, 4))


class RelatedMarkets(Base):
    """Related/similar markets"""
    __tablename__ = "related_markets"
    __table_args__ = {"schema": "predictions_gold"}
    
    source_market_id = Column(String(255), primary_key=True)
    related_market_id = Column(String(255), primary_key=True)
    snapshot_at = Column(TIMESTAMP, primary_key=True)
    related_title = Column(Text)
    similarity_score = Column(Numeric(5, 2))
    yes_price = Column(Numeric(10, 4))
    volume_24h = Column(Numeric(20, 2))
    rank = Column(Integer)


class MarketStatistics(Base):
    """Market statistics"""
    __tablename__ = "market_statistics"
    __table_args__ = {"schema": "predictions_gold"}
    
    market_id = Column(UUID(as_uuid=True), primary_key=True)
    computed_at = Column(TIMESTAMP, primary_key=True)
    total_trades = Column(Integer)
    unique_traders = Column(Integer)
    avg_trade_size = Column(Numeric(20, 2))
    largest_trade = Column(Numeric(20, 2))
    price_volatility = Column(Numeric(6, 4))
    volume_24h = Column(Numeric(20, 2))
    volume_7d = Column(Numeric(20, 2))
    resolution_date = Column(TIMESTAMP)


# ============================================
# MARKETS/EXPLORE PAGE COMPONENTS
# ============================================

class MarketSearchCache(Base):
    """Market search cache with full-text search"""
    __tablename__ = "market_search_cache"
    __table_args__ = {"schema": "predictions_gold"}
    
    market_id = Column(UUID(as_uuid=True), primary_key=True)
    cached_at = Column(TIMESTAMP, primary_key=True)
    question = Column(Text)
    description = Column(Text)
    category_name = Column(String(100))
    source = Column(String(50))
    yes_price = Column(Numeric(10, 4))
    volume_24h = Column(Numeric(20, 2))
    popularity_score = Column(Integer)
    search_vector = Column(TSVECTOR)


class FilterAggregates(Base):
    """Pre-computed filter counts"""
    __tablename__ = "filter_aggregates"
    __table_args__ = {"schema": "predictions_gold"}
    
    snapshot_at = Column(TIMESTAMP, primary_key=True)
    filter_type = Column(String(50), primary_key=True)
    filter_value = Column(String(100), primary_key=True)
    total_count = Column(Integer)
    active_count = Column(Integer)
    display_name = Column(String(100))
    icon = Column(String(50))
    sort_order = Column(Integer)


class WatchlistPopularMarkets(Base):
    """Popular markets by watchlist adds and views"""
    __tablename__ = "watchlist_popular_markets"
    __table_args__ = {"schema": "predictions_gold"}
    
    snapshot_at = Column(TIMESTAMP, primary_key=True)
    market_id = Column(UUID(as_uuid=True), primary_key=True)
    question = Column(Text)
    source = Column(String(50))
    yes_price = Column(Numeric(10, 4))
    volume_24h = Column(Numeric(20, 2))
    popularity_rank = Column(Integer)
    trade_count_24h = Column(Integer)


class RecentlyResolvedMarkets(Base):
    """Recently resolved markets"""
    __tablename__ = "recently_resolved_markets"
    __table_args__ = {"schema": "predictions_gold"}
    
    snapshot_at = Column(TIMESTAMP, primary_key=True)
    market_id = Column(UUID(as_uuid=True), primary_key=True)
    question = Column(Text)
    source = Column(String(50))
    outcome = Column(String(50))
    resolved_at = Column(TIMESTAMP)
    final_yes_price = Column(Numeric(10, 4))
    total_volume = Column(Numeric(20, 2))


class CategoryBreakdownByPlatform(Base):
    """2D category x platform breakdown"""
    __tablename__ = "category_breakdown_by_platform"
    __table_args__ = {"schema": "predictions_gold"}
    
    snapshot_at = Column(TIMESTAMP, primary_key=True)
    source = Column(String(50), primary_key=True)
    category_name = Column(String(100), primary_key=True)
    market_count = Column(Integer)
    total_volume_24h = Column(Numeric(20, 2))
    pct_of_platform_volume = Column(Numeric(5, 2))


# ============================================
# ANALYTICS PAGE COMPONENTS
# ============================================

class VolumeDistributionHistogram(Base):
    """Volume distribution histogram"""
    __tablename__ = "volume_distribution_histogram"
    __table_args__ = {"schema": "predictions_gold"}
    
    snapshot_at = Column(TIMESTAMP, primary_key=True)
    bin_label = Column(String(50), primary_key=True)
    bin_index = Column(Integer)
    market_count = Column(Integer)
    polymarket_count = Column(Integer)
    kalshi_count = Column(Integer)
    limitless_count = Column(Integer)
    total_volume = Column(Numeric(20, 2))


class MarketLifecycleFunnel(Base):
    """Market lifecycle funnel"""
    __tablename__ = "market_lifecycle_funnel"
    __table_args__ = {"schema": "predictions_gold"}
    
    snapshot_at = Column(TIMESTAMP, primary_key=True)
    stage = Column(String(50), primary_key=True)
    stage_order = Column(Integer)
    market_count = Column(Integer)
    conversion_rate_to_next = Column(Numeric(5, 2))


class TopTradersLeaderboard(Base):
    """Top 100 traders leaderboard"""
    __tablename__ = "top_traders_leaderboard"
    __table_args__ = {"schema": "predictions_gold"}
    
    snapshot_at = Column(TIMESTAMP, primary_key=True)
    trader_address = Column(String(255), primary_key=True)
    trader_rank = Column(Integer)
    total_trades = Column(Integer)
    total_volume = Column(Numeric(20, 2))
    volume_24h = Column(Numeric(20, 2))
    favorite_source = Column(String(50))
    win_rate = Column(Numeric(5, 2))


class CategoryPerformanceMetrics(Base):
    """Category performance metrics"""
    __tablename__ = "category_performance_metrics"
    __table_args__ = {"schema": "predictions_gold"}
    
    snapshot_at = Column(TIMESTAMP, primary_key=True)
    category_name = Column(String(100), primary_key=True)
    popularity_rank = Column(Integer)
    total_volume_24h = Column(Numeric(20, 2))
    active_markets = Column(Integer)
    resolved_markets = Column(Integer)
    avg_market_duration_days = Column(Numeric(6, 2))
    growth_rate_7d = Column(Numeric(6, 2))
    resolution_rate = Column(Numeric(5, 2))


class PlatformMarketShareTimeseries(Base):
    """Platform market share over time (daily)"""
    __tablename__ = "platform_market_share_timeseries"
    __table_args__ = {"schema": "predictions_gold"}
    
    date = Column(TIMESTAMP, primary_key=True)
    source = Column(String(50), primary_key=True)
    market_share_by_volume = Column(Numeric(5, 2))
    market_share_by_count = Column(Numeric(5, 2))
    growth_rate_volume = Column(Numeric(6, 2))


class HourlyActivityHeatmap(Base):
    """Hourly activity heatmap (24x7 grid)"""
    __tablename__ = "hourly_activity_heatmap"
    __table_args__ = {"schema": "predictions_gold"}
    
    computed_date = Column(TIMESTAMP, primary_key=True)
    hour_of_day = Column(Integer, primary_key=True)
    day_of_week = Column(Integer, primary_key=True)
    trade_count = Column(Integer)
    avg_volume = Column(Numeric(20, 2))
    activity_intensity = Column(Integer)


class ResolutionAccuracyTracker(Base):
    """Resolution accuracy tracking (daily)"""
    __tablename__ = "resolution_accuracy_tracker"
    __table_args__ = {"schema": "predictions_gold"}
    
    date = Column(TIMESTAMP, primary_key=True)
    total_resolved_markets = Column(Integer)
    accurate_resolutions = Column(Integer)
    accuracy_score = Column(Numeric(5, 2))
    avg_final_price_yes_markets = Column(Numeric(10, 4))
    avg_final_price_no_markets = Column(Numeric(10, 4))


# ==============================================================================
# Phase 2: Events Tables (Migration from Dome API)
# ==============================================================================

class EventsSnapshot(Base):
    """Events snapshot - grouping of related markets"""
    __tablename__ = "events_snapshot"
    __table_args__ = {"schema": "predictions_gold"}
    
    id = Column(BigInteger, primary_key=True, autoincrement=True)
    snapshot_at = Column(DateTime, nullable=False, default=func.now(), index=True)
    event_id = Column(String(255), nullable=False, index=True)
    platform = Column(String(20), nullable=False, index=True)  # 'polymarket', 'kalshi'
    title = Column(Text, nullable=False)
    category = Column(String(50))
    image_url = Column(String(500))
    market_count = Column(Integer, default=0)
    total_volume = Column(Numeric(20, 2), default=0)
    volume_24h = Column(Numeric(20, 2), default=0)
    volume_1_week = Column(Numeric(20, 2), default=0)
    start_time = Column(DateTime)
    end_time = Column(DateTime)
    status = Column(String(20), default='open')
    tags = Column(JSONB, default=[])
    created_at = Column(DateTime, default=func.now())


class EventMarkets(Base):
    """Event markets mapping - which markets belong to which events"""
    __tablename__ = "event_markets"
    __table_args__ = {"schema": "predictions_gold"}
    
    id = Column(BigInteger, primary_key=True, autoincrement=True)
    event_id = Column(String(255), nullable=False, index=True)
    platform = Column(String(20), nullable=False, index=True)
    market_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    market_title = Column(Text)
    market_slug = Column(String(255))
    yes_price = Column(Numeric(10, 6))
    volume_total = Column(Numeric(20, 2))
    volume_24h = Column(Numeric(20, 2))
    rank_in_event = Column(Integer)
    snapshot_at = Column(DateTime, nullable=False, default=func.now(), index=True)


class EventsAggregateMetrics(Base):
    """Aggregate metrics for events"""
    __tablename__ = "events_aggregate_metrics"
    __table_args__ = {"schema": "predictions_gold"}
    
    id = Column(BigInteger, primary_key=True, autoincrement=True)
    snapshot_at = Column(DateTime, nullable=False, default=func.now(), index=True)
    platform = Column(String(20), index=True)
    total_events = Column(Integer)
    total_markets = Column(Integer)
    total_volume = Column(Numeric(20, 2))
    volume_24h = Column(Numeric(20, 2))
    avg_markets_per_event = Column(Numeric(10, 2))
