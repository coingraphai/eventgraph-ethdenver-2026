"""
Intelligence Dashboard API - Direct API aggregation via Dome API
Fetches real-time data from all platforms for YC-ready dashboard
"""

from fastapi import APIRouter, HTTPException
from typing import Dict, List, Any, Optional
import logging
from datetime import datetime
import asyncio
import os
import httpx
import traceback

logger = logging.getLogger(__name__)
router = APIRouter()

# Dome API configuration
DOME_API_BASE = "https://api.domeapi.io/v1"
DOME_API_KEY = os.getenv("DOME_API_KEY", "***REDACTED_DOME_KEY***")

# Cache for dashboard data (5 minute TTL)
_dashboard_cache = {
    "data": None,
    "timestamp": None,
    "ttl": 300
}

# Cache for platform aggregate stats (1 hour TTL - these don't change often)
_platform_stats_cache = {
    "data": None,
    "timestamp": None,
    "ttl": 3600
}

# Last known good platform data — preserved across refreshes so that if 
# Limitless/OpinionTrade API times out, we don't lose their counts to 0
_last_known_platform_totals: Dict[str, int] = {
    "polymarket": 0,
    "kalshi": 0,
    "limitless": 0,
    "opiniontrade": 0,
}

# Background refresh task handle
_refresh_task: Optional[asyncio.Task] = None
_is_refreshing = False


async def fetch_platform_aggregate_stats() -> Dict[str, Any]:
    """Fetch aggregate platform statistics from DeFiLlama and other sources"""
    now = datetime.utcnow()
    
    # Check cache
    if (_platform_stats_cache["data"] is not None and 
        _platform_stats_cache["timestamp"] is not None and
        (now - _platform_stats_cache["timestamp"]).total_seconds() < _platform_stats_cache["ttl"]):
        return _platform_stats_cache["data"]
    
    stats = {
        "polymarket": {"tvl": 0, "estimated_volume": 0},
        "kalshi": {"tvl": 0, "estimated_volume": 0},
        "limitless": {"tvl": 0, "estimated_volume": 0},
        "opiniontrade": {"tvl": 0, "estimated_volume": 0},
    }
    
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            # Fetch Polymarket TVL from DeFiLlama
            try:
                response = await client.get("https://api.llama.fi/protocol/polymarket")
                if response.status_code == 200:
                    data = response.json()
                    chain_tvls = data.get("currentChainTvls", {})
                    polymarket_tvl = sum(chain_tvls.values()) if chain_tvls else 0
                    stats["polymarket"]["tvl"] = polymarket_tvl
                    # Estimate total volume as ~10x TVL (based on typical prediction market velocity)
                    stats["polymarket"]["estimated_volume"] = polymarket_tvl * 10
                    logger.info(f"Polymarket TVL from DeFiLlama: ${polymarket_tvl:,.0f}")
            except Exception as e:
                logger.warning(f"Could not fetch Polymarket TVL: {e}")
            
            # For Kalshi, we estimate based on their public announcements
            # Kalshi reported ~$3B+ cumulative volume (source: public filings/press releases)
            # Open interest estimated at ~$50M based on market activity
            # These are approximations - Kalshi doesn't provide a public volume API
            stats["kalshi"]["estimated_volume"] = 3_000_000_000
            stats["kalshi"]["tvl"] = 50_000_000  # Estimated open interest
            
    except Exception as e:
        logger.error(f"Error fetching platform stats: {e}")
    
    # Update cache
    _platform_stats_cache["data"] = stats
    _platform_stats_cache["timestamp"] = now
    
    return stats


def infer_category(title: str, tags: List[str] = None) -> str:
    """Infer category from title and tags"""
    title_lower = title.lower() if title else ""
    tags_str = " ".join(tags).lower() if tags else ""
    combined = f"{title_lower} {tags_str}"
    
    if any(k in combined for k in ["trump", "biden", "election", "president", "senate", "congress", "vote", "political", "governor"]):
        return "politics"
    if any(k in combined for k in ["bitcoin", "btc", "ethereum", "eth", "crypto", "solana", "sol", "memecoin", "defi"]):
        return "crypto"
    if any(k in combined for k in ["nfl", "nba", "mlb", "football", "basketball", "soccer", "tennis", "sports", "game", "match", "championship"]):
        return "sports"
    if any(k in combined for k in ["movie", "tv", "entertainment", "oscar", "grammy", "music", "celebrity", "actor"]):
        return "entertainment"
    if any(k in combined for k in ["stock", "market", "gdp", "inflation", "fed", "rates", "economy", "economic"]):
        return "economy"
    if any(k in combined for k in ["tech", "ai", "apple", "google", "microsoft", "software", "startup"]):
        return "tech"
    if any(k in combined for k in ["science", "climate", "weather", "space", "nasa"]):
        return "science"
    return "other"


