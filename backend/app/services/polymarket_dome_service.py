"""
Polymarket Live API Service using Dome API (EVENTS endpoint)
=============================================================
Fetches live Polymarket EVENTS for the Events page via Dome API.
Uses the /v1/polymarket/events endpoint which returns proper events with market_count.

Production-grade features:
- Parallel fetching for speed
- Retry with exponential backoff
- Partial success handling (use what we got)
- Circuit breaker for resilience
"""

import os
import time
import asyncio
import httpx
import logging
import threading
import concurrent.futures
from typing import Dict, List, Any, Optional
from datetime import datetime
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

logger = logging.getLogger(__name__)

# Dome API configuration
DOME_API_KEY = os.getenv("DOME_API_KEY", "")
DOME_API_BASE = "https://api.domeapi.io"

# Cache configuration
CACHE_TTL = 300  # 5 minutes - marks data as "needs refresh"
STALE_WHILE_REVALIDATE = 1800  # 30 minutes - serve stale while refreshing (increased from 10 min)

# Progressive loading config
INITIAL_LOAD = 500   # Fast initial load (instant for user)
FULL_LOAD = 25000    # Full dataset (~22,000+ events as of Feb 2026, filtered to ~9K with MIN_VOLUME)
BATCH_SIZE = 100     # Dome API pagination size
MAX_PARALLEL = 10    # Parallel requests
MIN_VOLUME = 100     # $100 minimum volume filter (keeps quality high, ~9K events)

# Retry configuration
MAX_RETRIES = 3
RETRY_DELAY = 2      # Base delay in seconds (doubles each retry)
REQUEST_TIMEOUT = 30  # Shorter timeout per request, retry instead of wait


