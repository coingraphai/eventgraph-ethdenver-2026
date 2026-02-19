"""
Events API
Lists and manages prediction market events from Polymarket and Kalshi.
Events group multiple related markets together.

World-class aggregator features:
- Tiered caching (Memory + Redis)
- Background refresh every 15 minutes
- Precomputed aggregations
- Cache warming on startup
"""
from fastapi import APIRouter, Query, HTTPException
from typing import Optional, List, Dict, Any, Set
from datetime import datetime, timedelta
from pydantic import BaseModel, Field
import httpx
import logging
import asyncio
from enum import Enum
from collections import defaultdict

from app.config import settings
from app.services.events_cache_service import get_events_cache_service, EventsCacheService

router = APIRouter()
logger = logging.getLogger(__name__)

# Dome API configuration
DOME_API_BASE = "https://api.domeapi.io/v1"

# Simple in-memory cache with TTL (kept for backward compatibility)
_events_cache: Dict[str, Dict[str, Any]] = {}
CACHE_TTL_SECONDS = 3600  # 1 hour (optimized to save API costs)
EVENT_DETAIL_TTL_SECONDS = 3600  # 1 hour for event details


def get_dome_api_key() -> str:
    """Get Dome API key from settings"""
    key = getattr(settings, 'DOME_API_KEY', None) or ""
    if not key:
        logger.warning("DOME_API_KEY not configured")
    return key


def calculate_volume_24h(market: Dict[str, Any], platform: str) -> float:
    """
    Standardize 24h volume calculation across platforms.
    
    For Kalshi: Use actual volume_24h if available
    For Polymarket: Estimate from weekly volume (volume_1_week / 7)
    Fallback: Estimate 10% of total volume
    """
    # Try actual 24h volume first (Kalshi has this)
    if platform == "kalshi":
        vol_24h = market.get("volume_24h")
        if vol_24h is not None and vol_24h > 0:
            return float(vol_24h)
    
    # Polymarket: estimate from weekly
    if platform == "polymarket":
        vol_week = market.get("volume_1_week")
        if vol_week is not None and vol_week > 0:
            return float(vol_week) / 7.0
    
    # Fallback: estimate 10% of total volume
    vol_total = market.get("volume_total") or market.get("volume")
    if vol_total is not None and vol_total > 0:
        return float(vol_total) * 0.1
    
    return 0.0


def events_cache_get(key: str) -> Optional[Any]:
    """Get value from cache if not expired"""
    if key in _events_cache:
        entry = _events_cache[key]
        if datetime.utcnow() < entry["expires_at"]:
            return entry["data"]
        else:
            del _events_cache[key]
    return None


def events_cache_set(key: str, data: Any, ttl_seconds: int = CACHE_TTL_SECONDS):
    """Set value in cache with TTL"""
    _events_cache[key] = {
        "data": data,
        "expires_at": datetime.utcnow() + timedelta(seconds=ttl_seconds),
    }


# ==============================================================================
# Models
# ==============================================================================

class EventPlatform(str, Enum):
    POLYMARKET = "polymarket"
    KALSHI = "kalshi"
    ALL = "all"


class EventCategory(str, Enum):
    ALL = "all"
    POLITICS = "politics"
    CRYPTO = "crypto"
    SPORTS = "sports"
    ECONOMY = "economy"
    ENTERTAINMENT = "entertainment"
    OTHER = "other"


class EventMarket(BaseModel):
    """A market within an event"""
    market_id: str  # market_slug
    event_slug: Optional[str] = None  # For Polymarket URL
    title: str
    yes_price: Optional[float] = None
    volume_total: Optional[float] = None
    volume_24h: Optional[float] = None
    status: str = "open"


class Event(BaseModel):
    """An event containing multiple markets"""
    event_id: str  # event_slug for Polymarket, event_ticker for Kalshi
    title: str
    platform: str
    category: str = "other"
    image: Optional[str] = None
    market_count: int = 0
    total_volume: float = 0
    volume_24h: Optional[float] = None
    volume_1_week: Optional[float] = None
    start_time: Optional[int] = None
    end_time: Optional[int] = None
    status: str = "open"
    tags: List[str] = []
    markets: List[EventMarket] = []
    # Top 3 markets for preview
    top_markets: List[Dict[str, Any]] = []


class AggregateMetrics(BaseModel):
    """Aggregate metrics for the events list"""
    total_markets: int = 0
    total_volume: float = 0
    volume_24h: float = 0
    volume_1_week: float = 0
    avg_markets_per_event: float = 0
    avg_volume_per_event: float = 0
    # Platform-specific metrics
    polymarket_markets: int = 0
    polymarket_volume: float = 0
    kalshi_markets: int = 0
    kalshi_volume: float = 0


class EventsResponse(BaseModel):
    """Response for events list"""
    events: List[Event]
    total: int
    page: int
    page_size: int
    total_pages: int
    platform_counts: Dict[str, int] = {}
    aggregate_metrics: Optional[AggregateMetrics] = None


