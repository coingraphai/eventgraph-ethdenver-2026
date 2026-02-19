"""
Event Analytics API
Enhanced event detail endpoint with comprehensive analytics:
- Full market prices for ALL markets
- Historical price data for charts
- Trade flow analysis (buy/sell ratio, whale alerts)
- Volume trends and momentum scores
- Orderbook depth data
- Cross-platform comparison
"""

from fastapi import APIRouter, Query, HTTPException
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
from pydantic import BaseModel, Field
from sqlalchemy import text
import httpx
import logging
import asyncio
from collections import defaultdict

from app.config import settings
from app.services.events_cache_service import get_events_cache_service

router = APIRouter()
logger = logging.getLogger(__name__)

DOME_API_BASE = "https://api.domeapi.io/v1"


def get_dome_api_key() -> str:
    """Get Dome API key from settings"""
    key = getattr(settings, 'DOME_API_KEY', None) or ""
    return key


# ============================================================================
# Enhanced Response Models
# ============================================================================

class MarketAnalytics(BaseModel):
    """Enhanced market data with analytics"""
    market_id: str
    title: str
    yes_price: Optional[float] = None
    no_price: Optional[float] = None
    volume_total: Optional[float] = None
    volume_24h: Optional[float] = None
    volume_1_week: Optional[float] = None
    volume_change_pct: Optional[float] = None  # 24h vs 7d average
    end_time: Optional[int] = None
    status: str = "open"
    image: Optional[str] = None
    source_url: Optional[str] = None  # Direct link to market on platform
    token_id_yes: Optional[str] = None
    token_id_no: Optional[str] = None
    condition_id: Optional[str] = None
    # Analytics
    momentum_score: Optional[float] = None  # -100 to +100
    is_whale_active: bool = False
    price_volatility: Optional[float] = None
    liquidity_score: Optional[float] = None


class TradeRecord(BaseModel):
    """Trade record with whale flag"""
    timestamp: int
    market_id: str
    market_title: Optional[str] = None
    side: str  # BUY or SELL
    token_label: str  # YES or NO
    price: float
    shares: float
    usd_value: Optional[float] = None
    is_whale: bool = False  # > $10K trade
    taker: Optional[str] = None  # Wallet address
    tx_hash: Optional[str] = None  # Transaction hash
    order_hash: Optional[str] = None  # Order hash


class TradeFlowStats(BaseModel):
    """Aggregated trade flow statistics"""
    total_trades: int = 0
    buy_count: int = 0
    sell_count: int = 0
    buy_volume: float = 0
    sell_volume: float = 0
    buy_sell_ratio: float = 1.0
    whale_trades: int = 0
    whale_buy_volume: float = 0
    whale_sell_volume: float = 0
    avg_trade_size: float = 0
    largest_trade: Optional[TradeRecord] = None


class PricePoint(BaseModel):
    """Historical price point for charts"""
    timestamp: int
    price: float
    volume: Optional[float] = None


class VolumeTrend(BaseModel):
    """Volume trend data"""
    market_id: str
    title: str
    volume_24h: float = 0
    volume_7d: float = 0
    volume_30d: float = 0
    trend: str = "stable"  # up, down, stable
    change_pct: float = 0


class EventSummary(BaseModel):
    """Event summary with key metrics"""
    event_id: str
    title: str
    platform: str
    category: str
    status: str
    end_time: Optional[int] = None
    time_remaining: Optional[str] = None
    total_markets: int = 0
    total_volume: float = 0
    volume_24h: float = 0
    volume_7d: float = 0
    avg_yes_price: Optional[float] = None
    high_conviction_count: int = 0  # >80% or <20%
    toss_up_count: int = 0  # 40-60%
    image: Optional[str] = None
    tags: List[str] = []


class CrossPlatformData(BaseModel):
    """Cross-platform comparison data"""
    kalshi_available: bool = False
    kalshi_event_ticker: Optional[str] = None
    kalshi_total_volume: Optional[float] = None
    price_differences: List[Dict[str, Any]] = []
    arbitrage_opportunities: List[Dict[str, Any]] = []


class EnhancedEventResponse(BaseModel):
    """Comprehensive event analytics response"""
    # Core data
    summary: EventSummary
    markets: List[MarketAnalytics]
    
    # Analytics
    trade_flow: TradeFlowStats
    recent_trades: List[TradeRecord]
    volume_trends: List[VolumeTrend]
    
    # Charts data
    price_history: Dict[str, List[PricePoint]] = {}  # market_id -> price points
    volume_by_market: List[Dict[str, Any]] = []
    price_distribution: Dict[str, int] = {}
    
    # Cross-platform
    cross_platform: CrossPlatformData
    
    # Pagination info for trades
    total_trades_available: int = 0
    trades_paginated: bool = True  # Indicates full trades available via separate endpoint
    
    # Metadata
    last_updated: str
    refresh_interval_seconds: int = 3600  # 1 hour


class PaginatedTradesResponse(BaseModel):
    """Paginated trades response for deep dive into all trades"""
    trades: List[TradeRecord]
    total_count: int
    page: int
    page_size: int
    total_pages: int
    has_next: bool
    has_prev: bool
    # Filters applied
    token_filter: Optional[str] = None  # YES, NO, or None for all
    sort_by: str = "value"  # value, time
    sort_order: str = "desc"
    # Summary stats for filtered results
    total_volume: float = 0
    whale_count: int = 0
    buy_count: int = 0
    sell_count: int = 0


# ============================================================================
# Helper Functions
# ============================================================================

def calculate_momentum_score(
    volume_24h: float,
    volume_7d: float,
    price: Optional[float],
    trade_count: int = 0
) -> float:
    """
    Calculate momentum score from -100 to +100
    Positive = bullish momentum, Negative = bearish
    """
    if volume_7d <= 0:
        return 0
    
    # Volume acceleration (weight: 60%)
    daily_avg = volume_7d / 7
    if daily_avg > 0:
        volume_accel = ((volume_24h - daily_avg) / daily_avg) * 100
    else:
        volume_accel = 0
    
    # Price distance from 50% (weight: 40%)
    if price is not None:
        # Markets far from 50% are more decisive
        price_conviction = abs(price - 0.5) * 200  # 0-100 scale
    else:
        price_conviction = 0
    
    # Combine scores
    momentum = (volume_accel * 0.6) + (price_conviction * 0.4)
    
    # Clamp to -100 to +100
    return max(-100, min(100, momentum))