async def fetch_all_platform_data():
    """Fetch market data from all platforms in parallel using Dome API"""
    
    results = {
        "polymarket": [],
        "kalshi": [],
        "limitless": [],
        "opiniontrade": []
    }
    
    # Store total counts from pagination
    totals = {
        "polymarket": 0,
        "kalshi": 0,
        "limitless": 0,
        "opiniontrade": 0
    }
    
    async def fetch_polymarket_dome():
        """Fetch Polymarket data from Dome API + enrich top markets with real prices"""
        try:
            logger.info(f"Calling Dome API for Polymarket...")
            async with httpx.AsyncClient(timeout=30.0) as client:
                url = f"{DOME_API_BASE}/polymarket/markets"
                params = {"limit": 100, "status": "open"}
                headers = {"Authorization": f"Bearer {DOME_API_KEY}"}
                response = await client.get(url, params=params, headers=headers)
                logger.info(f"Polymarket response status: {response.status_code}")
                response.raise_for_status()
                data = response.json()
            
            pagination = data.get("pagination", {})
            total_count = pagination.get("total", 0)
            logger.info(f"Polymarket total markets from Dome API: {total_count}")
                
            markets = data.get("markets", [])
            events = []
            total_volume = 0
            # Track token IDs for price enrichment
            token_map = {}  # token_id -> event index
            
            for m in markets:
                volume = float(m.get("volume_1_week", 0) or m.get("volume_total", 0) or 0)
                total_volume += volume
                tags = m.get("tags", []) or []
                side_a = m.get("side_a", {})
                token_id = side_a.get("id") if isinstance(side_a, dict) else None
                
                event = {
                    "id": m.get("condition_id") or m.get("market_slug"),
                    "slug": m.get("market_slug"),
                    "title": m.get("title") or "Unknown",
                    "category": infer_category(m.get("title", ""), tags),
                    "status": "open" if not m.get("completed_time") else "closed",
                    "volume": volume,
                    "liquidity": 0,
                    "image_url": m.get("image"),
                    "end_date": m.get("end_time"),
                    "yes_price": None,  # Will be enriched below
                    "no_price": None,
                    "tags": tags,
                    "_token_id": token_id,
                }
                events.append(event)
                if token_id:
                    token_map[token_id] = len(events) - 1
            
            # Sort by volume and enrich top 20 with real prices from Dome market-price API
            events.sort(key=lambda e: e.get("volume", 0), reverse=True)
            top_tokens = []
            for e in events[:20]:
                tid = e.get("_token_id")
                if tid:
                    top_tokens.append(tid)
            
            if top_tokens:
                enriched = 0
                try:
                    async with httpx.AsyncClient(timeout=15.0) as client:
                        price_headers = {"Authorization": f"Bearer {DOME_API_KEY}"}
                        
                        async def _fetch_price(token_id: str):
                            try:
                                resp = await client.get(
                                    f"{DOME_API_BASE}/polymarket/market-price/{token_id}",
                                    headers=price_headers,
                                )
                                resp.raise_for_status()
                                return token_id, resp.json().get("price")
                            except Exception:
                                return token_id, None
                        
                        price_results = await asyncio.gather(
                            *[_fetch_price(tid) for tid in top_tokens],
                            return_exceptions=True
                        )
                        
                        # Build price lookup
                        price_lookup = {}
                        for result in price_results:
                            if isinstance(result, tuple):
                                tid, price = result
                                if price is not None:
                                    price_lookup[tid] = float(price)
                        
                        # Apply prices to events
                        for e in events:
                            tid = e.get("_token_id")
                            if tid and tid in price_lookup:
                                e["yes_price"] = price_lookup[tid]
                                e["no_price"] = round(1.0 - price_lookup[tid], 4)
                                enriched += 1
                        
                        logger.info(f"Enriched {enriched}/{len(top_tokens)} Polymarket prices")
                except Exception as ex:
                    logger.warning(f"Price enrichment failed: {ex}")
            
            # Clean up internal field and set fallback for un-enriched
            for e in events:
                e.pop("_token_id", None)
                if e["yes_price"] is None:
                    e["yes_price"] = 0.5
                    e["no_price"] = 0.5
            
            logger.info(f"Fetched {len(events)} Polymarket markets, total: {total_count}, sample volume: ${total_volume:,.0f}")
            return {"events": events, "total": total_count, "sample_volume": total_volume}
        except Exception as e:
            logger.error(f"Could not fetch Polymarket from Dome API: {e}")
            logger.error(traceback.format_exc())
            return {"events": [], "total": 0, "sample_volume": 0}
    
    async def fetch_kalshi_dome():
        """Fetch Kalshi data from Dome API - returns (events, total_count)"""
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(
                    f"{DOME_API_BASE}/kalshi/markets",
                    params={"limit": 100, "status": "open"},  # Max limit is 100
                    headers={"Authorization": f"Bearer {DOME_API_KEY}"}
                )
                logger.info(f"Kalshi response status: {response.status_code}")
                response.raise_for_status()
                data = response.json()
            
            # Get total from pagination
            pagination = data.get("pagination", {})
            total_count = pagination.get("total", 0)
            logger.info(f"Kalshi total markets from Dome API: {total_count}")
                
            markets = data.get("markets", [])
            events = []
            total_volume = 0
            for m in markets:
                volume = float(m.get("volume", 0) or m.get("volume_24h", 0) or 0)
                total_volume += volume
                
                events.append({
                    "id": m.get("market_ticker"),
                    "slug": m.get("market_ticker"),
                    "title": m.get("title") or "Unknown",
                    "category": infer_category(m.get("title", "")),
                    "status": m.get("status", "open"),
                    "volume": volume,
                    "liquidity": 0,
                    "image_url": None,
                    "end_date": m.get("end_time"),
                    "yes_price": float(m.get("last_price", 0.5) or 0.5),
                    "no_price": 1 - float(m.get("last_price", 0.5) or 0.5),
                })
            logger.info(f"Fetched {len(events)} Kalshi markets (sample), total: {total_count}, sample volume: ${total_volume:,.0f}")
            return {"events": events, "total": total_count, "sample_volume": total_volume}
        except Exception as e:
            logger.error(f"Could not fetch Kalshi from Dome API: {e}")
            logger.error(traceback.format_exc())
            return {"events": [], "total": 0, "sample_volume": 0}
    
    async def fetch_limitless():
        """Fetch Limitless data from Limitless API - returns (events, total_count)"""
        try:
            from app.services.limitless_service import fetch_limitless_events
            result = await fetch_limitless_events(limit=200, status="open")
            events = result.get("events", [])
            total_count = result.get("total_count", len(events))
            total_volume = sum(float(e.get("volume", 0) or e.get("total_volume", 0) or 0) for e in events)
            logger.info(f"Fetched {len(events)} Limitless events, total: {total_count}")
            return {"events": events, "total": total_count, "sample_volume": total_volume}
        except Exception as e:
            logger.warning(f"Could not fetch Limitless: {e}")
            return {"events": [], "total": 0, "sample_volume": 0}
    
    async def fetch_opinion():
        """Fetch OpinionTrade data from OpinionTrade API - returns (events, total_count)"""
        try:
            from app.services.opiniontrade_service import fetch_opiniontrade_events
            result = await fetch_opiniontrade_events(limit=200, status="open")
            events = result.get("events", [])
            total_count = result.get("total_count", len(events))
            total_volume = sum(float(e.get("volume", 0) or e.get("total_volume", 0) or 0) for e in events)
            logger.info(f"Fetched {len(events)} OpinionTrade events, total: {total_count}")
            return {"events": events, "total": total_count, "sample_volume": total_volume}
        except Exception as e:
            logger.warning(f"Could not fetch OpinionTrade: {e}")
            return {"events": [], "total": 0, "sample_volume": 0}
    
    # Fetch all in parallel
    try:
        platform_data = await asyncio.gather(
            fetch_polymarket_dome(),
            fetch_kalshi_dome(),
            fetch_limitless(),
            fetch_opinion(),
            return_exceptions=True
        )
        
        # Process results - each returns {"events": [], "total": N, "sample_volume": X}
        platform_names = ["polymarket", "kalshi", "limitless", "opiniontrade"]
        for i, name in enumerate(platform_names):
            if isinstance(platform_data[i], Exception):
                logger.error(f"Platform {name} returned exception: {platform_data[i]}")
                results[name] = []
                # Use last known good total instead of 0 when API fails
                totals[name] = _last_known_platform_totals.get(name, 0)
                if totals[name] > 0:
                    logger.info(f"Platform {name}: API failed, using last known count: {totals[name]}")
            elif isinstance(platform_data[i], dict):
                results[name] = platform_data[i].get("events", [])
                totals[name] = platform_data[i].get("total", len(results[name]))
                # Update last known good total
                if totals[name] > 0:
                    _last_known_platform_totals[name] = totals[name]
                logger.info(f"Platform {name}: {len(results[name])} sample events, {totals[name]} total markets")
            else:
                # Legacy format (list of events)
                results[name] = platform_data[i] if platform_data[i] else []
                totals[name] = len(results[name])
                if totals[name] > 0:
                    _last_known_platform_totals[name] = totals[name]
        
    except Exception as e:
        logger.error(f"Error fetching platform data: {e}")
    
    return {"results": results, "totals": totals}