class MarketWithPrice(BaseModel):
    """Market with live price data"""
    market_id: str
    event_slug: Optional[str] = None  # For Polymarket URL: /event/{event_slug}
    title: str
    yes_price: Optional[float] = None
    no_price: Optional[float] = None
    volume_total: Optional[float] = None
    volume_24h: Optional[float] = None
    volume_1_week: Optional[float] = None
    end_time: Optional[int] = None
    status: str = "open"
    image: Optional[str] = None
    token_id_yes: Optional[str] = None
    token_id_no: Optional[str] = None
    condition_id: Optional[str] = None
    result: Optional[str] = None
    # Analytics
    price_change_24h: Optional[float] = None


class RecentTrade(BaseModel):
    """A recent trade/order"""
    timestamp: int
    side: str  # BUY or SELL
    price: float
    shares: float
    market_id: str
    market_title: Optional[str] = None
    token_label: Optional[str] = None  # YES or NO


class EventDetailResponse(BaseModel):
    """Response for single event with all markets"""
    event: Event
    markets: List[Dict[str, Any]]
    platform: str
    # Enhanced data
    recent_trades: List[RecentTrade] = []
    volume_by_market: List[Dict[str, Any]] = []
    price_summary: Dict[str, Any] = {}


# ==============================================================================
# Kalshi Events
# ==============================================================================

async def fetch_kalshi_events(
    client: httpx.AsyncClient,
    api_key: str,
    limit: int = 100,
    min_volume: int = 1000,
    status: str = "open",
    max_pages: int = 50,  # Reduced from 200 to 50 (5000 markets max)
    force_refresh: bool = False,  # Bypass cache when True
) -> List[Event]:
    """
    Fetch Kalshi markets and group by event_ticker.
    Kalshi markets have event_ticker field that groups related markets.
    """
    cache_key = f"kalshi_events:{limit}:{min_volume}:{status}:{max_pages}"
    if not force_refresh:
        cached = events_cache_get(cache_key)
        if cached is not None:
            logger.debug(f"Using cached Kalshi events ({len(cached)} events)")
            return cached
    
    try:
        # Fetch multiple pages of markets
        all_markets = []
        
        for page_num in range(max_pages):
            offset = page_num * limit
            response = await client.get(
                f"{DOME_API_BASE}/kalshi/markets",
                headers={"Authorization": f"Bearer {api_key}"},
                params={
                    "limit": limit,
                    "offset": offset,
                    "min_volume": min_volume,
                    "status": status,
                },
                timeout=15.0,
            )
            
            if response.status_code != 200:
                logger.error(f"Kalshi markets API error: {response.status_code}")
                break
            
            data = response.json()
            markets = data.get("markets", [])
            all_markets.extend(markets)
            
            # Check if there are more pages
            pagination = data.get("pagination", {})
            if not pagination.get("has_more", False):
                break
        
        logger.info(f"Fetched {len(all_markets)} Kalshi markets across {page_num + 1} pages")
        
        # Group by event_ticker
        events_map: Dict[str, Dict[str, Any]] = {}
        
        for market in all_markets:
            event_ticker = market.get("event_ticker", "")
            if not event_ticker:
                continue
            
            if event_ticker not in events_map:
                events_map[event_ticker] = {
                    "event_id": event_ticker,
                    "title": market.get("title", event_ticker),
                    "platform": "kalshi",
                    "category": categorize_market(market.get("title", ""), []),
                    "image": None,
                    "market_count": 0,
                    "total_volume": 0,
                    "volume_24h": 0,
                    "volume_1_week": 0,
                    "start_time": market.get("open_time"),
                    "end_time": market.get("end_time"),
                    "status": market.get("status", "open"),
                    "tags": [],
                    "markets": [],
                }
            
            evt = events_map[event_ticker]
            evt["market_count"] += 1
            evt["total_volume"] += market.get("volume", 0) or 0
            evt["volume_24h"] += calculate_volume_24h(market, "kalshi")
            evt["volume_1_week"] += market.get("volume_1_week", 0) or 0
            
            # Track earliest start time
            open_time = market.get("open_time")
            if open_time and (evt["start_time"] is None or open_time < evt["start_time"]):
                evt["start_time"] = open_time
            
            # Add market
            evt["markets"].append({
                "market_id": market.get("market_ticker", ""),
                "title": market.get("title", ""),
                "yes_price": market.get("last_price"),
                "volume_total": market.get("volume"),
                "volume_24h": market.get("volume_24h"),
                "status": market.get("status", "open"),
            })
        
        # Convert to Event objects
        events = []
        for evt_data in events_map.values():
            # Sort markets by volume and take top 3
            sorted_markets = sorted(
                evt_data["markets"],
                key=lambda m: m.get("volume_total") or 0,
                reverse=True
            )
            evt_data["top_markets"] = sorted_markets[:3]
            
            # Derive event title from event_id (event_ticker for Kalshi)
            if evt_data["markets"]:
                evt_data["title"] = derive_event_title(evt_data["markets"], event_slug=evt_data.get("event_id"))
            
            events.append(Event(**evt_data))
        
        # Sort by volume
        events.sort(key=lambda e: e.total_volume, reverse=True)
        
        events_cache_set(cache_key, events)
        return events
        
    except Exception as e:
        logger.error(f"Error fetching Kalshi events: {e}")
        return []


# ==============================================================================
# Polymarket Events
# ==============================================================================