def get_time_remaining(end_time: Optional[int]) -> Optional[str]:
    """Format time remaining as human-readable string"""
    if not end_time:
        return None
    
    end_dt = datetime.fromtimestamp(end_time)
    now = datetime.now()
    
    if end_dt < now:
        return "Ended"
    
    delta = end_dt - now
    days = delta.days
    hours = delta.seconds // 3600
    
    if days > 30:
        return f"{days // 30} months"
    elif days > 0:
        return f"{days}d {hours}h"
    elif hours > 0:
        return f"{hours}h {(delta.seconds % 3600) // 60}m"
    else:
        return f"{delta.seconds // 60}m"


def categorize_price_distribution(markets: List[Dict]) -> Dict[str, int]:
    """Categorize markets by price range"""
    distribution = {
        "0-10%": 0,
        "10-20%": 0,
        "20-30%": 0,
        "30-40%": 0,
        "40-50%": 0,
        "50-60%": 0,
        "60-70%": 0,
        "70-80%": 0,
        "80-90%": 0,
        "90-100%": 0,
    }
    
    for m in markets:
        price = m.get("yes_price")
        if price is None:
            continue
        
        pct = price * 100
        if pct <= 10:
            distribution["0-10%"] += 1
        elif pct <= 20:
            distribution["10-20%"] += 1
        elif pct <= 30:
            distribution["20-30%"] += 1
        elif pct <= 40:
            distribution["30-40%"] += 1
        elif pct <= 50:
            distribution["40-50%"] += 1
        elif pct <= 60:
            distribution["50-60%"] += 1
        elif pct <= 70:
            distribution["60-70%"] += 1
        elif pct <= 80:
            distribution["70-80%"] += 1
        elif pct <= 90:
            distribution["80-90%"] += 1
        else:
            distribution["90-100%"] += 1
    
    return distribution


# ============================================================================
# Main API Endpoint
# ============================================================================

@router.get("/event/{platform}/{event_id}/analytics", response_model=EnhancedEventResponse)
async def get_event_analytics(
    platform: str,
    event_id: str,
    include_history: bool = Query(False, description="Include price history (slower)"),
    include_trades: bool = Query(True, description="Include recent trades"),
    max_markets: int = Query(100, ge=1, le=200, description="Max markets to return"),
    force_refresh: bool = Query(False, description="Bypass cache and fetch fresh data"),
):
    """
    Get comprehensive event analytics with all data for the dashboard.
    
    Features:
    - Full market data with live prices for ALL markets
    - Trade flow analysis (buy/sell ratio, whale detection)
    - Volume trends and momentum scores
    - Price distribution charts
    - Cross-platform comparison (Kalshi)
    
    Performance:
    - Cached for 5 minutes (instant response after first load)
    - Use force_refresh=true to bypass cache
    
    Auto-refresh: Frontend should call every 1 hour (configurable)
    """
    api_key = get_dome_api_key()
    if not api_key:
        raise HTTPException(status_code=500, detail="DOME_API_KEY not configured")
    
    # Normalize platform
    if platform in ["poly", "polymarket"]:
        platform = "polymarket"
    elif platform in ["kalshi"]:
        platform = "kalshi"
    elif platform in ["limitless"]:
        platform = "limitless"
    elif platform in ["opiniontrade"]:
        platform = "opiniontrade"
    else:
        raise HTTPException(status_code=400, detail=f"Unknown platform: {platform}")
    
    # Get cache service
    cache_service = get_events_cache_service()
    await cache_service.initialize()
    
    # Check cache first (unless force_refresh)
    if not force_refresh:
        cached_analytics = await cache_service.get_event_analytics(
            platform, event_id, include_trades, max_markets
        )
        if cached_analytics:
            logger.info(f"Returning cached analytics for {event_id}")
            return EnhancedEventResponse(**cached_analytics)
    
    # Cache miss or force refresh - fetch fresh data
    logger.info(f"Cache miss for {event_id}, fetching fresh data...")
    
    # Try to get event from cache first
    events_data = await cache_service.get_all_events()
    cached_event = None
    
    if events_data:
        # Find the event in cache
        for evt in events_data.get("events", []):
            if evt.get("event_id") == event_id and evt.get("platform") == platform:
                cached_event = evt
                break
    
    # If not in cache, try to fetch from database
    if not cached_event:
        logger.info(f"Event not in cache, fetching from database...")
        from app.database.session import get_db
        from sqlalchemy import text
        
        try:
            with next(get_db()) as db:
                # Fetch event from database
                event_result = db.execute(text("""
                    SELECT DISTINCT ON (event_id, platform)
                        event_id,
                        platform,
                        title,
                        category,
                        market_count,
                        total_volume,
                        volume_24h,
                        volume_1_week,
                        status,
                        start_time,
                        end_time,
                        image_url,
                        source_url,
                        tags
                    FROM predictions_gold.events_snapshot
                    WHERE event_id = :event_id AND platform = :platform
                    ORDER BY event_id, platform, snapshot_at DESC
                """), {"event_id": event_id, "platform": platform})
                
                event = event_result.fetchone()
                if not event:
                    raise HTTPException(status_code=404, detail=f"Event not found: {event_id}")
                
                # Get associated markets from silver layer (for market_id list)
                # For Polymarket: use event_slug in extra_data and return market_slug
                # For Kalshi: use event ticker prefix
                # For Limitless/OpinionTrade: use event_slug in extra_data
                if platform == "polymarket":
                    markets_result = db.execute(text("""
                        SELECT DISTINCT
                            COALESCE(extra_data->>'market_slug', source_market_id) as market_id,
                            question,
                            volume_24h,
                            volume_total
                        FROM predictions_silver.markets
                        WHERE source = :platform
                        AND (extra_data->>'event_slug' = :event_id OR extra_data->>'market_slug' = :event_id)
                        ORDER BY volume_24h DESC NULLS LAST
                        LIMIT 100
                    """), {"platform": platform, "event_id": event_id})
                elif platform == "kalshi":
                    markets_result = db.execute(text("""
                        SELECT DISTINCT
                            source_market_id as market_id,
                            question,
                            volume_24h,
                            volume_total
                        FROM predictions_silver.markets
                        WHERE source = :platform
                        AND SPLIT_PART(source_market_id, '-', 1) = :event_id
                        ORDER BY volume_24h DESC NULLS LAST
                        LIMIT 100
                    """), {"platform": platform, "event_id": event_id})
                else:  # Limitless, OpinionTrade
                    markets_result = db.execute(text("""
                        SELECT DISTINCT
                            source_market_id as market_id,
                            question,
                            volume_24h,
                            volume_total
                        FROM predictions_silver.markets
                        WHERE source = :platform
                        AND (extra_data->>'event_slug' = :event_id OR extra_data->>'event_id' = :event_id)
                        ORDER BY volume_24h DESC NULLS LAST
                        LIMIT 100
                    """), {"platform": platform, "event_id": event_id})
                
                markets = markets_result.fetchall()
                
                # Build cached_event structure
                cached_event = {
                    "event_id": event.event_id,
                    "platform": event.platform,
                    "title": event.title,
                    "category": event.category or "other",
                    "market_count": event.market_count or len(markets),
                    "total_volume": float(event.total_volume or 0),
                    "volume_24h": float(event.volume_24h or 0),
                    "volume_1_week": float(event.volume_1_week or 0),
                    "status": event.status,
                    "markets": [
                        {
                            "market_id": m.market_id,
                            "question": m.question,
                            "volume_24h": float(m.volume_24h or 0),
                            "volume_total": float(m.volume_total or 0),
                        }
                        for m in markets
                    ]
                }
                logger.info(f"Fetched event from database with {len(markets)} markets")
        except Exception as e:
            logger.error(f"Failed to fetch event from database: {e}")
            raise HTTPException(status_code=404, detail=f"Event not found: {event_id}")
    
    if not cached_event:
        raise HTTPException(status_code=404, detail=f"Event not found: {event_id}")
    
    async with httpx.AsyncClient() as client:
        if platform == "polymarket":
            result = await fetch_polymarket_analytics(
                client, api_key, cached_event, 
                include_history=include_history,
                include_trades=include_trades,
                max_markets=max_markets,
            )
        elif platform == "kalshi":
            result = await fetch_kalshi_analytics(
                client, api_key, cached_event,
                include_trades=include_trades,
                max_markets=max_markets,
            )
        elif platform in ["limitless", "opiniontrade"]:
            result = await fetch_generic_platform_analytics(
                client, api_key, cached_event, platform,
                include_trades=include_trades,
                max_markets=max_markets,
            )
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported platform: {platform}")
    
    # Cache the result for instant future responses
    await cache_service.set_event_analytics(
        platform, event_id, result.model_dump(), include_trades, max_markets
    )
    logger.info(f"Cached analytics for {event_id}")
    
    return result