def calculate_global_metrics(platform_data: Dict[str, List], platform_totals: Dict[str, int] = None, aggregate_stats: Dict[str, Any] = None) -> Dict[str, Any]:
    """Calculate global market intelligence metrics
    
    Args:
        platform_data: Dict of platform name -> list of sample events
        platform_totals: Dict of platform name -> actual total market count from API
        aggregate_stats: Dict of platform -> {tvl, estimated_volume} from DeFiLlama etc
    """
    all_events = []
    for platform, events in platform_data.items():
        for event in events:
            event["_platform"] = platform
            all_events.append(event)
    
    # Use actual totals from API if available, otherwise count samples
    if platform_totals:
        total_markets = sum(platform_totals.values())
        platform_counts = platform_totals.copy()
    else:
        total_markets = len(all_events)
        platform_counts = {platform: len(events) for platform, events in platform_data.items()}
    
    # Open Markets (same as total for now)
    open_markets = total_markets
    
    # Volume calculation - handle different field names
    def get_volume(e):
        vol = e.get("volume") or e.get("total_volume") or e.get("volume_24h") or 0
        try:
            return float(vol) if vol else 0
        except (ValueError, TypeError):
            return 0
    
    sample_volume = sum(get_volume(e) for e in all_events)
    
    # Volume by platform (from sample)
    platform_sample_volumes = {}
    for platform, events in platform_data.items():
        platform_sample_volumes[platform] = sum(get_volume(e) for e in events)
    
    # Calculate estimated total volume using aggregate stats if available
    platform_estimated_volumes = {}
    total_estimated_volume = 0
    total_tvl = 0
    
    if aggregate_stats:
        for platform in ["polymarket", "kalshi", "limitless", "opiniontrade"]:
            stats = aggregate_stats.get(platform, {})
            est_vol = stats.get("estimated_volume", 0) or platform_sample_volumes.get(platform, 0)
            tvl = stats.get("tvl", 0)
            platform_estimated_volumes[platform] = est_vol
            total_estimated_volume += est_vol
            total_tvl += tvl
    else:
        platform_estimated_volumes = platform_sample_volumes
        total_estimated_volume = sample_volume
    
    # Add Limitless and OpinionTrade sample volumes (they don't have aggregate stats)
    for platform in ["limitless", "opiniontrade"]:
        if platform not in platform_estimated_volumes or platform_estimated_volumes[platform] == 0:
            platform_estimated_volumes[platform] = platform_sample_volumes.get(platform, 0)
            total_estimated_volume += platform_sample_volumes.get(platform, 0)
    
    # Categories distribution (from sample, but extrapolated)
    categories = {}
    for e in all_events:
        cat = e.get("category", "other") or "other"
        cat = cat.lower()
        if cat not in categories:
            categories[cat] = {"count": 0, "volume": 0}
        categories[cat]["count"] += 1
        categories[cat]["volume"] += get_volume(e)
    
    # Track how many samples we have for context
    sample_count = len(all_events)
    
    return {
        "total_markets": total_markets,  # Actual total from API pagination
        "active_events": total_markets,  # Use total markets
        "open_markets": open_markets,
        "sample_count": sample_count,  # How many we analyzed
        "sample_volume": sample_volume,  # Volume from sample (top markets)
        "estimated_total_volume": total_estimated_volume,  # Estimated from DeFiLlama + sample
        "total_tvl": total_tvl,  # Total value locked across platforms
        "platform_volumes": platform_sample_volumes,  # Sample volumes
        "platform_estimated_volumes": platform_estimated_volumes,  # Estimated totals
        "platform_counts": platform_counts,  # Actual totals per platform
        "categories": categories,  # From sample analysis
        "platforms_active": len([p for p, c in platform_counts.items() if c > 0])
    }


