#!/usr/bin/env python3
"""Helper script: write new DB-backed API files."""
import os

BASE = os.path.dirname(__file__)
BACKEND_API = os.path.join(BASE, "backend", "app", "api")

# ─────────────────────────────────────────────────────────────────────────────
# 1. intelligence_dashboard.py
# ─────────────────────────────────────────────────────────────────────────────
INTELLIGENCE = """\
\"\"\"
Intelligence Dashboard - Database-backed
Queries predictions_silver.markets for aggregate market intelligence.
No live external API calls. Same JSON shape as before.
\"\"\"
import time
import logging
from typing import Dict, Any
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import datetime, timezone

from app.database.session import get_db

logger = logging.getLogger(__name__)
router = APIRouter()

_dashboard_cache: Dict[str, Any] = {"data": None, "ts": 0.0, "ttl": 300.0}

PLATFORM_DISPLAY = {
    "polymarket":   "Polymarket",
    "kalshi":       "KALSHI",
    "limitless":    "Limitless",
    "opiniontrade": "OpinionTrade",
}


def _fmt_cat(cat: str) -> str:
    if not cat:
        return "Other"
    return cat.replace("-", " ").replace("_", " ").title()


# Stubs so main.py imports don't break
async def warm_intelligence_cache():
    \"\"\"No-op: cache built on first DB request.\"\"\"
    pass


def start_intelligence_refresh():
    \"\"\"No-op.\"\"\"
    pass


def stop_intelligence_refresh():
    \"\"\"No-op.\"\"\"
    pass


@router.get("/intelligence")
async def get_intelligence_dashboard(
    refresh: bool = False,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    \"\"\"Return aggregated market intelligence from the database. 5-min cache.\"\"\"
    t0 = time.time()

    if (
        not refresh
        and _dashboard_cache["data"]
        and (time.time() - _dashboard_cache["ts"]) < _dashboard_cache["ttl"]
    ):
        logger.info("Intelligence: cache hit")
        return _dashboard_cache["data"]

    try:
        # Per-platform aggregate stats
        plat_rows = db.execute(text(\"\"\"
            SELECT
                source                          AS platform,
                COUNT(*)                        AS market_count,
                COALESCE(SUM(volume_total), 0)  AS total_volume,
                COALESCE(SUM(volume_24h),   0)  AS volume_24h,
                COALESCE(SUM(liquidity),    0)  AS total_liquidity,
                AVG(COALESCE(yes_price, 0))     AS avg_yes_price,
                COUNT(DISTINCT category_name)   AS categories_count
            FROM predictions_silver.markets
            WHERE is_active = TRUE
            GROUP BY source
            ORDER BY total_volume DESC NULLS LAST
        \"\"\")).fetchall()

        total_markets    = sum(int(r.market_count  or 0) for r in plat_rows)
        total_volume     = sum(float(r.total_volume or 0) for r in plat_rows)
        total_volume_24h = sum(float(r.volume_24h  or 0) for r in plat_rows)
        platform_counts  = {r.platform: int(r.market_count  or 0) for r in plat_rows}
        platform_volumes = {r.platform: float(r.total_volume or 0) for r in plat_rows}

        # Category stats
        cat_rows = db.execute(text(\"\"\"
            SELECT
                COALESCE(category_name, 'other') AS category,
                COUNT(*)                         AS market_count,
                COALESCE(SUM(volume_total), 0)   AS total_volume
            FROM predictions_silver.markets
            WHERE is_active = TRUE
            GROUP BY COALESCE(category_name, 'other')
            ORDER BY total_volume DESC NULLS LAST
            LIMIT 20
        \"\"\")).fetchall()

        categories_dict: Dict[str, Any] = {}
        category_intelligence = []
        for cat in cat_rows:
            vol_share = (
                float(cat.total_volume or 0) / total_volume * 100
                if total_volume > 0 else 0
            )
            categories_dict[cat.category] = {
                "market_count": int(cat.market_count or 0),
                "volume":       float(cat.total_volume or 0),
                "volume_share": round(vol_share, 2),
            }
            category_intelligence.append({
                "category":     cat.category,
                "display_name": _fmt_cat(cat.category),
                "market_count": int(cat.market_count or 0),
                "total_volume": float(cat.total_volume or 0),
                "volume_share": round(vol_share, 2),
            })

        # Trending markets (top by 24h volume)
        trend_rows = db.execute(text(\"\"\"
            SELECT
                source_market_id,
                source       AS platform,
                question     AS title,
                yes_price    AS probability,
                volume_24h,
                volume_total,
                source_url
            FROM predictions_silver.markets
            WHERE is_active = TRUE
              AND volume_24h IS NOT NULL
              AND volume_24h > 0
            ORDER BY volume_24h DESC NULLS LAST
            LIMIT 10
        \"\"\")).fetchall()

        trending_markets = [
            {
                "id":               r.source_market_id,
                "title":            r.title or "",
                "probability":      float(r.probability or 0.5),
                "price_change_24h": 0,
                "volume":           float(r.volume_24h or 0),
                "volume_24h":       float(r.volume_24h or 0),
                "platform":         r.platform or "polymarket",
                "slug":             r.source_market_id,
                "source_url":       r.source_url,
            }
            for r in trend_rows
        ]

        # Platform comparison
        platform_comparison = []
        for r in plat_rows:
            vol       = float(r.total_volume or 0)
            liq       = float(r.total_liquidity or 0)
            liq_score = min(100.0, (liq / max(vol, 1)) * 100) if vol > 0 else 0
            platform_comparison.append({
                "platform":         r.platform,
                "display_name":     PLATFORM_DISPLAY.get(r.platform, r.platform.title()),
                "total_markets":    int(r.market_count or 0),
                "estimated_volume": vol,
                "sample_volume":    vol,
                "total_liquidity":  liq,
                "avg_price":        round(float(r.avg_yes_price or 0.5), 4),
                "categories_count": int(r.categories_count or 0),
                "liquidity_score":  round(liq_score, 1),
            })

        data: Dict[str, Any] = {
            "global_metrics": {
                "total_markets":              total_markets,
                "estimated_total_volume":     total_volume,
                "volume_24h":                 total_volume_24h,
                "platforms_active":           len(plat_rows),
                "sample_count":               total_markets,
                "categories":                 categories_dict,
                "platform_counts":            platform_counts,
                "platform_estimated_volumes": platform_volumes,
                "platform_volumes":           platform_volumes,
            },
            "trending_markets":        trending_markets,
            "category_intelligence":   category_intelligence,
            "platform_comparison":     platform_comparison,
            "arbitrage_opportunities": [],
            "data_source": "database",
            "query_ms":    int((time.time() - t0) * 1000),
            "updated_at":  datetime.now(timezone.utc).isoformat(),
        }

        _dashboard_cache["data"] = data
        _dashboard_cache["ts"]   = time.time()
        logger.info(
            "Intelligence: DB query OK in %dms - %d markets, %d platforms",
            data["query_ms"], total_markets, len(platform_comparison),
        )
        return data

    except Exception as exc:
        logger.error("Intelligence dashboard DB error: %s", exc)
        if _dashboard_cache["data"]:
            logger.warning("Intelligence: returning stale cache after DB error")
            return _dashboard_cache["data"]
        raise
"""

