"""
Unified Markets API
Hybrid version - fetches Polymarket from database, others from live APIs
"""
from fastapi import APIRouter, Query, HTTPException, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text, desc
from pydantic import BaseModel
from typing import Optional, List, Dict, Any, Literal
import logging
from enum import Enum
import httpx
import asyncio
import time

from app.config import settings
from app.database.session import get_db
from app.services.kalshi_service import get_kalshi_client
from app.services.limitless_service import get_limitless_client
from app.services.opiniontrade_service import get_opiniontrade_client
from app.services.production_cache_service import get_production_cache

router = APIRouter()
logger = logging.getLogger(__name__)

# Dome API configuration
DOME_API_BASE = "https://api.domeapi.io/v1"

# Dome API limit per request (max 100)
DOME_API_MAX_LIMIT = 100

# =============================================================================
# UNIFIED MARKETS CACHE
# Caches the full normalized markets list from ALL platforms
# Avoids re-fetching 4 APIs on every Screener page load
# =============================================================================
_unified_cache: Dict[str, Any] = {
    "markets": None,         # List[UnifiedMarket]
    "platform_counts": None, # Dict[str, int]
    "timestamp": 0,
    "is_refreshing": False,
}
UNIFIED_CACHE_TTL = 300      # 5 minutes - fresh
UNIFIED_CACHE_STALE_TTL = 3600  # 1 hour - serve stale while refreshing

# Platform-specific minimum volume floors (adjusted for performance)
# 50K provides good balance of quality markets and coverage
DEFAULT_MIN_VOLUME_BOTH = 50_000       # 50K when fetching from both platforms
DEFAULT_MIN_VOLUME_POLY = 50_000       # 50K for Polymarket only
DEFAULT_MIN_VOLUME_KALSHI = 50_000     # 50K for Kalshi only

# Max markets to fetch per platform (limits API calls for faster response)
# 200 markets = 2 API calls per platform = ~4 seconds total
MAX_MARKETS_PER_PLATFORM = 200


class PlatformType(str, Enum):
    ALL = "all"
    POLY = "poly"
    KALSHI = "kalshi"
    LIMITLESS = "limitless"
    OPINIONTRADE = "opiniontrade"


class CategoryType(str, Enum):
    ALL = "all"
    TRENDING = "trending"
    POLITICS = "politics"
    CRYPTO = "crypto"
    SPORTS = "sports"
    ENTERTAINMENT = "entertainment"
    ECONOMY = "economy"
    WEATHER = "weather"
    OTHER = "other"


class UnifiedMarket(BaseModel):
    platform: Literal["poly", "kalshi", "limitless", "opiniontrade"]
    id: str
    title: str
    status: str
    start_time: Optional[int] = None
    end_time: Optional[int] = None
    close_time: Optional[int] = None
    volume_total_usd: float
    volume_24h_usd: Optional[float] = None
    volume_1_week_usd: Optional[float] = None
    volume_1_month_usd: Optional[float] = None
    category: str
    tags: List[str] = []
    last_price: Optional[float] = None
    event_group: Optional[str] = None  # Event grouping: event_slug (poly), event_ticker (kalshi), slug-prefix (limitless)
    event_group_label: Optional[str] = None  # Human-readable event name
    extra: Dict[str, Any] = {}


class PaginatedResponse(BaseModel):
    markets: List[UnifiedMarket]
    pagination: Dict[str, Any]
    platform_stats: Dict[str, Any]


def get_dome_api_key() -> str:
    """Get Dome API key from settings"""
    key = getattr(settings, 'DOME_API_KEY', None) or ""
    if not key:
        import os
        key = os.environ.get('DOME_API_KEY', '')
    return key


def categorize_market(title: str, tags: List[str], event_ticker: Optional[str] = None) -> str:
    """
    Categorize market based on title, tags, and event_ticker.
    For Kalshi, event_ticker often contains category hints (e.g., PRES-2028, BTC-24H, NFL-SB)
    """
    title_lower = title.lower()
    tags_lower = [t.lower() for t in tags]
    ticker_lower = (event_ticker or "").lower()
    
    # Combined text for searching
    search_text = f"{title_lower} {' '.join(tags_lower)} {ticker_lower}"
    
    # Category keywords mapping
    category_keywords = {
        'Politics': [
            'politics', 'political', 'election', 'president', 'congress', 'senate', 
            'governor', 'trump', 'biden', 'pres-', 'vote', 'gop', 'democrat', 
            'republican', 'midterm', 'fed ', 'fed-', 'powell', 'interest rate',
            'tariff', 'supreme court', 'scotus', 'cabinet', 'impeach'
        ],
        'Crypto': [
            'crypto', 'bitcoin', 'ethereum', 'btc', 'eth', 'cryptocurrency', 
            'blockchain', 'defi', 'solana', 'sol-', 'xrp', 'doge', 'memecoin',
            'altcoin', 'nft', 'web3', 'coinbase', 'binance'
        ],
        'Sports': [
            'sports', 'nfl', 'nba', 'mlb', 'nhl', 'soccer', 'football', 
            'basketball', 'baseball', 'hockey', 'tennis', 'golf', 'super bowl',
            'world series', 'playoffs', 'championship', 'premier league', 
            'champions league', 'ufc', 'boxing', 'olympics', 'f1', 'formula 1',
            'nascar', 'pga', 'wimbledon', 'world cup', 'sb-', 'mvp'
        ],
        'Entertainment': [
            'entertainment', 'movies', 'music', 'celebrity', 'oscars', 'grammy', 
            'tv', 'streaming', 'spotify', 'netflix', 'box office', 'album',
            'concert', 'taylor swift', 'emmy', 'golden globe', 'billboard'
        ],
        'Economy': [
            'economy', 'gdp', 'inflation', 'cpi', 'unemployment', 'jobs', 
            'recession', 'stock', 's&p', 'nasdaq', 'dow', 'market', 'treasury',
            'bond', 'yield', 'oil', 'gas price', 'housing'
        ],
        'Weather': [
            'weather', 'hurricane', 'temperature', 'climate', 'snow', 'rain',
            'tornado', 'storm', 'drought', 'flood'
        ],
    }
    
    for category, keywords in category_keywords.items():
        for keyword in keywords:
            if keyword in search_text:
                return category
    
    return 'Other'