async def fetch_polymarket_events(
    client: httpx.AsyncClient,
    api_key: str,
    limit: int = 100,
    min_volume: int = 1000,
    status: str = "open",
    max_pages: int = 30,  # Reduced from 200 to 30 (3000 markets max)
    force_refresh: bool = False,  # Bypass cache when True
) -> List[Event]:
    """
    Fetch Polymarket markets and group into events.
    Since Polymarket API doesn't expose event_slug in response,
    we group by (end_time + primary_tag) as a proxy for events.
    """
    cache_key = f"poly_events:{limit}:{min_volume}:{status}:{max_pages}"
    if not force_refresh:
        cached = events_cache_get(cache_key)
        if cached is not None:
            logger.debug(f"Using cached Polymarket events ({len(cached)} events)")
            return cached
    
    try:
        # Fetch multiple pages of markets
        all_markets = []
        logger.info(f"Fetching Polymarket events with API key: {api_key[:10]}...")
        
        for page_num in range(max_pages):
            offset = page_num * limit
            response = await client.get(
                f"{DOME_API_BASE}/polymarket/markets",
                headers={"Authorization": f"Bearer {api_key}"},
                params={
                    "limit": limit,
                    "offset": offset,
                    "min_volume": min_volume,
                    "status": status,
                },
                timeout=15.0,
            )
            
            if response.status_code != 200:
                logger.error(f"Polymarket markets API error: {response.status_code} - {response.text[:200]}")
                break
            
            data = response.json()
            markets = data.get("markets", [])
            all_markets.extend(markets)
            
            # Check if there are more pages
            pagination = data.get("pagination", {})
            if not pagination.get("has_more", False):
                break
        
        logger.info(f"Fetched {len(all_markets)} Polymarket markets across {page_num + 1} pages")
        
        # Group markets by event_slug (from Dome API) - this is the real Polymarket event
        events_map: Dict[str, Dict[str, Any]] = {}
        
        for market in all_markets:
            # Use event_slug from Dome API for proper grouping
            event_slug = market.get("event_slug")
            if not event_slug:
                # Fallback to synthetic key if no event_slug
                event_slug = create_polymarket_event_key(market)
            if not event_slug:
                continue
            
            tags = market.get("tags", [])
            
            if event_slug not in events_map:
                events_map[event_slug] = {
                    "event_id": event_slug,  # Use event_slug as event_id for proper URLs
                    "title": "",  # Will be derived
                    "platform": "polymarket",
                    "category": categorize_market(market.get("title", ""), tags),
                    "image": market.get("image"),
                    "market_count": 0,
                    "total_volume": 0,
                    "volume_24h": 0,
                    "volume_1_week": 0,
                    "start_time": market.get("start_time"),
                    "end_time": market.get("end_time"),
                    "status": market.get("status", "open"),
                    "tags": list(set(tags[:5])),  # Keep first 5 unique tags
                    "markets": [],
                }
            
            evt = events_map[event_slug]
            evt["market_count"] += 1
            evt["total_volume"] += market.get("volume_total", 0) or 0
            
            # Track volume metrics using standardized calculation
            week_vol = market.get("volume_1_week", 0) or 0
            evt["volume_1_week"] = (evt.get("volume_1_week") or 0) + week_vol
            evt["volume_24h"] = (evt.get("volume_24h") or 0) + calculate_volume_24h(market, "polymarket")
            
            # Track earliest start time
            start_t = market.get("start_time")
            if start_t and (evt["start_time"] is None or start_t < evt["start_time"]):
                evt["start_time"] = start_t
            
            # Get token ID for price (from side_a)
            side_a = market.get("side_a", {})
            token_id = side_a.get("id") if isinstance(side_a, dict) else None
            
            # Add market - include event_slug for proper Polymarket URL
            evt["markets"].append({
                "market_id": market.get("market_slug", ""),
                "event_slug": event_slug,  # Use the event_slug for Polymarket URL
                "title": market.get("title", ""),
                "yes_price": None,  # Would need separate API call
                "volume_total": market.get("volume_total"),
                "volume_24h": calculate_volume_24h(market, "polymarket"),
                "status": market.get("status", "open"),
                "image": market.get("image"),
                "token_id": token_id,
            })
        
        # Convert to Event objects
        events = []
        for evt_data in events_map.values():
            # Sort markets by volume and take top 3
            sorted_markets = sorted(
                evt_data["markets"],
                key=lambda m: m.get("volume_total") or 0,
                reverse=True
            )
            evt_data["top_markets"] = sorted_markets[:3]
            
            # Derive event title from event_slug (which is stored in event_id for Polymarket)
            evt_data["title"] = derive_event_title(evt_data["markets"], event_slug=evt_data.get("event_id"))
            
            # Use best image from top market
            if sorted_markets and sorted_markets[0].get("image"):
                evt_data["image"] = sorted_markets[0]["image"]
            
            events.append(Event(**evt_data))
        
        # Sort by volume
        events.sort(key=lambda e: e.total_volume, reverse=True)
        
        events_cache_set(cache_key, events)
        return events
        
    except Exception as e:
        logger.error(f"Error fetching Polymarket events: {e}")
        import traceback
        traceback.print_exc()
        return []