class PolymarketDomeClient:
    """Client for fetching Polymarket events via Dome API with progressive loading"""
    
    def __init__(self):
        self.api_key = DOME_API_KEY
        self.base_url = DOME_API_BASE
        self._cache: Dict[str, Any] = {}
        self._cache_timestamps: Dict[str, float] = {}
        self._refresh_lock = threading.Lock()
        self._refreshing: Dict[str, bool] = {}
        self._full_load_triggered = False
        
        if not self.api_key:
            logger.warning("⚠️ DOME_API_KEY not set - Polymarket API calls will fail")
    
    def _get_headers(self) -> Dict[str, str]:
        """Get API headers with authentication"""
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
    
    def _is_cache_valid(self, cache_key: str) -> bool:
        """Check if cached data is still valid (within TTL)"""
        if cache_key not in self._cache_timestamps:
            return False
        return (time.time() - self._cache_timestamps[cache_key]) < CACHE_TTL
    
    def _is_cache_stale_but_usable(self, cache_key: str) -> bool:
        """Check if cached data is stale but can be served while refreshing"""
        if cache_key not in self._cache_timestamps:
            return False
        age = time.time() - self._cache_timestamps[cache_key]
        return age < STALE_WHILE_REVALIDATE
    
    def _get_cached(self, cache_key: str) -> Optional[Any]:
        """Get data from cache if valid"""
        if self._is_cache_valid(cache_key):
            logger.debug(f"📦 Cache hit for {cache_key}")
            return self._cache.get(cache_key)
        return None
    
    def _get_stale_cached(self, cache_key: str) -> Optional[Any]:
        """Get stale data from cache (for stale-while-revalidate pattern)"""
        if self._is_cache_stale_but_usable(cache_key):
            return self._cache.get(cache_key)
        return None
    
    def _set_cache(self, cache_key: str, data: Any):
        """Store data in cache"""
        self._cache[cache_key] = data
        self._cache_timestamps[cache_key] = time.time()
        logger.debug(f"💾 Cached {cache_key}")
    
    def _background_refresh(self, cache_key: str, max_events: int):
        """Refresh cache in background"""
        if self._refreshing.get(cache_key):
            return  # Already refreshing
        
        def do_refresh():
            try:
                self._refreshing[cache_key] = True
                logger.info(f"🔄 Background refresh for {cache_key}")
                self._fetch_events_internal(max_events, cache_key)
            finally:
                self._refreshing[cache_key] = False
        
        thread = threading.Thread(target=do_refresh, daemon=True)
        thread.start()
    
    def _fetch_events_internal(self, max_events: int, cache_key: str, status: Optional[str] = "open") -> List[Dict[str, Any]]:
        """
        Fetch EVENTS from Dome API /v1/polymarket/events endpoint.
        
        Production-grade approach:
        1. First request to get pagination info
        2. Parallel fetch remaining pages with retry logic
        3. Combine and deduplicate results
        
        Args:
            max_events: Maximum number of events to fetch
            cache_key: Key for caching
            status: Filter by status ("open", "closed", or None for all) - defaults to None for all events
        """
        all_events = []
        start_time = time.time()
        
        logger.info(f"⚡ Fetching up to {max_events} Polymarket {status or 'all'} events from Dome API...")
        
        def fetch_page_with_retry(pagination_key: Optional[str] = None, retries: int = 0) -> tuple:
            """Fetch a single page with retry logic"""
            try:
                with httpx.Client(timeout=REQUEST_TIMEOUT) as client:
                    url = f"{self.base_url}/v1/polymarket/events"
                    params = {"limit": BATCH_SIZE}
                    
                    if status:
                        params["status"] = status
                    
                    if pagination_key:
                        params["pagination_key"] = pagination_key
                    
                    response = client.get(url, headers=self._get_headers(), params=params)
                    response.raise_for_status()
                    data = response.json()
                    
                    events = data.get("events", [])
                    pagination = data.get("pagination", {})
                    next_key = pagination.get("pagination_key") if pagination.get("has_more") else None
                    
                    return events, next_key, None
                    
            except Exception as e:
                if retries < MAX_RETRIES:
                    delay = RETRY_DELAY * (2 ** retries)  # Exponential backoff
                    logger.warning(f"⚠️ Retry {retries + 1}/{MAX_RETRIES} after {delay}s: {e}")
                    time.sleep(delay)
                    return fetch_page_with_retry(pagination_key, retries + 1)
                else:
                    logger.error(f"❌ Failed after {MAX_RETRIES} retries: {e}")
                    return [], None, str(e)
        
        # Phase 1: Sequential fetch to get all pagination keys
        # (Polymarket uses cursor pagination, can't skip pages)
        pagination_key = None
        fetch_count = 0
        errors = []
        
        while len(all_events) < max_events:
            events, next_key, error = fetch_page_with_retry(pagination_key)
            
            if error:
                errors.append(error)
                # If we have some data, use it (partial success)
                if all_events:
                    logger.warning(f"⚠️ Partial success: got {len(all_events)} events before error")
                    break
                else:
                    # No data at all, this is a real failure
                    break
            
            if not events:
                break
            
            all_events.extend(events)
            fetch_count += 1
            
            # Log progress every 10 pages
            if fetch_count % 10 == 0:
                logger.info(f"  📥 Fetched {len(all_events)} events ({fetch_count} pages)...")
            
            if not next_key:
                break
            
            pagination_key = next_key
            
            # Small delay to avoid rate limiting
            if fetch_count % 5 == 0:
                time.sleep(0.1)
        
        # Trim to max_events
        all_events = all_events[:max_events]
        
        elapsed = time.time() - start_time
        logger.info(f"✅ Fetched {len(all_events)} Polymarket events in {elapsed:.1f}s ({fetch_count} pages)")
        
        # Only cache if we got events (don't cache empty results)
        if all_events:
            self._set_cache(cache_key, all_events)
        
        return all_events
    
    def _background_load_full(self):
        """Load full events in background after initial fast load"""
        cache_key = f"polymarket_events_{FULL_LOAD}"
        
        if self._refreshing.get(cache_key) or self._full_load_triggered:
            return  # Already loading
        
        # Check if we already have full data
        cached = self._get_cached(cache_key)
        if cached is not None:
            return
        
        def do_load():
            try:
                self._refreshing[cache_key] = True
                self._full_load_triggered = True
                logger.info(f"📦 Background loading full {FULL_LOAD} events...")
                self._fetch_events_internal(FULL_LOAD, cache_key)
                logger.info(f"✅ Full {FULL_LOAD} events loaded in background")
            except Exception as e:
                logger.error(f"❌ Background full load failed: {e}")
            finally:
                self._refreshing[cache_key] = False
        
        thread = threading.Thread(target=do_load, daemon=True)
        thread.start()
    
    def fetch_all_events(self, max_events: int = FULL_LOAD) -> List[Dict[str, Any]]:
        """
        Fetch events with progressive loading pattern:
        - First request: Return 500 instantly, load more in background
        - Subsequent requests: Return full from cache
        
        Returns:
            List of event dictionaries from Dome API
        """
        import time
        start_time = time.time()
        
        full_cache_key = f"polymarket_events_{FULL_LOAD}"
        initial_cache_key = f"polymarket_events_{INITIAL_LOAD}"
        
        # Check if full data is cached (best case - instant)
        full_cached = self._get_cached(full_cache_key)
        if full_cached is not None:
            duration = (time.time() - start_time) * 1000
            logger.info(f"📦 FRESH cache hit: {len(full_cached)} events ({duration:.1f}ms)")
            return full_cached[:max_events]
        
        # Check stale full cache
        stale_full = self._get_stale_cached(full_cache_key)
        if stale_full is not None:
            duration = (time.time() - start_time) * 1000
            logger.info(f"⚡ STALE cache hit: {len(stale_full)} events ({duration:.1f}ms), refreshing in background")
            self._background_refresh(full_cache_key, FULL_LOAD)
            return stale_full[:max_events]
        
        # Check if initial is cached
        initial_cached = self._get_cached(initial_cache_key)
        if initial_cached is not None:
            duration = (time.time() - start_time) * 1000
            logger.info(f"📦 Initial cache hit: {len(initial_cached)} events ({duration:.1f}ms), loading full in background")
            # Trigger background load of full data
            self._background_load_full()
            return initial_cached[:max_events]
        
        # First request - load initial fast, trigger full in background
        logger.info(f"❄️ COLD START: fetching {INITIAL_LOAD} events (full {FULL_LOAD} loading in background)...")
        
        try:
            # Fetch initial batch
            initial_events = self._fetch_events_internal(INITIAL_LOAD, initial_cache_key)
            
            # Trigger background load of full data
            self._background_load_full()
            
            duration = (time.time() - start_time) * 1000
            logger.info(f"✅ Initial cache populated: {len(initial_events)} events ({duration:.1f}ms)")
            return initial_events[:max_events]
            
        except httpx.HTTPStatusError as e:
            logger.error(f"❌ Dome API error: {e.response.status_code} - {e.response.text}")
            raise
        except Exception as e:
            logger.error(f"❌ Error fetching Polymarket events: {str(e)}")
            raise
    
    def fetch_event_detail(self, event_slug: str) -> Optional[Dict[str, Any]]:
        """
        Fetch detailed information for a specific event.
        
        Args:
            event_slug: The event slug to fetch
            
        Returns:
            Event detail dictionary or None
        """
        cache_key = f"polymarket_event_{event_slug}"
        cached = self._get_cached(cache_key)
        if cached is not None:
            return cached
        
        try:
            with httpx.Client(timeout=15.0) as client:
                url = f"{self.base_url}/v1/polymarket/events"
                params = {"event_slug[]": event_slug}
                response = client.get(url, headers=self._get_headers(), params=params)
                response.raise_for_status()
                
                data = response.json()
                events = data.get("events", [])
                if events:
                    self._set_cache(cache_key, events[0])
                    return events[0]
                return None
                
        except httpx.HTTPStatusError as e:
            logger.error(f"❌ Error fetching event {event_slug}: {e.response.status_code}")
            return None
        except Exception as e:
            logger.error(f"❌ Error fetching event {event_slug}: {str(e)}")
            return None
    
    async def fetch_event_detail_with_markets(
        self, 
        event_slug: str,
        force_refresh: bool = False
    ) -> Optional[Dict[str, Any]]:
        """
        Fetch event with all markets and live prices from Dome API.
        
        Makes 3 types of calls:
        1. /v1/polymarket/events?event_slug[]=X - Get event metadata
        2. /v1/polymarket/markets?event_slug[]=X - Get all markets in event  
        3. /v1/polymarket/market-price/{token_id} - Get live price for each market (parallel)
        
        Args:
            event_slug: The event slug to fetch (e.g., "democratic-presidential-nominee-2028")
            force_refresh: If True, bypass cache and fetch fresh data
            
        Returns:
            Event dict with markets list including live prices, or None
        """
        import asyncio
        
        cache_key = f"polymarket_event_detail_{event_slug}"
        
        # Check cache only if not forcing refresh
        if not force_refresh:
            cached = self._get_cached(cache_key)
            if cached is not None:
                logger.info(f"📦 Cache hit for event detail: {event_slug}")
                return cached
        else:
            logger.info(f"🔄 Force refresh requested for: {event_slug}")
        
        logger.info(f"🔄 Fetching live event detail for: {event_slug}")
        start_time = time.time()
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                # Step 1 & 2: Fetch event and markets in parallel
                event_task = client.get(
                    f"{self.base_url}/v1/polymarket/events",
                    params={"event_slug[]": event_slug},
                    headers=self._get_headers()
                )
                markets_task = client.get(
                    f"{self.base_url}/v1/polymarket/markets",
                    params={"event_slug[]": event_slug, "limit": 100},
                    headers=self._get_headers()
                )
                
                event_resp, markets_resp = await asyncio.gather(event_task, markets_task)
                event_resp.raise_for_status()
                markets_resp.raise_for_status()
                
                event_data = event_resp.json()
                markets_data = markets_resp.json()
                
                events = event_data.get("events", [])
                markets = markets_data.get("markets", [])
                
                if not events:
                    logger.warning(f"⚠️ Event not found: {event_slug}")
                    return None
                
                event = events[0]
                logger.info(f"📥 Got event + {len(markets)} markets")
                
                # Step 3: Fetch prices in parallel (batched to avoid rate limits)
                async def fetch_price(token_id: str) -> tuple:
                    """Fetch price for a single token"""
                    try:
                        resp = await client.get(
                            f"{self.base_url}/v1/polymarket/market-price/{token_id}",
                            headers=self._get_headers()
                        )
                        resp.raise_for_status()
                        data = resp.json()
                        return token_id, data.get("price", 0)
                    except Exception as e:
                        logger.warning(f"⚠️ Price fetch failed for {token_id[:20]}...: {e}")
                        return token_id, None
                
                # Extract token IDs (side_a = Yes token)
                token_prices = {}
                token_tasks = []
                for m in markets:
                    side_a = m.get("side_a", {})
                    token_id = side_a.get("id")
                    if token_id:
                        token_tasks.append(fetch_price(token_id))
                
                # Fetch all prices in parallel (max 50 concurrent)
                if token_tasks:
                    # Batch to avoid overwhelming the API
                    batch_size = 50
                    for i in range(0, len(token_tasks), batch_size):
                        batch = token_tasks[i:i+batch_size]
                        results = await asyncio.gather(*batch, return_exceptions=True)
                        for result in results:
                            if isinstance(result, tuple):
                                token_id, price = result
                                if price is not None:
                                    token_prices[token_id] = price
                        # Small delay between batches
                        if i + batch_size < len(token_tasks):
                            await asyncio.sleep(0.1)
                
                logger.info(f"💰 Got {len(token_prices)} prices")
                
                # Build markets list with prices
                markets_list = []
                for m in markets:
                    side_a = m.get("side_a", {})
                    token_id = side_a.get("id")
                    yes_price = token_prices.get(token_id) if token_id else None
                    
                    market_slug = m.get("market_slug", "")
                    source_url = f"https://polymarket.com/event/{event_slug}/{market_slug}"
                    
                    markets_list.append({
                        "id": market_slug,
                        "market_id": market_slug,
                        "source_market_id": m.get("condition_id", market_slug),
                        "title": m.get("title", ""),
                        "description": m.get("description", ""),
                        "yes_price": yes_price,
                        "no_price": (1 - yes_price) if yes_price is not None else None,
                        "volume_24h": 0,  # Not in this endpoint
                        "volume_total": m.get("volume_total", 0),
                        "volume_7d": m.get("volume_1_week", 0),
                        "volume_1_week": m.get("volume_1_week", 0),
                        "liquidity": 0,  # Not provided
                        "trade_count_24h": 0,
                        "unique_traders": 0,
                        "end_date": m.get("end_time"),
                        "image_url": m.get("image"),
                        "source_url": source_url,
                        "status": m.get("status", "open"),
                    })
                
                # Sort by volume
                markets_list.sort(key=lambda x: x.get("volume_total", 0) or 0, reverse=True)
                
                # Calculate totals
                total_volume = sum(m.get("volume_total", 0) or 0 for m in markets_list)
                
                # Build event title from slug
                event_title = " ".join(word.capitalize() for word in event_slug.replace("-", " ").split())
                
                result = {
                    "event": {
                        "event_id": event_slug,
                        "platform": "polymarket",
                        "title": event_title,
                        "event_title": event.get("title", event_title),
                        "event_description": event.get("subtitle", ""),
                        "category": (event.get("tags", []) or ["Other"])[0],
                        "market_count": len(markets_list),
                        "total_volume": total_volume,
                        "volume_24h": 0,  # Would need aggregation
                        "volume_1_week": 0,
                        "volume_7d": 0,
                        "status": event.get("status", "open"),
                        "start_time": event.get("start_time"),
                        "end_time": event.get("end_time"),
                        "image": event.get("image"),
                        "link": f"https://polymarket.com/event/{event_slug}",
                        "tags": event.get("tags", []),
                    },
                    "markets": markets_list,
                    "price_history": [],  # Would need separate API calls
                }
                
                elapsed = time.time() - start_time
                logger.info(f"✅ Event detail loaded in {elapsed:.1f}s: {len(markets_list)} markets with prices")
                
                # Cache for shorter time since this is live data
                self._cache[cache_key] = result
                self._cache_timestamps[cache_key] = time.time()
                
                return result
                
            except httpx.HTTPStatusError as e:
                logger.error(f"❌ Dome API error: {e.response.status_code} - {e.response.text}")
                return None
            except Exception as e:
                logger.error(f"❌ Error fetching event detail: {str(e)}")
                return None
    
    def _transform_to_frontend_event(self, event: Dict[str, Any]) -> Dict[str, Any]:
        """Transform Dome API event to frontend Event format"""
        
        event_slug = event.get("event_slug", "")
        market_title = event.get("title", "")  # This is actually the first market's question
        
        # Derive event title from slug (e.g., "democratic-presidential-nominee-2028" -> "Democratic Presidential Nominee 2028")
        # This gives a cleaner event name than using the first market's question
        event_title = " ".join(word.capitalize() for word in event_slug.replace("-", " ").split())
        
        # If slug is empty, fall back to market title
        if not event_title:
            event_title = market_title
        
        # Extract volume - Dome uses volume_fiat_amount for events
        total_volume = event.get("volume_fiat_amount", 0)
        try:
            total_volume = float(total_volume) if total_volume else 0
        except (ValueError, TypeError):
            total_volume = 0
        
        # Determine status
        status = event.get("status", "open")
        if status not in ["open", "closed", "resolved"]:
            status = "open"
        
        # Get tags/categories
        tags = event.get("tags", []) or []
        category = tags[0] if tags else "Other"
        
        # Build source URL
        source_url = f"https://polymarket.com/event/{event_slug}" if event_slug else ""
        
        # Market count from API
        market_count = event.get("market_count", 1)
        
        # Create top_market object (uses market question title)
        top_market = {
            "market_id": event_slug,
            "title": market_title,  # Keep original market question for top_market
            "yes_price": None,  # Events don't have direct yes/no prices
            "no_price": None,
            "volume": total_volume,
            "source_url": source_url,
        }
        
        return {
            "event_id": event_slug,
            "title": event_title,  # Use derived event title from slug
            "platform": "polymarket",
            "category": category,
            "image": event.get("image"),
            "link": source_url,
            "market_count": market_count,
            "total_volume": total_volume,
            "liquidity": 0,
            "volume_24h": 0,  # Not directly available in events endpoint
            "volume_1_week": 0,
            "start_time": event.get("start_time"),
            "end_time": event.get("end_time"),
            "status": status,
            "tags": tags,
            "markets": [],  # Would need separate API call to get market details
            "top_market": top_market,
            "top_markets": [{
                "market_id": event_slug,
                "title": market_title,  # Keep original market question
                "yes_price": None,
                "volume_total": total_volume,
                "image": event.get("image"),
            }],
        }


