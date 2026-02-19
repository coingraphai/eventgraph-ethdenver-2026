"""
Events API - Database-backed version
Fetches events from predictions_gold schema
Groups related markets together
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc, func, text
from typing import Dict, List, Any, Optional
import logging
import time
import asyncio
import threading
from datetime import datetime

from app.database.session import get_db
from app.models.gold_layer import EventsSnapshot, EventMarkets
from app.services.limitless_service import fetch_limitless_events, fetch_limitless_market_detail, fetch_limitless_categories
from app.services.opiniontrade_service import fetch_opiniontrade_events, fetch_opiniontrade_market_detail, fetch_opiniontrade_categories
from app.services.kalshi_service import fetch_kalshi_events, fetch_kalshi_market_detail, fetch_kalshi_categories
from app.services.polymarket_dome_service import fetch_polymarket_events, fetch_polymarket_market_detail, fetch_polymarket_categories, fetch_polymarket_event_detail_live
from app.services.production_cache_service import get_production_cache

logger = logging.getLogger(__name__)
router = APIRouter()

# =============================================================================
# MERGED EVENTS CACHE
# Cache the fully merged, sorted events list from ALL platforms
# This avoids re-fetching 4 live APIs on every page load
# =============================================================================

_merged_events_cache: Dict[str, Any] = {
    "data": None,           # The full merged events list + stats
    "timestamp": 0,         # When the cache was last populated
    "is_refreshing": False, # Prevent concurrent refreshes
}

MERGED_CACHE_TTL = 3600          # 1 hour - cache is "fresh"
MERGED_CACHE_STALE_TTL = 86400   # 24 hours - NEVER fully expire, always serve stale
FORCE_REFRESH_MIN_AGE = 900      # 15 min - don't force refresh if data is < 15 min old

# Background refresh task
_merged_refresh_task: Optional[asyncio.Task] = None

# Categories cache (per-platform, 10 minute TTL)
_categories_cache: Dict[str, Any] = {}
CATEGORIES_CACHE_TTL = 600  # 10 minutes


def _get_merged_cache() -> Optional[Dict[str, Any]]:
    """Get merged cache if it exists (fresh or stale).
    ALWAYS returns data if we have any — never returns None for stale data.
    This prevents 50-60s cold starts after idle periods."""
    if _merged_events_cache["data"] is None:
        return None
    
    # Always return cached data regardless of age
    # Staleness is handled by triggering background refresh
    return _merged_events_cache["data"]


def _is_cache_fresh() -> bool:
    """Check if cache is within fresh TTL"""
    if _merged_events_cache["data"] is None:
        return False
    return (time.time() - _merged_events_cache["timestamp"]) < MERGED_CACHE_TTL


def _is_cache_stale() -> bool:
    """Check if cache exists but is past fresh TTL"""
    if _merged_events_cache["data"] is None:
        return True
    return (time.time() - _merged_events_cache["timestamp"]) >= MERGED_CACHE_TTL


def _can_force_refresh() -> bool:
    """Only allow force refresh if data is older than 15 minutes"""
    if _merged_events_cache["data"] is None:
        return True
    return (time.time() - _merged_events_cache["timestamp"]) >= FORCE_REFRESH_MIN_AGE


def _get_cache_age_seconds() -> float:
    """Get age of cache in seconds"""
    if _merged_events_cache["timestamp"] == 0:
        return float('inf')
    return time.time() - _merged_events_cache["timestamp"]


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


@router.get("/events/stats")
async def get_events_stats(
    force_refresh: bool = Query(False, description="Force refresh from APIs (only if data > 15 min old)"),
) -> Dict[str, Any]:
    """
    Fast endpoint for overview stats (Total Events, Total Markets, Volume).
    Returns cached aggregate counts. < 200ms response time.
    
    - Fresh cache (< 1 hour): instant return
    - Stale cache (1-1.5 hours): instant return + background refresh
    - Force refresh: only works if data > 15 min old
    """
    start = time.time()
    
    cached = _get_merged_cache()
    
    # Handle force refresh
    if force_refresh and cached is not None:
        if not _can_force_refresh():
            age_min = _get_cache_age_seconds() / 60
            logger.info(f"🛡️ Force refresh rejected - data is only {age_min:.1f} min old (min: 15 min)")
            # Return cached stats anyway
            duration = (time.time() - start) * 1000
            return {
                **cached["stats"],
                "cache_age_seconds": int(_get_cache_age_seconds()),
                "cache_status": "fresh",
                "response_time_ms": round(duration, 1),
                "force_refresh_rejected": True,
                "force_refresh_available_in_seconds": int(FORCE_REFRESH_MIN_AGE - _get_cache_age_seconds()),
            }
        else:
            logger.info(f"🔄 Force refresh accepted - data is {_get_cache_age_seconds()/60:.1f} min old")
            cached = None  # Force cache miss
    
    # If we have cached stats, return them immediately
    if cached is not None:
        duration = (time.time() - start) * 1000
        cache_status = "fresh" if _is_cache_fresh() else "stale"
        
        # If stale, trigger background refresh
        if _is_cache_stale() and not _merged_events_cache["is_refreshing"]:
            logger.info("⚡ Stats: Serving stale cache, triggering background refresh")
            _trigger_background_refresh()
        
        logger.info(f"📦 Stats: {cache_status} cache hit ({duration:.1f}ms)")
        return {
            **cached["stats"],
            "cache_age_seconds": int(_get_cache_age_seconds()),
            "cache_status": cache_status,
            "response_time_ms": round(duration, 1),
        }
    
    # No cache - need to build it (cold start)
    logger.info("❄️ Stats: Cold start - building merged events cache...")
    await _build_merged_events_cache()
    
    cached = _get_merged_cache()
    duration = (time.time() - start) * 1000
    
    if cached:
        logger.info(f"✅ Stats: Cache built ({duration:.1f}ms)")
        return {
            **cached["stats"],
            "cache_age_seconds": 0,
            "cache_status": "fresh",
            "response_time_ms": round(duration, 1),
        }
    
    # Fallback - shouldn't happen
    return {
        "total_events": 0,
        "total_markets": 0,
        "total_volume": 0,
        "avg_per_event": 0,
        "platform_counts": {},
        "aggregate_metrics": {},
        "cache_status": "error",
        "response_time_ms": round((time.time() - start) * 1000, 1),
    }


async def _build_merged_events_cache() -> None:
    """
    Build the merged events cache by fetching ALL platforms.
    
    Uses ProductionCacheService for Limitless/OpinionTrade to leverage PostgreSQL caching.
    This avoids 30+ second API calls on every request by serving from DB cache.
    """
    if _merged_events_cache["is_refreshing"]:
        logger.info("🔄 Cache build already in progress, skipping")
        return
    
    _merged_events_cache["is_refreshing"] = True
    start = time.time()
    
    try:
        all_events = []
        platform_counts = {
            "polymarket": 0,
            "kalshi": 0,
            "limitless": 0,
            "opiniontrade": 0,
        }
        aggregate_metrics = {
            "total_events": 0,
            "total_markets": 0,
            "total_volume": 0,
            "volume_24h": 0,
            "volume_1_week": 0,
        }
        
        # Get ProductionCacheService for L2 PostgreSQL caching
        cache_service = get_production_cache()
        
        # Fetch all platforms in PARALLEL
        # Polymarket & Kalshi: Use raw API (they're already fast via Dome API)
        # Limitless & OpinionTrade: Use ProductionCacheService (PostgreSQL cache)
        poly_task = asyncio.get_event_loop().run_in_executor(None, _fetch_polymarket_sync)
        kalshi_task = fetch_kalshi_events(status="open", limit=50000, offset=0, full_fetch=True)
        
        # Use cache service for slow platforms - instant from PostgreSQL
        limitless_task = cache_service.get_events("limitless")
        opiniontrade_task = cache_service.get_events("opiniontrade")
        
        results = await asyncio.gather(
            poly_task, kalshi_task, limitless_task, opiniontrade_task,
            return_exceptions=True,
        )
        
        # Process Polymarket
        poly_result = results[0]
        if isinstance(poly_result, list):
            all_events.extend(poly_result)
            poly_count = len(poly_result)
            poly_volume = sum(e.get("total_volume", 0) or 0 for e in poly_result)
            poly_markets = sum(e.get("market_count", 1) for e in poly_result)
            platform_counts["polymarket"] = poly_count
            aggregate_metrics["total_events"] += poly_count
            aggregate_metrics["total_markets"] += poly_markets
            aggregate_metrics["total_volume"] += poly_volume
            logger.info(f"✅ Cache build: Polymarket {poly_count} events, {poly_markets} markets")
        elif isinstance(poly_result, Exception):
            logger.error(f"❌ Cache build: Polymarket failed: {poly_result}")
        
        # Process Kalshi
        kalshi_result = results[1]
        if isinstance(kalshi_result, dict):
            kalshi_events = kalshi_result.get("events", [])
            all_events.extend(kalshi_events)
            k_count = kalshi_result.get("total", len(kalshi_events))
            k_metrics = kalshi_result.get("aggregate_metrics", {})
            platform_counts["kalshi"] = k_count
            aggregate_metrics["total_events"] += k_count
            aggregate_metrics["total_markets"] += k_metrics.get("total_markets", k_count)
            aggregate_metrics["total_volume"] += k_metrics.get("total_volume", 0)
            logger.info(f"✅ Cache build: Kalshi {k_count} events")
        elif isinstance(kalshi_result, Exception):
            logger.error(f"❌ Cache build: Kalshi failed: {kalshi_result}")
        
        # Process Limitless (cache returns List, not dict)
        limitless_result = results[2]
        if isinstance(limitless_result, list):
            # Cache returns raw list of events
            all_events.extend(limitless_result)
            l_count = len(limitless_result)
            l_volume = sum(e.get("total_volume", 0) or e.get("volume", 0) or 0 for e in limitless_result)
            platform_counts["limitless"] = l_count
            aggregate_metrics["total_events"] += l_count
            aggregate_metrics["total_markets"] += l_count
            aggregate_metrics["total_volume"] += l_volume
            logger.info(f"✅ Cache build: Limitless {l_count} events (from cache)")
        elif isinstance(limitless_result, dict):
            limitless_events = limitless_result.get("events", [])
            all_events.extend(limitless_events)
            l_count = limitless_result.get("total", len(limitless_events))
            l_metrics = limitless_result.get("aggregate_metrics", {})
            platform_counts["limitless"] = l_count
            aggregate_metrics["total_events"] += l_count
            aggregate_metrics["total_markets"] += l_metrics.get("total_markets", l_count)
            aggregate_metrics["total_volume"] += l_metrics.get("total_volume", 0)
            logger.info(f"✅ Cache build: Limitless {l_count} events")
        elif isinstance(limitless_result, Exception):
            logger.error(f"❌ Cache build: Limitless failed: {limitless_result}")
        
        # Process OpinionTrade (cache returns List, not dict)
        ot_result = results[3]
        if isinstance(ot_result, list):
            # Cache returns raw list of events
            all_events.extend(ot_result)
            ot_count = len(ot_result)
            ot_volume = sum(e.get("total_volume", 0) or e.get("volume", 0) or 0 for e in ot_result)
            platform_counts["opiniontrade"] = ot_count
            aggregate_metrics["total_events"] += ot_count
            aggregate_metrics["total_markets"] += ot_count
            aggregate_metrics["total_volume"] += ot_volume
            logger.info(f"✅ Cache build: OpinionTrade {ot_count} events (from cache)")
        elif isinstance(ot_result, dict):
            ot_events = ot_result.get("events", [])
            all_events.extend(ot_events)
            ot_count = ot_result.get("total", len(ot_events))
            ot_metrics = ot_result.get("aggregate_metrics", {})
            platform_counts["opiniontrade"] = ot_count
            aggregate_metrics["total_events"] += ot_count
            aggregate_metrics["total_markets"] += ot_metrics.get("total_markets", ot_count)
            aggregate_metrics["total_volume"] += ot_metrics.get("total_volume", 0)
            logger.info(f"✅ Cache build: OpinionTrade {ot_count} events")
        elif isinstance(ot_result, Exception):
            logger.error(f"❌ Cache build: OpinionTrade failed: {ot_result}")
        
        # Sort all events by volume
        all_events.sort(key=lambda e: e.get("total_volume", 0) or 0, reverse=True)
        
        total_events = aggregate_metrics["total_events"]
        avg_per_event = aggregate_metrics["total_volume"] / total_events if total_events > 0 else 0
        
        # Build cache entry
        _merged_events_cache["data"] = {
            "events": all_events,
            "stats": {
                "total_events": total_events,
                "total_markets": aggregate_metrics["total_markets"],
                "total_volume": aggregate_metrics["total_volume"],
                "avg_per_event": avg_per_event,
                "platform_counts": platform_counts,
                "aggregate_metrics": aggregate_metrics,
            },
            "platform_counts": platform_counts,
            "aggregate_metrics": aggregate_metrics,
        }
        _merged_events_cache["timestamp"] = time.time()
        
        elapsed = time.time() - start
        logger.info(f"✅ Merged events cache built: {total_events} events, "
                     f"{aggregate_metrics['total_markets']} markets, "
                     f"${aggregate_metrics['total_volume']/1e9:.2f}B volume "
                     f"({elapsed:.1f}s)")
        
    except Exception as e:
        logger.error(f"❌ Failed to build merged events cache: {e}")
    finally:
        _merged_events_cache["is_refreshing"] = False


def _fetch_polymarket_sync() -> List[Dict[str, Any]]:
    """Synchronous wrapper for fetch_polymarket_events (runs in executor).
    Uses full_fetch=True to bypass progressive loading and get ALL events."""
    return fetch_polymarket_events(full_fetch=True)


def _trigger_background_refresh():
    """Trigger a background refresh of the merged cache"""
    if _merged_events_cache["is_refreshing"]:
        return
    
    def do_refresh():
        import asyncio
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(_build_merged_events_cache())
        finally:
            loop.close()
    
    thread = threading.Thread(target=do_refresh, daemon=True)
    thread.start()
    logger.info("🔄 Background refresh triggered for merged events cache")


async def warm_merged_events_cache():
    """Called on startup to pre-populate the merged events cache.
    Waits 10s for server to stabilize, then does full fetch of all platforms."""
    logger.info("🔥 Merged events cache: waiting 10s for server to stabilize...")
    await asyncio.sleep(10)
    logger.info("🔥 Warming merged events cache now (full_fetch for all platforms)...")
    await _build_merged_events_cache()


async def _merged_background_refresh_loop():
    """Background loop that refreshes the merged events cache every 30 minutes.
    This prevents the cache from ever going completely cold, eliminating
    50-60s cold starts after idle periods."""
    while True:
        await asyncio.sleep(1800)  # 30 minutes
        try:
            logger.info("🔄 Merged events cache: periodic background refresh starting...")
            await _build_merged_events_cache()
            logger.info("✅ Merged events cache: periodic refresh complete")
        except Exception as e:
            logger.error(f"❌ Merged events cache: periodic refresh failed: {e}")


def start_merged_events_refresh():
    """Start the background refresh task for merged events cache."""
    global _merged_refresh_task
    if _merged_refresh_task is None or _merged_refresh_task.done():
        _merged_refresh_task = asyncio.create_task(_merged_background_refresh_loop())
        logger.info("🔄 Merged events cache background refresh started (every 30 min)")


def stop_merged_events_refresh():
    """Stop the background refresh task."""
    global _merged_refresh_task
    if _merged_refresh_task and not _merged_refresh_task.done():
        _merged_refresh_task.cancel()
        logger.info("🛑 Merged events cache background refresh stopped")


@router.get("/events")
async def list_events(
    platform: str = Query("all", description="Filter by platform: all, polymarket, kalshi, limitless, opiniontrade"),
    category: str = Query("all", description="Filter by category"),
    search: str = Query(None, description="Search events by title"),
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=1000),
    status: str = Query("all", description="Filter by status: all, open, closed"),
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    List events with filtering and pagination
    Events are groups of related markets
    Supports: Polymarket, Kalshi, Limitless, OpinionTrade
    
    Limitless data is fetched directly from API (not DB)
    """
    try:
        offset = (page - 1) * page_size
        
        # =========================================
        # ALL PLATFORMS (including single-platform): Use merged events cache (FAST PATH)
        # The merged cache has all events from ALL platforms, pre-fetched and sorted.
        # This prevents 504 timeouts from slow live API calls (Limitless paginates 50 pages).
        # =========================================
        start_time = time.time()
        
        cached = _get_merged_cache()
        if cached is None:
            # Cold start - build cache first
            logger.info("❄️ Events list: Cold start - building merged cache...")
            await _build_merged_events_cache()
            cached = _get_merged_cache()
        elif _is_cache_stale() and not _merged_events_cache["is_refreshing"]:
            # Stale - serve cache but refresh in background
            _trigger_background_refresh()
        
        if cached is None:
            raise HTTPException(status_code=503, detail="Cache warming up, please retry")
        
        all_events = cached["events"]
        
        # Apply platform filter
        if platform != "all":
            all_events = [e for e in all_events if e.get("platform") == platform]
        
        # Apply filters on cached data (fast - all in memory)
        if category != "all":
            all_events = [
                e for e in all_events
                if e.get("category") == category or category in (e.get("tags") or [])
            ]
        
        if search:
            search_lower = search.lower()
            all_events = [
                e for e in all_events
                if search_lower in (e.get("title") or "").lower()
            ]
        
        if status != "all" and status != "open":
            all_events = [e for e in all_events if e.get("status") == status]
        
        # Calculate filtered totals
        total = len(all_events)
        
        # Compute platform counts from filtered data
        platform_counts = {}
        for e in all_events:
            p = e.get("platform", "unknown")
            platform_counts[p] = platform_counts.get(p, 0) + 1
        total_volume = sum(e.get("total_volume", 0) or 0 for e in all_events)
        total_markets = sum(e.get("market_count", 1) for e in all_events)
        agg = {
            "total_events": total,
            "total_markets": total_markets,
            "total_volume": total_volume,
            "volume_24h": 0,
            "volume_1_week": 0,
        }
        
        # Use full stats if no filters applied and showing all platforms
        if platform == "all" and category == "all" and not search:
            platform_counts = cached["platform_counts"]
            agg = cached["aggregate_metrics"]
        
        # Paginate
        paginated = all_events[offset:offset + page_size]
        
        duration = (time.time() - start_time) * 1000
        cache_status = "fresh" if _is_cache_fresh() else "stale"
        logger.info(f"📦 Events list: {cache_status} cache → platform={platform}, {total} events, page {page} ({duration:.1f}ms)")
        
        return {
            "events": paginated,
            "pagination": {
                "page": page,
                "page_size": page_size,
                "total": total,
                "pages": (total + page_size - 1) // page_size if total else 0,
            },
            "total": total,
            "total_pages": (total + page_size - 1) // page_size if total else 0,
            "platform_counts": {
                "polymarket": platform_counts.get("polymarket", 0),
                "kalshi": platform_counts.get("kalshi", 0),
                "limitless": platform_counts.get("limitless", 0),
                "opiniontrade": platform_counts.get("opiniontrade", 0),
            },
            "aggregate_metrics": agg,
        }
        
        # Build query - get latest snapshot per event
        # Exclude polymarket and kalshi from DB - they use live Dome API
        where_clause = "WHERE 1=1 AND es.market_count > 0 AND es.platform NOT IN ('polymarket', 'kalshi')"
        params = {"limit": page_size, "offset": offset}
        
        if platform != "all":
            where_clause += " AND es.platform = :platform"
            params["platform"] = platform
        if category != "all":
            where_clause += " AND es.category = :category"
            params["category"] = category
        if status != "all":
            where_clause += " AND es.status = :status"
            params["status"] = status
        if search:
            where_clause += " AND (LOWER(es.title) LIKE LOWER(:search) OR LOWER(e.title) LIKE LOWER(:search))"
            params["search"] = f"%{search}%"
        
        query = f"""
            WITH latest_events AS (
                SELECT DISTINCT ON (es.event_id, es.platform)
                    es.event_id,
                    es.platform,
                    es.title,
                    es.category,
                    es.market_count,
                    es.total_volume,
                    es.volume_24h,
                    es.volume_1_week,
                    es.status,
                    es.start_time,
                    es.end_time,
                    es.image_url,
                    es.source_url,
                    es.tags,
                    es.snapshot_at,
                    e.title as event_title,
                    e.description as event_description,
                    e.image_url as event_image_url
                FROM predictions_gold.events_snapshot es
                LEFT JOIN predictions_silver.events e 
                    ON e.source = es.platform 
                    AND e.slug = es.event_id
                {where_clause}
                ORDER BY es.event_id, es.platform, es.snapshot_at DESC
            )
            SELECT * FROM latest_events
            ORDER BY total_volume DESC NULLS LAST
            LIMIT :limit OFFSET :offset
        """
        
        result = db.execute(text(query), params)
        events = result.fetchall()
        
        # Build WHERE clause for count/aggregate queries (without alias)
        # Exclude polymarket and kalshi from DB queries - they use live API
        where_clause_no_alias = "WHERE 1=1 AND market_count > 0 AND platform NOT IN ('polymarket', 'kalshi')"
        count_params = {k: v for k, v in params.items() if k not in ['limit', 'offset']}
        
        if platform != "all":
            where_clause_no_alias += " AND platform = :platform"
        if category != "all":
            where_clause_no_alias += " AND category = :category"
        if status != "all":
            where_clause_no_alias += " AND status = :status"
        if search:
            # For count queries, we need to join with events table too
            where_clause_no_alias = f"""
                WHERE 1=1 AND es.market_count > 0 AND es.platform NOT IN ('polymarket', 'kalshi')
                {" AND es.platform = :platform" if platform != "all" else ""}
                {" AND es.category = :category" if category != "all" else ""}
                {" AND es.status = :status" if status != "all" else ""}
                AND (LOWER(es.title) LIKE LOWER(:search) OR LOWER(e.title) LIKE LOWER(:search))
            """
        
        # Get total count
        if search:
            count_query = f"""
                WITH latest_events AS (
                    SELECT DISTINCT ON (es.event_id, es.platform)
                        es.event_id,
                        es.platform
                    FROM predictions_gold.events_snapshot es
                    LEFT JOIN predictions_silver.events e 
                        ON e.source = es.platform 
                        AND e.slug = es.event_id
                    {where_clause_no_alias}
                    ORDER BY es.event_id, es.platform, es.snapshot_at DESC
                )
                SELECT COUNT(*) FROM latest_events
            """
        else:
            count_query = f"""
                SELECT COUNT(DISTINCT (event_id, platform))
                FROM predictions_gold.events_snapshot
                {where_clause_no_alias}
            """
        total = db.execute(text(count_query), count_params).scalar() or 0
        
        # Get platform counts (with search filter if applicable)
        if search:
            platform_counts_query = f"""
                WITH latest_events AS (
                    SELECT DISTINCT ON (es.event_id, es.platform)
                        es.event_id,
                        es.platform
                    FROM predictions_gold.events_snapshot es
                    LEFT JOIN predictions_silver.events e 
                        ON e.source = es.platform 
                        AND e.slug = es.event_id
                    {where_clause_no_alias}
                    ORDER BY es.event_id, es.platform, es.snapshot_at DESC
                )
                SELECT platform, COUNT(*) as count
                FROM latest_events
                GROUP BY platform
            """
        else:
            platform_counts_query = f"""
                SELECT platform, COUNT(DISTINCT event_id) as count
                FROM predictions_gold.events_snapshot
                {where_clause_no_alias}
                GROUP BY platform
            """
        platform_results = db.execute(text(platform_counts_query), count_params).fetchall()
        platform_counts = {row.platform: row.count for row in platform_results}
        
        # Calculate aggregate metrics
        if search:
            aggregate_query = f"""
                WITH latest_events AS (
                    SELECT DISTINCT ON (es.event_id, es.platform)
                        es.event_id,
                        es.platform,
                        es.market_count,
                        es.total_volume,
                        es.volume_24h,
                        es.volume_1_week
                    FROM predictions_gold.events_snapshot es
                    LEFT JOIN predictions_silver.events e 
                        ON e.source = es.platform 
                        AND e.slug = es.event_id
                    {where_clause_no_alias}
                    ORDER BY es.event_id, es.platform, es.snapshot_at DESC
                )
                SELECT 
                    COUNT(*) as total_events,
                    SUM(market_count) as total_markets,
                    SUM(COALESCE(total_volume, 0)) as total_volume,
                    SUM(COALESCE(volume_24h, 0)) as volume_24h,
                    SUM(COALESCE(volume_1_week, 0)) as volume_1_week,
                    AVG(COALESCE(total_volume, 0)) as avg_volume_per_event,
                    AVG(market_count) as avg_markets_per_event,
                    SUM(CASE WHEN platform = 'polymarket' THEN market_count ELSE 0 END) as polymarket_markets,
                    SUM(CASE WHEN platform = 'polymarket' THEN COALESCE(total_volume, 0) ELSE 0 END) as polymarket_volume,
                    SUM(CASE WHEN platform = 'kalshi' THEN market_count ELSE 0 END) as kalshi_markets,
                    SUM(CASE WHEN platform = 'kalshi' THEN COALESCE(total_volume, 0) ELSE 0 END) as kalshi_volume,
                    SUM(CASE WHEN platform = 'limitless' THEN market_count ELSE 0 END) as limitless_markets,
                    SUM(CASE WHEN platform = 'limitless' THEN COALESCE(total_volume, 0) ELSE 0 END) as limitless_volume,
                    SUM(CASE WHEN platform = 'opiniontrade' THEN market_count ELSE 0 END) as opiniontrade_markets,
                    SUM(CASE WHEN platform = 'opiniontrade' THEN COALESCE(total_volume, 0) ELSE 0 END) as opiniontrade_volume
                FROM latest_events
            """
        else:
            aggregate_query = f"""
                WITH latest_events AS (
                    SELECT DISTINCT ON (event_id, platform)
                        event_id,
                        platform,
                        market_count,
                        total_volume,
                        volume_24h,
                        volume_1_week
                    FROM predictions_gold.events_snapshot
                    {where_clause_no_alias}
                    ORDER BY event_id, platform, snapshot_at DESC
                )
                SELECT 
                    COUNT(*) as total_events,
                    SUM(market_count) as total_markets,
                    SUM(COALESCE(total_volume, 0)) as total_volume,
                    SUM(COALESCE(volume_24h, 0)) as volume_24h,
                    SUM(COALESCE(volume_1_week, 0)) as volume_1_week,
                    AVG(COALESCE(total_volume, 0)) as avg_volume_per_event,
                    AVG(market_count) as avg_markets_per_event,
                    SUM(CASE WHEN platform = 'polymarket' THEN market_count ELSE 0 END) as polymarket_markets,
                    SUM(CASE WHEN platform = 'polymarket' THEN COALESCE(total_volume, 0) ELSE 0 END) as polymarket_volume,
                    SUM(CASE WHEN platform = 'kalshi' THEN market_count ELSE 0 END) as kalshi_markets,
                    SUM(CASE WHEN platform = 'kalshi' THEN COALESCE(total_volume, 0) ELSE 0 END) as kalshi_volume,
                    SUM(CASE WHEN platform = 'limitless' THEN market_count ELSE 0 END) as limitless_markets,
                    SUM(CASE WHEN platform = 'limitless' THEN COALESCE(total_volume, 0) ELSE 0 END) as limitless_volume,
                    SUM(CASE WHEN platform = 'opiniontrade' THEN market_count ELSE 0 END) as opiniontrade_markets,
                    SUM(CASE WHEN platform = 'opiniontrade' THEN COALESCE(total_volume, 0) ELSE 0 END) as opiniontrade_volume
                FROM latest_events
            """
        agg_result = db.execute(text(aggregate_query), count_params).fetchone()
        
        aggregate_metrics = {
            "total_events": int(agg_result.total_events or 0),
            "total_markets": int(agg_result.total_markets or 0),
            "total_volume": float(agg_result.total_volume or 0),
            "volume_24h": float(agg_result.volume_24h or 0),
            "volume_1_week": float(agg_result.volume_1_week or 0),
            "avg_volume_per_event": float(agg_result.avg_volume_per_event or 0),
            "avg_markets_per_event": float(agg_result.avg_markets_per_event or 0),
            "polymarket_markets": int(agg_result.polymarket_markets or 0),
            "polymarket_volume": float(agg_result.polymarket_volume or 0),
            "kalshi_markets": int(agg_result.kalshi_markets or 0),
            "kalshi_volume": float(agg_result.kalshi_volume or 0),
            "limitless_markets": int(agg_result.limitless_markets or 0),
            "limitless_volume": float(agg_result.limitless_volume or 0),
            "opiniontrade_markets": int(agg_result.opiniontrade_markets or 0),
            "opiniontrade_volume": float(agg_result.opiniontrade_volume or 0),
        }
        
        # Get top market (highest probability) for each event from event_markets_latest
        event_ids = [(e.event_id, e.platform) for e in events]
        top_markets = {}
        if event_ids:
            # Build IN clause for event_ids
            event_conditions = " OR ".join([
                f"(event_id = '{eid}' AND platform = '{plat}')" 
                for eid, plat in event_ids
            ])
            top_market_query = f"""
                SELECT DISTINCT ON (event_id, platform)
                    event_id,
                    platform,
                    market_id,
                    market_title,
                    yes_price,
                    no_price,
                    volume_total,
                    liquidity,
                    source_url
                FROM predictions_gold.event_markets_latest
                WHERE ({event_conditions})
                    AND yes_price IS NOT NULL 
                    AND yes_price > 0
                ORDER BY event_id, platform, yes_price DESC
            """
            try:
                top_market_results = db.execute(text(top_market_query)).fetchall()
                for tm in top_market_results:
                    key = (tm.event_id, tm.platform)
                    top_markets[key] = {
                        "market_id": tm.market_id,
                        "title": tm.market_title,
                        "yes_price": float(tm.yes_price) if tm.yes_price else None,
                        "no_price": float(tm.no_price) if tm.no_price else None,
                        "volume": float(tm.volume_total) if tm.volume_total else 0,
                        "liquidity": float(tm.liquidity) if tm.liquidity else 0,
                        "source_url": tm.source_url,
                    }
            except Exception as tm_err:
                logger.warning(f"Could not fetch top markets: {tm_err}")
        
        # Build DB events list
        db_events = []
        for e in events:
            top_market = top_markets.get((e.event_id, e.platform))
            db_events.append({
                "event_id": e.event_id,
                "platform": e.platform,
                "title": slug_to_title(e.event_id),  # Always derive clean title from event_id slug
                "event_title": e.event_title,  # Original question from API (for tooltip/description)
                "event_description": e.event_description,  # Resolution criteria (for tooltip)
                "category": e.category or "other",
                "market_count": e.market_count or 0,
                "top_market": top_market,  # Include top market
                "total_volume": float(e.total_volume or 0),
                "liquidity": float(top_market.get("liquidity", 0)) if top_market else 0,  # Get from top market
                "volume_24h": float(e.volume_24h or 0),
                "volume_1_week": float(e.volume_1_week or 0),
                "volume_7d": float(e.volume_1_week or 0),  # Alias for volume_1_week
                "status": e.status,
                "start_time": int(e.start_time.timestamp()) if e.start_time else None,
                "end_time": int(e.end_time.timestamp()) if e.end_time else None,
                "image": e.event_image_url if e.event_image_url else e.image_url,  # Use event image from events table, fallback to snapshot
                "link": f"https://polymarket.com/event/{e.event_id}" if e.platform == "polymarket" else e.source_url,  # Construct correct event URL
                "tags": e.tags or [],
                "snapshot_at": e.snapshot_at.isoformat(),
            })
        
        # =========================================
        # DB FALLBACK ONLY (platform != "all" and not a known live platform)
        # This path is only reached for unknown platforms
        # =========================================
        
        return {
            "events": db_events,
            "pagination": {
                "page": page,
                "page_size": page_size,
                "total": total,
                "pages": (total + page_size - 1) // page_size if total else 0,
            },
            # Add top-level fields for frontend compatibility
            "total": total,
            "total_pages": (total + page_size - 1) // page_size if total else 0,
            "platform_counts": {
                "polymarket": platform_counts.get("polymarket", 0),
                "kalshi": platform_counts.get("kalshi", 0),
                "limitless": platform_counts.get("limitless", 0),
                "opiniontrade": platform_counts.get("opiniontrade", 0),
            },
            "aggregate_metrics": aggregate_metrics,
        }
        
    except Exception as e:
        logger.error(f"Error listing events: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/events/{platform}/{event_id}")