async def fetch_all_markets_paginated(
    client: httpx.AsyncClient,
    api_key: str,
    platform: str,
    search: Optional[str] = None,
    status: str = "open",
    tags: Optional[List[str]] = None,
    event_ticker: Optional[List[str]] = None,
    min_volume: Optional[float] = None,
    max_markets: int = MAX_MARKETS_PER_PLATFORM
) -> Dict[str, Any]:
    """
    Fetch ALL markets from a platform using pagination.
    Dome API max limit is 100 per request, so we loop with offset.
    """
    all_markets = []
    offset = 0
    total = 0
    
    while True:
        if platform == "poly":
            result = await fetch_polymarket_markets(
                client, api_key, search, status, tags, min_volume, DOME_API_MAX_LIMIT, offset
            )
        else:
            result = await fetch_kalshi_markets(
                client, api_key, search, status, event_ticker, min_volume, DOME_API_MAX_LIMIT, offset
            )
        
        markets = result.get("markets", [])
        pagination = result.get("pagination", {})
        total = pagination.get("total", 0)
        
        all_markets.extend(markets)
        
        # Stop if no more markets or reached max
        if not pagination.get("has_more", False) or len(all_markets) >= max_markets:
            break
        
        offset += DOME_API_MAX_LIMIT
        
        # Safety limit to avoid infinite loops
        if offset > 2000:
            logger.warning(f"Reached offset limit for {platform}")
            break
    
    return {
        "markets": all_markets[:max_markets],
        "pagination": {
            "total": total,
            "fetched": len(all_markets[:max_markets])
        }
    }


async def fetch_polymarket_markets(
    client: httpx.AsyncClient,
    api_key: str,
    search: Optional[str] = None,
    status: str = "open",
    tags: Optional[List[str]] = None,
    min_volume: Optional[float] = None,
    limit: int = 50,
    offset: int = 0
) -> Dict[str, Any]:
    """Fetch markets from Polymarket via Dome API"""
    params = {
        "limit": min(limit, 100),
        "offset": offset,
    }
    
    if status and status != "all":
        params["status"] = status
    if search:
        params["search"] = search
    if min_volume:
        params["min_volume"] = min_volume
    if tags:
        params["tags[]"] = tags
    
    headers = {"Authorization": f"Bearer {api_key}"}
    
    try:
        response = await client.get(
            f"{DOME_API_BASE}/polymarket/markets",
            params=params,
            headers=headers,
            timeout=30.0
        )
        response.raise_for_status()
        return response.json()
    except httpx.HTTPError as e:
        logger.error(f"Error fetching Polymarket markets: {e}")
        return {"markets": [], "pagination": {"total": 0, "has_more": False}}


async def fetch_kalshi_markets(
    client: httpx.AsyncClient,
    api_key: str,
    search: Optional[str] = None,
    status: str = "open",
    event_ticker: Optional[List[str]] = None,
    min_volume: Optional[float] = None,
    limit: int = 50,
    offset: int = 0
) -> Dict[str, Any]:
    """Fetch markets from Kalshi via Dome API"""
    params = {
        "limit": min(limit, 100),
        "offset": offset,
    }
    
    if status and status != "all":
        params["status"] = status
    if search:
        params["search"] = search
    if min_volume:
        params["min_volume"] = min_volume
    if event_ticker:
        params["event_ticker[]"] = event_ticker
    
    headers = {"Authorization": f"Bearer {api_key}"}
    
    try:
        response = await client.get(
            f"{DOME_API_BASE}/kalshi/markets",
            params=params,
            headers=headers,
            timeout=30.0
        )
        response.raise_for_status()
        return response.json()
    except httpx.HTTPError as e:
        logger.error(f"Error fetching Kalshi markets: {e}")
        return {"markets": [], "pagination": {"total": 0, "has_more": False}}