# Global singleton instance
_client: Optional[PolymarketDomeClient] = None

def get_client() -> PolymarketDomeClient:
    """Get or create the singleton client instance"""
    global _client
    if _client is None:
        _client = PolymarketDomeClient()
    return _client


def fetch_polymarket_events(full_fetch: bool = False) -> List[Dict[str, Any]]:
    """
    Fetch Polymarket EVENTS for the Events page.
    Uses the /v1/polymarket/events endpoint for proper events with market_count.
    Filters to only include events with volume >= $100 for consistency with Kalshi.
    
    This is the main function called by events_db.py
    
    Args:
        full_fetch: If True, bypass progressive loading and fetch ALL events directly.
                    Use this for cache warming where we need complete data.
    """
    client = get_client()
    
    if full_fetch:
        # Bypass progressive loading - fetch ALL events directly
        cache_key = f"polymarket_events_{FULL_LOAD}"
        # Check cache first
        cached = client._get_cached(cache_key)
        if cached is not None:
            logger.info(f"📦 Full fetch: cache hit with {len(cached)} events")
            events_raw = cached
        else:
            stale = client._get_stale_cached(cache_key)
            if stale is not None:
                logger.info(f"📦 Full fetch: stale cache hit with {len(stale)} events")
                events_raw = stale
            else:
                logger.info(f"🔄 Full fetch: fetching all {FULL_LOAD} events directly...")
                events_raw = client._fetch_events_internal(FULL_LOAD, cache_key)
    else:
        events_raw = client.fetch_all_events(max_events=FULL_LOAD)
    
    # Transform to frontend event format
    events = []
    for event in events_raw:
        try:
            transformed = client._transform_to_frontend_event(event)
            # Filter by minimum volume ($100) for consistency with Kalshi
            volume = transformed.get("total_volume") or 0
            if volume >= MIN_VOLUME:
                events.append(transformed)
        except Exception as e:
            logger.warning(f"⚠️ Error transforming event: {str(e)}")
            continue
    
    logger.info(f"📊 Returning {len(events)} Polymarket events (volume >= ${MIN_VOLUME})")
    return events