async def get_event_details(
    platform: str,
    event_id: str,
    force_refresh: bool = False,
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Get single event with all its markets
    
    Args:
        platform: Platform name (polymarket, kalshi, limitless, opiniontrade)
        event_id: Event ID or slug
        force_refresh: If True, bypass cache and fetch fresh data from API
        db: Database session
    """
    try:
        # Normalize platform name
        platform_map = {
            "poly": "polymarket",
            "polymarket": "polymarket",
            "kalshi": "kalshi",
            "limitless": "limitless",
            "opiniontrade": "opiniontrade"
        }
        platform = platform_map.get(platform.lower(), platform)
        
        # =========================================
        # LIMITLESS: Direct API fetch
        # =========================================
        if platform == "limitless":
            limitless_event = await fetch_limitless_market_detail(event_id)
            if not limitless_event:
                raise HTTPException(status_code=404, detail="Limitless market not found")
            
            return {
                "event": {
                    "event_id": limitless_event["event_id"],
                    "platform": "limitless",
                    "title": limitless_event["title"],
                    "event_title": limitless_event.get("event_title"),
                    "event_description": limitless_event.get("event_description"),
                    "category": limitless_event.get("category", "other"),
                    "market_count": 1,
                    "total_volume": limitless_event.get("total_volume", 0),
                    "volume_24h": limitless_event.get("volume_24h", 0),
                    "volume_1_week": limitless_event.get("volume_1_week", 0),
                    "status": limitless_event.get("status", "open"),
                    "start_time": limitless_event.get("start_time"),
                    "end_time": limitless_event.get("end_time"),
                    "image": limitless_event.get("image"),
                    "link": limitless_event.get("link"),
                    "tags": limitless_event.get("tags", []),
                },
                "markets": limitless_event.get("markets", []),
                "price_history": [],  # Not available for Limitless yet
            }
        
        # =========================================
        # OPINIONTRADE: Direct API fetch
        # =========================================
        if platform == "opiniontrade":
            opiniontrade_event = await fetch_opiniontrade_market_detail(event_id)
            if not opiniontrade_event:
                raise HTTPException(status_code=404, detail="OpinionTrade market not found")
            
            return {
                "event": {
                    "event_id": opiniontrade_event["event_id"],
                    "platform": "opiniontrade",
                    "title": opiniontrade_event["title"],
                    "event_title": opiniontrade_event.get("event_title"),
                    "event_description": opiniontrade_event.get("event_description"),
                    "category": opiniontrade_event.get("category", "other"),
                    "market_count": 1,
                    "total_volume": opiniontrade_event.get("total_volume", 0),
                    "volume_24h": opiniontrade_event.get("volume_24h", 0),
                    "volume_1_week": opiniontrade_event.get("volume_1_week", 0),
                    "status": opiniontrade_event.get("status", "open"),
                    "start_time": opiniontrade_event.get("start_time"),
                    "end_time": opiniontrade_event.get("end_time"),
                    "image": opiniontrade_event.get("image"),
                    "link": opiniontrade_event.get("link"),
                    "tags": opiniontrade_event.get("tags", []),
                },
                "markets": opiniontrade_event.get("markets", []),
                "price_history": [],  # Not available for OpinionTrade yet
            }
        
        # =========================================
        # KALSHI: Direct API fetch via Dome
        # =========================================
        if platform == "kalshi":
            kalshi_event = await fetch_kalshi_market_detail(event_id)
            if not kalshi_event:
                raise HTTPException(status_code=404, detail="Kalshi market not found")
            
            return {
                "event": {
                    "event_id": kalshi_event["event_id"],
                    "platform": "kalshi",
                    "title": kalshi_event["title"],
                    "event_title": kalshi_event.get("event_title"),
                    "event_description": kalshi_event.get("event_description"),
                    "category": kalshi_event.get("category", "other"),
                    "market_count": 1,
                    "total_volume": kalshi_event.get("total_volume", 0),
                    "volume_24h": kalshi_event.get("volume_24h", 0),
                    "volume_1_week": kalshi_event.get("volume_1_week", 0),
                    "status": kalshi_event.get("status", "open"),
                    "start_time": kalshi_event.get("start_time"),
                    "end_time": kalshi_event.get("end_time"),
                    "image": kalshi_event.get("image"),
                    "link": kalshi_event.get("link"),
                    "tags": kalshi_event.get("tags", []),
                },
                "markets": kalshi_event.get("markets", []),
                "price_history": [],  # Not available for Kalshi yet
            }
        
        # =========================================
        # POLYMARKET: Live API fetch via Dome
        # =========================================
        if platform == "polymarket":
            polymarket_event = await fetch_polymarket_event_detail_live(event_id, force_refresh)
            if not polymarket_event:
                raise HTTPException(status_code=404, detail="Polymarket event not found")
            
            # The function already returns the correct format
            return polymarket_event
        
        # =========================================
        # DB FALLBACK (should not reach here for supported platforms)
        # =========================================
        
        # Get event details (latest snapshot) + actual event title/description from events table
        event_result = db.execute(text("""
            SELECT 
                es.*,
                e.title as actual_event_title,
                e.description as actual_event_description,
                e.image_url as actual_event_image
            FROM predictions_gold.events_snapshot es
            LEFT JOIN predictions_silver.events e 
                ON e.source = es.platform 
                AND e.slug = es.event_id
            WHERE es.event_id = :event_id
            AND es.platform = :platform
            ORDER BY es.snapshot_at DESC
            LIMIT 1
        """), {"event_id": event_id, "platform": platform})
        
        event = event_result.fetchone()
        if not event:
            raise HTTPException(status_code=404, detail="Event not found")
        
        # Get markets in event from silver layer
        # Logic: Group by event metadata
        markets_result = db.execute(text("""
            SELECT 
                m.id,
                m.source_market_id,
                m.question,
                m.description,
                m.yes_price,
                m.volume_24h,
                m.volume_total,
                m.volume_7d,
                m.liquidity,
                m.trade_count_24h,
                m.unique_traders,
                m.end_date,
                m.image_url,
                m.source_url,
                m.status
            FROM predictions_silver.markets m
            WHERE m.source = :platform
            AND (
                -- Polymarket: group by event_slug in extra_data
                (m.extra_data->>'event_slug' = :event_id) OR
                -- Kalshi: group by event_ticker prefix
                (SPLIT_PART(m.source_market_id, '-', 1) = :event_id)
            )
            ORDER BY m.volume_total DESC NULLS LAST
            LIMIT 100
        """), {"platform": platform, "event_id": event_id})
        
        markets = markets_result.fetchall()
        
        # Build markets list with corrected source_url for Polymarket
        markets_list = []
        for m in markets:
            # Fix source_url for Polymarket: ensure it includes event_slug
            source_url = m.source_url
            if platform == "polymarket" and source_url:
                if 'polymarket.com/event/' in source_url:
                    # Extract path after /event/
                    path_after_event = source_url.split('polymarket.com/event/')[1].split('?')[0]
                    path_parts = path_after_event.strip('/').split('/')
                    if len(path_parts) == 1:
                        # URL is /event/{market_slug}, need to prepend event_slug
                        source_url = f"https://polymarket.com/event/{event_id}/{path_parts[0]}"
                elif not source_url.startswith('http'):
                    # Relative URL, construct full URL with event_id
                    market_slug = source_url.split('/')[-1].split('?')[0]
                    source_url = f"https://polymarket.com/event/{event_id}/{market_slug}"
            
            markets_list.append({
                "id": str(m.id),
                "market_id": m.source_market_id,  # Add market_id for frontend compatibility
                "source_market_id": m.source_market_id,
                "title": m.question,
                "description": m.description,  # Market description for event details
                "yes_price": float(m.yes_price or 0),
                "no_price": float(1 - (m.yes_price or 0)) if m.yes_price else 0,  # Calculate no_price
                "volume_24h": float(m.volume_24h or 0),
                "volume_total": float(m.volume_total or 0),
                "volume_7d": float(m.volume_7d or 0),
                "liquidity": float(m.liquidity or 0),
                "trade_count_24h": int(m.trade_count_24h or 0),
                "unique_traders": int(m.unique_traders or 0),
                "end_date": int(m.end_date.timestamp()) if m.end_date else None,
                "image_url": m.image_url,
                "source_url": source_url,
                "status": m.status,
            })
        
        return {
            "event": {
                "event_id": event.event_id,
                "platform": event.platform,
                "title": slug_to_title(event.event_id),  # Always derive clean title from event_id slug
                "event_title": event.actual_event_title or event.title,  # Original question for description
                "category": event.category or "other",
                "market_count": event.market_count or 0,
                "total_volume": float(event.total_volume or 0),
                "volume_24h": float(event.volume_24h or 0),
                "volume_1_week": float(event.volume_1_week or 0),
                "volume_7d": float(event.volume_1_week or 0),  # Alias for volume_1_week
                "status": event.status,
                "start_time": int(event.start_time.timestamp()) if event.start_time else None,
                "end_time": int(event.end_time.timestamp()) if event.end_time else None,
                "image": event.actual_event_image or event.image_url,  # Use actual event image from events table
                "link": event.source_url,  # Add link field
                "tags": event.tags or [],
            },
            "markets": markets_list
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting event details: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/events/{platform}/{event_id}/analytics")
async def get_event_analytics(
    platform: str,
    event_id: str,
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Get analytics for an event
    """
    try:
        # Get aggregated metrics
        result = db.execute(text("""
            SELECT 
                COUNT(*) as market_count,
                SUM(volume_total) as total_volume,
                SUM(volume_24h) as volume_24h,
                AVG(yes_price) as avg_yes_price,
                MAX(volume_24h) as max_market_volume
            FROM predictions_silver.markets m
            WHERE m.source = :platform
            AND (
                (m.extra_data->>'event_slug' = :event_id) OR
                (SPLIT_PART(m.source_market_id, '-', 1) = :event_id)
            )
        """), {"platform": platform, "event_id": event_id})
        
        metrics = result.fetchone()
        
        if not metrics or metrics.market_count == 0:
            raise HTTPException(status_code=404, detail="Event not found or has no markets")
        
        return {
            "event_id": event_id,
            "platform": platform,
            "analytics": {
                "market_count": metrics.market_count or 0,
                "total_volume": float(metrics.total_volume or 0),
                "volume_24h": float(metrics.volume_24h or 0),
                "avg_yes_price": float(metrics.avg_yes_price or 0),
                "max_market_volume": float(metrics.max_market_volume or 0),
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting event analytics: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# NOTE: The primary /events/stats endpoint is defined above (line ~120) with caching support.
# The database-based version below is removed to avoid duplicate route conflicts.


@router.get("/events/categories")
async def get_event_categories(
    platform: str = Query("all", description="Filter by platform: all, polymarket, kalshi, limitless, opiniontrade"),
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Get available categories for events by platform
    Returns category counts and unique categories
    """
    # Check in-memory cache first
    cached = _categories_cache.get(platform)
    if cached and (time.time() - cached["timestamp"]) < CATEGORIES_CACHE_TTL:
        return cached["data"]

    try:
        # =========================================
        # Use merged events cache for ALL platforms (prevents 504 timeouts)
        # The cache has all events pre-fetched — just count categories from it
        # =========================================
        cached = _get_merged_cache()
        if cached is not None:
            from collections import Counter
            category_counts = Counter()
            for e in cached["events"]:
                # Filter by platform if specified
                if platform != "all" and e.get("platform") != platform:
                    continue
                cat = e.get("category") or "other"
                category_counts[cat] += 1
            
            categories = [
                {
                    "name": cat,
                    "count": count,
                    "label": cat.replace("-", " ").title() if cat else "Other"
                }
                for cat, count in category_counts.most_common()
            ]
            
            result = {
                "categories": categories,
                "total_categories": len(categories)
            }
            _categories_cache[platform] = {"data": result, "timestamp": time.time()}
            return result
        
        # Fallback: Cache not ready yet — try platform-specific fetches
        # Limitless uses direct API, not database
        if platform == "limitless":
            result = await fetch_limitless_categories()
            _categories_cache[platform] = {"data": result, "timestamp": time.time()}
            return result
        
        # OpinionTrade uses direct API, not database
        if platform == "opiniontrade":
            result = await fetch_opiniontrade_categories()
            _categories_cache[platform] = {"data": result, "timestamp": time.time()}
            return result
        
        # Kalshi uses direct API via Dome, not database
        if platform == "kalshi":
            result = await fetch_kalshi_categories()
            _categories_cache[platform] = {"data": result, "timestamp": time.time()}
            return result
        
        where_clause = "WHERE category IS NOT NULL AND category != ''"
        params = {}
        
        if platform != "all":
            where_clause += " AND platform = :platform"
            params["platform"] = platform
        
        # Get categories with counts - simplified query (no need for DISTINCT ON latest snapshot)
        query = f"""
            SELECT 
                category,
                COUNT(DISTINCT event_id) as count
            FROM predictions_gold.events_snapshot
            {where_clause}
            GROUP BY category
            ORDER BY count DESC
        """
        
        result = db.execute(text(query), params).fetchall()
        
        categories = [
            {
                "name": row.category,
                "count": row.count,
                "label": row.category.title() if row.category else "Other"
            }
            for row in result
        ]
        
        response_data = {
            "categories": categories,
            "total_categories": len(categories)
        }

        # Store in cache
        _categories_cache[platform] = {"data": response_data, "timestamp": time.time()}

        return response_data
        
    except Exception as e:
        logger.error(f"Error getting categories: {e}")
        # Serve stale cache on error if available
        stale = _categories_cache.get(platform)
        if stale:
            return stale["data"]
        raise HTTPException(status_code=500, detail=str(e))
