"""
Kalshi API Service via Dome API
Direct API fetch for Kalshi markets (no database required)

Uses min_volume filter to fetch only high-volume markets (>$100).
Implements progressive loading: 500 markets fast, full load in background.
Parallel fetching for speed.

Dome API Docs: https://docs.domeapi.io
Base URL: https://api.domeapi.io
Endpoint: /v1/kalshi/markets
"""
import httpx
import asyncio
import logging
import re
import os
from typing import Dict, List, Any, Optional
from datetime import datetime
from functools import lru_cache
import time
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

logger = logging.getLogger(__name__)

DOME_API_BASE = "https://api.domeapi.io"

# Progressive loading config
INITIAL_LOAD_LIMIT = 500      # Fast initial load
FULL_LOAD_LIMIT = 10000       # Max markets to fetch (API limit for offset pagination)
MIN_VOLUME_DOLLARS = 5000     # $5,000 minimum volume (in dollars) - filters to ~4,500 quality markets
CONCURRENT_REQUESTS = 10      # Parallel requests for speed


class KalshiAPIClient:
    """Async client for Kalshi via Dome API with progressive loading."""
    
    def __init__(self):
        self._client: Optional[httpx.AsyncClient] = None
        self._cache: Dict[str, Any] = {}
        self._cache_timestamp: float = 0
        self._cache_ttl: float = 300  # 5 minutes cache
        self._stale_while_revalidate: float = 600  # 10 minutes stale
        self._api_key = os.getenv("DOME_API_KEY", "")
        self._background_load_started: bool = False
        self._full_load_complete: bool = False
    
    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create HTTP client with connection pooling."""
        if self._client is None:
            headers = {
                "User-Agent": "EventGraph/1.0",
                "Accept": "application/json",
            }
            if self._api_key:
                headers["Authorization"] = f"Bearer {self._api_key}"
            
            # Connection pooling for parallel requests
            limits = httpx.Limits(
                max_keepalive_connections=20,
                max_connections=50,
                keepalive_expiry=30
            )
            
            self._client = httpx.AsyncClient(
                base_url=DOME_API_BASE,
                timeout=httpx.Timeout(30.0),
                headers=headers,
                limits=limits
            )
        return self._client
    
    async def close(self):
        """Close HTTP client."""
        if self._client:
            await self._client.aclose()
            self._client = None
    
    async def _get(self, endpoint: str, params: Optional[Dict] = None) -> Any:
        """Make GET request to Dome API."""
        client = await self._get_client()
        
        try:
            response = await client.get(endpoint, params=params)
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as e:
            logger.error(f"Dome API error {e.response.status_code}: {e.response.text}")
            raise
        except Exception as e:
            logger.error(f"Dome API request failed: {e}")
            raise
    
    async def fetch_markets_page(
        self,
        offset: int = 0,
        limit: int = 100,
        status: str = "open",
        min_volume: int = MIN_VOLUME_DOLLARS,
    ) -> tuple[List[Dict[str, Any]], int]:
        """
        Fetch a single page of Kalshi markets from Dome API.
        Uses min_volume filter to get high-quality markets only.
        
        Args:
            offset: Pagination offset
            limit: Max results per page (max 100)
            status: Market status filter
            min_volume: Minimum volume in dollars (default: $100)
            
        Returns:
            Tuple of (markets list, total count)
        """
        try:
            params = {
                "limit": min(limit, 100),
                "offset": offset,
                "min_volume": min_volume,
            }
            if status != "all":
                params["status"] = status
            
            response = await self._get("/v1/kalshi/markets", params=params)
            markets = response.get("markets", [])
            pagination = response.get("pagination", {})
            total = pagination.get("total", len(markets))
            
            return markets, total
            
        except Exception as e:
            logger.error(f"Error fetching Kalshi markets page (offset={offset}): {e}")
            return [], 0
    
    async def fetch_markets_parallel(
        self,
        max_markets: int,
        status: str = "open",
        min_volume: int = MIN_VOLUME_DOLLARS,
    ) -> List[Dict[str, Any]]:
        """
        Fetch Kalshi markets in parallel for speed.
        Uses min_volume filter to get only high-volume markets (>$100).
        
        Args:
            max_markets: Maximum markets to fetch
            status: Market status filter
            min_volume: Minimum volume in dollars
            
        Returns:
            List of market dicts sorted by volume
        """
        start_time = time.time()
        limit = 100  # Max per request
        
        # First, get initial page to know total count
        first_markets, total_available = await self.fetch_markets_page(
            offset=0, limit=limit, status=status, min_volume=min_volume
        )
        
        if not first_markets:
            return []
        
        all_markets = list(first_markets)
        actual_max = min(max_markets, total_available)
        
        logger.info(f"Kalshi: {total_available} markets with volume >= ${min_volume}, fetching up to {actual_max}")
        
        # Calculate remaining pages needed
        if len(first_markets) < limit or len(all_markets) >= actual_max:
            # Already have enough or no more data
            pass
        else:
            # Fetch remaining pages in parallel
            remaining = actual_max - len(all_markets)
            num_pages = (remaining + limit - 1) // limit
            offsets = [limit + (i * limit) for i in range(num_pages)]
            
            # Parallel fetch with concurrency limit
            async def fetch_page(offset: int) -> List[Dict[str, Any]]:
                markets, _ = await self.fetch_markets_page(
                    offset=offset, limit=limit, status=status, min_volume=min_volume
                )
                return markets
            
            # Use semaphore for controlled concurrency
            semaphore = asyncio.Semaphore(CONCURRENT_REQUESTS)
            
            async def fetch_with_semaphore(offset: int) -> List[Dict[str, Any]]:
                async with semaphore:
                    return await fetch_page(offset)
            
            # Execute parallel fetches
            tasks = [fetch_with_semaphore(offset) for offset in offsets]
            results = await asyncio.gather(*tasks, return_exceptions=True)
            
            for result in results:
                if isinstance(result, list):
                    all_markets.extend(result)
                elif isinstance(result, Exception):
                    logger.warning(f"Kalshi page fetch failed: {result}")
        
        # Trim to max and sort by volume
        all_markets = all_markets[:actual_max]
        all_markets.sort(key=lambda m: m.get("volume", 0) or 0, reverse=True)
        
        elapsed = time.time() - start_time
        logger.info(f"Kalshi parallel fetch: {len(all_markets)} markets in {elapsed:.2f}s")
        
        return all_markets
    
    async def fetch_all_markets(
        self,
        status: str = "open",
        max_markets: int = INITIAL_LOAD_LIMIT,
        use_cache: bool = True,
        trigger_background_load: bool = True,
        full_fetch: bool = False,
    ) -> List[Dict[str, Any]]:
        """
        Fetch Kalshi markets with progressive loading.
        Returns cached data fast, loads full dataset in background.
        Only fetches markets with volume > $100.
        
        Args:
            status: Market status filter
            max_markets: Maximum markets to fetch
            use_cache: Whether to use cache
            trigger_background_load: Whether to trigger background full load
            full_fetch: If True, bypass progressive loading and fetch ALL markets directly.
                        Used by merged cache builder to ensure complete data.
            
        Returns:
            List of high-volume market dicts
        """
        cache_key = f"kalshi_markets_{status}"
        cache_key_full = f"kalshi_markets_{status}_full"
        current_time = time.time()
        
        # Full fetch mode: bypass progressive loading, get everything
        if full_fetch:
            # Check if we already have full cache
            if use_cache and cache_key_full in self._cache:
                cache_age = current_time - self._cache_timestamp
                if cache_age < self._cache_ttl:
                    logger.info(f"Kalshi full_fetch: using cached {len(self._cache[cache_key_full])} markets")
                    return self._cache[cache_key_full]
            
            # Do a complete fetch now
            logger.info(f"Kalshi full_fetch: fetching ALL markets (up to {FULL_LOAD_LIMIT})")
            markets = await self.fetch_markets_parallel(
                max_markets=FULL_LOAD_LIMIT,
                status=status,
                min_volume=MIN_VOLUME_DOLLARS
            )
            
            # Store in full cache
            self._cache[cache_key_full] = markets
            self._cache_timestamp = current_time
            self._full_load_complete = True
            logger.info(f"Kalshi full_fetch: loaded {len(markets)} markets")
            return markets
        
        # Check if we have full cache (best case - instant return)
        if use_cache and cache_key_full in self._cache:
            cache_age = current_time - self._cache_timestamp
            if cache_age < self._cache_ttl:
                logger.debug(f"Using full cached Kalshi markets ({len(self._cache[cache_key_full])} markets)")
                return self._cache[cache_key_full][:max_markets]
            elif cache_age < self._stale_while_revalidate:
                # Return stale data, refresh in background
                logger.debug("Returning stale Kalshi cache, refreshing in background")
                asyncio.create_task(self._refresh_cache(status))
                return self._cache[cache_key_full][:max_markets]
        
        # Check if full load already completed (cache warmer ran)
        if self._full_load_complete and cache_key_full in self._cache:
            return self._cache[cache_key_full][:max_markets]
        
        # Check if we have initial cache (partial)
        if use_cache and cache_key in self._cache:
            cache_age = current_time - self._cache_timestamp
            if cache_age < self._cache_ttl:
                # Trigger background load if not started
                if trigger_background_load and not self._background_load_started:
                    asyncio.create_task(self._background_full_load(status))
                return self._cache[cache_key][:max_markets]
        
        # No cache - do initial fast load
        logger.info(f"Kalshi: Initial load of {INITIAL_LOAD_LIMIT} markets (volume > $100)")
        markets = await self.fetch_markets_parallel(
            max_markets=INITIAL_LOAD_LIMIT,
            status=status,
            min_volume=MIN_VOLUME_DOLLARS
        )
        
        # Cache initial load
        self._cache[cache_key] = markets
        self._cache_timestamp = current_time
        
        # Trigger background full load
        if trigger_background_load and not self._background_load_started:
            asyncio.create_task(self._background_full_load(status))
        
        return markets[:max_markets]
    
    async def _background_full_load(self, status: str = "open"):
        """Load full dataset in background and update cache."""
        if self._background_load_started:
            return
        
        self._background_load_started = True
        logger.info(f"Kalshi: Starting background full load ({FULL_LOAD_LIMIT} max markets)")
        
        try:
            markets = await self.fetch_markets_parallel(
                max_markets=FULL_LOAD_LIMIT,
                status=status,
                min_volume=MIN_VOLUME_DOLLARS
            )
            
            cache_key_full = f"kalshi_markets_{status}_full"
            self._cache[cache_key_full] = markets
            self._cache_timestamp = time.time()
            self._full_load_complete = True
            
            logger.info(f"Kalshi: Background load complete - {len(markets)} markets cached")
        except Exception as e:
            logger.error(f"Kalshi background load failed: {e}")
        finally:
            self._background_load_started = False
    
    async def _refresh_cache(self, status: str = "open"):
        """Refresh cache in background."""
        logger.info("Kalshi: Refreshing cache in background")
        try:
            markets = await self.fetch_markets_parallel(
                max_markets=FULL_LOAD_LIMIT,
                status=status,
                min_volume=MIN_VOLUME_DOLLARS
            )
            
            cache_key_full = f"kalshi_markets_{status}_full"
            self._cache[cache_key_full] = markets
            self._cache_timestamp = time.time()
            
            logger.info(f"Kalshi: Cache refreshed with {len(markets)} markets")
        except Exception as e:
            logger.error(f"Kalshi cache refresh failed: {e}")
    
    async def warm_cache(self):
        """
        Pre-warm cache on server startup.
        Fetches full dataset so first user request is instant.
        """
        logger.info("Kalshi: Warming cache on startup...")
        self._background_load_started = True  # Prevent background loads from triggering
        try:
            start_time = time.time()
            
            # Fetch full dataset
            markets = await self.fetch_markets_parallel(
                max_markets=FULL_LOAD_LIMIT,
                status="open",
                min_volume=MIN_VOLUME_DOLLARS
            )
            
            # Store in full cache
            cache_key_full = "kalshi_markets_open_full"
            self._cache[cache_key_full] = markets
            self._cache_timestamp = time.time()
            self._full_load_complete = True
            
            elapsed = time.time() - start_time
            logger.info(f"Kalshi: Cache warmed with {len(markets)} markets in {elapsed:.2f}s")
            
            return len(markets)
        except Exception as e:
            logger.error(f"Kalshi cache warming failed: {e}")
            return 0
        finally:
            self._background_load_started = False  # Allow future refreshes
    
    def _extract_category(self, raw: Dict[str, Any]) -> str:
        """Extract category from market data using keyword matching."""
        title = (raw.get("title") or "").lower()
        event_ticker = (raw.get("event_ticker") or "").lower()
        
        # Crypto keywords
        crypto_keywords = [
            "bitcoin", "btc", "ethereum", "eth", "crypto", "solana", 
            "token", "blockchain", "defi", "nft"
        ]
        
        # Politics keywords  
        politics_keywords = [
            "trump", "biden", "president", "congress", "senate", "election",
            "vote", "republican", "democrat", "government", "white house",
            "supreme court", "impeach", "tariff", "fed ", "federal reserve",
            "recession", "gdp", "inflation", "rate cut", "rate hike"
        ]
        
        # Sports keywords
        sports_keywords = [
            "nfl", "nba", "mlb", "nhl", "fifa", "world cup", "super bowl",
            "championship", "playoffs", "win the", "football", "basketball",
            "baseball", "hockey", "soccer", "tennis", "golf", "olympics",
            "college football", "ncaa", "pro football"
        ]
        
        # Weather keywords
        weather_keywords = [
            "temperature", "weather", "hurricane", "storm", "rainfall",
            "snowfall", "climate", "tornado", "flood"
        ]
        
        # Entertainment keywords
        entertainment_keywords = [
            "movie", "film", "oscar", "grammy", "emmy", "album", "song",
            "artist", "singer", "actor", "spotify", "netflix", "box office"
        ]
        
        # Finance keywords
        finance_keywords = [
            "stock", "s&p", "nasdaq", "dow", "index", "market", "ipo",
            "earnings", "revenue", "gdp growth"
        ]
        
        combined = f"{title} {event_ticker}"
        
        # Check keywords in order of specificity
        for keyword in sports_keywords:
            if keyword in combined:
                return "sports"
        
        for keyword in crypto_keywords:
            if keyword in combined:
                return "crypto"
        
        for keyword in weather_keywords:
            if keyword in combined:
                return "weather"
        
        for keyword in entertainment_keywords:
            if keyword in combined:
                return "entertainment"
        
        for keyword in finance_keywords:
            if keyword in combined:
                return "finance"
        
        for keyword in politics_keywords:
            if keyword in combined:
                return "politics"
        
        return "other"
    
    def _parse_status(self, raw: Dict[str, Any]) -> str:
        """Parse market status from raw data."""
        status = raw.get("status", "").lower()
        result = raw.get("result")
        
        if result is not None:
            return "resolved"
        
        status_map = {
            "open": "open",
            "active": "open",
            "closed": "resolved",
            "settled": "resolved",
            "finalized": "resolved",
        }
        
        return status_map.get(status, "open")
    
    def _generate_slug(self, title: str, ticker: str) -> str:
        """Generate a URL-friendly slug from title and ticker."""
        # Clean title
        slug = title.lower()
        slug = re.sub(r'[^\w\s-]', '', slug)
        slug = re.sub(r'[-\s]+', '-', slug)
        slug = slug.strip('-')[:50]
        
        # Add ticker for uniqueness
        ticker_clean = ticker.replace("-", "").lower()[:20]
        return f"{slug}-{ticker_clean}"
    
    def transform_to_event(self, market: Dict[str, Any]) -> Dict[str, Any]:
        """Transform raw Kalshi market to event format."""
        market_ticker = market.get("market_ticker") or ""
        event_ticker = market.get("event_ticker") or ""
        title = market.get("title") or ""
        
        # Parse price (Kalshi uses 0-100 scale)
        # Priority: yes_bid/yes_ask (current orderbook) > last_price (last trade)
        # NEVER default to 50 — that creates phantom arbitrage opportunities
        yes_bid = market.get("yes_bid")
        yes_ask = market.get("yes_ask")
        last_price = market.get("last_price")
        
        # Use midpoint of bid/ask if available (most accurate current price)
        if yes_bid is not None and yes_ask is not None:
            yes_price = ((yes_bid + yes_ask) / 2.0) / 100.0
            price_source = "orderbook"
        elif yes_ask is not None:
            yes_price = yes_ask / 100.0
            price_source = "ask"
        elif yes_bid is not None:
            yes_price = yes_bid / 100.0
            price_source = "bid"
        elif last_price is not None:
            yes_price = last_price / 100.0
            price_source = "last_trade"
        else:
            # No price data at all — mark as None so downstream can skip
            yes_price = None
            price_source = "none"
        
        no_price = (1 - yes_price) if yes_price is not None else None
        
        # Parse volume (already in dollars)
        volume = market.get("volume", 0) or 0
        volume_24h = market.get("volume_24h", 0) or 0
        
        # Parse timestamps
        start_time = market.get("start_time")
        end_time = market.get("end_time") or market.get("close_time")
        
        # Generate slug
        slug = self._generate_slug(title, market_ticker)
        
        # Get result for resolved markets
        result = market.get("result")
        
        return {
            "event_id": slug,
            "platform": "kalshi",
            "title": title,
            "event_title": title,
            "event_description": f"Kalshi market: {event_ticker}",
            "category": self._extract_category(market),
            "market_count": 1,
            "total_volume": volume,  # Volume is already in dollars
            "volume_24h": volume_24h,
            "volume_1_week": None,  # Not provided by API
            "yes_price": yes_price,
            "no_price": no_price,
            "status": self._parse_status(market),
            "start_time": start_time,
            "end_time": end_time,
            "image": None,  # Kalshi doesn't provide images via Dome API
            "link": f"https://kalshi.com/browse?search={market_ticker}",
            "tags": [],
            "liquidity": None,
            "result": result,
            "event_ticker": event_ticker,
            "market_ticker": market_ticker,
            # Include raw market for detail view
            "markets": [{
                "market_id": market_ticker,
                "source_market_id": market_ticker,
                "title": title,
                "description": f"Kalshi market: {event_ticker}",
                "yes_price": yes_price,
                "no_price": no_price,
                "volume_total": volume,
                "volume_24h": volume_24h,
                "volume_1_week": None,
                "liquidity": None,
                "status": self._parse_status(market),
                "source_url": f"https://kalshi.com/browse?search={market_ticker}",
                "image_url": None,
                "outcomes": ["Yes", "No"],
                "result": result,
            }],
        }


# Singleton client instance
_kalshi_client: Optional[KalshiAPIClient] = None


def get_kalshi_client() -> KalshiAPIClient:
    """Get or create Kalshi API client singleton."""
    global _kalshi_client
    if _kalshi_client is None:
        _kalshi_client = KalshiAPIClient()
    return _kalshi_client


async def fetch_kalshi_events(
    category: str = "all",
    search: str = "",
    status: str = "open",
    limit: int = 50,
    offset: int = 0,
    full_fetch: bool = False,
) -> Dict[str, Any]:
    """
    Fetch Kalshi events with filtering and pagination.
    
    Args:
        category: Filter by category (all, crypto, politics, sports, etc.)
        search: Search term for title
        status: Filter by status (all, open, resolved)
        limit: Max results to return
        offset: Pagination offset
        full_fetch: If True, bypass progressive loading and fetch ALL markets
        
    Returns:
        Dict with events list, total count, and aggregate metrics
    """
    client = get_kalshi_client()
    
    try:
        # Always fetch from cached open markets (cache warmed with status=open)
        # We filter by status in Python if needed (most requests want open anyway)
        raw_markets = await client.fetch_all_markets(
            status="open",  # Always use cached open markets
            max_markets=FULL_LOAD_LIMIT,  # Get full cache, not just initial 500
            full_fetch=full_fetch,  # Bypass progressive loading if True
        )
        
        # Transform to events
        events = [client.transform_to_event(m) for m in raw_markets]
        
        # Filter by status (in case API returns mixed)
        if status != "all":
            events = [e for e in events if e["status"] == status]
        
        # Filter by category
        if category != "all":
            category_lower = category.lower()
            events = [e for e in events if e["category"].lower() == category_lower]
        
        # Filter by search
        if search:
            search_lower = search.lower()
            events = [e for e in events if search_lower in e["title"].lower()]
        
        # Sort by volume
        events.sort(key=lambda e: e.get("total_volume", 0) or 0, reverse=True)
        
        # Get total before pagination
        total = len(events)
        
        # Calculate aggregate metrics from ALL events (before pagination)
        total_volume = sum(e.get("total_volume", 0) or 0 for e in events)
        
        # Apply pagination AFTER calculating totals
        paginated_events = events[offset:offset + limit]
        
        return {
            "events": paginated_events,
            "total": total,
            "aggregate_metrics": {
                "total_events": total,
                "total_markets": total,  # 1:1 for Kalshi
                "total_volume": total_volume,
                "total_liquidity": 0,
            }
        }
    except Exception as e:
        logger.error(f"Error fetching Kalshi events: {e}")
        return {
            "events": [],
            "total": 0,
            "aggregate_metrics": {
                "total_events": 0,
                "total_markets": 0,
                "total_volume": 0,
                "total_liquidity": 0,
            }
        }


async def fetch_kalshi_market_detail(market_slug: str) -> Optional[Dict[str, Any]]:
    """
    Fetch detailed Kalshi market by slug or market_ticker.
    
    Args:
        market_slug: The market slug (title-slug-ticker) or market_ticker (e.g. KXNCAAF-26-UGA)
    
    Returns:
        Event dict with market details, or None if not found
    """
    client = get_kalshi_client()
    
    try:
        # Fetch all open markets and search
        all_markets = await client.fetch_all_markets(use_cache=True)
        
        for market in all_markets:
            # Match by market_ticker (from Screener) or event_ticker
            if (market.get("market_ticker") == market_slug or 
                market.get("event_ticker") == market_slug):
                return client.transform_to_event(market)
            
            # Match by generated slug (from Events page)
            event = client.transform_to_event(market)
            if event["event_id"] == market_slug:
                return event
        
        # Also check closed markets
        closed_markets = await client.fetch_all_markets(status="closed", use_cache=True)
        
        for market in closed_markets:
            if (market.get("market_ticker") == market_slug or 
                market.get("event_ticker") == market_slug):
                return client.transform_to_event(market)
            
            event = client.transform_to_event(market)
            if event["event_id"] == market_slug:
                return event
        
        return None
        
    except Exception as e:
        logger.error(f"Error fetching Kalshi market detail: {e}")
        return None


async def fetch_kalshi_categories() -> Dict[str, Any]:
    """
    Get categories with counts from Kalshi markets.
    
    Returns:
        Dict with categories list and total count
    """
    client = get_kalshi_client()
    
    try:
        # Fetch all markets (full fetch to get accurate counts, not just initial 500)
        raw_markets = await client.fetch_all_markets(full_fetch=True)
        
        # Count by category
        category_counts: Dict[str, int] = {}
        for market in raw_markets:
            event = client.transform_to_event(market)
            category = event.get("category", "other")
            category_counts[category] = category_counts.get(category, 0) + 1
        
        # Format as list sorted by count
        categories = [
            {
                "name": name,
                "count": count,
                "label": name.title() if name else "Other"
            }
            for name, count in sorted(category_counts.items(), key=lambda x: -x[1])
        ]
        
        return {
            "categories": categories,
            "total_categories": len(categories)
        }
        
    except Exception as e:
        logger.error(f"Error fetching Kalshi categories: {e}")
        return {
            "categories": [],
            "total_categories": 0
        }


async def warm_kalshi_cache() -> int:
    """
    Warm Kalshi cache on server startup.
    Call this from main.py on startup.
    
    Returns:
        Number of markets cached
    """
    client = get_kalshi_client()
    return await client.warm_cache()