def fetch_polymarket_market_detail(market_id: str) -> Optional[Dict[str, Any]]:
    """
    Fetch detailed information for a specific Polymarket event.
    
    Args:
        market_id: The event slug to fetch
        
    Returns:
        Event detail dictionary or None
    """
    client = get_client()
    event = client.fetch_event_detail(market_id)
    
    if event:
        return client._transform_to_frontend_event(event)
    return None


async def fetch_polymarket_event_detail_live(event_slug: str, force_refresh: bool = False) -> Optional[Dict[str, Any]]:
    """
    Fetch Polymarket event with all markets and LIVE prices from Dome API.
    
    This is the preferred method for event detail pages - returns fresh data
    instead of stale DB data.
    
    Args:
        event_slug: The event slug (e.g., "democratic-presidential-nominee-2028")
        force_refresh: If True, bypass cache and fetch fresh data from API
        
    Returns:
        Dict with 'event' and 'markets' keys, or None if not found
    """
    client = get_client()
    return await client.fetch_event_detail_with_markets(event_slug, force_refresh)


def fetch_polymarket_categories() -> List[str]:
    """
    Get available categories from Polymarket events.
    Extracts unique categories from fetched events.
    """
    client = get_client()
    events = client.fetch_all_events(max_events=500)  # Sample for categories
    
    categories = set()
    for event in events:
        tags = event.get("tags", [])
        if tags:
            categories.update(tags)
    
    return sorted(list(categories))


def warm_cache():
    """
    Pre-warm the cache on server startup (sync version).
    Fetches full dataset immediately for instant page loads.
    """
    logger.info(f"🔥 Warming Polymarket events cache (fetching {FULL_LOAD} events)...")
    try:
        client = get_client()
        # Directly fetch full dataset and cache it
        full_cache_key = f"polymarket_events_{FULL_LOAD}"
        raw_events = client._fetch_events_internal(FULL_LOAD, full_cache_key)
        logger.info(f"✅ Cache warmed with {len(raw_events)} raw Polymarket events")
        
        # The events will be filtered when fetch_polymarket_events is called
        return len(raw_events)
    except Exception as e:
        logger.error(f"❌ Cache warming failed: {e}")
        return 0


async def warm_polymarket_cache() -> int:
    """
    Async wrapper for cache warming.
    Used by main.py startup for parallel warming.
    
    Returns:
        Number of events cached
    """
    import asyncio
    return await asyncio.get_event_loop().run_in_executor(None, warm_cache)