async def fetch_polymarket_analytics(
    client: httpx.AsyncClient,
    api_key: str,
    cached_event: Dict,
    include_history: bool = False,
    include_trades: bool = True,
    max_markets: int = 100,
) -> EnhancedEventResponse:
    """Fetch comprehensive Polymarket event analytics from database (FAST)"""
    
    event_id = cached_event.get("event_id")
    logger.info(f"Fetching analytics for Polymarket event from database: {event_id}")
    
    # PERFORMANCE OPTIMIZATION: Use database instead of external API calls
    # This is 5-10x faster than calling Polymarket/Dome API
    from app.database.session import get_db
    
    markets_data = []
    
    try:
        with next(get_db()) as db:
            # Fetch all market data from Silver markets table (includes extra_data with token IDs)
            result = db.execute(text("""
                SELECT 
                    m.source_market_id as condition_id,
                    m.slug as market_slug,
                    m.question,
                    m.yes_price as current_yes_price,
                    m.no_price as current_no_price,
                    m.mid_price,
                    m.spread,
                    m.volume_24h,
                    m.volume_7d,
                    m.volume_30d,
                    m.volume_total,
                    m.liquidity,
                    m.open_interest,
                    m.trade_count_24h,
                    NULL::integer as trade_count_total,
                    m.unique_traders,
                    COALESCE(m.status, 'open') as status,
                    m.end_date,
                    m.last_trade_at,
                    m.image_url,
                    m.source_url,
                    m.extra_data
                FROM predictions_silver.markets m
                WHERE m.source = 'polymarket'
                  AND m.extra_data->>'event_slug' = :event_id
                ORDER BY m.volume_24h DESC NULLS LAST
                LIMIT :max_markets
            """), {"event_id": event_id, "max_markets": max_markets})
            
            db_markets = result.fetchall()
            logger.info(f"Fetched {len(db_markets)} markets from database for event_id={event_id}")
            
            # Convert database rows to market data format
            for m in db_markets:
                extra_data = m.extra_data or {}
                market_data = {
                    "condition_id": m.condition_id,
                    "market_slug": m.market_slug or m.condition_id,
                    "question": m.question,
                    "current_yes_price": float(m.current_yes_price) if m.current_yes_price is not None else None,
                    "current_no_price": float(m.current_no_price) if m.current_no_price is not None else None,
                    "mid_price": float(m.mid_price) if m.mid_price is not None else None,
                    "spread": float(m.spread) if m.spread is not None else None,
                    "volume_24h": float(m.volume_24h) if m.volume_24h is not None else None,
                    "volume_7d": float(m.volume_7d) if m.volume_7d is not None else None,
                    "volume_30d": float(m.volume_30d) if m.volume_30d is not None else None,
                    "volume_total": float(m.volume_total) if m.volume_total is not None else None,
                    "liquidity": float(m.liquidity) if m.liquidity is not None else None,
                    "open_interest": float(m.open_interest) if m.open_interest is not None else None,
                    "trade_count_24h": m.trade_count_24h if m.trade_count_24h is not None else None,
                    "trade_count_total": m.trade_count_total if m.trade_count_total is not None else None,
                    "unique_traders": m.unique_traders if m.unique_traders is not None else None,
                    "status": m.status or "open",
                    "end_date": m.end_date.isoformat() if m.end_date else None,
                    "last_trade_at": m.last_trade_at.isoformat() if m.last_trade_at else None,
                    "image": m.image_url,
                    "url": m.source_url,
                    "extra_data": extra_data,
                    # Extract token IDs from extra_data
                    "token_id_yes": extra_data.get("token_id_yes"),
                    "token_id_no": extra_data.get("token_id_no")
                }
                # DEBUG: Log token ID extraction
                if extra_data.get("token_id_yes"):
                    logger.info(f"DB: Market {m.market_slug or m.condition_id} has token_id_yes={extra_data.get('token_id_yes')[:20]}...")
                else:
                    logger.info(f"DB: Market {m.market_slug or m.condition_id} missing token IDs in extra_data: {list(extra_data.keys())}")
                markets_data.append(market_data)
    
    except Exception as e:
        logger.error(f"Failed to fetch markets from database: {e}")
        # Fallback to empty markets list
        markets_data = []
    
    logger.info(f"Processed {len(markets_data)} markets from database for event {event_id}")
    
    # SKIP: No need to collect token IDs since we have prices in database already
    # Prices are already in market data from database
    token_ids = []
    token_to_market = {}
    prices = {}  # Empty since we use DB prices directly
    
    # SKIP: No need to fetch prices from API - we have them from database
    logger.info(f"Using prices from database (skip API calls)")
    
    # Fetch recent trades if requested (from Dome API for realtime data)
    recent_trades: List[TradeRecord] = []
    trade_flow = TradeFlowStats()
    total_trades_available = 0
    
    # Fetch actual trades from Dome API if include_trades is True
    if include_trades and markets_data:
        try:
            from app.services.dome_api import fetch_market_trades
            logger.info(f"Fetching trades for {len(markets_data[:50])} markets...")
            
            # Fetch trades for up to 50 markets in parallel
            all_trades = []
            for m in markets_data[:50]:
                market_id = m.get("source_market_id")
                if not market_id:
                    continue
                    
                try:
                    trades_response = await fetch_market_trades(
                        platform=platform,
                        market_id=market_id,
                        hours=24,
                        min_usd=1000,  # Filter for whale trades >$1000
                        limit=100
                    )
                    
                    # Convert to TradeRecord format
                    for trade in trades_response.get("trades", []):
                        trade_record = TradeRecord(
                            timestamp=trade.get("timestamp"),
                            market_id=market_id,
                            market_title=m.get("question"),
                            side=trade.get("side"),
                            token_label=trade.get("token_label", ""),
                            price=trade.get("price", 0),
                            shares=trade.get("quantity", 0),
                            usd_value=trade.get("total_value"),
                            is_whale=trade.get("total_value", 0) >= 1000,
                            taker=trade.get("taker"),
                            tx_hash=trade.get("trade_id"),
                            order_hash=None
                        )
                        all_trades.append(trade_record)
                        
                        # Update trade flow stats
                        if trade.get("side") == "BUY":
                            trade_flow.buy_count += 1
                            trade_flow.buy_volume += trade.get("total_value", 0)
                        else:
                            trade_flow.sell_count += 1
                            trade_flow.sell_volume += trade.get("total_value", 0)
                            
                        if trade.get("total_value", 0) >= 1000:
                            trade_flow.whale_trades += 1
                            if trade.get("side") == "BUY":
                                trade_flow.whale_buy_volume += trade.get("total_value", 0)
                            else:
                                trade_flow.whale_sell_volume += trade.get("total_value", 0)
                            
                except Exception as e:
                    logger.warning(f"Failed to fetch trades for market {market_id}: {e}")
                    continue
            
            # Sort by timestamp and keep top 100
            all_trades.sort(key=lambda t: t.timestamp, reverse=True)
            recent_trades = all_trades[:100]
            
            # Calculate trade flow stats
            trade_flow.total_trades = len(all_trades)
            if trade_flow.sell_volume > 0:
                trade_flow.buy_sell_ratio = trade_flow.buy_volume / trade_flow.sell_volume
            if trade_flow.total_trades > 0:
                trade_flow.avg_trade_size = (trade_flow.buy_volume + trade_flow.sell_volume) / trade_flow.total_trades
            if all_trades:
                trade_flow.largest_trade = max(all_trades, key=lambda t: t.usd_value or 0)
                
            total_trades_available = len(all_trades)
            logger.info(f"Fetched {len(all_trades)} trades, returning top {len(recent_trades)}")
            
        except Exception as e:
            logger.error(f"Failed to fetch trades: {e}")
            # Fall back to database aggregates if trades fetch fails
            pass
    
    # Calculate aggregate trade stats from database market data as fallback
    if not recent_trades and include_trades and markets_data:
        for m in markets_data:
            trade_count = m.get("trade_count_24h", 0) or 0
            volume_24h = m.get("volume_24h", 0) or 0
            
            trade_flow.total_trades += trade_count
            # Rough estimate: assume 60% buys, 40% sells
            trade_flow.buy_count += int(trade_count * 0.6)
            trade_flow.sell_count += int(trade_count * 0.4)
            trade_flow.buy_volume += volume_24h * 0.6
            trade_flow.sell_volume += volume_24h * 0.4
            
        # Calculate stats
        if trade_flow.sell_volume > 0:
            trade_flow.buy_sell_ratio = trade_flow.buy_volume / trade_flow.sell_volume
        if trade_flow.total_trades > 0:
            trade_flow.avg_trade_size = (trade_flow.buy_volume + trade_flow.sell_volume) / trade_flow.total_trades
        
        total_trades_available = trade_flow.total_trades
        logger.info(f"Calculated trade stats from database: {trade_flow.total_trades} total trades")
    
    # Build enhanced market analytics
    formatted_markets: List[MarketAnalytics] = []
    volume_trends: List[VolumeTrend] = []
    volume_by_market: List[Dict] = []
    
    total_volume = 0
    total_volume_24h = 0
    total_volume_7d = 0
    prices_list = []
    high_conviction = 0
    toss_ups = 0
    
    for m in sorted(markets_data, key=lambda x: x.get("volume_total", 0) or 0, reverse=True):
        # Use prices directly from database, with defaults if missing
        yes_price = m.get("current_yes_price")
        no_price = m.get("current_no_price")
        
        # Use default prices if not available (50/50)
        if yes_price is None:
            yes_price = 0.5
        if no_price is None:
            no_price = 0.5
        
        volume_total = m.get("volume_total", 0) or 0
        volume_7d = m.get("volume_7d", 0) or 0
        volume_24h = m.get("volume_24h", 0) or 0
        
        # Calculate volume change
        daily_avg = volume_7d / 7 if volume_7d else 0
        volume_change_pct = ((volume_24h - daily_avg) / daily_avg * 100) if daily_avg > 0 else 0
        
        # Calculate momentum
        momentum = calculate_momentum_score(volume_24h, volume_7d, yes_price)
        
        # Check for whale activity (from aggregates)
        is_whale_active = volume_24h > 50000  # Simple heuristic
        
        # Handle end_date conversion to timestamp
        end_time = None
        end_date = m.get("end_date")
        if end_date:
            try:
                if hasattr(end_date, 'timestamp'):
                    end_time = int(end_date.timestamp())
                elif isinstance(end_date, (int, float)):
                    end_time = int(end_date)
                elif isinstance(end_date, str):
                    # datetime is already imported at module level
                    end_time = int(datetime.fromisoformat(end_date.replace('Z', '+00:00')).timestamp())
            except:
                end_time = None
        
        # Fix Polymarket URL: must be /event/{event_slug}/{market_slug}
        # The database source_url might be /event/{market_slug} (missing event_slug)
        db_source_url = m.get("url")  # This is the source_url from database
        if db_source_url and 'polymarket.com/event/' in db_source_url:
            # Extract market_slug from the URL (last path segment)
            parts = db_source_url.rstrip('/').split('/')
            market_slug_from_url = parts[-1] if parts else ""
            # Check if URL already has event_slug (2 segments after /event/)
            event_index = db_source_url.find('/event/')
            if event_index != -1:
                path_after_event = db_source_url[event_index + 7:]  # After "/event/"
                path_parts = path_after_event.strip('/').split('/')
                if len(path_parts) == 1:
                    # URL is /event/{market_slug}, need to add event_slug
                    source_url = f"https://polymarket.com/event/{event_id}/{path_parts[0]}"
                else:
                    # URL already has /event/{event_slug}/{market_slug}
                    source_url = db_source_url
            else:
                source_url = db_source_url
        else:
            # Fallback: construct URL from market_slug
            market_slug = m.get("market_slug", "")
            source_url = f"https://polymarket.com/event/{event_id}/{market_slug}" if market_slug else None
        
        market_analytics = MarketAnalytics(
            market_id=m.get("market_slug", ""),
            title=m.get("question") or "Unknown Market",  # Handle None
            yes_price=yes_price,
            no_price=no_price,
            volume_total=volume_total,
            volume_24h=volume_24h,
            volume_1_week=volume_7d,
            volume_change_pct=volume_change_pct,
            end_time=end_time,
            status=m.get("status", "open"),
            image=m.get("image"),
            source_url=source_url,
            token_id_yes=m.get("token_id_yes"),  # Now from extra_data
            token_id_no=m.get("token_id_no"),    # Now from extra_data
            condition_id=m.get("condition_id"),
            momentum_score=momentum,
            is_whale_active=is_whale_active,
        )
        formatted_markets.append(market_analytics)
        
        # Volume trends
        trend = "stable"
        if volume_change_pct > 20:
            trend = "up"
        elif volume_change_pct < -20:
            trend = "down"
        
        volume_trends.append(VolumeTrend(
            market_id=m.get("market_slug", ""),
            title=(m.get("question") or "Unknown Market")[:50],
            volume_24h=volume_24h,
            volume_7d=volume_7d,
            volume_30d=volume_total,  # Approximation
            trend=trend,
            change_pct=volume_change_pct,
        ))
        
        # Volume by market for chart
        volume_by_market.append({
            "market_id": m.get("market_slug"),
            "title": (m.get("question") or "Unknown Market")[:40],
            "volume": volume_total,
            "volume_24h": volume_24h,
            "volume_7d": volume_7d,
        })
        
        # Aggregate stats
        total_volume += volume_total
        total_volume_24h += volume_24h
        total_volume_7d += volume_7d
        
        if yes_price is not None:
            prices_list.append(yes_price)
            if yes_price > 0.8 or yes_price < 0.2:
                high_conviction += 1
            elif 0.4 <= yes_price <= 0.6:
                toss_ups += 1
    
    logger.info(f"Formatted {len(formatted_markets)} markets for event {event_id}")
    
    # Calculate averages
    avg_yes_price = sum(prices_list) / len(prices_list) if prices_list else None
    
    # Build event summary
    summary = EventSummary(
        event_id=event_id,
        title=cached_event.get("title", ""),
        platform="polymarket",
        category=cached_event.get("category", "other"),
        status=cached_event.get("status", "open"),
        end_time=cached_event.get("end_time"),
        time_remaining=get_time_remaining(cached_event.get("end_time")),
        total_markets=len(formatted_markets),
        total_volume=total_volume,
        volume_24h=total_volume_24h,
        volume_7d=total_volume_7d,
        avg_yes_price=avg_yes_price,
        high_conviction_count=high_conviction,
        toss_up_count=toss_ups,
        image=cached_event.get("image"),
        tags=cached_event.get("tags", []),
    )
    
    # Price distribution
    price_distribution = categorize_price_distribution([m.model_dump() for m in formatted_markets])
    
    # Cross-platform comparison (placeholder for now)
    cross_platform = CrossPlatformData(
        kalshi_available=False,
        kalshi_event_ticker=None,
    )
    
    # Fetch price history if requested (DB-first with API fallback)
    price_history_data = {}
    if include_history and markets_data:
        logger.info(f"Fetching price history for {len(markets_data)} markets")
        
        # Import price history service
        from app.services.price_history_service import price_history_service
        
        # Prepare market data for service - use raw markets_data which has token IDs from DB
        markets_for_history = []
        for m in markets_data[:10]:  # Limit to 10 markets
            market_dict = {
                "market_id": m.get("market_slug", ""),
                "source": "polymarket",
                "source_market_id": m.get("condition_id") or m.get("market_slug", ""),
                "token_id_yes": m.get("token_id_yes"),  # From extra_data
                "token_id_no": m.get("token_id_no")     # From extra_data
            }
            if market_dict["token_id_yes"]:
                logger.info(f"Market {market_dict['market_id'][:30]}... has token_id_yes={market_dict['token_id_yes'][:20]}...")
            markets_for_history.append(market_dict)
        
        # Get price history (from DB cache or fetch from API)
        try:
            price_history_data = await price_history_service.ensure_price_history_cached(
                markets=markets_for_history,
                max_markets=10
            )
            logger.info(f"Retrieved price history for {len(price_history_data)} markets (DB + API)")
        except Exception as e:
            logger.error(f"Failed to get price history: {e}")
    
    return EnhancedEventResponse(
        summary=summary,
        markets=formatted_markets,
        trade_flow=trade_flow,
        recent_trades=recent_trades,
        volume_trends=volume_trends[:20],
        price_history=price_history_data,
        volume_by_market=volume_by_market[:15],
        price_distribution=price_distribution,
        cross_platform=cross_platform,
        total_trades_available=total_trades_available,
        trades_paginated=True,
        last_updated=datetime.utcnow().isoformat(),
        refresh_interval_seconds=3600,
    )