def create_polymarket_event_key(market: Dict[str, Any]) -> Optional[str]:
    """
    Create a unique event key for grouping Polymarket markets.
    Uses pattern matching on market slugs and titles.
    """
    slug = market.get("market_slug", "")
    title = market.get("title", "")
    end_time = market.get("end_time")
    tags = market.get("tags", [])
    
    # Common event patterns to extract
    patterns = [
        # Elections
        ("presidential-election", "presidential-election-winner"),
        ("super-bowl", "super-bowl-winner"),
        ("nba", "nba-championship"),
        ("fed-", "fed-rates"),
        ("interest-rate", "fed-rates"),
        ("champions-league", "champions-league"),
        ("premier-league", "premier-league"),
        ("world-cup", "world-cup"),
    ]
    
    for pattern, event_base in patterns:
        if pattern in slug.lower():
            # Extract year or qualifier
            import re
            year_match = re.search(r'20\d{2}', slug)
            year = year_match.group(0) if year_match else ""
            return f"{event_base}-{year}" if year else event_base
    
    # Default: group by end_time + first tag
    if end_time and tags:
        primary_tag = tags[0].lower().replace(" ", "-")
        return f"{primary_tag}-{end_time}"
    
    # Fallback: treat as individual event
    return slug


def slug_to_title(event_slug: str) -> str:
    """
    Convert an event_slug to a proper title format.
    Example: 'democratic-presidential-nominee-2028' -> 'Democratic Presidential Nominee 2028'
    """
    if not event_slug:
        return "Unknown Event"
    
    # Replace hyphens with spaces and title case each word
    words = event_slug.replace("-", " ").split()
    
    # Words to keep lowercase (unless first word)
    lowercase_words = {"a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for", "of", "vs", "by"}
    
    # Words to keep uppercase
    uppercase_words = {"us", "uk", "eu", "ufc", "nba", "nfl", "mlb", "nhl", "pga", "gdp", "cpi", "fed", "btc", "eth"}
    
    result = []
    for i, word in enumerate(words):
        word_lower = word.lower()
        if word_lower in uppercase_words:
            result.append(word.upper())
        elif i == 0 or word_lower not in lowercase_words:
            result.append(word.capitalize())
        else:
            result.append(word_lower)
    
    return " ".join(result)


def derive_event_title(markets: List[Dict[str, Any]], event_slug: Optional[str] = None) -> str:
    """
    Derive a good event title. Prefers event_slug conversion, falls back to market title parsing.
    """
    # If event_slug is provided, convert it to a proper title
    if event_slug:
        return slug_to_title(event_slug)
    
    if not markets:
        return "Unknown Event"
    
    # Fallback: Find common patterns in titles
    titles = [m.get("title", "") for m in markets]
    
    # Check for "Will X win Y" pattern
    import re
    for title in titles:
        match = re.search(r'(?:win|the)\s+(.+?)(?:\?|$)', title, re.I)
        if match:
            return match.group(1).strip()
    
    # Use first title, but clean it up
    first_title = titles[0]
    
    # Remove "Will X" prefix if present
    if first_title.lower().startswith("will "):
        first_title = first_title[5:]
    
    # Truncate if too long
    if len(first_title) > 60:
        first_title = first_title[:57] + "..."
    
    return first_title


def categorize_market(title: str, tags: List[str]) -> str:
    """Categorize a market based on title and tags."""
    title_lower = title.lower()
    tags_lower = [t.lower() for t in tags]
    
    # Check tags first
    tag_categories = {
        "politics": ["politics", "election", "government", "congress", "senate"],
        "crypto": ["crypto", "bitcoin", "ethereum", "blockchain", "btc", "eth"],
        "sports": ["sports", "nfl", "nba", "mlb", "soccer", "football", "basketball"],
        "economy": ["economy", "fed", "interest rate", "inflation", "gdp", "jobs"],
        "entertainment": ["entertainment", "movies", "tv", "celebrity", "awards"],
    }
    
    for category, keywords in tag_categories.items():
        for tag in tags_lower:
            if any(kw in tag for kw in keywords):
                return category
    
    # Check title
    for category, keywords in tag_categories.items():
        if any(kw in title_lower for kw in keywords):
            return category
    
    return "other"


# ==============================================================================
# API Endpoints
# ==============================================================================