# ─────────────────────────────────────────────────────────────────────────────
# 2. events_db.py
# ─────────────────────────────────────────────────────────────────────────────
EVENTS_DB = """\
\"\"\"
Events API - Database-backed
Fetches events from predictions_gold.events_snapshot.
No live API calls, no in-memory cache of live data.
\"\"\"
from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Dict, Any
import logging

from app.database.session import get_db

logger = logging.getLogger(__name__)
router = APIRouter()


def slug_to_title(event_slug: str) -> str:
    \"\"\"Convert event_slug to a human-readable title.\"\"\"
    if not event_slug:
        return "Unknown Event"
    words = event_slug.replace("-", " ").split()
    lower_set = {"a","an","the","and","or","but","in","on","at","to","for","of","vs","by"}
    upper_set = {"us","uk","eu","ufc","nba","nfl","mlb","nhl","pga","gdp","cpi","fed","btc","eth"}
    result = []
    for i, word in enumerate(words):
        wl = word.lower()
        if wl in upper_set:
            result.append(word.upper())
        elif i == 0 or wl not in lower_set:
            result.append(word.capitalize())
        else:
            result.append(wl)
    return " ".join(result)


# Stub so main.py cleanup doesn't break
def stop_merged_events_refresh():
    pass


@router.get("/events/stats")
async def get_events_stats(db: Session = Depends(get_db)) -> Dict[str, Any]:
    \"\"\"Aggregate event/market stats directly from predictions_gold.events_snapshot.\"\"\"
    try:
        result = db.execute(text(\"\"\"
            WITH latest AS (
                SELECT DISTINCT ON (event_id, platform)
                    event_id, platform, market_count, total_volume, volume_24h
                FROM predictions_gold.events_snapshot
                WHERE market_count > 0
                ORDER BY event_id, platform, snapshot_at DESC
            )
            SELECT
                COUNT(*)                                                               AS total_events,
                COALESCE(SUM(market_count), 0)                                         AS total_markets,
                COALESCE(SUM(total_volume), 0)                                         AS total_volume,
                COALESCE(SUM(volume_24h), 0)                                           AS volume_24h,
                COALESCE(SUM(CASE WHEN platform='polymarket'   THEN market_count ELSE 0 END),0) AS poly_mkt,
                COALESCE(SUM(CASE WHEN platform='polymarket'   THEN total_volume  ELSE 0 END),0) AS poly_vol,
                COALESCE(SUM(CASE WHEN platform='kalshi'       THEN market_count ELSE 0 END),0) AS kal_mkt,
                COALESCE(SUM(CASE WHEN platform='kalshi'       THEN total_volume  ELSE 0 END),0) AS kal_vol,
                COALESCE(SUM(CASE WHEN platform='limitless'    THEN market_count ELSE 0 END),0) AS lim_mkt,
                COALESCE(SUM(CASE WHEN platform='opiniontrade' THEN market_count ELSE 0 END),0) AS ot_mkt
            FROM latest
        \"\"\")).fetchone()

        total     = int(result.total_events or 0)
        total_vol = float(result.total_volume or 0)
        return {
            "total_events":  total,
            "total_markets": int(result.total_markets or 0),
            "total_volume":  total_vol,
            "avg_per_event": total_vol / total if total > 0 else 0,
            "volume_24h":    float(result.volume_24h or 0),
            "platform_counts": {
                "polymarket":   int(result.poly_mkt or 0),
                "kalshi":       int(result.kal_mkt  or 0),
                "limitless":    int(result.lim_mkt  or 0),
                "opiniontrade": int(result.ot_mkt   or 0),
            },
            "aggregate_metrics": {
                "total_events":         total,
                "total_markets":        int(result.total_markets or 0),
                "total_volume":         total_vol,
                "polymarket_markets":   int(result.poly_mkt or 0),
                "polymarket_volume":    float(result.poly_vol or 0),
                "kalshi_markets":       int(result.kal_mkt  or 0),
                "kalshi_volume":        float(result.kal_vol or 0),
                "limitless_markets":    int(result.lim_mkt  or 0),
                "opiniontrade_markets": int(result.ot_mkt   or 0),
            },
            "cache_status": "db",
            "data_source":  "database",
        }
    except Exception as e:
        logger.error("Error fetching events stats: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/events/categories")
async def get_event_categories(
    platform: str = Query("all"),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    \"\"\"Get available categories from predictions_gold.events_snapshot.\"\"\"
    try:
        params: Dict[str, Any] = {}
        where = "WHERE category IS NOT NULL AND category != '' AND market_count > 0"
        if platform != "all":
            where += " AND platform = :platform"
            params["platform"] = platform

        rows = db.execute(text(f\"\"\"
            SELECT category, COUNT(DISTINCT event_id) AS cnt
            FROM predictions_gold.events_snapshot
            {where}
            GROUP BY category
            ORDER BY cnt DESC
        \"\"\"), params).fetchall()

        categories = [
            {
                "name":  r.category,
                "count": r.cnt,
                "label": r.category.replace("-", " ").title() if r.category else "Other",
            }
            for r in rows
        ]
        return {"categories": categories, "total_categories": len(categories)}
    except Exception as e:
        logger.error("Error getting categories: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/events")
async def list_events(
    platform: str = Query("all"),
    category: str = Query("all"),
    search:   str = Query(None),
    page:     int = Query(1, ge=1),
    page_size:int = Query(100, ge=1, le=1000),
    status:   str = Query("all"),
    sort_by:  str = Query("volume"),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    \"\"\"List events from predictions_gold.events_snapshot. Pure DB, no cache.\"\"\"
    try:
        offset = (page - 1) * page_size
        params: Dict[str, Any] = {"limit": page_size, "offset": offset}

        conds = ["market_count > 0"]
        if platform != "all":
            conds.append("platform = :platform"); params["platform"] = platform
        if category != "all":
            conds.append("category = :category"); params["category"] = category
        if status not in ("all", "open"):
            conds.append("status = :status"); params["status"] = status
        if search:
            conds.append("LOWER(title) LIKE :search")
            params["search"] = f"%{search.lower()}%"

        where = "WHERE " + " AND ".join(conds)
        count_params = {k: v for k, v in params.items() if k not in ("limit", "offset")}

        sort_map = {
            "volume":     "total_volume DESC NULLS LAST",
            "volume_24h": "volume_24h DESC NULLS LAST",
            "markets":    "market_count DESC NULLS LAST",
            "recent":     "end_time DESC NULLS LAST",
        }
        order_by = sort_map.get(sort_by, "total_volume DESC NULLS LAST")

        # Count
        total = db.execute(text(f\"\"\"
            SELECT COUNT(*) FROM (
                SELECT DISTINCT ON (event_id, platform) event_id, platform
                FROM predictions_gold.events_snapshot
                {where}
                ORDER BY event_id, platform, snapshot_at DESC
            ) t
        \"\"\"), count_params).scalar() or 0

        # Platform counts
        pcnt_rows = db.execute(text(f\"\"\"
            SELECT platform, COUNT(DISTINCT event_id) AS cnt
            FROM predictions_gold.events_snapshot
            {where}
            GROUP BY platform
        \"\"\"), count_params).fetchall()
        platform_counts_map = {r.platform: r.cnt for r in pcnt_rows}

        # Aggregate metrics
        agg = db.execute(text(f\"\"\"
            WITH latest AS (
                SELECT DISTINCT ON (event_id, platform) *
                FROM predictions_gold.events_snapshot
                {where}
                ORDER BY event_id, platform, snapshot_at DESC
            )
            SELECT
                COUNT(*) AS total_events,
                COALESCE(SUM(market_count),  0) AS total_markets,
                COALESCE(SUM(total_volume),  0) AS total_volume,
                COALESCE(SUM(volume_24h),    0) AS volume_24h,
                COALESCE(SUM(volume_1_week), 0) AS volume_1_week,
                COALESCE(AVG(total_volume),  0) AS avg_vol,
                COALESCE(SUM(CASE WHEN platform='polymarket'   THEN market_count ELSE 0 END),0) AS poly_mkt,
                COALESCE(SUM(CASE WHEN platform='polymarket'   THEN total_volume  ELSE 0 END),0) AS poly_vol,
                COALESCE(SUM(CASE WHEN platform='kalshi'       THEN market_count ELSE 0 END),0) AS kal_mkt,
                COALESCE(SUM(CASE WHEN platform='kalshi'       THEN total_volume  ELSE 0 END),0) AS kal_vol,
                COALESCE(SUM(CASE WHEN platform='limitless'    THEN market_count ELSE 0 END),0) AS lim_mkt,
                COALESCE(SUM(CASE WHEN platform='limitless'    THEN total_volume  ELSE 0 END),0) AS lim_vol,
                COALESCE(SUM(CASE WHEN platform='opiniontrade' THEN market_count ELSE 0 END),0) AS ot_mkt,
                COALESCE(SUM(CASE WHEN platform='opiniontrade' THEN total_volume  ELSE 0 END),0) AS ot_vol
            FROM latest
        \"\"\"), count_params).fetchone()

        aggregate_metrics = {
            "total_events":         int(agg.total_events   or 0),
            "total_markets":        int(agg.total_markets  or 0),
            "total_volume":         float(agg.total_volume or 0),
            "volume_24h":           float(agg.volume_24h   or 0),
            "volume_1_week":        float(agg.volume_1_week or 0),
            "avg_volume_per_event": float(agg.avg_vol      or 0),
            "avg_markets_per_event": 0,
            "polymarket_markets":   int(agg.poly_mkt or 0),
            "polymarket_volume":    float(agg.poly_vol or 0),
            "kalshi_markets":       int(agg.kal_mkt  or 0),
            "kalshi_volume":        float(agg.kal_vol or 0),
            "limitless_markets":    int(agg.lim_mkt  or 0),
            "limitless_volume":     float(agg.lim_vol or 0),
            "opiniontrade_markets": int(agg.ot_mkt   or 0),
            "opiniontrade_volume":  float(agg.ot_vol  or 0),
        }

        # Events list (CTE to allow custom ORDER BY after DISTINCT ON)
        rows = db.execute(text(f\"\"\"
            WITH latest_events AS (
                SELECT DISTINCT ON (event_id, platform) *
                FROM predictions_gold.events_snapshot
                {where}
                ORDER BY event_id, platform, snapshot_at DESC
            )
            SELECT * FROM latest_events
            ORDER BY {order_by}
            LIMIT :limit OFFSET :offset
        \"\"\"), params).fetchall()

        # Top market per event from event_markets_latest
        top_markets: Dict[Any, Any] = {}
        if rows:
            conditions = " OR ".join(
                f"(event_id = '{r.event_id}' AND platform = '{r.platform}')" for r in rows
            )
            try:
                tm_rows = db.execute(text(f\"\"\"
                    SELECT DISTINCT ON (event_id, platform)
                        event_id, platform, market_id, market_title,
                        yes_price, no_price, volume_total, liquidity, source_url
                    FROM predictions_gold.event_markets_latest
                    WHERE ({conditions})
                      AND yes_price IS NOT NULL AND yes_price > 0
                    ORDER BY event_id, platform, yes_price DESC
                \"\"\")).fetchall()
                for tm in tm_rows:
                    top_markets[(tm.event_id, tm.platform)] = {
                        "market_id":  tm.market_id,
                        "title":      tm.market_title,
                        "yes_price":  float(tm.yes_price)    if tm.yes_price    else None,
                        "no_price":   float(tm.no_price)     if tm.no_price     else None,
                        "volume":     float(tm.volume_total) if tm.volume_total else 0,
                        "liquidity":  float(tm.liquidity)    if tm.liquidity    else 0,
                        "source_url": tm.source_url,
                    }
            except Exception as tm_err:
                logger.warning("Could not fetch top markets: %s", tm_err)

        db_events = []
        for e in rows:
            tm = top_markets.get((e.event_id, e.platform))
            db_events.append({
                "event_id":          e.event_id,
                "platform":          e.platform,
                "title":             slug_to_title(e.event_id),
                "event_title":       e.event_title,
                "event_description": e.event_description,
                "category":          e.category or "other",
                "market_count":      e.market_count or 0,
                "top_market":        tm,
                "total_volume":      float(e.total_volume  or 0),
                "liquidity":         float(tm.get("liquidity", 0)) if tm else 0,
                "volume_24h":        float(e.volume_24h    or 0),
                "volume_1_week":     float(e.volume_1_week or 0),
                "volume_7d":         float(e.volume_1_week or 0),
                "status":            e.status,
                "start_time":        int(e.start_time.timestamp()) if e.start_time else None,
                "end_time":          int(e.end_time.timestamp())   if e.end_time   else None,
                "image":             e.event_image_url or e.image_url,
                "link": (
                    f"https://polymarket.com/event/{e.event_id}"
                    if e.platform == "polymarket" else e.source_url
                ),
                "tags":       e.tags or [],
                "snapshot_at": e.snapshot_at.isoformat() if e.snapshot_at else None,
            })

        pages = (total + page_size - 1) // page_size if total else 0
        return {
            "events": db_events,
            "pagination": {"page": page, "page_size": page_size, "total": total, "pages": pages},
            "total":        total,
            "total_pages":  pages,
            "platform_counts": {
                "polymarket":   platform_counts_map.get("polymarket",   0),
                "kalshi":       platform_counts_map.get("kalshi",       0),
                "limitless":    platform_counts_map.get("limitless",    0),
                "opiniontrade": platform_counts_map.get("opiniontrade", 0),
            },
            "aggregate_metrics": aggregate_metrics,
        }
    except Exception as e:
        logger.error("Error listing events: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/events/{platform}/{event_id}/analytics")
async def get_event_analytics(
    platform: str,
    event_id: str,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    \"\"\"Get analytics for an event from predictions_silver.markets.\"\"\"
    try:
        result = db.execute(text(\"\"\"
            SELECT
                COUNT(*) AS market_count,
                SUM(volume_total) AS total_volume,
                SUM(volume_24h)   AS volume_24h,
                AVG(yes_price)    AS avg_yes_price,
                MAX(volume_24h)   AS max_market_volume
            FROM predictions_silver.markets
            WHERE source = :platform
              AND (
                  extra_data->>'event_slug'   = :event_id OR
                  extra_data->>'event_ticker' = :event_id OR
                  source_market_id            = :event_id OR
                  SPLIT_PART(source_market_id, '-', 1) = :event_id
              )
        \"\"\"), {"platform": platform, "event_id": event_id}).fetchone()

        if not result or result.market_count == 0:
            raise HTTPException(status_code=404, detail="Event not found")
        return {
            "event_id": event_id,
            "platform": platform,
            "analytics": {
                "market_count":      int(result.market_count or 0),
                "total_volume":      float(result.total_volume or 0),
                "volume_24h":        float(result.volume_24h or 0),
                "avg_yes_price":     float(result.avg_yes_price or 0),
                "max_market_volume": float(result.max_market_volume or 0),
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error getting event analytics: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/events/{platform}/{event_id}")
async def get_event_details(
    platform:      str,
    event_id:      str,
    force_refresh: bool = False,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    \"\"\"Get a single event with all its markets from the database.\"\"\"
    try:
        platform_map = {
            "poly": "polymarket", "polymarket": "polymarket",
            "kalshi": "kalshi", "limitless": "limitless",
            "opiniontrade": "opiniontrade",
        }
        platform = platform_map.get(platform.lower(), platform)

        # Event metadata
        event = db.execute(text(\"\"\"
            SELECT es.*,
                   e.title       AS actual_event_title,
                   e.description AS actual_event_description,
                   e.image_url   AS actual_event_image
            FROM predictions_gold.events_snapshot es
            LEFT JOIN predictions_silver.events e
                ON e.source = es.platform AND e.slug = es.event_id
            WHERE es.event_id = :event_id AND es.platform = :platform
            ORDER BY es.snapshot_at DESC
            LIMIT 1
        \"\"\"), {"event_id": event_id, "platform": platform}).fetchone()

        if not event:
            raise HTTPException(status_code=404, detail="Event not found")

        # Markets from silver layer
        mkt_rows = db.execute(text(\"\"\"
            SELECT
                id, source_market_id, question, description,
                yes_price, volume_24h, volume_total, volume_7d,
                liquidity, trade_count_24h, unique_traders,
                end_date, image_url, source_url, status
            FROM predictions_silver.markets
            WHERE source = :platform
              AND (
                  extra_data->>'event_slug'   = :event_id OR
                  extra_data->>'event_ticker' = :event_id OR
                  source_market_id            = :event_id OR
                  SPLIT_PART(source_market_id, '-', 1) = :event_id
              )
            ORDER BY volume_total DESC NULLS LAST
            LIMIT 100
        \"\"\"), {"platform": platform, "event_id": event_id}).fetchall()

        markets_list = []
        for m in mkt_rows:
            source_url = m.source_url
            if platform == "polymarket" and source_url:
                if "polymarket.com/event/" in source_url:
                    path = source_url.split("polymarket.com/event/")[1].split("?")[0]
                    parts = path.strip("/").split("/")
                    if len(parts) == 1:
                        source_url = f"https://polymarket.com/event/{event_id}/{parts[0]}"
                elif not source_url.startswith("http"):
                    slug = source_url.split("/")[-1].split("?")[0]
                    source_url = f"https://polymarket.com/event/{event_id}/{slug}"
            markets_list.append({
                "id":               str(m.id),
                "market_id":        m.source_market_id,
                "source_market_id": m.source_market_id,
                "title":            m.question,
                "description":      m.description,
                "yes_price":        float(m.yes_price or 0),
                "no_price":         float(1 - (m.yes_price or 0)) if m.yes_price else 0,
                "volume_24h":       float(m.volume_24h    or 0),
                "volume_total":     float(m.volume_total  or 0),
                "volume_7d":        float(m.volume_7d     or 0),
                "liquidity":        float(m.liquidity     or 0),
                "trade_count_24h":  int(m.trade_count_24h or 0),
                "unique_traders":   int(m.unique_traders  or 0),
                "end_date":         int(m.end_date.timestamp()) if m.end_date else None,
                "image_url":        m.image_url,
                "source_url":       source_url,
                "status":           m.status,
            })

        return {
            "event": {
                "event_id":          event.event_id,
                "platform":          event.platform,
                "title":             slug_to_title(event.event_id),
                "event_title":       event.actual_event_title or event.event_title,
                "event_description": event.actual_event_description or event.event_description,
                "category":          event.category or "other",
                "market_count":      event.market_count or 0,
                "total_volume":      float(event.total_volume  or 0),
                "volume_24h":        float(event.volume_24h    or 0),
                "volume_1_week":     float(event.volume_1_week or 0),
                "volume_7d":         float(event.volume_1_week or 0),
                "status":            event.status,
                "start_time":        int(event.start_time.timestamp()) if event.start_time else None,
                "end_time":          int(event.end_time.timestamp())   if event.end_time   else None,
                "image":             event.actual_event_image or event.event_image_url or event.image_url,
                "link":              event.source_url,
                "tags":              event.tags or [],
            },
            "markets":       markets_list,
            "price_history": [],
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error getting event details: %s", e)
        raise HTTPException(status_code=500, detail=str(e))
"""

# Write files
files = {
    os.path.join(BACKEND_API, "intelligence_dashboard.py"): INTELLIGENCE,
    os.path.join(BACKEND_API, "events_db.py"): EVENTS_DB,
}

for path, content in files.items():
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"Written: {path} ({len(content)} chars)")

print("Done.")