def normalize_polymarket(market: Dict[str, Any]) -> UnifiedMarket:
    """Normalize Polymarket market to unified format"""
    tags = market.get("tags", []) or []
    title = market.get("title", "")
    
    return UnifiedMarket(
        platform="poly",
        id=market.get("market_slug", ""),
        title=title,
        status=market.get("status", "open"),
        start_time=market.get("start_time"),
        end_time=market.get("end_time"),
        close_time=market.get("close_time"),
        volume_total_usd=market.get("volume_total", 0) or 0,
        volume_24h_usd=None,  # Polymarket doesn't provide 24h volume
        volume_1_week_usd=market.get("volume_1_week", 0) or 0,
        volume_1_month_usd=market.get("volume_1_month", 0) or 0,
        category=categorize_market(title, tags),
        tags=tags,
        last_price=None,
        extra={
            "condition_id": market.get("condition_id"),
            "market_slug": market.get("market_slug"),
            "event_slug": market.get("event_slug"),  # For Polymarket URL: /event/{event_slug}
            "image": market.get("image"),
            "resolution_source": market.get("resolution_source"),
            "side_a": market.get("side_a"),
            "side_b": market.get("side_b"),
            "winning_side": market.get("winning_side"),
            "game_start_time": market.get("game_start_time"),
        }
    )


def normalize_kalshi(market: Dict[str, Any]) -> UnifiedMarket:
    """Normalize Kalshi market to unified format"""
    title = market.get("title", "")
    event_ticker = market.get("event_ticker", "")
    
    # Kalshi prices are in cents (0-100), convert to decimal (0-1)
    last_price = market.get("last_price")
    if last_price is not None:
        last_price = float(last_price) / 100  # Convert from cents to decimal
    
    return UnifiedMarket(
        platform="kalshi",
        id=market.get("market_ticker", ""),
        title=title,
        status=market.get("status", "open"),
        start_time=market.get("start_time"),
        end_time=market.get("end_time"),
        close_time=market.get("close_time"),
        volume_total_usd=market.get("volume", 0) or 0,
        volume_24h_usd=market.get("volume_24h", 0) or 0,
        volume_1_week_usd=None,
        volume_1_month_usd=None,
        category=categorize_market(title, [], event_ticker),  # Pass event_ticker for better categorization
        tags=[],
        last_price=last_price,
        extra={
            "market_ticker": market.get("market_ticker"),
            "event_ticker": event_ticker,
            "result": market.get("result"),
        }
    )


def normalize_limitless(market: Dict[str, Any]) -> UnifiedMarket:
    """Normalize Limitless market to unified format"""
    title = market.get("title", "")
    slug = market.get("slug", "")
    
    # Get price from prices array or outcomePrices
    prices = market.get("prices", [])
    outcome_prices = market.get("outcomePrices", [])
    yes_price = None
    
    if prices and len(prices) > 0:
        yes_price = float(prices[0]) / 100 if prices[0] else None
    elif outcome_prices and len(outcome_prices) > 0:
        yes_price = float(outcome_prices[0]) if outcome_prices[0] else None
    
    # Parse volume - use volumeFormatted (in USD) if available, otherwise raw volume is in tiny units
    volume_formatted = market.get("volumeFormatted", "")
    volume = 0
    
    if volume_formatted:
        # volumeFormatted is the actual USD value (e.g., "3181.990000" = $3181)
        try:
            volume_formatted = str(volume_formatted).replace("$", "").replace(",", "")
            if "K" in volume_formatted.upper():
                volume = float(volume_formatted.upper().replace("K", "")) * 1000
            elif "M" in volume_formatted.upper():
                volume = float(volume_formatted.upper().replace("M", "")) * 1_000_000
            else:
                volume = float(volume_formatted)
        except:
            volume = 0
    elif market.get("volume"):
        # Raw volume is in very small units (like wei), divide by 10^6 to get USD
        raw_vol = market.get("volume", 0)
        if isinstance(raw_vol, str):
            raw_vol = float(raw_vol) if raw_vol else 0
        volume = raw_vol / 1_000_000  # Convert to approximate USD
    
    # Parse end date
    end_time = None
    expiration = market.get("expirationDate") or market.get("deadline")
    if expiration:
        try:
            from datetime import datetime
            if isinstance(expiration, str):
                # Try ISO format
                dt = datetime.fromisoformat(expiration.replace("Z", "+00:00"))
                end_time = int(dt.timestamp())
            elif isinstance(expiration, (int, float)):
                end_time = int(expiration)
        except:
            pass
    
    return UnifiedMarket(
        platform="limitless",
        id=slug,
        title=title,
        status="open" if market.get("status") != "resolved" else "closed",
        start_time=None,
        end_time=end_time,
        close_time=None,
        volume_total_usd=float(volume) if volume else 0,
        volume_24h_usd=None,
        volume_1_week_usd=None,
        volume_1_month_usd=None,
        category=categorize_market(title, market.get("tags", []) or []),
        tags=market.get("tags", []) or [],
        last_price=yes_price,
        extra={
            "market_slug": slug,
            "image": market.get("ogImageURI") or market.get("imageUrl"),
            "liquidity": market.get("liquidity", 0),
            "creator": market.get("creator"),
        }
    )


