"""
Market Test API
Experimental endpoint - ISOLATED from existing markets functionality
Fetches from market_test table and enriches with Dome API data
"""
from fastapi import APIRouter, Query, HTTPException
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
import httpx
import logging
import asyncio
import time
from enum import Enum

from app.config import settings
from app.models.market_test import (
    MarketTest,
    MarketTestEnriched,
    MarketTestCreate,
    MarketTestUpdate,
    MarketStatus,
    get_all_market_tests,
    get_market_test_by_id,
    create_market_test,
    update_market_test,
    delete_market_test,
    seed_sample_market_tests,
)

router = APIRouter()
logger = logging.getLogger(__name__)

# Dome API configuration
DOME_API_BASE = "https://api.domeapi.io/v1"

# Simple in-memory cache with TTL
_cache: Dict[str, Dict[str, Any]] = {}
CACHE_TTL_SECONDS = 300  # 5 minutes
PRICE_CACHE_TTL = 60  # 1 minute for price data


def get_dome_api_key() -> str:
    """Get Dome API key from settings"""
    key = getattr(settings, 'DOME_API_KEY', None) or ""
    if not key:
        logger.warning("DOME_API_KEY not configured")
    return key


def cache_get(key: str) -> Optional[Any]:
    """Get value from cache if not expired"""
    if key in _cache:
        entry = _cache[key]
        if datetime.utcnow() < entry["expires_at"]:
            return entry["data"]
        else:
            del _cache[key]
    return None


def cache_set(key: str, data: Any, ttl_seconds: int = CACHE_TTL_SECONDS):
    """Set value in cache with TTL"""
    _cache[key] = {
        "data": data,
        "expires_at": datetime.utcnow() + timedelta(seconds=ttl_seconds),
    }


async def fetch_polymarket_price(
    client: httpx.AsyncClient,
    api_key: str,
    token_id: str,
) -> Optional[float]:
    """Fetch current price for a Polymarket token"""
    cache_key = f"price:{token_id}"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached
    
    try:
        response = await client.get(
            f"{DOME_API_BASE}/polymarket/prices/{token_id}",
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=5.0,
        )
        
        if response.status_code == 200:
            data = response.json()
            price = data.get("price")
            if price is not None:
                cache_set(cache_key, price, ttl_seconds=PRICE_CACHE_TTL)
                return price
    except Exception as e:
        logger.debug(f"Failed to fetch Polymarket price: {e}")
    
    return None


async def fetch_polymarket_candlesticks(
    client: httpx.AsyncClient,
    api_key: str,
    condition_id: str,
) -> Optional[Dict[str, Any]]:
    """Fetch candlestick data for price history and volume"""
    cache_key = f"candles:{condition_id}"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached
    
    try:
        now = int(time.time())
        start = now - (2 * 24 * 60 * 60)  # 2 days ago (seconds, not ms!)
        
        response = await client.get(
            f"{DOME_API_BASE}/polymarket/candlesticks/{condition_id}",
            headers={"Authorization": f"Bearer {api_key}"},
            params={
                "start_time": start,
                "end_time": now,
                "interval": 1440,  # daily
            },
            timeout=10.0,
        )
        
        if response.status_code == 200:
            data = response.json()
            cache_set(cache_key, data, ttl_seconds=PRICE_CACHE_TTL)
            return data
    except Exception as e:
        logger.debug(f"Failed to fetch candlesticks: {e}")
    
    return None


async def fetch_polymarket_orderbook(
    client: httpx.AsyncClient,
    api_key: str,
    token_id: str,
) -> Optional[Dict[str, Any]]:
    """Fetch orderbook data for a Polymarket token"""
    cache_key = f"orderbook:{token_id}"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached
    
    try:
        now = int(time.time() * 1000)  # milliseconds
        start = now - (60 * 60 * 1000)  # 1 hour ago
        
        response = await client.get(
            f"{DOME_API_BASE}/polymarket/orderbooks/{token_id}",
            headers={"Authorization": f"Bearer {api_key}"},
            params={
                "start_time": start,
                "end_time": now,
                "limit": 1,
            },
            timeout=5.0,
        )
        
        if response.status_code == 200:
            data = response.json()
            cache_set(cache_key, data, ttl_seconds=60)
            return data
    except Exception as e:
        logger.debug(f"Failed to fetch orderbook: {e}")
    
    return None


def parse_candlestick_data(candles_data: Dict[str, Any]) -> Dict[str, Any]:
    """Parse candlestick response to extract price and volume metrics"""
    result = {
        "current_price": None,
        "price_24h_ago": None,
        "volume_24h": None,
        "volume_7d": None,
    }
    
    try:
        candlesticks = candles_data.get("candlesticks", [])
        if not candlesticks:
            return result
        
        # Structure: candlesticks[0] = YES side, candlesticks[1] = NO side
        # Each side: [candles_list, metadata_dict]
        # candles_list: list of dicts with end_period_ts, price, volume, etc.
        
        yes_side = None
        if len(candlesticks) >= 1 and isinstance(candlesticks[0], list) and len(candlesticks[0]) >= 1:
            yes_side = candlesticks[0][0]  # The list of candle dicts
        
        if not yes_side or not isinstance(yes_side, list) or len(yes_side) == 0:
            return result
        
        # Sort candles by timestamp to get latest
        candles = sorted(yes_side, key=lambda c: c.get("end_period_ts", 0))
        
        # Get most recent candle for current price
        latest = candles[-1] if candles else None
        if latest and "price" in latest:
            price_data = latest["price"]
            close_str = price_data.get("close_dollars", "0")
            try:
                result["current_price"] = float(close_str)
            except:
                pass
        
        # Get 24h ago candle for price change
        # Each candle is 1 day (1440 min interval), so previous candle is ~24h ago
        if len(candles) >= 2:
            prev = candles[-2]
            if prev and "price" in prev:
                close_str = prev["price"].get("close_dollars", "0")
                try:
                    result["price_24h_ago"] = float(close_str)
                except:
                    pass
        
    except Exception as e:
        logger.debug(f"Error parsing candlesticks: {e}")
    
    return result


def calculate_orderbook_metrics(orderbook_data: Dict[str, Any]) -> Dict[str, Any]:
    """Calculate metrics from orderbook data"""
    result = {
        "bid_depth_usd": None,
        "ask_depth_usd": None,
        "spread_bps": None,
    }
    
    try:
        snapshots = orderbook_data.get("snapshots", [])
        if not snapshots:
            return result
        
        snapshot = snapshots[0] if isinstance(snapshots[0], dict) else None
        if not snapshot:
            return result
        
        bids = snapshot.get("bids", [])
        asks = snapshot.get("asks", [])
        
        # Calculate bid depth
        bid_depth = 0.0
        best_bid = 0.0
        for bid in bids[:10]:  # Top 10 levels
            size = float(bid.get("size", 0))
            price = float(bid.get("price", 0))
            bid_depth += size * price
            if price > best_bid:
                best_bid = price
        result["bid_depth_usd"] = bid_depth
        
        # Calculate ask depth
        ask_depth = 0.0
        best_ask = 1.0
        for ask in asks[:10]:  # Top 10 levels
            size = float(ask.get("size", 0))
            price = float(ask.get("price", 0))
            ask_depth += size * price
            if price < best_ask:
                best_ask = price
        result["ask_depth_usd"] = ask_depth
        
        # Calculate spread in bps
        if best_bid > 0 and best_ask > 0 and best_ask > best_bid:
            mid = (best_bid + best_ask) / 2
            spread = best_ask - best_bid
            result["spread_bps"] = (spread / mid) * 10000
        
    except Exception as e:
        logger.debug(f"Error calculating orderbook metrics: {e}")
    
    return result