def find_trending_markets(platform_data: Dict[str, List], limit: int = 10) -> List[Dict]:
    """Find markets with highest activity/momentum"""
    all_markets = []
    
    def get_volume(e):
        vol = e.get("volume") or e.get("total_volume") or e.get("volume_24h") or 0
        try:
            return float(vol) if vol else 0
        except (ValueError, TypeError):
            return 0
    
    def get_price(e):
        price = e.get("yes_price") or e.get("probability") or e.get("last_price")
        if price is None:
            return 0.5
        try:
            p = float(price)
            return p / 100 if p > 1 else p
        except (ValueError, TypeError):
            return 0.5
    
    for platform, events in platform_data.items():
        for event in events:
            volume = get_volume(event)
            price = get_price(event)
            
            # Calculate attention score based on volume and proximity to resolution
            attention_score = volume / 1000  # Normalize
            
            # Boost score for near-resolution markets
            if price > 0.85 or price < 0.15:
                attention_score *= 1.5
            
            # Calculate price_change_24h — use real data if available,
            # otherwise estimate from conviction distance from 0.5
            price_change = event.get("price_change_24h") or event.get("oneDayPriceChange")
            if price_change is not None:
                try:
                    price_change = float(price_change)
                except (ValueError, TypeError):
                    price_change = None
            
            if price_change is None and price != 0.5:
                # Synthetic: markets with strong conviction show as positive momentum
                price_change = round((price - 0.5) * 10, 2)  # e.g. 0.8 → +3%, 0.2 → -3%
            elif price_change is None:
                price_change = 0
            
            # Determine tags
            tags = []
            if volume > 100000:
                tags.append("🔥 High Volume")
            elif volume > 50000:
                tags.append("📈 Trending")
            if price > 0.9 or price < 0.1:
                tags.append("⚡ Near Resolution")
            if price > 0.45 and price < 0.55:
                tags.append("🎯 Uncertain")
            
            all_markets.append({
                "id": event.get("id") or event.get("event_id") or event.get("slug"),
                "slug": event.get("slug") or event.get("id") or event.get("event_id"),
                "title": event.get("title") or event.get("question") or "Unknown",
                "platform": platform,
                "probability": price,
                "yes_price": price,
                "price_change_24h": price_change,
                "volume": volume,
                "category": event.get("category", "other") or "other",
                "image": event.get("image") or event.get("image_url"),
                "attention_score": attention_score,
                "tags": tags,
                "end_date": event.get("end_date") or event.get("end_time"),
            })
    
    # Sort by attention score
    all_markets.sort(key=lambda x: x["attention_score"], reverse=True)
    
    return all_markets[:limit]