def normalize_opiniontrade(market: Dict[str, Any]) -> UnifiedMarket:
    """Normalize OpinionTrade market to unified format"""
    # OpinionTrade uses 'marketTitle' as the primary title field
    title = market.get("marketTitle", "") or market.get("title", "") or market.get("name", "")
    market_id = str(market.get("marketId", "") or market.get("id", ""))
    
    # Get yes price
    yes_price = market.get("yesPrice") or market.get("yes_price")
    if yes_price is not None:
        yes_price = float(yes_price) / 100 if yes_price > 1 else float(yes_price)
    
    # Get volume (already in USD format)
    volume = market.get("volume", 0) or market.get("volume24h", 0) or market.get("total_volume", 0)
    if isinstance(volume, str):
        volume = float(volume.replace(",", "").replace("$", "")) if volume else 0
    
    # Parse end date - OpinionTrade uses cutoffAt (Unix timestamp)
    end_time = None
    cutoff = market.get("cutoffAt") or market.get("endDate") or market.get("end_date")
    if cutoff:
        try:
            if isinstance(cutoff, (int, float)) and cutoff > 0:
                end_time = int(cutoff)
            elif isinstance(cutoff, str):
                from datetime import datetime
                dt = datetime.fromisoformat(cutoff.replace("Z", "+00:00"))
                end_time = int(dt.timestamp())
        except:
            pass
    
    # Map status: 2 = Activated (open), others = closed
    raw_status = market.get("status")
    status_enum = market.get("statusEnum", "")
    is_open = raw_status == 2 or status_enum == "Activated" or raw_status in ["active", "open", None]
    
    return UnifiedMarket(
        platform="opiniontrade",
        id=market_id,
        title=title,
        status="open" if is_open else "closed",
        start_time=None,
        end_time=end_time,
        close_time=None,
        volume_total_usd=float(volume) if volume else 0,
        volume_24h_usd=None,
        volume_1_week_usd=None,
        volume_1_month_usd=None,
        category=categorize_market(title, market.get("tags", []) or []),
        tags=market.get("tags", []) or [],
        last_price=yes_price,
        extra={
            "image": market.get("image") or market.get("imageUrl"),
            "category_id": market.get("categoryId"),
        }
    )


def filter_by_category(markets: List[UnifiedMarket], category: str) -> List[UnifiedMarket]:
    """Filter markets by category"""
    # 'all' and 'trending' return all markets (trending just means sorted by volume)
    if category in ["all", "trending"]:
        return markets
    
    category_map = {
        "politics": "Politics",
        "crypto": "Crypto",
        "sports": "Sports",
        "entertainment": "Entertainment",
        "economy": "Economy",
        "weather": "Weather",
        "other": "Other",
    }
    
    target_category = category_map.get(category.lower(), "")
    if not target_category:
        return markets
    
    return [m for m in markets if m.category == target_category]


# =============================================================================
# POLYMARKET PRICE ENRICHMENT
# =============================================================================

# In-memory price cache for Polymarket tokens (token_id -> (price, timestamp))
_poly_price_cache: Dict[str, tuple] = {}
POLY_PRICE_CACHE_TTL = 120  # 2 minutes


async def _enrich_polymarket_prices(markets: List[UnifiedMarket]) -> List[UnifiedMarket]:
    """
    Enrich Polymarket markets with live prices from Dome API.
    Only called for the paginated page (max ~25 markets), so API cost is minimal.
    Uses a short-lived in-memory cache to avoid redundant calls.
    """
    poly_markets = [(i, m) for i, m in enumerate(markets) if m.platform == "poly" and m.last_price is None]
    if not poly_markets:
        return markets

    api_key = get_dome_api_key()
    if not api_key:
        return markets

    now = time.time()

    # Separate into cached and needs-fetch
    to_fetch: List[tuple] = []  # (index, token_id)
    for idx, m in poly_markets:
        side_a = m.extra.get("side_a") if m.extra else None
        token_id = side_a.get("id") if isinstance(side_a, dict) else None
        if not token_id:
            continue
        cached = _poly_price_cache.get(token_id)
        if cached and (now - cached[1]) < POLY_PRICE_CACHE_TTL:
            # Use cached price
            markets[idx] = m.model_copy(update={"last_price": cached[0]})
        else:
            to_fetch.append((idx, token_id))

    if not to_fetch:
        return markets

    headers = {"Authorization": f"Bearer {api_key}"}

    async def fetch_price(token_id: str) -> tuple:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(
                    f"{DOME_API_BASE}/polymarket/market-price/{token_id}",
                    headers=headers,
                )
                resp.raise_for_status()
                data = resp.json()
                price = data.get("price")
                return token_id, float(price) if price is not None else None
        except Exception as e:
            logger.debug(f"Price fetch failed for token {token_id[:20]}...: {e}")
            return token_id, None

    # Fetch all prices in parallel (limited to page size, so at most ~25)
    tasks = [fetch_price(tid) for _, tid in to_fetch]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    # Map token_id -> price
    price_map: Dict[str, float] = {}
    for result in results:
        if isinstance(result, tuple):
            tid, price = result
            if price is not None:
                price_map[tid] = price
                _poly_price_cache[tid] = (price, now)

    # Update markets with fetched prices
    for idx, token_id in to_fetch:
        if token_id in price_map:
            markets[idx] = markets[idx].model_copy(update={"last_price": price_map[token_id]})

    logger.info(f"Enriched {len(price_map)}/{len(to_fetch)} Polymarket prices")
    return markets


# =============================================================================
# CACHE HELPERS
# =============================================================================

