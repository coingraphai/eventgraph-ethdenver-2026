"""
Limitless Exchange API Service
Direct API fetch for Limitless markets (no database required)
"""
import httpx
import asyncio
import logging
import re
from typing import Dict, List, Any, Optional
from datetime import datetime
from functools import lru_cache
import time

logger = logging.getLogger(__name__)

LIMITLESS_API_BASE = "https://api.limitless.exchange"


class LimitlessAPIClient:
    """Async client for Limitless Exchange API."""
    
    def __init__(self):
        self._client: Optional[httpx.AsyncClient] = None
        self._cache: Dict[str, Any] = {}
        self._cache_timestamp: float = 0
        self._cache_ttl: float = 60  # Cache for 60 seconds
    
    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create HTTP client."""
        if self._client is None:
            self._client = httpx.AsyncClient(
                base_url=LIMITLESS_API_BASE,
                timeout=httpx.Timeout(30.0),
                headers={
                    "User-Agent": "EventGraph/1.0",
                    "Accept": "application/json",
                }
            )
        return self._client
    
    async def close(self):
        """Close the HTTP client."""
        if self._client:
            await self._client.aclose()
            self._client = None
    
    async def _get(self, path: str, params: Optional[Dict] = None) -> Any:
        """Make GET request."""
        client = await self._get_client()
        try:
            response = await client.get(path, params=params)
            response.raise_for_status()
            return response.json()
        except httpx.HTTPError as e:
            logger.error(f"Limitless API error: {e}")
            raise
    
    async def fetch_all_markets(self, use_cache: bool = True) -> List[Dict[str, Any]]:
        """
        Fetch all active markets from Limitless API.
        Handles pagination automatically.
        """
        # Check cache
        cache_key = "all_markets"
        if use_cache and cache_key in self._cache:
            if time.time() - self._cache_timestamp < self._cache_ttl:
                logger.debug("Returning cached Limitless markets")
                return self._cache[cache_key]
        
        all_markets = []
        page = 1
        max_pages = 50  # Increased safety limit to fetch all
        total_from_api = 0
        
        while page <= max_pages:
            try:
                response = await self._get("/markets/active", params={
                    "page": page,
                    "limit": 25
                })
                
                markets = response.get("data", [])
                total_from_api = response.get("totalMarketsCount", total_from_api)
                
                if not markets:
                    break
                
                all_markets.extend(markets)
                
                logger.debug(f"Limitless: Fetched page {page}, got {len(markets)} markets, total so far: {len(all_markets)}/{total_from_api}")
                
                # Stop if we've fetched all markets
                if total_from_api > 0 and len(all_markets) >= total_from_api:
                    break
                
                # Also stop if we got fewer than expected (end of data)
                if len(markets) < 25:
                    break
                
                page += 1
                
            except Exception as e:
                logger.error(f"Error fetching Limitless markets page {page}: {e}")
                break
        
        # Update cache
        self._cache[cache_key] = all_markets
        self._cache_timestamp = time.time()
        # Store total count from API
        self._cache["total_count"] = total_from_api or len(all_markets)
        
        logger.info(f"Limitless: Fetched {len(all_markets)} total markets (API reports: {total_from_api})")
        return all_markets
    
    async def get_total_market_count(self) -> int:
        """Get total market count from API or cache."""
        if "total_count" in self._cache and time.time() - self._cache_timestamp < self._cache_ttl:
            return self._cache["total_count"]
        
        # Fetch first page to get total
        try:
            response = await self._get("/markets/active", params={"page": 1, "limit": 1})
            total = response.get("totalMarketsCount", 0)
            self._cache["total_count"] = total
            self._cache_timestamp = time.time()
            return total
        except Exception as e:
            logger.error(f"Error fetching Limitless total count: {e}")
            return 0
    
    async def fetch_market_detail(self, slug: str) -> Optional[Dict[str, Any]]:
        """
        Fetch detailed market info by slug.
        First tries to get from cached active markets (which have prices),
        then falls back to detail endpoint and merges data.
        """
        try:
            # First, try to find in cached active markets (which have prices)
            all_markets = await self.fetch_all_markets(use_cache=True)
            cached_market = None
            for m in all_markets:
                if m.get("slug") == slug:
                    cached_market = m
                    break
            
            # Fetch detail endpoint for full description, etc.
            detail = await self._get(f"/markets/{slug}")
            
            if detail and cached_market:
                # Merge prices from cached market into detail
                detail["prices"] = cached_market.get("prices", [])
                detail["outcomesPrices"] = cached_market.get("outcomesPrices")
            elif cached_market and not detail:
                # Use cached market if detail fails
                detail = cached_market
            
            return detail
        except Exception as e:
            logger.error(f"Error fetching Limitless market {slug}: {e}")
            return None
    
    def _strip_emojis(self, text: str) -> str:
        """Remove emojis and special unicode symbols from text."""
        if not text:
            return text
        # Pattern to match emojis and special symbols
        emoji_pattern = re.compile(
            "["
            "\U0001F600-\U0001F64F"  # emoticons
            "\U0001F300-\U0001F5FF"  # symbols & pictographs
            "\U0001F680-\U0001F6FF"  # transport & map symbols
            "\U0001F1E0-\U0001F1FF"  # flags
            "\U00002702-\U000027B0"  # dingbats
            "\U0001F900-\U0001F9FF"  # supplemental symbols
            "\U0001FA00-\U0001FA6F"  # chess symbols
            "\U0001FA70-\U0001FAFF"  # symbols extended-A
            "\U00002600-\U000026FF"  # misc symbols
            "\U0001F004-\U0001F0CF"  # playing cards
            "]+",
            flags=re.UNICODE
        )
        return emoji_pattern.sub("", text).strip()

    def transform_to_event(self, market: Dict[str, Any]) -> Dict[str, Any]:
        """
        Transform a Limitless market to event format matching Polymarket/Kalshi.
        Each Limitless market is treated as a single-market event.
        """
        # Extract fields from Limitless API response
        slug = market.get("slug", market.get("address", ""))
        title = self._strip_emojis(market.get("title", market.get("question", "Unknown")))
        description = market.get("description", "")
        
        # Category - Limitless uses 'categories' array (not 'tags')
        categories = market.get("categories", [])
        tags = market.get("tags", [])
        # Use first category if available, otherwise first tag, otherwise "other"
        raw_category = categories[0] if categories else (tags[0] if tags else "other")
        category = self._normalize_category(raw_category)
        
        # Prices - Limitless uses 'prices' array [yes, no] (not outcomesPrices)
        # Note: Some markets return 0-1 decimals, others return 0-100 percentages
        prices = market.get("prices", market.get("outcomesPrices", []))
        yes_price = float(prices[0]) if len(prices) > 0 and prices[0] is not None else None
        no_price = float(prices[1]) if len(prices) > 1 and prices[1] is not None else None
        
        # Normalize prices to 0-1 range (some markets return percentages 0-100)
        if yes_price is not None and yes_price > 1:
            yes_price = yes_price / 100
        if no_price is not None and no_price > 1:
            no_price = no_price / 100
        
        # Volume - stored in volumeFormatted or liquidity
        volume_str = market.get("volumeFormatted", "0")
        try:
            # Handle formatted strings like "$1.2K" or "$5.4M"
            volume = self._parse_formatted_volume(volume_str)
        except:
            volume = 0
        
        # Liquidity
        liquidity_str = market.get("liquidityFormatted", "0")
        try:
            liquidity = self._parse_formatted_volume(liquidity_str)
        except:
            liquidity = 0
        
        # Status - Limitless uses FUNDED for active markets
        status_raw = market.get("status", "").upper()
        expired = market.get("expired", False)
        # FUNDED = active/open, RESOLVED/SETTLED = closed
        status = "open" if status_raw in ["FUNDED", "ACTIVE", "OPEN"] and not expired else "closed"
        
        # Timestamps
        created_at = market.get("createdAt")
        deadline = market.get("deadline") or market.get("expirationTimestamp")
        
        # Image - try market image, then creator logo, then Limitless default
        image_url = (
            market.get("ogImageURI") or 
            market.get("imageURI") or 
            market.get("logo") or
            (market.get("creator", {}) or {}).get("imageURI") or
            "https://limitless.exchange/assets/images/logo.svg"
        )
        
        # Source URL
        source_url = f"https://limitless.exchange/markets/{slug}"
        
        return {
            "event_id": slug,
            "platform": "limitless",
            "title": title,
            "event_title": title,
            "event_description": description,
            "category": self._normalize_category(category),
            "market_count": 1,  # Each Limitless market is a single-market event
            # Price at root level for easy arbitrage access
            "yes_price": yes_price,
            "no_price": no_price,
            "top_market": {
                "market_id": slug,
                "title": title,
                "yes_price": yes_price,
                "no_price": no_price,
                "volume": volume,
                "source_url": source_url,
            },
            "total_volume": volume,
            "volume_24h": 0,  # Not available in API
            "volume_1_week": 0,  # Not available in API
            "volume_7d": 0,
            "liquidity": liquidity,
            "status": status,
            "start_time": self._parse_timestamp(created_at),
            "end_time": self._parse_timestamp(deadline),
            "image": image_url,
            "link": source_url,
            "tags": tags,
            "snapshot_at": datetime.utcnow().isoformat(),
        }
    
    def _parse_formatted_volume(self, volume_str: str) -> float:
        """Parse formatted volume strings like '$1.2K' or '$5.4M'."""
        if not volume_str or volume_str == "N/A":
            return 0
        
        # Remove $ and spaces
        clean = volume_str.replace("$", "").replace(",", "").strip()
        
        multipliers = {"K": 1_000, "M": 1_000_000, "B": 1_000_000_000}
        
        for suffix, mult in multipliers.items():
            if clean.upper().endswith(suffix):
                return float(clean[:-1]) * mult
        
        try:
            return float(clean)
        except:
            return 0
    
    def _parse_timestamp(self, ts: Any) -> Optional[int]:
        """Parse timestamp to unix seconds."""
        if not ts:
            return None
        if isinstance(ts, (int, float)):
            # Already a timestamp, check if milliseconds
            if ts > 1e12:
                return int(ts / 1000)
            return int(ts)
        if isinstance(ts, str):
            try:
                dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                return int(dt.timestamp())
            except:
                return None
        return None
    
    def _normalize_category(self, category: str) -> str:
        """Normalize category - preserve Limitless categories as-is, just clean them up."""
        if not category:
            return "other"
        
        category_clean = category.strip()
        
        # Keep Limitless categories as-is (these are their actual categories)
        limitless_categories = {
            "hourly", "daily", "weekly", 
            "football matches", "off the pitch", "sports", "esports",
            "culture", "this vs that", "crypto", "politics", "economy",
            "company news", "pre-tge", "korean market", "中文预测专区", "other"
        }
        
        if category_clean.lower() in limitless_categories:
            return category_clean.lower()
        
        # Map some variations
        category_lower = category_clean.lower()
        category_map = {
            # Sports variations
            "football": "sports",
            "basketball": "sports", 
            "soccer": "sports",
            "cricket": "sports",
            "tennis": "sports",
            "nfl": "sports",
            "nba": "sports",
            "hockey": "sports",
            "dota 2": "esports",
            "league of legends": "esports",
            # Politics
            "elections": "politics",
            "political": "politics",
            "global elections": "politics",
            # Economics
            "finance": "economy",
            "economics": "economy",
            "financial": "economy",
            # Entertainment -> Culture
            "entertainment": "culture",
            "pop culture": "culture",
            "movies": "culture",
            "music": "culture",
            # Tech
            "technology": "crypto",
            "ai": "crypto",
            "ai technology": "crypto",
        }
        
        for key, value in category_map.items():
            if key in category_lower:
                return value
        
        return "other"
        
        for key, value in category_map.items():
            if key in category_lower:
                return value
        
        return "other"


# Singleton instance
_limitless_client: Optional[LimitlessAPIClient] = None


def get_limitless_client() -> LimitlessAPIClient:
    """Get singleton Limitless client instance."""
    global _limitless_client
    if _limitless_client is None:
        _limitless_client = LimitlessAPIClient()
    return _limitless_client


async def fetch_limitless_events(
    category: str = "all",
    search: Optional[str] = None,
    status: str = "all",
    limit: int = 100,
    offset: int = 0,
) -> Dict[str, Any]:
    """
    Fetch Limitless events with filtering.
    Returns data in same format as the DB events endpoint.
    """
    client = get_limitless_client()
    
    # Fetch all markets
    markets = await client.fetch_all_markets()
    
    # Get total count from API (before filtering)
    total_from_api = await client.get_total_market_count()
    
    # Transform to events
    events = [client.transform_to_event(m) for m in markets]
    
    # Apply filters
    if category and category != "all":
        events = [e for e in events if e["category"] == category]
    
    if search:
        search_lower = search.lower()
        events = [e for e in events if search_lower in e["title"].lower()]
    
    if status and status != "all":
        events = [e for e in events if e["status"] == status]
    
    # Sort by volume
    events.sort(key=lambda e: e.get("total_volume", 0) or 0, reverse=True)
    
    # Use API total if no filters applied, otherwise use filtered count
    total = total_from_api if (category == "all" and not search and status in ["all", "open"]) else len(events)
    
    # Apply pagination
    paginated_events = events[offset:offset + limit]
    
    # Calculate aggregate metrics
    total_volume = sum(e.get("total_volume", 0) or 0 for e in events)
    total_liquidity = sum(e.get("liquidity", 0) or 0 for e in events)
    
    return {
        "events": paginated_events,
        "total": total,
        "total_count": total,  # Alias for intelligence dashboard
        "platform_counts": {
            "limitless": total,
        },
        "aggregate_metrics": {
            "total_events": total,
            "total_markets": total,  # 1 market per event for Limitless
            "total_volume": total_volume,
            "total_liquidity": total_liquidity,
            "volume_24h": 0,
            "volume_1_week": 0,
        }
    }


async def fetch_limitless_market_detail(slug: str) -> Optional[Dict[str, Any]]:
    """Fetch detailed market data for a specific Limitless market."""
    client = get_limitless_client()
    market = await client.fetch_market_detail(slug)
    
    if not market:
        return None
    
    # Transform to detailed format
    event = client.transform_to_event(market)
    
    # Extract additional fields from raw market data
    creator = market.get("creator", {}) or {}
    creator_name = creator.get("name", "Unknown")
    creator_image = creator.get("imageURI", "")
    market_type = market.get("marketType", "single")
    trade_type = market.get("tradeType", "amm")
    expiration_date = market.get("expirationDate", "")
    open_interest_str = market.get("openInterestFormatted", "0")
    try:
        open_interest = float(open_interest_str) if open_interest_str else 0
    except:
        open_interest = 0
    
    # Add additional detail fields
    event["markets"] = [{
        "market_id": slug,
        "title": event["title"],
        "description": event.get("event_description", ""),
        "yes_price": event["top_market"]["yes_price"],
        "no_price": event["top_market"]["no_price"],
        "volume": event["total_volume"],
        "volume_total": event["total_volume"],  # Alias for frontend compatibility
        "volume_24h": event.get("volume_24h", 0),
        "volume_1_week": event.get("liquidity", 0),  # Use liquidity as 7D vol proxy for display
        "liquidity": event.get("liquidity", 0),
        "open_interest": open_interest,
        "status": event["status"],
        "source_url": event["link"],
        "image_url": event.get("image"),  # For market avatar
        "creator_name": creator_name,
        "creator_image": creator_image,
        "market_type": market_type,
        "trade_type": trade_type,
        "expiration_date": expiration_date,
        "outcomes": market.get("outcomes", ["Yes", "No"]),
        "outcomes_prices": market.get("outcomesPrices", []),
    }]
    
    return event


async def fetch_limitless_categories() -> Dict[str, Any]:
    """
    Fetch categories with counts for Limitless markets.
    Returns in same format as DB categories endpoint.
    """
    client = get_limitless_client()
    markets = await client.fetch_all_markets()
    
    # Count categories
    from collections import Counter
    category_counts = Counter()
    
    for market in markets:
        event = client.transform_to_event(market)
        # Only count open markets
        if event.get("status") == "open":
            category_counts[event.get("category", "other")] += 1
    
    categories = [
        {
            "name": cat,
            "count": count,
            "label": cat.replace("-", " ").title() if cat else "Other"
        }
        for cat, count in category_counts.most_common()
    ]
    
    return {
        "categories": categories,
        "total_categories": len(categories)
    }