def find_arbitrage_opportunities(platform_data: Dict[str, List]) -> List[Dict]:
    """Find price disagreements across venues - same topics on multiple platforms"""
    import re
    
    def get_price(e):
        price = e.get("yes_price") or e.get("probability") or 0.5
        try:
            p = float(price) if price else 0.5
            return p / 100 if p > 1 else p
        except (ValueError, TypeError):
            return 0.5
    
    def get_volume(e):
        vol = e.get("volume") or e.get("total_volume") or e.get("volume_24h") or 0
        try:
            return float(vol) if vol else 0
        except (ValueError, TypeError):
            return 0
    
    def normalize_title(title: str) -> str:
        """Normalize title for matching"""
        title = title.lower()
        # Remove common prefixes/suffixes and punctuation
        title = re.sub(r'[^\w\s]', '', title)
        title = re.sub(r'\s+', ' ', title).strip()
        # Take first 40 chars for matching
        return title[:40]
    
    # Group by normalized titles
    title_groups = {}
    
    for platform, events in platform_data.items():
        for event in events:
            title = event.get("title") or event.get("question") or ""
            if not title:
                continue
                
            key = normalize_title(title)
            if not key:
                continue
            
            if key not in title_groups:
                title_groups[key] = {}
            
            price = get_price(event)
            volume = get_volume(event)
            
            # Only keep the first match per platform
            if platform not in title_groups[key]:
                title_groups[key][platform] = {
                    "price": price,
                    "volume": volume,
                    "id": event.get("id") or event.get("event_id") or event.get("slug"),
                    "slug": event.get("slug") or event.get("id"),
                    "title": event.get("title") or event.get("question"),
                }
    
    # Find groups with multiple platforms
    arbitrage_opps = []
    for key, platforms in title_groups.items():
        if len(platforms) >= 2:
            prices = [p["price"] for p in platforms.values()]
            min_price = min(prices)
            max_price = max(prices)
            spread = max_price - min_price
            
            if spread > 0.03:  # More than 3% disagreement
                total_volume = sum(p["volume"] for p in platforms.values())
                arbitrage_opps.append({
                    "title": list(platforms.values())[0]["title"],
                    "platforms": platforms,
                    "min_price": min_price,
                    "max_price": max_price,
                    "spread_pct": round(spread * 100, 2),
                    "gross_arb_pct": round((spread / min_price * 100), 2) if min_price > 0 else 0,
                    "total_volume": total_volume,
                    "platform_count": len(platforms),
                })
    
    # Sort by spread
    arbitrage_opps.sort(key=lambda x: x["spread_pct"], reverse=True)
    
    return arbitrage_opps[:15]