async def fetch_all_from_silver_db(search=None, min_volume=None) -> tuple:
    """
    Fetch ALL platforms from predictions_silver.markets (our pipeline DB).
    Uses existing SQLAlchemy sync engine via thread executor — fast, no API calls.
    """
    import calendar
    from app.database.session import SessionLocal

    def _run_query():
        session = SessionLocal()
        try:
            where_parts = ["(is_active = true OR status IN ('active', 'open'))"]
            params: Dict[str, Any] = {}
            if min_volume:
                where_parts.append("volume_total >= :min_vol")
                params["min_vol"] = float(min_volume)
            if search:
                where_parts.append("title ILIKE :search")
                params["search"] = f"%{search}%"
            where_sql = " AND ".join(where_parts)

            sql = text(f"""
                SELECT
                    source, source_market_id, slug, condition_id,
                    title, category_name, tags, status,
                    yes_price, no_price,
                    volume_24h, volume_7d, volume_30d, volume_total, liquidity,
                    start_date, end_date,
                    image_url, source_url, extra_data
                FROM predictions_silver.markets
                WHERE {where_sql}
                ORDER BY volume_total DESC NULLS LAST
                LIMIT 2000
            """)
            rows = session.execute(sql, params).fetchall()
            return rows
        finally:
            session.close()

    loop = asyncio.get_event_loop()
    try:
        rows = await loop.run_in_executor(None, _run_query)
    except Exception as e:
        logger.error(f"DB silver fetch failed: {e}")
        return [], {"poly": 0, "kalshi": 0, "limitless": 0, "opiniontrade": 0}

    all_markets: List[UnifiedMarket] = []
    platform_counts = {"poly": 0, "kalshi": 0, "limitless": 0, "opiniontrade": 0}

    for row in rows:
        source = row.source
        extra = dict(row.extra_data) if row.extra_data else {}
        yes_p = float(row.yes_price) if row.yes_price is not None else None

        event_group = None
        event_group_label = None

        if source == "polymarket":
            platform_key = "poly"
            event_slug = extra.get("event_slug") or row.slug or row.source_market_id
            extra.update({
                "condition_id": row.condition_id or "",
                "market_slug": row.slug or row.source_market_id,
                "event_slug": event_slug,
                "image": row.image_url,
            })
            event_group = event_slug
            # Make a readable label: replace dashes with spaces, title case
            event_group_label = event_slug.replace("-", " ").title() if event_slug else None
        elif source == "kalshi":
            platform_key = "kalshi"
            event_ticker = extra.get("event_ticker") or row.source_market_id.rsplit("-", 1)[0]
            extra.update({
                "market_ticker": row.source_market_id,
                "event_ticker": event_ticker,
            })
            event_group = event_ticker
            event_group_label = event_ticker  # e.g. KXNBA-26
        elif source == "limitless":
            platform_key = "limitless"
            slug = row.slug or row.source_market_id
            extra.update({
                "market_slug": slug,
                "image": row.image_url,
                "liquidity": float(row.liquidity) if row.liquidity else 0,
            })
            # Group by asset name extracted from slug (e.g. "dollarbtc" → "BTC")
            if slug:
                parts = slug.split("-")
                event_group = parts[0] if parts else slug
                # Clean up: dollar prefix → asset name
                g = event_group.replace("dollar", "").upper()
                event_group_label = g if g else event_group
            else:
                event_group = None
        else:
            platform_key = "opiniontrade"
            extra.update({"market_slug": row.slug or row.source_market_id})

        if platform_key not in platform_counts:
            continue

        end_ts = None
        if row.end_date:
            end_ts = int(calendar.timegm(row.end_date.timetuple()))

        try:
            market = UnifiedMarket(
                platform=platform_key,
                id=row.source_market_id,
                title=row.title,
                status=row.status or "open",
                start_time=None,
                end_time=end_ts,
                close_time=end_ts,
                volume_total_usd=float(row.volume_total or 0),
                volume_24h_usd=float(row.volume_24h or 0) if row.volume_24h else None,
                volume_1_week_usd=float(row.volume_7d or 0) if row.volume_7d else None,
                volume_1_month_usd=float(row.volume_30d or 0) if row.volume_30d else None,
                category=row.category_name or categorize_market(row.title, list(row.tags) if row.tags else []),
                tags=list(row.tags) if row.tags else [],
                last_price=yes_p,
                event_group=event_group,
                event_group_label=event_group_label,
                extra=extra,
            )
            all_markets.append(market)
            platform_counts[platform_key] += 1
        except Exception as e:
            logger.debug(f"Error building UnifiedMarket from DB row: {e}")

    logger.info(f"DB silver fetch: poly={platform_counts['poly']} kalshi={platform_counts['kalshi']} "
                f"limitless={platform_counts['limitless']} (total={len(all_markets)})")
    return all_markets, platform_counts