async def fetch_kalshi_analytics(
    client: httpx.AsyncClient,
    api_key: str,
    cached_event: Dict,
    include_trades: bool = True,
    max_markets: int = 100,
) -> EnhancedEventResponse:
    """Fetch Kalshi event analytics"""
    
    event_id = cached_event.get("event_id")
    logger.info(f"Fetching analytics for Kalshi event: {event_id}")
    
    # Fetch markets with event_ticker filter
    try:
        response = await client.get(
            f"{DOME_API_BASE}/kalshi/markets",
            headers={"Authorization": f"Bearer {api_key}"},
            params={
                "event_ticker": event_id,
                "limit": max_markets,
            },
            timeout=15.0,
        )
        
        if response.status_code != 200:
            raise HTTPException(status_code=response.status_code, detail="Failed to fetch Kalshi markets")
        
        markets_data = response.json().get("markets", [])
    except Exception as e:
        logger.error(f"Failed to fetch Kalshi markets: {e}")
        markets_data = []
    
    # Process markets
    formatted_markets: List[MarketAnalytics] = []
    volume_by_market: List[Dict] = []
    volume_trends: List[VolumeTrend] = []
    
    total_volume = 0
    total_volume_24h = 0
    prices_list = []
    high_conviction = 0
    toss_ups = 0
    
    for m in markets_data:
        yes_price = m.get("last_price")
        no_price = 1 - yes_price if yes_price is not None else None
        
        volume_total = m.get("volume", 0) or 0
        volume_24h = m.get("volume_24h", 0) or 0
        volume_1_week = m.get("volume_1_week", 0) or volume_24h * 7
        
        momentum = calculate_momentum_score(volume_24h, volume_1_week, yes_price)
        
        # Construct Kalshi URL
        market_ticker = m.get("market_ticker", "")
        source_url = f"https://kalshi.com/markets/{market_ticker}" if market_ticker else None
        
        market_analytics = MarketAnalytics(
            market_id=market_ticker,
            title=m.get("title", ""),
            yes_price=yes_price,
            no_price=no_price,
            volume_total=volume_total,
            volume_24h=volume_24h,
            volume_1_week=volume_1_week,
            end_time=m.get("end_time"),
            status=m.get("status", "open"),
            source_url=source_url,
            momentum_score=momentum,
        )
        formatted_markets.append(market_analytics)
        
        volume_by_market.append({
            "market_id": m.get("market_ticker"),
            "title": m.get("title", "")[:40],
            "volume": volume_total,
            "volume_24h": volume_24h,
        })
        
        total_volume += volume_total
        total_volume_24h += volume_24h
        
        if yes_price is not None:
            prices_list.append(yes_price)
            if yes_price > 0.8 or yes_price < 0.2:
                high_conviction += 1
            elif 0.4 <= yes_price <= 0.6:
                toss_ups += 1
    
    avg_yes_price = sum(prices_list) / len(prices_list) if prices_list else None
    
    summary = EventSummary(
        event_id=event_id,
        title=cached_event.get("title", ""),
        platform="kalshi",
        category=cached_event.get("category", "other"),
        status=cached_event.get("status", "open"),
        end_time=cached_event.get("end_time"),
        time_remaining=get_time_remaining(cached_event.get("end_time")),
        total_markets=len(formatted_markets),
        total_volume=total_volume,
        volume_24h=total_volume_24h,
        avg_yes_price=avg_yes_price,
        high_conviction_count=high_conviction,
        toss_up_count=toss_ups,
        tags=cached_event.get("tags", []),
    )
    
    price_distribution = categorize_price_distribution([m.model_dump() for m in formatted_markets])
    
    return EnhancedEventResponse(
        summary=summary,
        markets=formatted_markets,
        trade_flow=TradeFlowStats(),
        recent_trades=[],
        volume_trends=volume_trends,
        price_history={},
        volume_by_market=volume_by_market[:15],
        price_distribution=price_distribution,
        cross_platform=CrossPlatformData(),
        last_updated=datetime.utcnow().isoformat(),
        refresh_interval_seconds=3600,
    )