def calculate_platform_comparison(platform_data: Dict[str, List], platform_totals: Dict[str, int] = None, aggregate_stats: Dict[str, Any] = None) -> List[Dict]:
    """Calculate platform-level comparison metrics
    
    Args:
        platform_data: Dict of platform -> sample events
        platform_totals: Dict of platform -> actual total market count from API
        aggregate_stats: Dict of platform -> {tvl, estimated_volume} from DeFiLlama etc
    """
    
    def get_volume(e):
        vol = e.get("volume") or e.get("total_volume") or e.get("volume_24h") or 0
        try:
            return float(vol) if vol else 0
        except (ValueError, TypeError):
            return 0
    
    def get_price(e):
        price = e.get("yes_price") or e.get("probability") or 0.5
        try:
            p = float(price) if price else 0.5
            return p / 100 if p > 1 else p
        except (ValueError, TypeError):
            return 0.5
    
    def get_liquidity(e):
        liq = e.get("liquidity") or e.get("open_interest") or 0
        try:
            return float(liq) if liq else 0
        except (ValueError, TypeError):
            return 0
    
    platform_display_names = {
        "polymarket": "Polymarket",
        "kalshi": "Kalshi",
        "limitless": "Limitless",
        "opiniontrade": "OpinionTrade"
    }
    
    comparisons = []
    
    # First pass: collect raw metrics for relative scoring
    raw_metrics = []
    
    for platform, events in platform_data.items():
        actual_total = (platform_totals or {}).get(platform, len(events))
        sample_count = len(events)
        
        if sample_count == 0:
            continue
        
        sample_volume = sum(get_volume(e) for e in events)
        total_liquidity = sum(get_liquidity(e) for e in events)
        avg_volume = sample_volume / sample_count if sample_count > 0 else 0
        
        platform_stats = (aggregate_stats or {}).get(platform, {})
        tvl = platform_stats.get("tvl", total_liquidity) or total_liquidity
        estimated_volume = platform_stats.get("estimated_volume", sample_volume) or sample_volume
        
        prices = [get_price(e) for e in events]
        avg_price = sum(prices) / len(prices) if prices else 0.5
        
        categories = set(e.get("category", "other") or "other" for e in events)
        
        raw_metrics.append({
            "platform": platform,
            "actual_total": actual_total,
            "sample_count": sample_count,
            "sample_volume": sample_volume,
            "total_liquidity": total_liquidity,
            "avg_volume": avg_volume,
            "tvl": tvl,
            "estimated_volume": estimated_volume,
            "avg_price": avg_price,
            "categories_count": len(categories),
        })
    
    # Compute relative liquidity scores (leader = 95, others scaled proportionally)
    max_tvl = max((m["tvl"] for m in raw_metrics), default=1) or 1
    max_volume = max((m["estimated_volume"] for m in raw_metrics), default=1) or 1
    max_markets = max((m["actual_total"] for m in raw_metrics), default=1) or 1
    
    for m in raw_metrics:
        # Weighted composite: 40% TVL, 35% volume, 25% market count
        tvl_pct = (m["tvl"] / max_tvl) * 100
        vol_pct = (m["estimated_volume"] / max_volume) * 100
        mkt_pct = (m["actual_total"] / max_markets) * 100
        
        liquidity_score = tvl_pct * 0.40 + vol_pct * 0.35 + mkt_pct * 0.25
        # Cap at 95 so it never shows a perfect 100
        liquidity_score = min(95, max(5, liquidity_score))
        
        comparisons.append({
            "platform": m["platform"],
            "display_name": platform_display_names.get(m["platform"], m["platform"].title()),
            "total_markets": m["actual_total"],
            "sample_markets": m["sample_count"],
            "sample_volume": m["sample_volume"],
            "estimated_volume": m["estimated_volume"],
            "tvl": m["tvl"],
            "total_liquidity": m["total_liquidity"],
            "avg_volume": m["avg_volume"],
            "avg_price": m["avg_price"],
            "categories_count": m["categories_count"],
            "liquidity_score": round(liquidity_score, 1),
        })
    
    # Sort by total markets
    comparisons.sort(key=lambda x: x["total_markets"], reverse=True)
    
    return comparisons