async def _fetch_all_unified_markets(search=None, min_volume=None):
    """
    Fetch from ALL 4 platforms. Returns (all_markets, platform_counts).
    Uses predictions_silver.markets (pipeline DB) for all platforms — fast, no API calls.
    Falls back to Dome API if DB returns < 100 markets.
    """
    all_markets: List[UnifiedMarket] = []
    platform_counts = {"poly": 0, "kalshi": 0, "limitless": 0, "opiniontrade": 0}

    # Primary: read from our pipeline DB (top 500 markets already stored)
    try:
        all_markets, platform_counts = await fetch_all_from_silver_db(search, min_volume)
        total = sum(platform_counts.values())
        if total >= 100:
            return all_markets, platform_counts
        logger.warning(f"DB returned only {total} markets, falling back to live APIs")
    except Exception as e:
        logger.error(f"DB fetch failed, falling back to live APIs: {e}")

    # Fallback: live API calls (only if DB is empty/failing)
    # Get cache service for slow platforms
    cache_service = get_production_cache()

    tasks = [
        ("poly", fetch_polymarket_from_dome_api(search, min_volume)),
        ("kalshi", fetch_kalshi_from_api(search, min_volume)),
        ("limitless", cache_service.get_markets("limitless")),
        ("opiniontrade", cache_service.get_markets("opiniontrade")),
    ]
    
    for platform_name, task in tasks:
        try:
            if asyncio.iscoroutine(task):
                raw_result = await task
            else:
                raw_result = task
            
            # Cache returns normalized events_db format, convert to UnifiedMarket
            if platform_name in ["limitless", "opiniontrade"] and raw_result:
                markets = []
                for m in raw_result:
                    try:
                        # Convert from events_db normalized format to UnifiedMarket
                        unified = UnifiedMarket(
                            platform=platform_name,
                            id=m.get('event_id') or m.get('slug', ''),
                            title=m.get('title') or m.get('event_title', ''),
                            status=m.get('status', 'open'),
                            start_time=m.get('start_time'),
                            end_time=m.get('end_time'),
                            close_time=None,
                            volume_total_usd=float(m.get('total_volume') or m.get('volume') or 0),
                            volume_24h_usd=float(m.get('volume_24h') or 0) if m.get('volume_24h') else None,
                            volume_1_week_usd=float(m.get('volume_1_week') or 0) if m.get('volume_1_week') else None,
                            volume_1_month_usd=None,
                            category=m.get('category') or categorize_market(m.get('title', ''), m.get('tags', []) or []),
                            tags=m.get('tags', []) or [],
                            last_price=m.get('yes_price') or (m.get('top_market', {}) or {}).get('yes_price'),
                            extra={
                                "market_slug": m.get('event_id') or m.get('slug', ''),
                                "image": m.get('image'),
                                "liquidity": m.get('liquidity', 0),
                            }
                        )
                        markets.append(unified)
                    except Exception as e:
                        logger.debug(f"Error converting {platform_name} market: {e}")
                all_markets.extend(markets)
                platform_counts[platform_name] = len(markets)
            else:
                all_markets.extend(raw_result or [])
                platform_counts[platform_name] = len(raw_result) if raw_result else 0
            
            logger.info(f"Fetched {platform_counts[platform_name]} markets from {platform_name}")
        except Exception as e:
            logger.error(f"Error fetching from {platform_name}: {e}")
            platform_counts[platform_name] = 0
    
    return all_markets, platform_counts


async def _refresh_unified_cache():
    """Background task: refresh the unified cache without blocking requests."""
    if _unified_cache["is_refreshing"]:
        return
    _unified_cache["is_refreshing"] = True
    try:
        logger.info("Background refresh of unified markets cache starting...")
        start = time.time()
        markets, counts = await _fetch_all_unified_markets()
        _unified_cache["markets"] = markets
        _unified_cache["platform_counts"] = counts
        _unified_cache["timestamp"] = time.time()
        elapsed = (time.time() - start) * 1000
        logger.info(f"Unified cache refreshed: {len(markets)} markets in {elapsed:.0f}ms")
    except Exception as e:
        logger.error(f"Background unified cache refresh failed: {e}")
    finally:
        _unified_cache["is_refreshing"] = False


async def warm_unified_markets_cache():
    """Warm the unified markets cache on startup."""
    try:
        logger.info("Warming unified markets cache on startup...")
        await _refresh_unified_cache()
    except Exception as e:
        logger.error(f"Failed to warm unified markets cache: {e}")