@router.get("/events", response_model=EventsResponse)
async def get_events(
    platform: EventPlatform = Query(EventPlatform.ALL, description="Platform filter"),
    category: EventCategory = Query(EventCategory.ALL, description="Category filter"),
    search: Optional[str] = Query(None, description="Search query"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Page size"),
    min_volume: int = Query(1000, ge=0, description="Minimum total volume"),
    status: str = Query("open", description="Market status filter"),
):
    """
    Get list of events from Polymarket and Kalshi.
    Events group related markets together.
    
    Uses tiered caching for instant responses:
    1. Check pre-warmed cache (L1 Memory -> L2 Redis)
    2. Fall back to live API fetch if cache miss
    """
    api_key = get_dome_api_key()
    if not api_key:
        raise HTTPException(status_code=500, detail="DOME_API_KEY not configured")
    
    # Try to get from advanced cache service first (instant response)
    cache_service = get_events_cache_service()
    await cache_service.initialize()
    
    cached_data = await cache_service.get_all_events()
    
    all_events: List[Event] = []
    platform_counts = {"polymarket": 0, "kalshi": 0}
    
    if cached_data and cached_data.get("events"):
        # Use cached events (instant response!)
        logger.info(f"✅ Using cached events data ({len(cached_data.get('events', []))} events)")
        events_data = cached_data["events"]
        platform_counts = cached_data.get("platform_counts", {"polymarket": 0, "kalshi": 0})
        
        # Filter by platform
        if platform == EventPlatform.POLYMARKET:
            events_data = [e for e in events_data if e.get("platform") == "polymarket"]
        elif platform == EventPlatform.KALSHI:
            events_data = [e for e in events_data if e.get("platform") == "kalshi"]
        
        # Convert dicts to Event objects
        for evt_dict in events_data:
            try:
                all_events.append(Event(**evt_dict))
            except Exception as e:
                logger.debug(f"Error parsing cached event: {e}")
    else:
        # Cache miss - return error to force cache warming
        logger.warning("⚠️ Cache miss - cache is still warming up or not initialized")
        # Return empty result with helpful message instead of blocking for 45+ seconds
        raise HTTPException(
            status_code=503,
            detail="Events cache is warming up. Please try again in a few seconds."
        )
    
    # Filter by category
    if category != EventCategory.ALL:
        all_events = [e for e in all_events if e.category == category.value]
    
    # Filter by search
    if search:
        search_lower = search.lower()
        all_events = [
            e for e in all_events
            if search_lower in e.title.lower()
            or any(search_lower in t.lower() for t in e.tags)
            or any(search_lower in m.get("title", "").lower() for m in e.top_markets)
        ]
    
    # Sort by volume
    all_events.sort(key=lambda e: e.total_volume, reverse=True)
    
    # Calculate aggregate metrics from all filtered events (not just paginated)
    total_markets = sum(e.market_count for e in all_events)
    total_volume_sum = sum(e.total_volume for e in all_events)
    volume_24h_sum = sum(e.volume_24h or 0 for e in all_events)
    volume_1_week_sum = sum(e.volume_1_week or 0 for e in all_events)
    
    # Platform-specific metrics (from all events before filtering by platform)
    poly_events = [e for e in all_events if e.platform == "polymarket"]
    kalshi_events = [e for e in all_events if e.platform == "kalshi"]
    
    aggregate_metrics = AggregateMetrics(
        total_markets=total_markets,
        total_volume=total_volume_sum,
        volume_24h=volume_24h_sum,
        volume_1_week=volume_1_week_sum,
        avg_markets_per_event=round(total_markets / max(1, len(all_events)), 1),
        avg_volume_per_event=round(total_volume_sum / max(1, len(all_events)), 2),
        polymarket_markets=sum(e.market_count for e in poly_events),
        polymarket_volume=sum(e.total_volume for e in poly_events),
        kalshi_markets=sum(e.market_count for e in kalshi_events),
        kalshi_volume=sum(e.total_volume for e in kalshi_events),
    )
    
    # Pagination
    total = len(all_events)
    total_pages = max(1, (total + page_size - 1) // page_size)
    start_idx = (page - 1) * page_size
    end_idx = start_idx + page_size
    paginated_events = all_events[start_idx:end_idx]
    
    return EventsResponse(
        events=paginated_events,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
        platform_counts=platform_counts,
        aggregate_metrics=aggregate_metrics,
    )


@router.get("/events/{platform}/{event_id}", response_model=EventDetailResponse)
async def get_event_detail(
    platform: str,
    event_id: str,
):
    """
    Get detailed event information with all markets.
    
    For Polymarket: event_id is the event_slug (e.g., presidential-election-winner-2028)
    For Kalshi: event_id is the event_ticker (e.g., KXBTCMAXY-25)
    
    Implements Phase 1 caching: Response cached for 1 hour to reduce API costs
    """
    # Normalize platform first
    if platform in ["poly", "polymarket"]:
        platform = "polymarket"
    elif platform in ["kalshi"]:
        platform = "kalshi"
    else:
        raise HTTPException(status_code=400, detail=f"Unknown platform: {platform}")
    
    # Phase 1: Check cache first
    cache_key = f"event_detail:{platform}:{event_id}"
    cached = events_cache_get(cache_key)
    if cached:
        logger.info(f"✅ Event detail cache HIT: {cache_key}")
        return cached
    
    logger.info(f"❌ Event detail cache MISS: {cache_key} - Fetching from API")
    
    # Fetch fresh data from API
    api_key = get_dome_api_key()
    if not api_key:
        raise HTTPException(status_code=500, detail="DOME_API_KEY not configured")
    
    async with httpx.AsyncClient() as client:
        if platform == "polymarket":
            result = await fetch_polymarket_event_detail(client, api_key, event_id)
        else:
            result = await fetch_kalshi_event_detail(client, api_key, event_id)
    
    # Phase 1: Cache the result for 1 hour
    events_cache_set(cache_key, result, ttl_seconds=EVENT_DETAIL_TTL_SECONDS)
    logger.info(f"💾 Cached event detail: {cache_key} (TTL: {EVENT_DETAIL_TTL_SECONDS}s)")
    
    return result


async def fetch_polymarket_event_detail(
    client: httpx.AsyncClient,
    api_key: str,
    event_id: str,
) -> EventDetailResponse:
    """Fetch all markets for a Polymarket event with live prices and recent trades.
    
    First tries to find the event in cache (since we use synthetic event IDs).
    Then fetches live prices for each market.
    """
    try:
        # Find the event in our cache (events should always be cached)
        # Use the events_cache_service (where warm_events_cache stores data)
        cache_service = get_events_cache_service()
        await cache_service.initialize()
        
        events_data = await cache_service.get_all_events()
        
        if not events_data:
            logger.error(f"Cache is empty, cannot fetch event {event_id}")
            raise HTTPException(status_code=503, detail="Cache is warming up, please try again in a moment")
        
        # events_data is a dict with 'events' and 'platform_counts'
        all_events = events_data.get("events", [])
        
        logger.info(f"Looking for event {event_id}, cache has {len(all_events)} total events")
        
        cached_event = None
        
        for evt_dict in all_events:
            if evt_dict.get("event_id") == event_id and evt_dict.get("platform") == "polymarket":
                cached_event = evt_dict
                logger.info(f"Found event {event_id} with {evt_dict.get('market_count', 0)} markets")
                break
        
        # If not in cache, return error
        if not cached_event:
            logger.error(f"Event {event_id} not found in cache")
            raise HTTPException(status_code=404, detail=f"Event not found: {event_id}")
        
        # Get unique market_ids from the cached event
        market_slugs = []
        seen_slugs = set()
        for m in cached_event.get("markets", []):
            mid = m.get("market_id")
            if mid and mid not in seen_slugs:
                market_slugs.append(mid)
                seen_slugs.add(mid)
        
        if not market_slugs:
            raise HTTPException(status_code=404, detail=f"No markets found for event: {event_id}")
        
        # Phase 2: Fetch markets in parallel (10 at a time) for better performance
        markets = []
        
        async def fetch_single_market(slug: str) -> Optional[Dict]:
            """Fetch a single market by slug"""
            try:
                resp = await client.get(
                    f"{DOME_API_BASE}/polymarket/markets",
                    headers={"Authorization": f"Bearer {api_key}"},
                    params={"market_slug": slug, "limit": 1},
                    timeout=10.0,
                )
                if resp.status_code == 200:
                    market_data = resp.json().get("markets", [])
                    if market_data and len(market_data) > 0:
                        return market_data[0]
            except Exception as e:
                logger.debug(f"Failed to fetch market {slug}: {e}")
            return None
        
        # Fetch in batches of 10 for better performance
        batch_size = 10
        for i in range(0, min(len(market_slugs), 100), batch_size):
            batch = market_slugs[i:i+batch_size]
            batch_results = await asyncio.gather(
                *[fetch_single_market(slug) for slug in batch],
                return_exceptions=True
            )
            # Filter out None and exceptions
            for result in batch_results:
                if result and not isinstance(result, Exception):
                    markets.append(result)
        
        logger.info(f"✅ Fetched {len(markets)} markets in parallel batches")
        
        data = {"markets": markets}
        
        if not markets:
            raise HTTPException(status_code=404, detail=f"Event not found: {event_id}")
        
        # Phase 2: Smart price fetching - prioritize high-volume markets
        # Sort markets by volume to fetch prices for most important ones first
        sorted_markets = sorted(markets, key=lambda x: x.get("volume_total", 0) or 0, reverse=True)
        
        # Collect token IDs for price fetching (prioritize top markets)
        token_ids = []
        token_to_market = {}
        for m in sorted_markets[:50]:  # Fetch prices for top 50 markets (100 tokens max)
            side_a = m.get("side_a", {})
            side_b = m.get("side_b", {})
            if isinstance(side_a, dict) and side_a.get("id"):
                token_ids.append(side_a["id"])
                token_to_market[side_a["id"]] = {"market": m, "side": "yes"}
            if isinstance(side_b, dict) and side_b.get("id"):
                token_ids.append(side_b["id"])
                token_to_market[side_b["id"]] = {"market": m, "side": "no"}
        
        # Fetch live prices in batches of 10 (better throughput)
        prices = {}
        batch_size = 10
        for i in range(0, min(len(token_ids), 100), batch_size):
            batch = token_ids[i:i+batch_size]
            price_tasks = [
                client.get(
                    f"{DOME_API_BASE}/polymarket/market-price/{tid}",
                    headers={"Authorization": f"Bearer {api_key}"},
                    timeout=10.0,
                )
                for tid in batch
            ]
            price_results = await asyncio.gather(*price_tasks, return_exceptions=True)
            for tid, result in zip(batch, price_results):
                if isinstance(result, Exception):
                    continue
                if result.status_code == 200:
                    price_data = result.json()
                    prices[tid] = price_data.get("price")
        
        logger.info(f"✅ Fetched {len(prices)} prices for top markets")
        
        # Fetch recent trades for the first market (most active)
        recent_trades = []
        if markets:
            top_market = max(markets, key=lambda x: x.get("volume_total", 0) or 0)
            try:
                trades_resp = await client.get(
                    f"{DOME_API_BASE}/polymarket/orders",
                    headers={"Authorization": f"Bearer {api_key}"},
                    params={
                        "market_slug": top_market.get("market_slug"),
                        "limit": 20,
                    },
                    timeout=10.0,
                )
                if trades_resp.status_code == 200:
                    trades_data = trades_resp.json()
                    for trade in trades_data.get("orders", [])[:15]:
                        recent_trades.append(RecentTrade(
                            timestamp=trade.get("timestamp", 0),
                            side=trade.get("side", ""),
                            price=trade.get("price", 0),
                            shares=trade.get("shares_normalized", 0) or trade.get("shares", 0),
                            market_id=trade.get("market_slug", ""),
                            market_title=trade.get("title", ""),
                            token_label=trade.get("token_label", ""),
                        ))
            except Exception as e:
                logger.debug(f"Failed to fetch trades: {e}")
        
        # Build event from cached data
        event = Event(**cached_event)
        
        # Format markets for response with live prices
        formatted_markets = []
        volume_by_market = []
        for m in sorted(markets, key=lambda x: x.get("volume_total", 0) or 0, reverse=True):
            side_a = m.get("side_a", {})
            side_b = m.get("side_b", {})
            token_id_yes = side_a.get("id") if isinstance(side_a, dict) else None
            token_id_no = side_b.get("id") if isinstance(side_b, dict) else None
            
            yes_price = prices.get(token_id_yes) if token_id_yes else None
            no_price = prices.get(token_id_no) if token_id_no else None
            
            market_data = {
                "market_id": m.get("market_slug"),
                "event_slug": m.get("event_slug"),  # For Polymarket URL
                "title": m.get("title"),
                "yes_price": yes_price,
                "no_price": no_price,
                "volume_total": m.get("volume_total"),
                "volume_1_week": m.get("volume_1_week"),
                "volume_24h": calculate_volume_24h(m, "polymarket"),
                "end_time": m.get("end_time"),
                "status": m.get("status", "open"),
                "image": m.get("image"),
                "token_id_yes": token_id_yes,
                "token_id_no": token_id_no,
                "condition_id": m.get("condition_id"),
            }
            formatted_markets.append(market_data)
            
            # For volume chart
            volume_by_market.append({
                "title": m.get("title", "")[:40] + ("..." if len(m.get("title", "")) > 40 else ""),
                "volume": m.get("volume_total", 0),
                "volume_1_week": m.get("volume_1_week", 0),
            })
        
        # Price summary
        prices_with_values = [m["yes_price"] for m in formatted_markets if m.get("yes_price") is not None]
        price_summary = {
            "avg_price": sum(prices_with_values) / len(prices_with_values) if prices_with_values else None,
            "max_price": max(prices_with_values) if prices_with_values else None,
            "min_price": min(prices_with_values) if prices_with_values else None,
            "markets_with_price": len(prices_with_values),
        }
        
        return EventDetailResponse(
            event=event,
            markets=formatted_markets,
            platform="polymarket",
            recent_trades=recent_trades,
            volume_by_market=volume_by_market[:10],  # Top 10 for chart
            price_summary=price_summary,
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching Polymarket event: {e}")
        raise HTTPException(status_code=500, detail=str(e))


async def fetch_kalshi_event_detail(
    client: httpx.AsyncClient,
    api_key: str,
    event_ticker: str,
) -> EventDetailResponse:
    """Fetch all markets for a Kalshi event using event_ticker filter."""
    try:
        response = await client.get(
            f"{DOME_API_BASE}/kalshi/markets",
            headers={"Authorization": f"Bearer {api_key}"},
            params={
                "event_ticker": event_ticker,
                "limit": 100,
            },
            timeout=15.0,
        )
        
        if response.status_code != 200:
            raise HTTPException(
                status_code=response.status_code,
                detail=f"Failed to fetch event: {response.text}"
            )
        
        data = response.json()
        markets = data.get("markets", [])
        
        if not markets:
            raise HTTPException(status_code=404, detail=f"Event not found: {event_ticker}")
        
        # Build event from markets
        total_volume = sum(m.get("volume", 0) or 0 for m in markets)
        total_24h = sum(m.get("volume_24h", 0) or 0 for m in markets)
        
        first_market = markets[0]
        
        event = Event(
            event_id=event_ticker,
            title=derive_event_title([{"title": m.get("title", "")} for m in markets], event_slug=event_ticker),
            platform="kalshi",
            category=categorize_market(first_market.get("title", ""), []),
            image=None,
            market_count=len(markets),
            total_volume=total_volume,
            volume_24h=total_24h,
            end_time=first_market.get("end_time"),
            status=first_market.get("status", "open"),
            tags=[],
        )
        
        # Format markets for response with enhanced data
        formatted_markets = []
        volume_by_market = []
        for m in sorted(markets, key=lambda x: x.get("volume", 0) or 0, reverse=True):
            market_data = {
                "market_id": m.get("market_ticker"),
                "title": m.get("title"),
                "yes_price": m.get("last_price"),
                "no_price": 1 - m.get("last_price", 0) if m.get("last_price") else None,
                "volume_total": m.get("volume"),
                "volume_24h": m.get("volume_24h"),
                "volume_1_week": m.get("volume_1_week"),
                "end_time": m.get("end_time"),
                "close_time": m.get("close_time"),
                "status": m.get("status", "open"),
                "result": m.get("result"),
            }
            formatted_markets.append(market_data)
            
            # For volume chart
            volume_by_market.append({
                "title": m.get("title", "")[:40] + ("..." if len(m.get("title", "")) > 40 else ""),
                "volume": m.get("volume", 0),
                "volume_24h": m.get("volume_24h", 0),
            })
        
        # Price summary for Kalshi (already has last_price)
        prices_with_values = [m["yes_price"] for m in formatted_markets if m.get("yes_price") is not None]
        price_summary = {
            "avg_price": sum(prices_with_values) / len(prices_with_values) if prices_with_values else None,
            "max_price": max(prices_with_values) if prices_with_values else None,
            "min_price": min(prices_with_values) if prices_with_values else None,
            "markets_with_price": len(prices_with_values),
        }
        
        return EventDetailResponse(
            event=event,
            markets=formatted_markets,
            platform="kalshi",
            recent_trades=[],  # Kalshi doesn't have trades API via Dome
            volume_by_market=volume_by_market[:10],
            price_summary=price_summary,
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching Kalshi event: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ==============================================================================
# Cache Management Endpoints
# ==============================================================================

@router.get("/events-cache/health")
async def cache_health():
    """Get cache health status - lightweight check for frontend"""
    cache_service = get_events_cache_service()
    stats = cache_service.get_stats()
    is_ready = stats.get('total_events', 0) > 0
    
    return {
        "status": "ready" if is_ready else "warming",
        "total_events": stats.get('total_events', 0),
        "polymarket_count": stats.get('polymarket_count', 0),
        "kalshi_count": stats.get('kalshi_count', 0),
        "last_refresh": stats.get('last_refresh'),
    }


@router.get("/events-cache/stats")
async def get_cache_stats():
    """Get cache statistics and health info"""
    cache_service = get_events_cache_service()
    return {
        "status": "healthy",
        "cache": cache_service.get_stats(),
        "cache_ttl_seconds": CACHE_TTL_SECONDS,
    }


@router.post("/events-cache/refresh")
async def refresh_cache():
    """Force refresh the events cache"""
    try:
        await warm_events_cache()
        return {"status": "success", "message": "Cache refreshed successfully"}
    except Exception as e:
        logger.error(f"Cache refresh failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/events-cache")
async def clear_cache():
    """Clear the events cache"""
    cache_service = get_events_cache_service()
    await cache_service.clear_all()
    
    # Also clear legacy cache
    global _events_cache
    _events_cache.clear()
    
    return {"status": "success", "message": "Cache cleared"}


# ==============================================================================
# Cache Warming & Background Refresh
# ==============================================================================

async def warm_events_cache(force_refresh: bool = True):
    """
    Warm the cache by fetching all events from both platforms.
    Called on startup and by background refresh.
    
    Args:
        force_refresh: If True, bypasses internal cache and fetches fresh data from Dome API
    """
    api_key = get_dome_api_key()
    if not api_key:
        logger.warning("Cannot warm cache: DOME_API_KEY not configured")
        return
    
    cache_service = get_events_cache_service()
    await cache_service.initialize()
    
    logger.info(f"Warming events cache... (force_refresh={force_refresh})")
    start_time = datetime.utcnow()
    
    all_events = []
    platform_counts = {"polymarket": 0, "kalshi": 0}
    
    async with httpx.AsyncClient() as client:
        # Fetch from both platforms in parallel with force_refresh
        poly_task = fetch_polymarket_events(
            client, api_key, min_volume=1000, status="open", force_refresh=force_refresh
        )
        kalshi_task = fetch_kalshi_events(
            client, api_key, min_volume=1000, status="open", force_refresh=force_refresh
        )
        
        results = await asyncio.gather(poly_task, kalshi_task, return_exceptions=True)
        
        for result in results:
            if isinstance(result, Exception):
                logger.error(f"Error warming cache: {result}")
                continue
            if isinstance(result, list):
                all_events.extend(result)
    
    # Count by platform
    for evt in all_events:
        if evt.platform == "polymarket":
            platform_counts["polymarket"] += 1
        elif evt.platform == "kalshi":
            platform_counts["kalshi"] += 1
    
    # Store in advanced cache service
    events_data = [evt.model_dump() for evt in all_events]
    await cache_service.set_all_events(events_data, platform_counts)
    
    elapsed = (datetime.utcnow() - start_time).total_seconds()
    logger.info(
        f"Cache warmed: {len(all_events)} events "
        f"(Poly: {platform_counts['polymarket']}, Kalshi: {platform_counts['kalshi']}) "
        f"in {elapsed:.2f}s"
    )
    
    return all_events


def start_background_refresh():
    """Start the background refresh task"""
    cache_service = get_events_cache_service()
    cache_service.start_background_refresh(warm_events_cache)


def stop_background_refresh():
    """Stop the background refresh task"""
    cache_service = get_events_cache_service()
    cache_service.stop_background_refresh()

