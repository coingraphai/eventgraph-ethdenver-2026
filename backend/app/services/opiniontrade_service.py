"""
Opinion Trade API Service
Direct API fetch for Opinion Trade markets (no database required)

API Docs: https://docs.opinion.trade/developer-guide/opinion-open-api
Base URL: https://openapi.opinion.trade
Rate limit: 15 RPS
Auth: apikey header required
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

logger = logging.getLogger(__name__)

OPINIONTRADE_API_BASE = "https://openapi.opinion.trade"


class OpinionTradeAPIClient:
    """Async client for Opinion Trade API."""
    
    def __init__(self):
        self._client: Optional[httpx.AsyncClient] = None
        self._cache: Dict[str, Any] = {}
        self._cache_timestamp: float = 0
        self._cache_ttl: float = 60  # Cache for 60 seconds
        self._api_key = os.getenv("OPINIONTRADE_API_KEY", "")
        if self._api_key:
            logger.info("OpinionTrade API key configured")
        else:
            logger.warning("OpinionTrade API key not found - API access may be limited")
    
    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create HTTP client."""
        if self._client is None:
            headers = {
                "User-Agent": "EventGraph/1.0",
                "Accept": "application/json",
            }
            if self._api_key:
                headers["apikey"] = self._api_key
                logger.debug(f"Using OpinionTrade API key: {self._api_key[:8]}...")
            
            self._client = httpx.AsyncClient(
                base_url=OPINIONTRADE_API_BASE,
                timeout=httpx.Timeout(30.0),
                headers=headers
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
            logger.error(f"OpinionTrade API error: {e}")
            raise
    
    async def fetch_all_markets(self, use_cache: bool = True) -> List[Dict[str, Any]]:
        """
        Fetch all markets from Opinion Trade API.
        Handles pagination automatically.
        """
        # Check cache
        cache_key = "all_markets"
        if use_cache and cache_key in self._cache:
            if time.time() - self._cache_timestamp < self._cache_ttl:
                logger.debug("Returning cached OpinionTrade markets")
                return self._cache[cache_key]
        
        all_markets = []
        page = 1
        max_pages = 50  # Safety limit
        total_from_api = 0
        
        while page <= max_pages:
            try:
                response = await self._get("/openapi/market", params={
                    "page": page,
                    "limit": 20  # API max is 20
                })
                
                # Handle response structure: {errmsg, errno, result: {total, list}}
                if isinstance(response, dict):
                    result = response.get("result", {})
                    if isinstance(result, dict):
                        markets = result.get("list", [])
                        total_from_api = result.get("total", total_from_api)
                    else:
                        markets = response.get("data", response.get("markets", []))
                        total_from_api = len(markets) if total_from_api == 0 else total_from_api
                elif isinstance(response, list):
                    markets = response
                    total_from_api = len(markets) if total_from_api == 0 else total_from_api
                else:
                    markets = []
                
                if not markets:
                    break
                
                all_markets.extend(markets)
                
                logger.debug(f"Fetched OpinionTrade page {page}, got {len(markets)} markets, total so far: {len(all_markets)}/{total_from_api}")
                
                # Stop if we've fetched all markets
                if total_from_api > 0 and len(all_markets) >= total_from_api:
                    break
                
                # If we got less than 20, we've reached the end
                if len(markets) < 20:
                    break
                
                page += 1
                
            except Exception as e:
                logger.error(f"Error fetching OpinionTrade page {page}: {e}")
                break
        
        # Update cache
        self._cache[cache_key] = all_markets
        self._cache["total_count"] = total_from_api or len(all_markets)
        self._cache_timestamp = time.time()
        
        logger.info(f"Fetched {len(all_markets)} total OpinionTrade markets (API reports: {total_from_api})")
        return all_markets
    
    async def get_total_market_count(self) -> int:
        """Get total market count from API or cache."""
        if "total_count" in self._cache and time.time() - self._cache_timestamp < self._cache_ttl:
            return self._cache["total_count"]
        
        # Fetch first page to get total
        try:
            response = await self._get("/openapi/market", params={"page": 1, "limit": 1})
            result = response.get("result", {})
            total = result.get("total", 0) if isinstance(result, dict) else 0
            self._cache["total_count"] = total
            self._cache_timestamp = time.time()
            return total
        except Exception as e:
            logger.error(f"Error fetching OpinionTrade total count: {e}")
            return 0
    
    async def fetch_market_detail(self, market_id: str) -> Optional[Dict[str, Any]]:
        """Fetch detailed market data by market ID."""
        try:
            response = await self._get(f"/openapi/market/{market_id}")
            
            if isinstance(response, dict):
                result = response.get("result", response)
                if result:
                    return result
            
            return None
        except Exception as e:
            logger.error(f"Error fetching OpinionTrade market {market_id}: {e}")
            return None
    
    def _extract_category(self, raw: Dict[str, Any]) -> str:
        """Extract category from raw data using keyword matching."""
        # Check for explicit category field first
        if raw.get("category") or raw.get("categoryName"):
            return (raw.get("category") or raw.get("categoryName")).lower()
        
        # Get title for keyword matching
        title = (raw.get("marketTitle") or raw.get("title") or "").lower()
        
        # Crypto keywords
        crypto_keywords = [
            "bitcoin", "btc", "ethereum", "eth", "crypto", "solana", "sol", 
            "bnb", "xrp", "ripple", "dogecoin", "doge", "cardano", "ada",
            "polygon", "matic", "avalanche", "avax", "chainlink", "link",
            "uniswap", "aave", "defi", "nft", "token", "coin", "blockchain",
            "binance", "coinbase", "kraken", "metamask", "wallet", "satoshi",
            "usdt", "usdc", "stablecoin", "depeg", "monad", "megaeth", "base",
            "hyperliquid", "farcaster", "onchain", "web3", "dao", "l2", "layer",
            "etf approved", "etf by", "all time high", "ath"
        ]
        
        # Politics keywords  
        politics_keywords = [
            "trump", "biden", "president", "congress", "senate", "election",
            "vote", "republican", "democrat", "government", "white house",
            "supreme court", "impeach", "tariff", "sanction", "policy",
            "xi", "putin", "zelensky", "ukraine", "russia", "china", "iran",
            "israel", "hamas", "ceasefire", "war", "military", "nato",
            "recession", "gdp", "fed", "interest rate", "inflation"
        ]
        
        # Sports keywords
        sports_keywords = [
            "nfl", "nba", "mlb", "nhl", "fifa", "world cup", "super bowl",
            "championship", "playoffs", "draft", "trade", "player", "team",
            "game", "match", "score", "win", "lose", "mvp", "coach",
            "olympics", "tennis", "golf", "soccer", "football", "basketball"
        ]
        
        # Entertainment keywords
        entertainment_keywords = [
            "movie", "film", "oscar", "grammy", "emmy", "album", "song",
            "artist", "singer", "actor", "netflix", "disney", "spotify",
            "tiktok", "youtube", "instagram", "twitter", "social media",
            "celebrity", "blackpink", "taylor swift", "concert", "tour"
        ]
        
        # Science/Tech keywords
        science_keywords = [
            "ai", "artificial intelligence", "openai", "chatgpt", "deepseek",
            "spacex", "nasa", "mars", "moon", "rocket", "satellite",
            "apple", "google", "microsoft", "amazon", "tesla", "meta",
            "iphone", "android", "software", "hardware", "chip", "nvidia",
            "earthquake", "climate", "weather", "hurricane", "volcano"
        ]
        
        # Check keywords in order of specificity
        for keyword in crypto_keywords:
            if keyword in title:
                return "crypto"
        
        for keyword in sports_keywords:
            if keyword in title:
                return "sports"
        
        for keyword in entertainment_keywords:
            if keyword in title:
                return "entertainment"
        
        for keyword in science_keywords:
            if keyword in title:
                return "science"
        
        for keyword in politics_keywords:
            if keyword in title:
                return "politics"
        
        return "other"
    
    def _parse_status(self, raw: Dict[str, Any]) -> str:
        """Parse market status from raw data."""
        status = raw.get("status", "")
        status_enum = raw.get("statusEnum", "")
        closed = raw.get("closed", False)
        resolved_at = raw.get("resolvedAt", 0)
        
        if closed or resolved_at > 0:
            return "resolved"
        
        # Map statusEnum values (from API: Activated, Pending, Resolved, etc.)
        enum_map = {
            "ACTIVATED": "open",
            "ACTIVE": "open",
            "OPEN": "open",
            "PENDING": "pending",
            "CLOSED": "resolved",
            "RESOLVED": "resolved",
            "SETTLED": "resolved",
        }
        
        if isinstance(status_enum, str) and status_enum:
            return enum_map.get(status_enum.upper(), "open")
        
        # Map numeric status values
        if isinstance(status, int):
            # 0 = pending, 1 = open, 2 = activated, 3+ = resolved
            if status >= 3:
                return "resolved"
            elif status == 0:
                return "pending"
            else:
                return "open"
        
        if isinstance(status, str):
            return enum_map.get(status.upper(), "open")
        
        return "open"
    
    def _parse_volume(self, raw: Dict[str, Any]) -> float:
        """Parse volume from raw data."""
        # Try various volume fields
        volume = (
            raw.get("volume") or 
            raw.get("totalVolume") or 
            raw.get("tradeVolume") or 
            raw.get("volumeNum") or
            0
        )
        
        if isinstance(volume, str):
            try:
                volume = float(volume.replace(",", "").replace("$", ""))
            except:
                volume = 0
        
        return float(volume or 0)
    
    def _parse_price(self, raw: Dict[str, Any]) -> tuple[Optional[float], Optional[float]]:
        """Parse yes/no prices from raw data. Returns (None, None) if no price available."""
        # Try to get yes price — NEVER default to 0.5 (creates phantom arbitrage)
        yes_price = (
            raw.get("yesPrice") or 
            raw.get("yes_price") or 
            raw.get("probability") or 
            raw.get("prob") or
            raw.get("lastPrice")
        )
        
        if yes_price is None:
            return None, None
        
        if isinstance(yes_price, str):
            try:
                yes_price = float(yes_price)
            except:
                return None, None
        
        yes_price = float(yes_price)
        
        # Normalize to 0-1 range if needed
        if yes_price > 1:
            yes_price = yes_price / 100
        
        yes_price = max(0, min(1, yes_price))
        no_price = 1 - yes_price
        
        return yes_price, no_price
    
    def _generate_slug(self, title: str, market_id: str) -> str:
        """Generate a URL-friendly slug from title."""
        # Clean title
        slug = title.lower()
        slug = re.sub(r'[^\w\s-]', '', slug)
        slug = re.sub(r'[-\s]+', '-', slug)
        slug = slug.strip('-')[:50]
        
        # Add market ID for uniqueness
        return f"{slug}-{market_id}"
    
    def transform_to_event(self, market: Dict[str, Any]) -> Dict[str, Any]:
        """Transform raw Opinion Trade market to event format."""
        market_id = str(market.get("marketId") or market.get("id") or market.get("market_id") or "")
        title = market.get("marketTitle") or market.get("title") or market.get("question") or market.get("name") or ""
        
        # Clean emoji from title for display
        clean_title = re.sub(r'[^\x00-\x7F]+', '', title).strip()
        if not clean_title:
            clean_title = title
        
        yes_price, no_price = self._parse_price(market)
        volume = self._parse_volume(market)
        
        # Parse timestamps - use cutoffAt for end time
        end_time = market.get("cutoffAt") or market.get("endDate") or market.get("expirationDate") or market.get("closesAt")
        if end_time:
            if isinstance(end_time, str):
                try:
                    end_time = int(datetime.fromisoformat(end_time.replace("Z", "+00:00")).timestamp())
                except:
                    end_time = None
            elif isinstance(end_time, (int, float)):
                # Check if milliseconds
                if end_time > 10000000000:
                    end_time = int(end_time / 1000)
                else:
                    end_time = int(end_time)
        
        start_time = market.get("createdAt") or market.get("startDate")
        if start_time:
            if isinstance(start_time, str):
                try:
                    start_time = int(datetime.fromisoformat(start_time.replace("Z", "+00:00")).timestamp())
                except:
                    start_time = None
            elif isinstance(start_time, (int, float)):
                if start_time > 10000000000:
                    start_time = int(start_time / 1000)
                else:
                    start_time = int(start_time)
        
        # Get image - use thumbnailUrl from API
        image_url = (
            market.get("thumbnailUrl") or
            market.get("coverUrl") or
            market.get("image") or 
            market.get("imageUrl") or 
            market.get("iconUrl") or 
            market.get("icon") or
            "https://opinion.trade/favicon.ico"
        )
        
        # Generate slug
        slug = self._generate_slug(clean_title, market_id)
        
        # Get description - use rules field from API
        description = market.get("rules") or market.get("description") or market.get("resolutionSource") or ""
        
        # Get liquidity
        liquidity = market.get("liquidity") or market.get("liquidityNum") or 0
        if isinstance(liquidity, str):
            try:
                liquidity = float(liquidity.replace(",", "").replace("$", ""))
            except:
                liquidity = 0
        
        return {
            "event_id": slug,
            "platform": "opiniontrade",
            "title": clean_title,
            "event_title": title,
            "event_description": description,
            "category": self._extract_category(market),
            "market_count": 1,
            "total_volume": volume,
            "volume_24h": market.get("volume24h", 0) or 0,
            "volume_1_week": market.get("volume7d", 0) or 0,
            "yes_price": yes_price,
            "no_price": no_price,
            "status": self._parse_status(market),
            "start_time": start_time,
            "end_time": end_time,
            "image": image_url,
            "link": f"https://app.opinion.trade/detail?topicId={market_id}",
            "tags": market.get("tags", []) or [],
            "liquidity": float(liquidity or 0),
            # Include raw market for detail view
            "markets": [{
                "market_id": market_id,
                "source_market_id": market_id,
                "title": clean_title,
                "description": description,
                "yes_price": yes_price,
                "no_price": no_price,
                "volume_total": volume,
                "volume_24h": market.get("volume24h", 0) or 0,
                "volume_1_week": market.get("volume7d", 0) or 0,
                "liquidity": float(liquidity or 0),
                "status": self._parse_status(market),
                "source_url": f"https://app.opinion.trade/detail?topicId={market_id}",
                "image_url": image_url,
                "outcomes": ["Yes", "No"],
            }],
        }


# Singleton client instance
_client: Optional[OpinionTradeAPIClient] = None


def get_opiniontrade_client() -> OpinionTradeAPIClient:
    """Get or create OpinionTrade API client."""
    global _client
    if _client is None:
        _client = OpinionTradeAPIClient()
    return _client


async def fetch_opiniontrade_events(
    category: str = "all",
    search: str = "",
    status: str = "all",
    limit: int = 50,
    offset: int = 0,
) -> Dict[str, Any]:
    """
    Fetch OpinionTrade events with filtering.
    
    Returns:
        Dict with events list and metadata
    """
    client = get_opiniontrade_client()
    
    try:
        # Fetch all markets
        raw_markets = await client.fetch_all_markets()
        
        # Get total count from API
        total_from_api = await client.get_total_market_count()
        
        # Transform to events
        events = [client.transform_to_event(m) for m in raw_markets]
        
        # Filter by status
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
        
        # Use API total if no filters applied, otherwise use filtered count
        total = total_from_api if (category == "all" and not search and status in ["all", "open"]) else len(events)
        
        # Apply pagination
        paginated_events = events[offset:offset + limit]
        
        # Calculate aggregate metrics (from all filtered events, not just paginated)
        total_volume = sum(e.get("total_volume", 0) or 0 for e in events)
        total_liquidity = sum(e.get("liquidity", 0) or 0 for e in events)
        
        return {
            "events": paginated_events,
            "total": total,
            "total_count": total,  # Alias for intelligence dashboard
            "aggregate_metrics": {
                "total_events": total,
                "total_markets": total,  # 1:1 for OpinionTrade
                "total_volume": total_volume,
                "total_liquidity": total_liquidity,
            }
        }
    except Exception as e:
        logger.error(f"Error fetching OpinionTrade events: {e}")
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


async def fetch_opiniontrade_market_detail(market_slug: str) -> Optional[Dict[str, Any]]:
    """
    Fetch detailed OpinionTrade market by slug.
    
    Args:
        market_slug: The market slug (format: title-slug-marketid)
    
    Returns:
        Event dict with market details, or None if not found
    """
    client = get_opiniontrade_client()
    
    try:
        # Extract market ID from slug (last part after final hyphen)
        parts = market_slug.rsplit("-", 1)
        if len(parts) == 2:
            market_id = parts[1]
        else:
            market_id = market_slug
        
        # First try to find in cached markets
        all_markets = await client.fetch_all_markets(use_cache=True)
        
        for market in all_markets:
            mid = str(market.get("id") or market.get("marketId") or market.get("market_id") or "")
            if mid == market_id:
                event = client.transform_to_event(market)
                return event
        
        # If not in cache, try direct fetch
        market = await client.fetch_market_detail(market_id)
        if market:
            event = client.transform_to_event(market)
            return event
        
        return None
        
    except Exception as e:
        logger.error(f"Error fetching OpinionTrade market detail: {e}")
        return None


async def fetch_opiniontrade_categories() -> Dict[str, Any]:
    """
    Get categories with counts from OpinionTrade markets.
    
    Returns:
        Dict with categories list and total count
    """
    client = get_opiniontrade_client()
    
    try:
        # Fetch all markets
        raw_markets = await client.fetch_all_markets()
        
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
        logger.error(f"Error fetching OpinionTrade categories: {e}")
        return {
            "categories": [],
            "total_categories": 0
        }