# ============================================================================
# Price History Endpoint (for charts)
# ============================================================================

@router.get("/market/{token_id}/price-history")
async def get_price_history(
    token_id: str,
    hours: int = Query(24, ge=1, le=720, description="Hours of history"),
    interval: int = Query(60, ge=5, le=360, description="Interval in minutes"),
):
    """
    Get historical prices for a market token.
    
    Uses Dome API's at_time parameter to fetch prices at intervals.
    """
    api_key = get_dome_api_key()
    if not api_key:
        raise HTTPException(status_code=500, detail="DOME_API_KEY not configured")
    
    now = datetime.utcnow()
    start_time = now - timedelta(hours=hours)
    
    # Calculate time points
    points = []
    current = start_time
    while current <= now:
        points.append(int(current.timestamp()))
        current += timedelta(minutes=interval)
    
    # Limit to 50 points max
    if len(points) > 50:
        step = len(points) // 50
        points = points[::step]
    
    # Fetch prices at each point
    price_history = []
    
    async with httpx.AsyncClient() as client:
        for ts in points:
            try:
                resp = await client.get(
                    f"{DOME_API_BASE}/polymarket/market-price/{token_id}",
                    headers={"Authorization": f"Bearer {api_key}"},
                    params={"at_time": ts},
                    timeout=10.0,
                )
                
                if resp.status_code == 200:
                    data = resp.json()
                    price_history.append({
                        "timestamp": ts,
                        "price": data.get("price"),
                    })
            except Exception as e:
                logger.debug(f"Failed to fetch price at {ts}: {e}")
    
    return {
        "token_id": token_id,
        "history": price_history,
        "hours": hours,
        "interval_minutes": interval,
    }