async def fetch_polymarket_data(
    client: httpx.AsyncClient,
    api_key: str,
    market_slug: Optional[str] = None,
    condition_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Fetch Polymarket data from Dome API"""
    if not market_slug and not condition_id:
        return None
    
    cache_key = f"poly:{market_slug or condition_id}"
    cached = cache_get(cache_key)
    if cached:
        return cached
    
    try:
        # Try fetching by slug first
        params = {"limit": 1}
        if market_slug:
            params["market_slug"] = market_slug
        
        response = await client.get(
            f"{DOME_API_BASE}/polymarket/markets",
            headers={"Authorization": f"Bearer {api_key}"},
            params=params,
            timeout=10.0,
        )
        
        if response.status_code == 200:
            data = response.json()
            markets = data.get("markets", [])
            if markets:
                result = markets[0]
                cache_set(cache_key, result)
                return result
    except Exception as e:
        logger.warning(f"Failed to fetch Polymarket data: {e}")
    
    return None


async def fetch_kalshi_data(
    client: httpx.AsyncClient,
    api_key: str,
    market_ticker: Optional[str] = None,
    event_ticker: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Fetch Kalshi data from Dome API"""
    if not market_ticker:
        return None
    
    cache_key = f"kalshi:{market_ticker}"
    cached = cache_get(cache_key)
    if cached:
        return cached
    
    try:
        params = {"limit": 1}
        if market_ticker:
            params["ticker"] = market_ticker
        
        response = await client.get(
            f"{DOME_API_BASE}/kalshi/markets",
            headers={"Authorization": f"Bearer {api_key}"},
            params=params,
            timeout=10.0,
        )
        
        if response.status_code == 200:
            data = response.json()
            markets = data.get("markets", [])
            if markets:
                result = markets[0]
                cache_set(cache_key, result)
                return result
    except Exception as e:
        logger.warning(f"Failed to fetch Kalshi data: {e}")
    
    return None


async def fetch_orderbook_data(
    client: httpx.AsyncClient,
    api_key: str,
    platform: str,
    market_id: str,
) -> Optional[Dict[str, Any]]:
    """Fetch orderbook data from Dome API"""
    cache_key = f"orderbook:{platform}:{market_id}"
    cached = cache_get(cache_key)
    if cached:
        return cached
    
    try:
        endpoint = f"{DOME_API_BASE}/{platform}/orderbook/{market_id}"
        response = await client.get(
            endpoint,
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=10.0,
        )
        
        if response.status_code == 200:
            result = response.json()
            cache_set(cache_key, result, ttl_seconds=60)  # Shorter TTL for orderbook
            return result
    except Exception as e:
        logger.debug(f"Failed to fetch orderbook data: {e}")
    
    return None


async def fetch_top_markets_from_dome(
    client: httpx.AsyncClient,
    api_key: str,
    platform: str = "polymarket",
    limit: int = 100,
    min_volume: int = 50000,
    status: str = "open",
) -> List[Dict[str, Any]]:
    """Fetch top markets directly from Dome API"""
    cache_key = f"top_markets:{platform}:{limit}:{min_volume}:{status}"
    cached = cache_get(cache_key)
    if cached:
        logger.info(f"Using cached {platform} markets ({len(cached)} markets)")
        return cached
    
    try:
        params = {
            "limit": min(limit, 100),  # Dome API max is 100 per request
            "min_volume": min_volume,
            "status": status,
            "sort_by": "volume",
            "sort_order": "desc",
        }
        
        response = await client.get(
            f"{DOME_API_BASE}/{platform}/markets",
            headers={"Authorization": f"Bearer {api_key}"},
            params=params,
            timeout=30.0,
        )
        
        if response.status_code == 200:
            data = response.json()
            markets = data.get("markets", [])
            logger.info(f"Fetched {len(markets)} {platform} markets from Dome API")
            cache_set(cache_key, markets, ttl_seconds=120)  # Cache for 2 minutes
            return markets
        else:
            logger.warning(f"Dome API returned {response.status_code} for {platform} markets")
    except Exception as e:
        logger.error(f"Failed to fetch {platform} markets: {e}")
    
    return []


def convert_dome_market_to_enriched(market_data: Dict[str, Any], platform: str) -> MarketTestEnriched:
    """Convert raw Dome API market data to MarketTestEnriched"""
    from datetime import timezone
    
    # Common fields - Kalshi uses market_ticker, Polymarket uses market_slug
    if platform == "kalshi":
        market_id = market_data.get("market_ticker") or market_data.get("ticker") or market_data.get("id", "unknown")
    else:
        market_id = market_data.get("market_slug") or market_data.get("id", "unknown")
    
    title = market_data.get("title") or market_data.get("question") or "Unknown Market"
    
    # Parse dates - timestamps are in seconds
    end_time = None
    start_time = None
    if "end_time" in market_data and market_data["end_time"]:
        try:
            if isinstance(market_data["end_time"], int):
                end_time = datetime.fromtimestamp(market_data["end_time"])
            else:
                end_time = datetime.fromisoformat(str(market_data["end_time"]).replace("Z", "+00:00"))
        except Exception as e:
            logger.debug(f"Failed to parse end_time: {e}")
    
    if "start_time" in market_data and market_data["start_time"]:
        try:
            if isinstance(market_data["start_time"], int):
                start_time = datetime.fromtimestamp(market_data["start_time"])
            else:
                start_time = datetime.fromisoformat(str(market_data["start_time"]).replace("Z", "+00:00"))
        except Exception as e:
            logger.debug(f"Failed to parse start_time: {e}")
    
    # Determine category from tags or title
    category = "Other"
    tags = market_data.get("tags", []) or []
    title_lower = title.lower()
    
    # Check tags first (more reliable)
    tag_lower_list = [t.lower() for t in tags] if tags else []
    
    if any(t in ["politics", "election", "government"] for t in tag_lower_list) or \
       any(kw in title_lower for kw in ["trump", "biden", "election", "president", "congress", "senate", "governor", "mayor"]):
        category = "Politics"
    elif any(t in ["crypto", "bitcoin", "ethereum", "cryptocurrency"] for t in tag_lower_list) or \
         any(kw in title_lower for kw in ["bitcoin", "btc", "ethereum", "eth", "crypto", "solana", "xrp"]):
        category = "Crypto"
    elif any(t in ["sports", "nfl", "nba", "soccer", "football", "baseball", "hockey"] for t in tag_lower_list) or \
         any(kw in title_lower for kw in ["super bowl", "nfl", "nba", "world cup", "game", "match", "win the 20", "championship", "leeds", "panthers"]):
        category = "Sports"
    elif any(t in ["economy", "fed", "inflation", "gdp", "rates", "fed rates"] for t in tag_lower_list) or \
         any(kw in title_lower for kw in ["fed", "inflation", "gdp", "economy", "rate", "unemployment", "interest rate"]):
        category = "Economy"
    
    # Extract prices - Kalshi has last_price, Polymarket doesn't have prices in list API
    yes_price = None
    no_price = None
    
    if platform == "kalshi":
        # Kalshi returns last_price (0-1 scale for cents, or 0-100 for percentage)
        last_price = market_data.get("last_price")
        if last_price is not None:
            # Kalshi prices are in cents (0-100), convert to 0-1
            if last_price > 1:
                yes_price = last_price / 100.0
            else:
                yes_price = last_price
            no_price = 1.0 - yes_price if yes_price <= 1.0 else None
    # Polymarket list API doesn't return prices - would need separate API call
    
    # Volume - different field names per platform
    if platform == "polymarket":
        volume_total = market_data.get("volume_total", 0) or 0
        volume_7d = market_data.get("volume_1_week", 0) or 0
        volume_24h = 0  # Polymarket list API doesn't return 24h volume
    else:  # kalshi
        volume_total = market_data.get("volume", 0) or 0
        volume_24h = market_data.get("volume_24h", 0) or 0
        volume_7d = 0  # Kalshi doesn't return 7d volume
    
    # Status
    status_str = market_data.get("status", "open")
    if status_str == "open":
        status = MarketStatus.OPEN
    elif status_str == "resolved":
        status = MarketStatus.RESOLVED
    else:
        status = MarketStatus.CLOSED
    
    # Build enriched object
    enriched = MarketTestEnriched(
        id=str(hash(market_id) & 0xFFFFFFFF),
        market_id=market_id,
        title=title,
        category=category,
        start=start_time,
        end=end_time,
        status=status,
        platforms=[platform],
        polymarket_market_slug=market_data.get("market_slug") if platform == "polymarket" else None,
        polymarket_condition_id=market_data.get("condition_id") if platform == "polymarket" else None,
        kalshi_market_ticker=market_data.get("market_ticker") if platform == "kalshi" else None,
        kalshi_event_ticker=market_data.get("event_ticker") if platform == "kalshi" else None,
        volume_total_usd=volume_total,
        volume_24h_usd=volume_24h if volume_24h > 0 else None,
        volume_7d_usd=volume_7d if volume_7d > 0 else None,
        yes_price_last=yes_price,
        last_price_yes=yes_price,
        last_price_no=no_price,
        mid_price=yes_price,
        polymarket_data=market_data if platform == "polymarket" else None,
        kalshi_data=market_data if platform == "kalshi" else None,
    )
    
    # Liquidity score based on volume
    liquidity_score = 0
    vol_check = volume_24h if volume_24h > 0 else volume_7d / 7 if volume_7d > 0 else volume_total / 30
    
    if vol_check >= 100000:
        liquidity_score = 80
    elif vol_check >= 50000:
        liquidity_score = 60
    elif vol_check >= 10000:
        liquidity_score = 40
    elif vol_check >= 1000:
        liquidity_score = 20
    else:
        liquidity_score = 10
    
    enriched.liquidity_score = min(liquidity_score, 100)
    
    if enriched.liquidity_score >= 70:
        enriched.liquidity_label = "High"
    elif enriched.liquidity_score >= 50:
        enriched.liquidity_label = "Medium"
    elif enriched.liquidity_score >= 30:
        enriched.liquidity_label = "Low"
    else:
        enriched.liquidity_label = "Very Low"
    
    # Actions
    actions = {}
    if platform == "polymarket" and market_data.get("market_slug"):
        actions["open_market"] = f"https://polymarket.com/event/{market_data.get('market_slug')}"
        actions["trade"] = f"https://polymarket.com/event/{market_data.get('market_slug')}"
    elif platform == "kalshi" and market_data.get("market_ticker"):
        actions["open_market"] = f"https://kalshi.com/markets/{market_data.get('market_ticker')}"
        actions["trade"] = f"https://kalshi.com/markets/{market_data.get('market_ticker')}"
    enriched.actions = actions
    
    return enriched
    enriched.actions = actions
    
    return enriched


def enrich_market_test(
    market_test: MarketTest,
    polymarket_data: Optional[Dict[str, Any]] = None,
    kalshi_data: Optional[Dict[str, Any]] = None,
    orderbook_data: Optional[Dict[str, Any]] = None,
) -> MarketTestEnriched:
    """Enrich a market test with external data and compute derived fields"""
    from datetime import datetime, timezone
    
    enriched = MarketTestEnriched(
        **market_test.model_dump(),
        polymarket_data=polymarket_data,
        kalshi_data=kalshi_data,
    )
    
    # Initialize tracking variables
    poly_yes_price = None
    kalshi_yes_price = None
    poly_volume_24h = 0.0
    kalshi_volume_24h = 0.0
    total_trades_24h = 0
    total_buy_notional = 0.0
    total_sell_notional = 0.0
    whale_count = 0
    whale_threshold = 5000.0
    
    # Extract data from Polymarket
    if polymarket_data:
        enriched.volume_total_usd = polymarket_data.get("volume_total", 0) or 0
        enriched.volume_7d_usd = polymarket_data.get("volume_1_week", 0)
        poly_volume_24h = polymarket_data.get("volume_24h", 0) or 0
        
        # Get price data from outcomes
        if "outcomes" in polymarket_data:
            outcomes = polymarket_data.get("outcomes", [])
            for outcome in outcomes:
                if outcome.get("name", "").lower() in ["yes", "true", "1"]:
                    poly_yes_price = outcome.get("price")
                    enriched.last_price_yes = poly_yes_price
                    enriched.yes_price_last = poly_yes_price
                    
                    # 24h price change if available
                    price_24h_ago = outcome.get("price_24h_ago")
                    if price_24h_ago is not None and poly_yes_price is not None:
                        enriched.yes_change_24h = poly_yes_price - price_24h_ago
                        if price_24h_ago > 0:
                            enriched.yes_change_24h_pct = ((poly_yes_price - price_24h_ago) / price_24h_ago) * 100
                            
                elif outcome.get("name", "").lower() in ["no", "false", "0"]:
                    enriched.last_price_no = outcome.get("price")
        
        # Trade metrics from Polymarket
        trades = polymarket_data.get("trades_24h", 0) or 0
        total_trades_24h += trades
        
        # Last trade time
        last_trade = polymarket_data.get("last_trade_time")
        if last_trade:
            try:
                if isinstance(last_trade, str):
                    enriched.last_trade_time = datetime.fromisoformat(last_trade.replace("Z", "+00:00"))
                else:
                    enriched.last_trade_time = last_trade
            except:
                pass
    
    # Extract data from Kalshi
    if kalshi_data:
        kalshi_volume = kalshi_data.get("volume", 0) or 0
        # Use Kalshi volume if higher
        if kalshi_volume > enriched.volume_total_usd:
            enriched.volume_total_usd = kalshi_volume
        
        kalshi_volume_24h = kalshi_data.get("volume_24h", 0) or 0
        
        # Get price data
        kalshi_yes_price = kalshi_data.get("last_price") or kalshi_data.get("yes_price")
        if kalshi_yes_price is not None:
            # If no Polymarket price, use Kalshi
            if enriched.last_price_yes is None:
                enriched.last_price_yes = kalshi_yes_price
                enriched.yes_price_last = kalshi_yes_price
            enriched.last_price_no = 1.0 - kalshi_yes_price if kalshi_yes_price <= 1.0 else None
            
            # 24h change
            yes_price_24h_ago = kalshi_data.get("yes_price_24h_ago")
            if yes_price_24h_ago is not None and enriched.yes_change_24h is None:
                enriched.yes_change_24h = kalshi_yes_price - yes_price_24h_ago
                if yes_price_24h_ago > 0:
                    enriched.yes_change_24h_pct = ((kalshi_yes_price - yes_price_24h_ago) / yes_price_24h_ago) * 100
        
        # Trade metrics from Kalshi
        kalshi_trades = kalshi_data.get("trades_24h", 0) or kalshi_data.get("trade_count_24h", 0) or 0
        total_trades_24h += kalshi_trades
        
        # Buy/sell pressure from Kalshi
        buy_volume = kalshi_data.get("buy_volume_24h", 0) or 0
        sell_volume = kalshi_data.get("sell_volume_24h", 0) or 0
        total_buy_notional += buy_volume
        total_sell_notional += sell_volume
        
        # Last trade time (use latest)
        kalshi_last_trade = kalshi_data.get("last_trade_time")
        if kalshi_last_trade:
            try:
                if isinstance(kalshi_last_trade, str):
                    kalshi_trade_dt = datetime.fromisoformat(kalshi_last_trade.replace("Z", "+00:00"))
                else:
                    kalshi_trade_dt = kalshi_last_trade
                    
                if enriched.last_trade_time is None or kalshi_trade_dt > enriched.last_trade_time:
                    enriched.last_trade_time = kalshi_trade_dt
            except:
                pass
    
    # Combine 24h volumes
    enriched.volume_24h_usd = poly_volume_24h + kalshi_volume_24h if (poly_volume_24h or kalshi_volume_24h) else None
    
    # Trade count
    enriched.trades_24h = total_trades_24h if total_trades_24h > 0 else None
    enriched.trade_count_24h = enriched.trades_24h
    
    # Average trade metrics
    if total_trades_24h > 0 and enriched.volume_24h_usd:
        enriched.avg_trade_notional_24h_usd = enriched.volume_24h_usd / total_trades_24h
        enriched.avg_trade_size_usd = enriched.avg_trade_notional_24h_usd
        # Estimate contracts (assuming ~$1 per contract on average)
        enriched.avg_trade_size_24h_contracts = enriched.avg_trade_notional_24h_usd
    
    # Last trade age
    if enriched.last_trade_time:
        try:
            now = datetime.now(timezone.utc)
            if enriched.last_trade_time.tzinfo is None:
                enriched.last_trade_time = enriched.last_trade_time.replace(tzinfo=timezone.utc)
            diff = now - enriched.last_trade_time
            enriched.last_trade_age_minutes = int(diff.total_seconds() / 60)
        except:
            pass
    
    # Buy pressure ratio
    total_pressure = total_buy_notional + total_sell_notional
    if total_pressure > 0:
        enriched.buy_pressure_24h_ratio = total_buy_notional / total_pressure
        enriched.buy_notional_24h_usd = total_buy_notional
        enriched.sell_notional_24h_usd = total_sell_notional
    
    # Whale trades (estimate from large trades if available)
    whale_trades_poly = (polymarket_data or {}).get("whale_trades_24h", 0) or 0
    whale_trades_kalshi = (kalshi_data or {}).get("whale_trades_24h", 0) or 0
    enriched.whale_trades_24h = whale_trades_poly + whale_trades_kalshi if (whale_trades_poly or whale_trades_kalshi) else None
    enriched.whale_threshold_usd = whale_threshold
    
    # Calculate mid price
    if enriched.last_price_yes is not None and enriched.last_price_no is not None:
        enriched.mid_price = (enriched.last_price_yes + (1 - enriched.last_price_no)) / 2
    elif enriched.last_price_yes is not None:
        enriched.mid_price = enriched.last_price_yes
    
    # Extract orderbook metrics
    if orderbook_data:
        bids = orderbook_data.get("bids", [])
        asks = orderbook_data.get("asks", [])
        
        # Calculate depth
        bid_depth = sum(float(b.get("size", 0)) * float(b.get("price", 0)) for b in bids[:10])
        ask_depth = sum(float(a.get("size", 0)) * float(a.get("price", 0)) for a in asks[:10])
        enriched.bid_depth_usd = bid_depth
        enriched.ask_depth_usd = ask_depth
        
        # Calculate spread
        if bids and asks:
            best_bid = max(float(b.get("price", 0)) for b in bids) if bids else 0
            best_ask = min(float(a.get("price", 0)) for a in asks) if asks else 0
            if best_bid > 0:
                spread = (best_ask - best_bid) / best_bid * 10000  # basis points
                enriched.spread_bps = spread
    
    # Liquidity score (0-100)
    liquidity_score = 0
    if enriched.volume_24h_usd:
        if enriched.volume_24h_usd >= 100000:
            liquidity_score += 40
        elif enriched.volume_24h_usd >= 50000:
            liquidity_score += 30
        elif enriched.volume_24h_usd >= 10000:
            liquidity_score += 20
        else:
            liquidity_score += 10
    
    if enriched.trades_24h:
        if enriched.trades_24h >= 100:
            liquidity_score += 30
        elif enriched.trades_24h >= 50:
            liquidity_score += 20
        elif enriched.trades_24h >= 10:
            liquidity_score += 10
    
    if enriched.spread_bps is not None:
        if enriched.spread_bps < 50:
            liquidity_score += 30
        elif enriched.spread_bps < 100:
            liquidity_score += 20
        elif enriched.spread_bps < 200:
            liquidity_score += 10
    
    enriched.liquidity_score = min(liquidity_score, 100)
    
    # Liquidity label
    if enriched.liquidity_score >= 70:
        enriched.liquidity_label = "High"
    elif enriched.liquidity_score >= 50:
        enriched.liquidity_label = "Medium"
    elif enriched.liquidity_score >= 30:
        enriched.liquidity_label = "Low"
    else:
        enriched.liquidity_label = "Very Low"
    
    # Arbitrage opportunity detection
    if poly_yes_price is not None and kalshi_yes_price is not None:
        price_diff = abs(poly_yes_price - kalshi_yes_price)
        if price_diff > 0.01:  # More than 1% difference
            enriched.arb_best_spread = price_diff * 10000  # Convert to bps
            if poly_yes_price > kalshi_yes_price:
                enriched.arb_direction = "kalshi_to_poly"
            else:
                enriched.arb_direction = "poly_to_kalshi"
            
            # Executability based on liquidity
            if enriched.liquidity_score and enriched.liquidity_score >= 60:
                enriched.arb_executability = "Good"
            elif enriched.liquidity_score and enriched.liquidity_score >= 40:
                enriched.arb_executability = "Medium"
            else:
                enriched.arb_executability = "Poor"
    
    # Build actions URLs
    actions = {}
    if market_test.polymarket_market_slug:
        actions["open_market"] = f"https://polymarket.com/event/{market_test.polymarket_market_slug}"
        actions["trade"] = f"https://polymarket.com/event/{market_test.polymarket_market_slug}"
    elif market_test.kalshi_market_ticker:
        actions["open_market"] = f"https://kalshi.com/markets/{market_test.kalshi_market_ticker}"
        actions["trade"] = f"https://kalshi.com/markets/{market_test.kalshi_market_ticker}"
    
    if enriched.arb_direction:
        actions["arb_view"] = f"/market-test/{market_test.id}?arb=1"
    
    enriched.actions = actions
    
    return enriched


async def enrich_with_candlestick_data(
    client: httpx.AsyncClient,
    api_key: str,
    market: MarketTestEnriched,
) -> MarketTestEnriched:
    """
    Enrich a Polymarket market with price data from candlesticks API.
    This provides the missing yes_price, 24h change, etc.
    """
    if not market.polymarket_condition_id:
        return market
    
    condition_id = market.polymarket_condition_id
    
    try:
        # Fetch candlestick data
        candles_data = await fetch_polymarket_candlesticks(client, api_key, condition_id)
        if not candles_data:
            return market
        
        # Parse candlestick data
        parsed = parse_candlestick_data(candles_data)
        
        # Update market with price data
        if parsed.get("current_price") is not None:
            market.yes_price_last = parsed["current_price"]
            market.last_price_yes = parsed["current_price"]
            market.mid_price = parsed["current_price"]
            
            # Calculate 24h change
            if parsed.get("price_24h_ago") is not None:
                price_24h_ago = parsed["price_24h_ago"]
                current = parsed["current_price"]
                market.yes_change_24h = current - price_24h_ago
                if price_24h_ago > 0:
                    market.yes_change_24h_pct = ((current - price_24h_ago) / price_24h_ago) * 100
        
    except Exception as e:
        logger.debug(f"Failed to enrich {market.market_id} with candlesticks: {e}")
    
    return market


class SortBy(str, Enum):
    VOLUME = "volume"
    CREATED = "created"
    END_DATE = "end_date"
    TITLE = "title"


@router.get("/markets")
async def get_market_tests(
    category: Optional[str] = Query(None, description="Filter by category"),
    status: Optional[MarketStatus] = Query(None, description="Filter by status"),
    platform: Optional[str] = Query(None, description="Filter by platform (polymarket/kalshi)"),
    sort_by: SortBy = Query(SortBy.VOLUME, description="Sort by field"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Page size"),
    enrich: bool = Query(True, description="Fetch enriched data from Dome API"),
) -> Dict[str, Any]:
    """
    Get top 100 markets directly from Dome API.
    This is ISOLATED from the existing markets functionality.
    """
    api_key = get_dome_api_key()
    if not api_key:
        raise HTTPException(status_code=500, detail="DOME_API_KEY not configured")
    
    enriched_markets: List[MarketTestEnriched] = []
    
    async with httpx.AsyncClient() as client:
        # Determine which platforms to fetch
        platforms_to_fetch = []
        if platform == "polymarket":
            platforms_to_fetch = ["polymarket"]
        elif platform == "kalshi":
            platforms_to_fetch = ["kalshi"]
        else:
            platforms_to_fetch = ["polymarket", "kalshi"]
        
        # Fetch markets from each platform
        for plat in platforms_to_fetch:
            try:
                raw_markets = await fetch_top_markets_from_dome(
                    client, api_key, 
                    platform=plat, 
                    limit=100,
                    min_volume=50000,
                    status="open"
                )
                
                for market_data in raw_markets:
                    try:
                        enriched = convert_dome_market_to_enriched(market_data, plat)
                        enriched_markets.append(enriched)
                    except Exception as e:
                        logger.warning(f"Failed to convert market: {e}")
                        continue
                        
            except Exception as e:
                logger.error(f"Failed to fetch {plat} markets: {e}")
        
        # Enrich Polymarket markets with candlestick data (for prices)
        # Only enrich the first page to avoid too many API calls
        if enrich:
            # Sort first to prioritize high-volume markets
            enriched_markets.sort(key=lambda m: m.volume_total_usd, reverse=True)
            
            # Filter by category early to reduce enrichment calls
            if category:
                enriched_markets = [m for m in enriched_markets if m.category.lower() == category.lower()]
            
            # Calculate which markets are on the current page
            start_idx = (page - 1) * page_size
            end_idx = start_idx + page_size
            
            # Enrich only markets on current page that need it (Polymarket without price)
            markets_to_enrich = []
            for i, market in enumerate(enriched_markets[start_idx:end_idx]):
                if market.polymarket_condition_id and market.yes_price_last is None:
                    markets_to_enrich.append((start_idx + i, market))
            
            # Limit concurrent enrichments to avoid rate limiting
            BATCH_SIZE = 10
            for batch_start in range(0, len(markets_to_enrich), BATCH_SIZE):
                batch = markets_to_enrich[batch_start:batch_start + BATCH_SIZE]
                
                async def enrich_task(idx: int, m: MarketTestEnriched):
                    enriched = await enrich_with_candlestick_data(client, api_key, m)
                    return (idx, enriched)
                
                tasks = [enrich_task(idx, m) for idx, m in batch]
                results = await asyncio.gather(*tasks, return_exceptions=True)
                
                for result in results:
                    if isinstance(result, Exception):
                        logger.debug(f"Enrichment failed: {result}")
                        continue
                    idx, enriched_market = result
                    enriched_markets[idx] = enriched_market
                
                # Small delay between batches to avoid rate limiting
                if batch_start + BATCH_SIZE < len(markets_to_enrich):
                    await asyncio.sleep(0.1)
        else:
            # Not enriching, still need to filter by category
            if category:
                enriched_markets = [m for m in enriched_markets if m.category.lower() == category.lower()]
    
    # Sort (already sorted by volume if enriching, but may need different sort)
    if sort_by == SortBy.VOLUME:
        enriched_markets.sort(key=lambda m: m.volume_total_usd, reverse=True)
    elif sort_by == SortBy.CREATED:
        enriched_markets.sort(key=lambda m: m.created_at, reverse=True)
    elif sort_by == SortBy.END_DATE:
        enriched_markets.sort(key=lambda m: m.end or datetime.max, reverse=False)
    elif sort_by == SortBy.TITLE:
        enriched_markets.sort(key=lambda m: m.title.lower())
    
    # Paginate
    total = len(enriched_markets)
    start_idx = (page - 1) * page_size
    end_idx = start_idx + page_size
    paginated = enriched_markets[start_idx:end_idx]
    
    total_pages = (total + page_size - 1) // page_size
    
    return {
        "markets": [m.model_dump() for m in paginated],
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": total_pages,
            "has_more": page < total_pages,
        },
        "filters": {
            "category": category,
            "status": status.value if status else None,
            "platform": platform,
        },
    }


@router.get("/markets/{market_test_id}")
async def get_market_test_detail(
    market_test_id: str,
    enrich: bool = Query(True, description="Fetch enriched data from Dome API"),
) -> Dict[str, Any]:
    """Get a single market test by ID with enrichment"""
    market = get_market_test_by_id(market_test_id)
    if not market:
        raise HTTPException(status_code=404, detail="Market test not found")
    
    api_key = get_dome_api_key()
    
    if enrich and api_key:
        async with httpx.AsyncClient() as client:
            poly_data = None
            kalshi_data = None
            
            if market.polymarket_market_slug or market.polymarket_condition_id:
                poly_data = await fetch_polymarket_data(
                    client, api_key,
                    market.polymarket_market_slug,
                    market.polymarket_condition_id,
                )
            
            if market.kalshi_market_ticker:
                kalshi_data = await fetch_kalshi_data(
                    client, api_key,
                    market.kalshi_market_ticker,
                    market.kalshi_event_ticker,
                )
            
            enriched = enrich_market_test(market, poly_data, kalshi_data)
            return {"market": enriched.model_dump()}
    
    return {"market": MarketTestEnriched(**market.model_dump()).model_dump()}


@router.post("/markets")
async def create_new_market_test(data: MarketTestCreate) -> Dict[str, Any]:
    """Create a new market test"""
    market = create_market_test(data)
    return {"market": market.model_dump(), "message": "Market test created successfully"}


@router.put("/markets/{market_test_id}")
async def update_existing_market_test(
    market_test_id: str,
    data: MarketTestUpdate,
) -> Dict[str, Any]:
    """Update an existing market test"""
    market = update_market_test(market_test_id, data)
    if not market:
        raise HTTPException(status_code=404, detail="Market test not found")
    return {"market": market.model_dump(), "message": "Market test updated successfully"}


@router.delete("/markets/{market_test_id}")
async def delete_existing_market_test(market_test_id: str) -> Dict[str, Any]:
    """Delete a market test"""
    success = delete_market_test(market_test_id)
    if not success:
        raise HTTPException(status_code=404, detail="Market test not found")
    return {"message": "Market test deleted successfully"}


@router.post("/seed")
async def seed_sample_data() -> Dict[str, Any]:
    """Seed sample market test data"""
    count = seed_sample_market_tests()
    return {"message": f"Seeded {count} sample market tests", "count": count}


@router.get("/categories")
async def get_categories() -> Dict[str, Any]:
    """Get all unique categories from market tests"""
    all_markets = get_all_market_tests()
    categories = list(set(m.category for m in all_markets))
    return {"categories": sorted(categories)}


@router.get("/stats")
async def get_market_test_stats() -> Dict[str, Any]:
    """Get statistics about market tests"""
    all_markets = get_all_market_tests()
    
    by_category = {}
    by_status = {}
    by_platform = {}
    
    for m in all_markets:
        by_category[m.category] = by_category.get(m.category, 0) + 1
        by_status[m.status.value] = by_status.get(m.status.value, 0) + 1
        for p in m.platforms:
            by_platform[p] = by_platform.get(p, 0) + 1
    
    return {
        "total": len(all_markets),
        "by_category": by_category,
        "by_status": by_status,
        "by_platform": by_platform,
    }


# =============================================================================
# Individual Market Terminal Endpoints
# =============================================================================

async def fetch_polymarket_trades(
    client: httpx.AsyncClient,
    api_key: str,
    market_slug: str,
    limit: int = 100,
) -> List[Dict[str, Any]]:
    """Fetch trade history for a Polymarket market"""
    try:
        response = await client.get(
            f"{DOME_API_BASE}/polymarket/orders",
            headers={"Authorization": f"Bearer {api_key}"},
            params={
                "market_slug": market_slug,
                "limit": limit,
            },
            timeout=15.0,
        )
        
        if response.status_code == 200:
            data = response.json()
            return data.get("orders", [])
    except Exception as e:
        logger.warning(f"Failed to fetch Polymarket trades: {e}")
    
    return []


async def fetch_polymarket_orderbook_latest(
    client: httpx.AsyncClient,
    api_key: str,
    token_id: str,
) -> Optional[Dict[str, Any]]:
    """Fetch latest orderbook snapshot for a Polymarket token"""
    try:
        response = await client.get(
            f"{DOME_API_BASE}/polymarket/orderbooks",
            headers={"Authorization": f"Bearer {api_key}"},
            params={
                "token_id": token_id,
                "limit": 1,
            },
            timeout=10.0,
        )
        
        if response.status_code == 200:
            data = response.json()
            snapshots = data.get("snapshots", [])
            if snapshots:
                return snapshots[0]
    except Exception as e:
        logger.warning(f"Failed to fetch Polymarket orderbook: {e}")
    
    return None


async def fetch_kalshi_trades(
    client: httpx.AsyncClient,
    api_key: str,
    ticker: str,
    limit: int = 100,
) -> List[Dict[str, Any]]:
    """Fetch trade history for a Kalshi market"""
    try:
        response = await client.get(
            f"{DOME_API_BASE}/kalshi/trades",
            headers={"Authorization": f"Bearer {api_key}"},
            params={
                "ticker": ticker,
                "limit": limit,
            },
            timeout=15.0,
        )
        
        if response.status_code == 200:
            data = response.json()
            return data.get("trades", [])
    except Exception as e:
        logger.warning(f"Failed to fetch Kalshi trades: {e}")
    
    return []


async def fetch_kalshi_orderbook_latest(
    client: httpx.AsyncClient,
    api_key: str,
    ticker: str,
) -> Optional[Dict[str, Any]]:
    """Fetch latest orderbook snapshot for a Kalshi market"""
    try:
        response = await client.get(
            f"{DOME_API_BASE}/kalshi/orderbooks",
            headers={"Authorization": f"Bearer {api_key}"},
            params={
                "ticker": ticker,
                "limit": 1,
            },
            timeout=10.0,
        )
        
        if response.status_code == 200:
            data = response.json()
            snapshots = data.get("snapshots", [])
            if snapshots:
                return snapshots[0]
    except Exception as e:
        logger.warning(f"Failed to fetch Kalshi orderbook: {e}")
    
    return None


async def fetch_polymarket_candlesticks_extended(
    client: httpx.AsyncClient,
    api_key: str,
    condition_id: str,
    days: int = 30,
    interval: int = 60,  # 1 hour candles
) -> List[Dict[str, Any]]:
    """Fetch extended candlestick data for charting"""
    try:
        now = int(time.time())
        start = now - (days * 24 * 60 * 60)
        
        response = await client.get(
            f"{DOME_API_BASE}/polymarket/candlesticks/{condition_id}",
            headers={"Authorization": f"Bearer {api_key}"},
            params={
                "start_time": start,
                "end_time": now,
                "interval": interval,
            },
            timeout=15.0,
        )
        
        if response.status_code == 200:
            data = response.json()
            candlesticks = data.get("candlesticks", [])
            
            # Parse the nested structure
            if candlesticks and len(candlesticks) >= 1:
                yes_side = candlesticks[0]
                if isinstance(yes_side, list) and len(yes_side) >= 1:
                    candles = yes_side[0]
                    if isinstance(candles, list):
                        return candles
    except Exception as e:
        logger.warning(f"Failed to fetch extended candlesticks: {e}")
    
    return []


def calculate_trade_analytics(trades: List[Dict[str, Any]], platform: str) -> Dict[str, Any]:
    """Calculate analytics from trade history"""
    if not trades:
        return {
            "total_trades": 0,
            "total_volume": 0,
            "avg_trade_size": 0,
            "buy_count": 0,
            "sell_count": 0,
            "buy_volume": 0,
            "sell_volume": 0,
            "buy_pressure": 0.5,
            "whale_trades": 0,
            "largest_trade": 0,
        }
    
    total_volume = 0
    buy_count = 0
    sell_count = 0
    buy_volume = 0
    sell_volume = 0
    whale_trades = 0
    largest_trade = 0
    whale_threshold = 5000  # $5k threshold
    
    for trade in trades:
        if platform == "polymarket":
            shares = trade.get("shares_normalized", 0) or 0
            price = trade.get("price", 0) or 0
            notional = shares * price
            side = trade.get("side", "").upper()
        else:  # kalshi
            count = trade.get("count", 0) or 0
            yes_price = trade.get("yes_price_dollars", 0) or 0
            notional = count * yes_price
            side = trade.get("taker_side", "").upper()
        
        total_volume += notional
        
        if side in ["BUY", "YES"]:
            buy_count += 1
            buy_volume += notional
        elif side in ["SELL", "NO"]:
            sell_count += 1
            sell_volume += notional
        
        if notional >= whale_threshold:
            whale_trades += 1
        
        if notional > largest_trade:
            largest_trade = notional
    
    total_trades = len(trades)
    avg_trade_size = total_volume / total_trades if total_trades > 0 else 0
    
    total_directional = buy_volume + sell_volume
    buy_pressure = buy_volume / total_directional if total_directional > 0 else 0.5
    
    return {
        "total_trades": total_trades,
        "total_volume": round(total_volume, 2),
        "avg_trade_size": round(avg_trade_size, 2),
        "buy_count": buy_count,
        "sell_count": sell_count,
        "buy_volume": round(buy_volume, 2),
        "sell_volume": round(sell_volume, 2),
        "buy_pressure": round(buy_pressure, 4),
        "whale_trades": whale_trades,
        "largest_trade": round(largest_trade, 2),
    }


def calculate_orderbook_analytics(orderbook: Optional[Dict[str, Any]], platform: str) -> Dict[str, Any]:
    """Calculate analytics from orderbook snapshot"""
    result = {
        "best_bid": None,
        "best_ask": None,
        "spread": None,
        "spread_bps": None,
        "mid_price": None,
        "bid_depth_10": 0,
        "ask_depth_10": 0,
        "total_liquidity": 0,
        "imbalance": 0,  # -1 to 1, positive = more bids
        "bids": [],
        "asks": [],
    }
    
    if not orderbook:
        return result
    
    try:
        if platform == "polymarket":
            bids = orderbook.get("bids", [])
            asks = orderbook.get("asks", [])
            
            # Process bids
            processed_bids = []
            bid_depth = 0
            best_bid = 0
            for bid in bids[:20]:
                price = float(bid.get("price", 0))
                size = float(bid.get("size", 0))
                processed_bids.append({"price": price, "size": size})
                bid_depth += size * price
                if price > best_bid:
                    best_bid = price
            
            # Process asks
            processed_asks = []
            ask_depth = 0
            best_ask = 1.0
            for ask in asks[:20]:
                price = float(ask.get("price", 0))
                size = float(ask.get("size", 0))
                processed_asks.append({"price": price, "size": size})
                ask_depth += size * price
                if price < best_ask and price > 0:
                    best_ask = price
            
            result["bids"] = processed_bids
            result["asks"] = processed_asks
            result["best_bid"] = best_bid if best_bid > 0 else None
            result["best_ask"] = best_ask if best_ask < 1 else None
            result["bid_depth_10"] = round(bid_depth, 2)
            result["ask_depth_10"] = round(ask_depth, 2)
            
        else:  # kalshi
            ob = orderbook.get("orderbook", {})
            yes_bids = ob.get("yes_dollars", [])
            no_bids = ob.get("no_dollars", [])
            
            # Yes bids are like buying YES
            processed_bids = []
            bid_depth = 0
            best_bid = 0
            for level in yes_bids[:20]:
                if isinstance(level, list) and len(level) >= 2:
                    price = float(level[0])
                    size = int(level[1])
                    processed_bids.append({"price": price, "size": size})
                    bid_depth += size * price
                    if price > best_bid:
                        best_bid = price
            
            # No bids give us the asks (1 - no_price = yes_ask)
            processed_asks = []
            ask_depth = 0
            best_ask = 1.0
            for level in no_bids[:20]:
                if isinstance(level, list) and len(level) >= 2:
                    no_price = float(level[0])
                    yes_price = 1.0 - no_price
                    size = int(level[1])
                    processed_asks.append({"price": yes_price, "size": size})
                    ask_depth += size * yes_price
                    if yes_price < best_ask and yes_price > 0:
                        best_ask = yes_price
            
            result["bids"] = processed_bids
            result["asks"] = sorted(processed_asks, key=lambda x: x["price"])
            result["best_bid"] = best_bid if best_bid > 0 else None
            result["best_ask"] = best_ask if best_ask < 1 else None
            result["bid_depth_10"] = round(bid_depth, 2)
            result["ask_depth_10"] = round(ask_depth, 2)
        
        # Calculate derived metrics
        if result["best_bid"] and result["best_ask"]:
            spread = result["best_ask"] - result["best_bid"]
            mid = (result["best_bid"] + result["best_ask"]) / 2
            result["spread"] = round(spread, 4)
            result["spread_bps"] = round((spread / mid) * 10000, 2) if mid > 0 else None
            result["mid_price"] = round(mid, 4)
        
        total_depth = result["bid_depth_10"] + result["ask_depth_10"]
        result["total_liquidity"] = round(total_depth, 2)
        
        if total_depth > 0:
            result["imbalance"] = round((result["bid_depth_10"] - result["ask_depth_10"]) / total_depth, 4)
        
    except Exception as e:
        logger.warning(f"Error calculating orderbook analytics: {e}")
    
    return result


def format_candlesticks_for_chart(candles: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Format candlestick data for frontend charting"""
    formatted = []
    
    for candle in candles:
        try:
            ts = candle.get("end_period_ts", 0)
            price_data = candle.get("price", {})
            volume_val = candle.get("volume", 0)
            
            # Handle both int and dict volume formats
            if isinstance(volume_val, dict):
                volume = float(volume_val.get("total_volume", 0) or 0)
            else:
                volume = float(volume_val or 0)
            
            formatted.append({
                "time": ts,
                "open": float(price_data.get("open_dollars", 0) or 0),
                "high": float(price_data.get("high_dollars", 0) or 0),
                "low": float(price_data.get("low_dollars", 0) or 0),
                "close": float(price_data.get("close_dollars", 0) or 0),
                "volume": volume,
            })
        except Exception:
            continue
    
    # Sort by time
    formatted.sort(key=lambda x: x["time"])
    return formatted


@router.get("/market/{platform}/{market_id}")
async def get_market_terminal_data(
    platform: str,
    market_id: str,
    include_trades: bool = Query(True, description="Include trade history"),
    include_orderbook: bool = Query(True, description="Include orderbook data"),
    include_chart: bool = Query(True, description="Include candlestick chart data"),
    trade_limit: int = Query(100, ge=1, le=500, description="Number of trades to fetch"),
    chart_days: int = Query(30, ge=1, le=90, description="Days of chart history"),
) -> Dict[str, Any]:
    """
    Get comprehensive market data for trading terminal view.
    
    Returns:
    - Market info (title, status, prices, volume)
    - Trade history with analytics
    - Orderbook with depth analytics
    - Candlestick data for charting
    """
    if platform not in ["polymarket", "poly", "kalshi"]:
        raise HTTPException(status_code=400, detail="Platform must be 'polymarket' or 'kalshi'")
    
    # Normalize platform name
    if platform == "poly":
        platform = "polymarket"
    
    api_key = get_dome_api_key()
    if not api_key:
        raise HTTPException(status_code=500, detail="Dome API key not configured")
    
    async with httpx.AsyncClient() as client:
        # Fetch base market data first
        market_data = None
        token_id = None
        condition_id = None
        
        if platform == "polymarket":
            # Fetch market info
            response = await client.get(
                f"{DOME_API_BASE}/polymarket/markets",
                headers={"Authorization": f"Bearer {api_key}"},
                params={"market_slug": market_id, "limit": 1},
                timeout=10.0,
            )
            
            if response.status_code == 200:
                data = response.json()
                markets = data.get("markets", [])
                if markets:
                    market_data = markets[0]
                    condition_id = market_data.get("condition_id")
                    
                    # Get token IDs from side_a/side_b (Yes/No outcomes)
                    # Dome API returns: side_a: {id: "token_id", label: "Yes"}, side_b: {id: "token_id", label: "No"}
                    side_a = market_data.get("side_a", {})
                    side_b = market_data.get("side_b", {})
                    
                    if side_a.get("label", "").lower() in ["yes", "true"]:
                        token_id = side_a.get("id")
                    elif side_b.get("label", "").lower() in ["yes", "true"]:
                        token_id = side_b.get("id")
                    elif side_a.get("id"):  # Default to side_a if no "yes" label
                        token_id = side_a.get("id")
                    
                    # Fallback: check outcomes array (older API format)
                    if not token_id:
                        outcomes = market_data.get("outcomes", [])
                        for outcome in outcomes:
                            if outcome.get("name", "").lower() in ["yes", "true"]:
                                token_id = outcome.get("token_id")
                                break
        else:  # kalshi
            response = await client.get(
                f"{DOME_API_BASE}/kalshi/markets",
                headers={"Authorization": f"Bearer {api_key}"},
                params={"ticker": market_id, "limit": 1},
                timeout=10.0,
            )
            
            if response.status_code == 200:
                data = response.json()
                markets = data.get("markets", [])
                if markets:
                    market_data = markets[0]
        
        if not market_data:
            raise HTTPException(status_code=404, detail=f"Market not found: {market_id}")
        
        # Convert to enriched format
        enriched = convert_dome_market_to_enriched(market_data, platform)
        
        # Parallel fetch of additional data
        tasks = []
        
        if include_trades:
            if platform == "polymarket":
                tasks.append(("trades", fetch_polymarket_trades(client, api_key, market_id, trade_limit)))
            else:
                tasks.append(("trades", fetch_kalshi_trades(client, api_key, market_id, trade_limit)))
        
        if include_orderbook:
            if platform == "polymarket" and token_id:
                tasks.append(("orderbook", fetch_polymarket_orderbook_latest(client, api_key, token_id)))
            elif platform == "kalshi":
                tasks.append(("orderbook", fetch_kalshi_orderbook_latest(client, api_key, market_id)))
        
        if include_chart and platform == "polymarket" and condition_id:
            tasks.append(("candles", fetch_polymarket_candlesticks_extended(client, api_key, condition_id, chart_days)))
        
        # Fetch candlesticks for current price enrichment
        if platform == "polymarket" and condition_id:
            tasks.append(("price_candles", fetch_polymarket_candlesticks(client, api_key, condition_id)))
        
        # Execute all tasks
        results = {}
        if tasks:
            task_names = [t[0] for t in tasks]
            task_coros = [t[1] for t in tasks]
            task_results = await asyncio.gather(*task_coros, return_exceptions=True)
            
            for name, result in zip(task_names, task_results):
                if isinstance(result, Exception):
                    logger.warning(f"Task {name} failed: {result}")
                    results[name] = None
                else:
                    results[name] = result
        
        # Enrich with price data from candlesticks
        if platform == "polymarket" and results.get("price_candles"):
            parsed = parse_candlestick_data(results["price_candles"])
            if parsed.get("current_price"):
                enriched.yes_price_last = parsed["current_price"]
                enriched.last_price_yes = parsed["current_price"]
                enriched.mid_price = parsed["current_price"]
                
                if parsed.get("price_24h_ago"):
                    change = parsed["current_price"] - parsed["price_24h_ago"]
                    enriched.yes_change_24h = change
                    if parsed["price_24h_ago"] > 0:
                        enriched.yes_change_24h_pct = (change / parsed["price_24h_ago"]) * 100
        
        # Build response
        response_data = {
            "platform": platform,
            "market_id": market_id,
            "market": enriched.model_dump(),
        }
        
        # Add trade data
        if include_trades:
            trades = results.get("trades", []) or []
            trade_analytics = calculate_trade_analytics(trades, platform)
            response_data["trades"] = {
                "data": trades[:50],  # Limit to 50 for response size
                "total_fetched": len(trades),
                "analytics": trade_analytics,
            }
        
        # Add orderbook data
        if include_orderbook:
            orderbook = results.get("orderbook")
            ob_analytics = calculate_orderbook_analytics(orderbook, platform)
            response_data["orderbook"] = {
                "snapshot": orderbook,
                "analytics": ob_analytics,
            }
        
        # Add chart data
        if include_chart:
            candles = results.get("candles", []) or []
            formatted_candles = format_candlesticks_for_chart(candles)
            response_data["chart"] = {
                "candles": formatted_candles,
                "interval_minutes": 60,
                "days": chart_days,
            }
        
        # Add platform-specific links
        if platform == "polymarket":
            response_data["links"] = {
                "trade": f"https://polymarket.com/event/{market_id}",
                "share": f"https://polymarket.com/event/{market_id}",
            }
        else:
            response_data["links"] = {
                "trade": f"https://kalshi.com/markets/{market_id}",
                "share": f"https://kalshi.com/markets/{market_id}",
            }
        
        return response_data