def get_category_intelligence(platform_data: Dict[str, List]) -> List[Dict]:
    """Get category-level intelligence"""
    
    def get_volume(e):
        vol = e.get("volume") or e.get("total_volume") or e.get("volume_24h") or 0
        try:
            return float(vol) if vol else 0
        except (ValueError, TypeError):
            return 0
    
    categories = {}
    
    for platform, events in platform_data.items():
        for event in events:
            cat = event.get("category", "other") or "other"
            cat = cat.lower()
            
            if cat not in categories:
                categories[cat] = {
                    "category": cat,
                    "total_volume": 0,
                    "market_count": 0,
                    "platforms": set(),
                    "top_event": None,
                    "top_event_volume": 0,
                    "top_event_platform": None,
                }
            
            volume = get_volume(event)
            categories[cat]["total_volume"] += volume
            categories[cat]["market_count"] += 1
            categories[cat]["platforms"].add(platform)
            
            if volume > categories[cat]["top_event_volume"]:
                categories[cat]["top_event"] = event.get("title") or event.get("question")
                categories[cat]["top_event_volume"] = volume
                categories[cat]["top_event_platform"] = platform
    
    # Convert to list and calculate shares
    total_volume = sum(c["total_volume"] for c in categories.values())
    total_markets = sum(c["market_count"] for c in categories.values())
    
    category_display_names = {
        "politics": "🏛️ Politics",
        "crypto": "₿ Crypto",
        "sports": "⚽ Sports",
        "entertainment": "🎬 Entertainment",
        "science": "🔬 Science",
        "finance": "💰 Finance",
        "tech": "💻 Tech",
        "economy": "📊 Economy",
        "news": "📰 News",
        "business": "💼 Business",
        "other": "📦 Other",
    }
    
    result = []
    for cat, data in categories.items():
        result.append({
            "category": cat,
            "display_name": category_display_names.get(cat, f"📌 {cat.title()}"),
            "total_volume": data["total_volume"],
            "market_count": data["market_count"],
            "volume_share": round((data["total_volume"] / total_volume * 100), 1) if total_volume > 0 else 0,
            "market_share": round((data["market_count"] / total_markets * 100), 1) if total_markets > 0 else 0,
            "platform_count": len(data["platforms"]),
            "platforms": list(data["platforms"]),
            "top_event": data["top_event"],
            "top_event_platform": data["top_event_platform"],
        })
    
    # Sort by volume
    result.sort(key=lambda x: x["total_volume"], reverse=True)
    
    return result[:12]


@router.get("/intelligence")
async def get_intelligence_dashboard() -> Dict[str, Any]:
    """
    Get comprehensive intelligence dashboard data from all platforms
    Returns 6-section dashboard data for YC submission
    
    Uses stale-while-revalidate pattern:
    - Returns cached data immediately (even if stale)
    - Triggers background refresh if cache is older than TTL
    """
    now = datetime.utcnow()
    
    # Check if we have ANY cached data - return it immediately for instant load
    if _dashboard_cache["data"] is not None:
        cache_age = 0
        if _dashboard_cache["timestamp"]:
            cache_age = (now - _dashboard_cache["timestamp"]).total_seconds()
        
        # If cache is expired, trigger background refresh (non-blocking)
        if cache_age > _dashboard_cache["ttl"] and not _is_refreshing:
            logger.info(f"Cache expired ({cache_age:.0f}s old), triggering background refresh")
            asyncio.create_task(_refresh_dashboard_cache())
        
        logger.info(f"Returning cached intelligence dashboard ({cache_age:.0f}s old)")
        return _dashboard_cache["data"]
    
    # No cache at all - must fetch synchronously (first request after startup)
    logger.info("No cache available, fetching fresh intelligence dashboard from APIs")
    
    try:
        # Fetch all platform data - returns {"results": {...}, "totals": {...}}
        fetch_result = await fetch_all_platform_data()
        platform_data = fetch_result.get("results", {})
        platform_totals = fetch_result.get("totals", {})
        
        logger.info(f"Platform totals from APIs: {platform_totals}")
        
        # Fetch aggregate platform stats (TVL, estimated volume from DeFiLlama etc)
        aggregate_stats = await fetch_platform_aggregate_stats()
        
        # 1. GLOBAL MARKET INTELLIGENCE (with actual totals from pagination + aggregate stats)
        global_metrics = calculate_global_metrics(platform_data, platform_totals, aggregate_stats)
        
        # 2. MARKETS MOVING RIGHT NOW
        trending_markets = find_trending_markets(platform_data, limit=8)
        
        # 3. CROSS-VENUE ARBITRAGE
        arbitrage_opportunities = find_arbitrage_opportunities(platform_data)
        
        # 4. CATEGORY INTELLIGENCE
        category_intelligence = get_category_intelligence(platform_data)
        
        # 5. PLATFORM COMPARISON (use actual totals + aggregate stats)
        platform_comparison = calculate_platform_comparison(platform_data, platform_totals, aggregate_stats)
        
        # Build response
        response = {
            "global_metrics": global_metrics,
            "trending_markets": trending_markets,
            "arbitrage_opportunities": arbitrage_opportunities,
            "category_intelligence": category_intelligence,
            "platform_comparison": platform_comparison,
            "timestamp": now.isoformat(),
            "data_sources": {
                "polymarket": platform_totals.get("polymarket", len(platform_data.get("polymarket", []))),
                "kalshi": platform_totals.get("kalshi", len(platform_data.get("kalshi", []))),
                "limitless": platform_totals.get("limitless", len(platform_data.get("limitless", []))),
                "opiniontrade": platform_totals.get("opiniontrade", len(platform_data.get("opiniontrade", []))),
            },
            "sample_sizes": {
                "polymarket": len(platform_data.get("polymarket", [])),
                "kalshi": len(platform_data.get("kalshi", [])),
                "limitless": len(platform_data.get("limitless", [])),
                "opiniontrade": len(platform_data.get("opiniontrade", [])),
            }
        }
        
        # Update cache
        _dashboard_cache["data"] = response
        _dashboard_cache["timestamp"] = now
        
        return response
        
    except Exception as e:
        logger.error(f"Error building intelligence dashboard: {e}")
        raise HTTPException(status_code=500, detail=str(e))