@router.get("/markets", response_model=PaginatedResponse)
async def get_unified_markets(
    platform: PlatformType = Query(default=PlatformType.ALL, description="Platform filter"),
    category: CategoryType = Query(default=CategoryType.ALL, description="Category filter"),
    search: Optional[str] = Query(default=None, description="Search query"),
    status: str = Query(default="open", description="Market status: open, closed, all"),
    min_volume: Optional[float] = Query(default=None, description="Minimum volume filter"),
    sort: str = Query(default="volume_desc", description="Sort order: volume_desc, volume_24h_desc"),
    page: int = Query(default=1, ge=1, description="Page number"),
    page_size: int = Query(default=10, ge=1, le=100, description="Page size"),
    tags: Optional[str] = Query(default=None, description="Comma-separated tags"),
    event_ticker: Optional[str] = Query(default=None, description="Comma-separated event tickers"),
    db: Session = Depends(get_db)
):
    """
    Get unified markets from all platforms.
    Uses 5-minute cache for instant responses after first load.
    """
    start_time = time.time()
    
    all_markets: List[UnifiedMarket] = []
    platform_counts = {
        "poly": 0,
        "kalshi": 0,
        "limitless": 0,
        "opiniontrade": 0,
    }
    
    try:
        # Try to use cached data for unfiltered requests (most common case)
        cache_age = time.time() - _unified_cache["timestamp"] if _unified_cache["timestamp"] else float('inf')
        cache_usable = (
            _unified_cache["markets"] is not None 
            and cache_age < UNIFIED_CACHE_TTL + UNIFIED_CACHE_STALE_TTL
        )
        
        if cache_usable:
            # Use cached markets
            all_markets = list(_unified_cache["markets"])
            platform_counts = dict(_unified_cache["platform_counts"] or {})
            
            # If stale, trigger background refresh
            if cache_age > UNIFIED_CACHE_TTL and not _unified_cache["is_refreshing"]:
                logger.info(f"Unified cache stale ({cache_age:.0f}s), triggering background refresh")
                asyncio.create_task(_refresh_unified_cache())
            
            cache_status = "fresh" if cache_age <= UNIFIED_CACHE_TTL else "stale"
            logger.debug(f"Unified cache hit ({cache_status}, {cache_age:.0f}s old, {len(all_markets)} markets)")
        else:
            # No cache or fully expired — fetch live
            logger.info("Unified cache miss — fetching all platforms live...")
            all_markets, platform_counts = await _fetch_all_unified_markets(search, min_volume)
            
            # Update cache (only if no search/filter so it's a clean full set)
            if not search and not min_volume:
                _unified_cache["markets"] = list(all_markets)
                _unified_cache["platform_counts"] = dict(platform_counts)
                _unified_cache["timestamp"] = time.time()
        
        # Filter by platform (if not 'all')
        if platform != PlatformType.ALL:
            platform_key = platform.value
            all_markets = [m for m in all_markets if m.platform == platform_key]
        
        # Apply category filter
        if category != CategoryType.ALL and category != CategoryType.TRENDING:
            all_markets = filter_by_category(all_markets, category.value)
        
        # Apply volume filter
        if min_volume:
            all_markets = [m for m in all_markets if m.volume_total_usd >= min_volume]
        
        # Apply search filter
        if search:
            search_lower = search.lower()
            all_markets = [m for m in all_markets if search_lower in m.title.lower()]
        
        # Sort all markets
        if sort == "volume_24h_desc":
            all_markets.sort(key=lambda m: m.volume_24h_usd or 0, reverse=True)
        else:  # volume_desc (default)
            all_markets.sort(key=lambda m: m.volume_total_usd, reverse=True)
        
        # Paginate
        total_count = len(all_markets)
        offset = (page - 1) * page_size
        paginated_markets = all_markets[offset:offset + page_size]
        total_pages = (total_count + page_size - 1) // page_size if total_count else 0
        
        # Enrich Polymarket markets with live prices (only for current page, ~25 markets max)
        paginated_markets = await _enrich_polymarket_prices(paginated_markets)
        
        elapsed = (time.time() - start_time) * 1000
        logger.info(f"Unified markets: {total_count} total, page {page}/{total_pages} ({elapsed:.0f}ms)")
        
        return PaginatedResponse(
            markets=paginated_markets,
            pagination={
                "page": page,
                "page_size": page_size,
                "total": total_count,
                "total_pages": total_pages,
                "has_more": page < total_pages,
                "poly_available": platform_counts.get("poly", 0),
                "kalshi_available": platform_counts.get("kalshi", 0),
                "limitless_available": platform_counts.get("limitless", 0),
                "opiniontrade_available": platform_counts.get("opiniontrade", 0),
            },
            platform_stats={
                "polymarket": {
                    "total_available": platform_counts.get("poly", 0),
                    "fetched": len([m for m in paginated_markets if m.platform == "poly"])
                },
                "kalshi": {
                    "total_available": platform_counts.get("kalshi", 0),
                    "fetched": len([m for m in paginated_markets if m.platform == "kalshi"])
                },
                "limitless": {
                    "total_available": platform_counts.get("limitless", 0),
                    "fetched": len([m for m in paginated_markets if m.platform == "limitless"])
                },
                "opiniontrade": {
                    "total_available": platform_counts.get("opiniontrade", 0),
                    "fetched": len([m for m in paginated_markets if m.platform == "opiniontrade"])
                }
            }
        )
        
    except Exception as e:
        logger.error(f"Error fetching unified markets: {e}")
        raise HTTPException(status_code=500, detail=str(e))