async def fetch_generic_platform_analytics(
    client: httpx.AsyncClient,
    api_key: str,
    cached_event: Dict,
    platform: str,
    include_trades: bool = True,
    max_markets: int = 100,
) -> EnhancedEventResponse:
    """Fetch analytics for Limitless, OpinionTrade, and other generic platforms from database"""
    
    event_id = cached_event.get("event_id")
    logger.info(f"Fetching analytics for {platform} event from database: {event_id}")
    
    from app.database.session import get_db
    
    markets_data = []
    
    try:
        with next(get_db()) as db:
            # Fetch all market data from gold.event_markets_latest view (no snapshot bloat)
            result = db.execute(text("""
                SELECT 
                    market_id as condition_id,
                    market_title as question,
                    yes_price as current_yes_price,
                    no_price as current_no_price,
                    mid_price,
                    NULL::numeric as spread,
                    volume_24h,
                    volume_total,
                    liquidity,
                    NULL::numeric as open_interest,
                    NULL::integer as trade_count_24h,
                    NULL::integer as trade_count_total,
                    NULL::integer as unique_traders,
                    COALESCE(status, 'active') as status,
                    end_date,
                    NULL::timestamp as last_trade_at,
                    NULL::text as image_url,
                    source_url,
                    NULL::jsonb as extra_data
                FROM predictions_gold.event_markets_latest
                WHERE platform = :platform
                AND event_id = :event_id
                ORDER BY volume_24h DESC NULLS LAST
                LIMIT :max_markets
            """), {"platform": platform, "event_id": event_id, "max_markets": max_markets})
            
            db_markets = result.fetchall()
            logger.info(f"Fetched {len(db_markets)} markets from database for {platform}")
            
            # Convert database rows to market data format
            for m in db_markets:
                market_data = {
                    "condition_id": m.condition_id,
                    "market_slug": m.condition_id,  # Use condition_id as slug for generic platforms
                    "question": m.question,
                    "current_yes_price": float(m.current_yes_price) if m.current_yes_price is not None else None,
                    "current_no_price": float(m.current_no_price) if m.current_no_price is not None else None,
                    "mid_price": float(m.mid_price) if m.mid_price is not None else None,
                    "spread": float(m.spread) if m.spread is not None else None,
                    "volume_24h": float(m.volume_24h) if m.volume_24h is not None else None,
                    "volume_total": float(m.volume_total) if m.volume_total is not None else None,
                    "liquidity": float(m.liquidity) if m.liquidity is not None else None,
                    "open_interest": float(m.open_interest) if m.open_interest is not None else None,
                    "trade_count_24h": m.trade_count_24h if m.trade_count_24h is not None else None,
                    "trade_count_total": m.trade_count_total if m.trade_count_total is not None else None,
                    "unique_traders": m.unique_traders if m.unique_traders is not None else None,
                    "status": m.status or "active",
                    "end_date": m.end_date.isoformat() if m.end_date else None,
                    "last_trade_at": m.last_trade_at.isoformat() if m.last_trade_at else None,
                    "image_url": m.image_url,
                    "source_url": m.source_url,
                }
                markets_data.append(market_data)
    
    except Exception as e:
        logger.error(f"Failed to fetch markets from database: {e}")
        markets_data = []
    
    # If no markets found, return 404
    if not markets_data:
        raise HTTPException(
            status_code=404, 
            detail=f"Event {event_id} not found or has no active markets. This may be due to missing event_id mapping in the database."
        )
    
    # Build market summaries
    market_summaries = []
    for market in markets_data:
        yes_price = market.get("current_yes_price")
        no_price = market.get("current_no_price")
        
        # Skip markets without prices
        if yes_price is None or no_price is None:
            continue
        
        market_summaries.append({
            "market_id": market.get("condition_id"),
            "question": market.get("question"),
            "yes_price": yes_price,
            "no_price": no_price,
            "volume_24h": market.get("volume_24h", 0),
            "volume_total": market.get("volume_total", 0),
        })
    
    # Build summary metrics
    total_volume = sum(m.get("volume_total", 0) for m in markets_data)
    volume_24h = sum(m.get("volume_24h", 0) for m in markets_data)
    
    event_summary = EventSummary(
        event_id=event_id,
        platform=platform,
        title=cached_event.get("title", ""),
        market_count=len(markets_data),
        total_volume=total_volume,
        volume_24h=volume_24h,
        category=cached_event.get("category", "other"),
        status=cached_event.get("status", "active"),
    )
    
    # Build market analytics objects
    markets_analytics = []
    for market in markets_data:
        yes_price = market.get("current_yes_price", 0.5)
        no_price = market.get("current_no_price", 0.5)
        
        # Construct source URL based on platform
        market_slug = market.get("market_slug") or market.get("condition_id", "")
        market_id = market.get("market_id") or market.get("id", "")
        if platform == "limitless":
            source_url = f"https://limitless.exchange/markets/{market_slug}" if market_slug else None
        elif platform == "opiniontrade":
            source_url = f"https://app.opinion.trade/detail?topicId={market_id}" if market_id else None
        else:
            # Use source_url from DB if available, otherwise construct generic URL
            source_url = market.get("source_url")
        
        market_analytics = MarketAnalytics(
            market_id=market.get("condition_id", ""),
            condition_id=market.get("condition_id", ""),
            title=market.get("question", ""),
            yes_price=yes_price,
            no_price=no_price,
            volume_total=market.get("volume_total", 0),
            volume_24h=market.get("volume_24h", 0),
            volume_1_week=0,
            volume_change_pct=0,
            end_time=market.get("end_date"),
            status=market.get("status", "active"),
            image=market.get("image_url"),
            source_url=source_url,
            token_id_yes=None,
            token_id_no=None,
            momentum_score=0,
            is_whale_active=False,
            price_volatility=0,
            liquidity_score=0,
        )
        markets_analytics.append(market_analytics)
    
    from datetime import datetime, timezone
    
    return EnhancedEventResponse(
        summary=event_summary,
        markets=markets_analytics,
        trade_flow=TradeFlowStats(
            buy_volume=0,
            sell_volume=0,
            net_flow=0,
            buy_count=0,
            sell_count=0,
            whale_buy_volume=0,
            whale_sell_volume=0,
        ),
        recent_trades=[],
        volume_trends=[],
        price_history={},
        cross_platform=CrossPlatformData(
            platforms=[],
            total_volume=total_volume,
            price_correlation=0,
            arbitrage_opportunities=[],
        ),
        last_updated=datetime.now(timezone.utc).isoformat(),
    )