async def _refresh_dashboard_cache():
    """Internal function to refresh cache - called from background task."""
    global _dashboard_cache, _is_refreshing
    
    if _is_refreshing:
        logger.debug("Cache refresh already in progress, skipping")
        return
    
    _is_refreshing = True
    try:
        logger.info("🔄 Background refreshing intelligence dashboard cache...")
        start_time = datetime.utcnow()
        
        # Fetch all platform data
        fetch_result = await fetch_all_platform_data()
        platform_data = fetch_result.get("results", {})
        platform_totals = fetch_result.get("totals", {})
        
        # Fetch aggregate platform stats
        aggregate_stats = await fetch_platform_aggregate_stats()
        
        # Build response
        global_metrics = calculate_global_metrics(platform_data, platform_totals, aggregate_stats)
        trending_markets = find_trending_markets(platform_data, limit=8)
        arbitrage_opportunities = find_arbitrage_opportunities(platform_data)
        category_intelligence = get_category_intelligence(platform_data)
        platform_comparison = calculate_platform_comparison(platform_data, platform_totals, aggregate_stats)
        
        now = datetime.utcnow()
        response = {
            "global_metrics": global_metrics,
            "trending_markets": trending_markets,
            "arbitrage_opportunities": arbitrage_opportunities,
            "category_intelligence": category_intelligence,
            "platform_comparison": platform_comparison,
            "timestamp": now.isoformat(),
            "data_sources": {
                "polymarket": platform_totals.get("polymarket", len(platform_data.get("polymarket", []))),
                "kalshi": platform_totals.get("kalshi", len(platform_data.get("kalshi", []))),
                "limitless": platform_totals.get("limitless", len(platform_data.get("limitless", []))),
                "opiniontrade": platform_totals.get("opiniontrade", len(platform_data.get("opiniontrade", []))),
            },
            "sample_sizes": {
                "polymarket": len(platform_data.get("polymarket", [])),
                "kalshi": len(platform_data.get("kalshi", [])),
                "limitless": len(platform_data.get("limitless", [])),
                "opiniontrade": len(platform_data.get("opiniontrade", [])),
            }
        }
        
        # Update cache
        _dashboard_cache["data"] = response
        _dashboard_cache["timestamp"] = now
        
        elapsed = (datetime.utcnow() - start_time).total_seconds()
        logger.info(f"✅ Intelligence cache refreshed in {elapsed:.1f}s")
        
    except Exception as e:
        logger.error(f"❌ Background cache refresh failed: {e}")
    finally:
        _is_refreshing = False


async def _background_refresh_loop():
    """Background loop that refreshes cache every 4 minutes."""
    while True:
        await asyncio.sleep(240)  # 4 minutes
        try:
            await _refresh_dashboard_cache()
        except Exception as e:
            logger.error(f"Background refresh error: {e}")


async def warm_intelligence_cache():
    """Pre-warm the intelligence cache on startup."""
    logger.info("🔥 Pre-warming intelligence dashboard cache...")
    await _refresh_dashboard_cache()


def start_intelligence_refresh():
    """Start the background refresh task."""
    global _refresh_task
    if _refresh_task is None or _refresh_task.done():
        _refresh_task = asyncio.create_task(_background_refresh_loop())
        logger.info("🔄 Intelligence dashboard background refresh started (every 4 min)")


def stop_intelligence_refresh():
    """Stop the background refresh task."""
    global _refresh_task
    if _refresh_task and not _refresh_task.done():
        _refresh_task.cancel()
        logger.info("🛑 Intelligence dashboard background refresh stopped")


@router.get("/clear-cache")
async def clear_intelligence_cache():
    """Clear the intelligence dashboard cache"""
    global _dashboard_cache
    _dashboard_cache = {"data": None, "timestamp": None, "ttl": 300}
    return {"status": "cache cleared"}


@router.get("/debug-dome")
async def debug_dome_api():
    """Debug endpoint to test Dome API directly"""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                f"{DOME_API_BASE}/polymarket/markets",
                params={"limit": 3, "status": "open"},
                headers={"Authorization": f"Bearer {DOME_API_KEY}"}
            )
            return {
                "status_code": response.status_code,
                "api_key_prefix": DOME_API_KEY[:8] + "...",
                "markets_count": len(response.json().get("markets", [])) if response.status_code == 200 else 0,
                "error": response.text[:200] if response.status_code != 200 else None
            }
    except Exception as e:
        return {"error": str(e)}