async def fetch_polymarket_from_dome_api(search: Optional[str], min_volume: Optional[float]) -> List[UnifiedMarket]:
    """Fetch Polymarket markets from Dome API (same source as Events page)"""
    try:
        api_key = get_dome_api_key()
        if not api_key:
            logger.error("DOME_API_KEY not configured for Polymarket")
            return []
        
        all_markets = []
        headers = {"Authorization": f"Bearer {api_key}"}
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            # Fetch markets in parallel batches
            # First request to get total count
            params = {
                "limit": 100,
                "offset": 0,
                "status": "open",
            }
            if min_volume:
                params["min_volume"] = int(min_volume)
            else:
                params["min_volume"] = 100  # Default $100 min like Events page
            if search:
                params["search"] = search
            
            response = await client.get(
                f"{DOME_API_BASE}/polymarket/markets",
                params=params,
                headers=headers,
            )
            response.raise_for_status()
            data = response.json()
            
            first_batch = data.get("markets", [])
            pagination = data.get("pagination", {})
            total_available = pagination.get("total", len(first_batch))
            all_markets.extend(first_batch)
            
            # Fetch remaining pages in parallel (up to 5000 markets)
            max_markets = min(total_available, 5000)
            if len(all_markets) < max_markets and pagination.get("has_more"):
                remaining = max_markets - len(all_markets)
                num_pages = (remaining + 99) // 100
                offsets = [100 + (i * 100) for i in range(num_pages)]
                
                semaphore = asyncio.Semaphore(10)
                
                async def fetch_page(offset: int) -> List[Dict]:
                    async with semaphore:
                        p = {**params, "offset": offset}
                        try:
                            resp = await client.get(
                                f"{DOME_API_BASE}/polymarket/markets",
                                params=p,
                                headers=headers,
                            )
                            resp.raise_for_status()
                            return resp.json().get("markets", [])
                        except Exception as e:
                            logger.warning(f"Polymarket page fetch failed (offset={offset}): {e}")
                            return []
                
                tasks = [fetch_page(o) for o in offsets]
                results = await asyncio.gather(*tasks, return_exceptions=True)
                
                for result in results:
                    if isinstance(result, list):
                        all_markets.extend(result)
        
        # Sort by volume
        all_markets.sort(key=lambda m: m.get("volume_total", 0) or 0, reverse=True)
        
        # Normalize to unified format
        unified = []
        for m in all_markets:
            try:
                unified.append(normalize_polymarket(m))
            except Exception as e:
                logger.debug(f"Error normalizing Polymarket market: {e}")
        
        logger.info(f"Fetched {len(unified)} Polymarket markets from Dome API")
        return unified
        
    except Exception as e:
        logger.error(f"Error fetching Polymarket from Dome API: {e}")
        return []


async def fetch_kalshi_from_api(search: Optional[str], min_volume: Optional[float]) -> List[UnifiedMarket]:
    """Fetch Kalshi markets from Dome API"""
    try:
        client = get_kalshi_client()
        # Use fetch_all_markets which has caching and fetches up to 10k markets
        raw_markets = await client.fetch_all_markets(
            status="open",
            max_markets=5000,  # Get up to 5000 markets
            use_cache=True
        )
        
        unified = []
        for m in raw_markets:
            try:
                unified.append(normalize_kalshi(m))
            except Exception as e:
                logger.debug(f"Error normalizing Kalshi market: {e}")
        
        return unified
    except Exception as e:
        logger.error(f"Error fetching Kalshi markets: {e}")
        return []


async def fetch_limitless_from_api(search: Optional[str]) -> List[UnifiedMarket]:
    """Fetch Limitless markets from API"""
    try:
        client = get_limitless_client()
        raw_markets = await client.fetch_all_markets(use_cache=True)
        
        unified = []
        for m in raw_markets:
            try:
                unified.append(normalize_limitless(m))
            except Exception as e:
                logger.debug(f"Error normalizing Limitless market: {e}")
        
        return unified
    except Exception as e:
        logger.error(f"Error fetching Limitless markets: {e}")
        return []


async def fetch_opiniontrade_from_api(search: Optional[str]) -> List[UnifiedMarket]:
    """Fetch OpinionTrade markets from API"""
    try:
        client = get_opiniontrade_client()
        raw_markets = await client.fetch_all_markets(use_cache=True)
        
        unified = []
        for m in raw_markets:
            try:
                unified.append(normalize_opiniontrade(m))
            except Exception as e:
                logger.debug(f"Error normalizing OpinionTrade market: {e}")
        
        return unified
    except Exception as e:
        logger.error(f"Error fetching OpinionTrade markets: {e}")
        return []


@router.get("/markets/{platform}/{market_id}")
async def get_market_detail(
    platform: Literal["poly", "kalshi"],
    market_id: str
):
    """
    Get detailed information about a specific market.
    """
    api_key = get_dome_api_key()
    if not api_key:
        raise HTTPException(status_code=500, detail="DOME_API_KEY not configured")
    
    async with httpx.AsyncClient() as client:
        headers = {"Authorization": f"Bearer {api_key}"}
        
        try:
            if platform == "poly":
                response = await client.get(
                    f"{DOME_API_BASE}/polymarket/markets",
                    params={"market_slug[]": [market_id], "limit": 1},
                    headers=headers,
                    timeout=30.0
                )
            else:
                response = await client.get(
                    f"{DOME_API_BASE}/kalshi/markets",
                    params={"market_ticker[]": [market_id], "limit": 1},
                    headers=headers,
                    timeout=30.0
                )
            
            response.raise_for_status()
            data = response.json()
            
            markets = data.get("markets", [])
            if not markets:
                raise HTTPException(status_code=404, detail="Market not found")
            
            raw_market = markets[0]
            
            if platform == "poly":
                unified = normalize_polymarket(raw_market)
            else:
                unified = normalize_kalshi(raw_market)
            
            return {
                "market": unified,
                "raw": raw_market
            }
            
        except httpx.HTTPError as e:
            logger.error(f"Error fetching market detail: {e}")
            raise HTTPException(status_code=500, detail=str(e))