# ============================================================================
# Paginated Trades Endpoint - For Deep Dive into ALL Trades
# ============================================================================

@router.get("/event/{platform}/{event_id}/trades", response_model=PaginatedTradesResponse)
async def get_event_trades_paginated(
    platform: str,
    event_id: str,
    page: int = Query(1, ge=1, description="Page number (1-indexed)"),
    page_size: int = Query(100, ge=10, le=500, description="Trades per page"),
    token_filter: Optional[str] = Query(None, description="Filter by YES or NO"),
    sort_by: str = Query("value", description="Sort by: value or time"),
    sort_order: str = Query("desc", description="Sort order: asc or desc"),
):
    """
    Get paginated trades for an event with full data.
    
    Fetches ALL trades from ALL markets and returns them paginated.
    Use this endpoint for deep analytics and browsing all trades.
    
    Parameters:
    - page: Page number (1-indexed)
    - page_size: Number of trades per page (10-500, default 100)
    - token_filter: Filter by YES or NO (optional)
    - sort_by: Sort by "value" (USD) or "time" (timestamp)
    - sort_order: "asc" or "desc"
    """
    api_key = get_dome_api_key()
    if not api_key:
        raise HTTPException(status_code=500, detail="DOME_API_KEY not configured")
    
    # Normalize platform
    if platform in ["poly", "polymarket"]:
        platform = "polymarket"
    elif platform in ["kalshi"]:
        platform = "kalshi"
    elif platform in ["limitless"]:
        platform = "limitless"
    elif platform in ["opiniontrade"]:
        platform = "opiniontrade"
    else:
        raise HTTPException(status_code=400, detail=f"Unknown platform: {platform}")
    
    # Get cache service to get markets
    cache_service = get_events_cache_service()
    await cache_service.initialize()
    
    # Get event data from cache first
    events_data = await cache_service.get_all_events()
    event_data = None
    markets_data = []
    
    if events_data:
        polymarket_events = events_data.get("polymarket", {}).get("events", [])
        for e in polymarket_events:
            if e.get("event_id") == event_id or e.get("slug") == event_id:
                event_data = e
                markets_data = event_data.get("markets", [])
                break
    
    # If not in cache, fetch markets directly from API
    if not markets_data:
        logger.info(f"Event {event_id} not in cache, fetching markets directly")
        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(
                    f"{DOME_API_BASE}/polymarket/markets",
                    headers={"Authorization": f"Bearer {api_key}"},
                    params={
                        "event_slug": event_id,
                        "limit": 100,
                    },
                    timeout=15.0,
                )
                if response.status_code == 200:
                    markets_data = response.json().get("markets", [])
                    logger.info(f"Fetched {len(markets_data)} markets for {event_id}")
            except Exception as e:
                logger.error(f"Failed to fetch markets for {event_id}: {e}")
    
    if not markets_data:
        raise HTTPException(status_code=404, detail=f"Event not found or has no markets: {event_id}")
    
    # Fetch ALL trades from ALL markets
    all_trades: List[TradeRecord] = []
    
    async with httpx.AsyncClient() as client:
        for market in markets_data:
            try:
                # Fetch up to 1000 trades per market (API max)
                trades_resp = await client.get(
                    f"{DOME_API_BASE}/polymarket/orders",
                    headers={"Authorization": f"Bearer {api_key}"},
                    params={
                        "market_slug": market.get("market_slug"),
                        "limit": 1000,
                    },
                    timeout=20.0,
                )
                
                if trades_resp.status_code == 200:
                    trades_data = trades_resp.json().get("orders", [])
                    
                    for trade in trades_data:
                        shares = trade.get("shares_normalized", 0) or trade.get("shares", 0)
                        price = trade.get("price", 0)
                        usd_value = shares * price if shares and price else 0
                        is_whale = usd_value >= 10000
                        
                        record = TradeRecord(
                            timestamp=trade.get("timestamp", 0),
                            market_id=trade.get("market_slug", ""),
                            market_title=trade.get("title", ""),
                            side=trade.get("side", ""),
                            token_label=trade.get("token_label", "YES"),
                            price=price,
                            shares=shares,
                            usd_value=usd_value,
                            is_whale=is_whale,
                            taker=trade.get("taker") or trade.get("user"),
                            tx_hash=trade.get("tx_hash"),
                            order_hash=trade.get("order_hash"),
                        )
                        all_trades.append(record)
                        
            except Exception as e:
                logger.debug(f"Failed to fetch trades for {market.get('market_slug')}: {e}")
    
    logger.info(f"Fetched {len(all_trades)} total trades for {event_id}")
    
    # Apply token filter if specified
    filtered_trades = all_trades
    if token_filter:
        token_filter_upper = token_filter.upper()
        filtered_trades = [t for t in all_trades if (t.token_label or "").upper() == token_filter_upper]
    
    # Calculate summary stats before sorting/pagination
    total_volume = sum(t.usd_value or 0 for t in filtered_trades)
    whale_count = sum(1 for t in filtered_trades if t.is_whale)
    buy_count = sum(1 for t in filtered_trades if t.side == "BUY")
    sell_count = sum(1 for t in filtered_trades if t.side == "SELL")
    
    # Sort trades
    if sort_by == "time":
        filtered_trades = sorted(filtered_trades, key=lambda t: t.timestamp or 0, reverse=(sort_order == "desc"))
    else:  # value
        filtered_trades = sorted(filtered_trades, key=lambda t: t.usd_value or 0, reverse=(sort_order == "desc"))
    
    # Paginate
    total_count = len(filtered_trades)
    total_pages = (total_count + page_size - 1) // page_size if total_count > 0 else 0
    
    start_idx = (page - 1) * page_size
    end_idx = start_idx + page_size
    paginated_trades = filtered_trades[start_idx:end_idx]
    
    return PaginatedTradesResponse(
        trades=paginated_trades,
        total_count=total_count,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
        has_next=page < total_pages,
        has_prev=page > 1,
        token_filter=token_filter,
        sort_by=sort_by,
        sort_order=sort_order,
        total_volume=total_volume,
        whale_count=whale_count,
        buy_count=buy_count,
        sell_count=sell_count,
    )
