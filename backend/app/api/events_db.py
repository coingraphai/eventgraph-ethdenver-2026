"""
Events API - Database-backed (silver layer)
Groups prediction markets from predictions_silver.markets into logical events.
No live API calls, no in-memory cache.

Event grouping rules (mirroring unified_markets.py):
  polymarket   -> extra_data->>'event_slug'
  kalshi       -> COALESCE(extra_data->>'event_ticker', SPLIT_PART(source_market_id, '-', 1))
  limitless    -> SPLIT_PART(source_market_id, '-', 1)
  opiniontrade -> source_market_id
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Dict, Any
import logging

from app.database.session import get_db

logger = logging.getLogger(__name__)
router = APIRouter()

# SQL CASE expression that derives a stable event-group ID per market row
_EVENT_ID_EXPR = (
    "CASE"
    " WHEN source = 'polymarket'    THEN COALESCE(extra_data->>'event_slug', source_market_id)"
    " WHEN source = 'kalshi'        THEN COALESCE(extra_data->>'event_ticker',"
    "                                              SPLIT_PART(source_market_id, '-', 1))"
    " WHEN source = 'limitless'     THEN COALESCE(NULLIF(SPLIT_PART(slug, '-', 1), ''),"
    "                                              SPLIT_PART(source_market_id, '-', 1),"
    "                                              source_market_id)"
    " ELSE source_market_id END"
)


def slug_to_title(s: str) -> str:
    """Convert a slug/ticker to a human-readable title."""
    if not s:
        return "Unknown Event"
    words = s.replace("-", " ").replace("_", " ").split()
    lower_set = {"a","an","the","and","or","but","in","on","at","to","for","of","vs","by"}
    upper_set = {"us","uk","eu","ufc","nba","nfl","mlb","nhl","pga","gdp","cpi","fed","btc","eth","sol","ada"}
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
    """Aggregate event/market counts directly from predictions_silver.markets."""
    try:
        result = db.execute(text(
            "WITH ev AS ("
            "  SELECT"
            f"    ({_EVENT_ID_EXPR}) AS event_id,"
            "    source AS platform,"
            "    volume_total,"
            "    volume_24h"
            "  FROM predictions_silver.markets"
            "  WHERE is_active = true OR status IN ('active','open')"
            ")"
            "SELECT"
            "  COUNT(DISTINCT (event_id, platform))                                   AS total_events,"
            "  COUNT(*)                                                                AS total_markets,"
            "  COALESCE(SUM(volume_total), 0)                                         AS total_volume,"
            "  COALESCE(SUM(volume_24h),   0)                                         AS volume_24h,"
            "  COUNT(*) FILTER (WHERE platform = 'polymarket')                        AS poly_mkt,"
            "  COALESCE(SUM(volume_total) FILTER (WHERE platform = 'polymarket'), 0)  AS poly_vol,"
            "  COUNT(*) FILTER (WHERE platform = 'kalshi')                            AS kal_mkt,"
            "  COALESCE(SUM(volume_total) FILTER (WHERE platform = 'kalshi'),    0)   AS kal_vol,"
            "  COUNT(*) FILTER (WHERE platform = 'limitless')                         AS lim_mkt,"
            "  COUNT(*) FILTER (WHERE platform = 'opiniontrade')                      AS ot_mkt"
            " FROM ev"
        )).fetchone()

        total      = int(result.total_events or 0)
        total_mkts = int(result.total_markets or 0)
        total_vol  = float(result.total_volume or 0)
        return {
            "total_events":  total,
            "total_markets": total_mkts,
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
                "total_markets":        total_mkts,
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
    """Get available categories from predictions_silver.markets."""
    try:
        params: Dict[str, Any] = {}
        conds = [
            "category_name IS NOT NULL",
            "category_name != ''",
            "(is_active = true OR status IN ('active','open'))",
        ]
        if platform != "all":
            conds.append("source = :platform")
            params["platform"] = platform

        where = "WHERE " + " AND ".join(conds)
        rows = db.execute(text(
            f"SELECT category_name AS category, COUNT(*) AS cnt"
            f" FROM predictions_silver.markets"
            f" {where}"
            f" GROUP BY category_name ORDER BY cnt DESC"
        ), params).fetchall()

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
    """
    List events derived from predictions_silver.markets.
    Markets grouped by (derived_event_id, platform). Pure DB, no cache.
    """
    try:
        offset = (page - 1) * page_size
        params: Dict[str, Any] = {"limit": page_size, "offset": offset}

        conds = ["(is_active = true OR status IN ('active','open'))"]
        if platform != "all":
            conds.append("source = :platform"); params["platform"] = platform
        if category != "all":
            conds.append("category_name = :category"); params["category"] = category
        if search:
            conds.append("(LOWER(title) LIKE :search OR LOWER(slug) LIKE :search)")
            params["search"] = f"%{search.lower()}%"
        if status not in ("all", "open"):
            conds.append("status = :status"); params["status"] = status

        where = "WHERE " + " AND ".join(conds)
        count_params = {k: v for k, v in params.items() if k not in ("limit", "offset")}

        sort_map = {
            "volume":     "total_volume DESC NULLS LAST",
            "volume_24h": "volume_24h DESC NULLS LAST",
            "markets":    "market_count DESC NULLS LAST",
            "recent":     "max_end_date DESC NULLS LAST",
        }
        order_by = sort_map.get(sort_by, "total_volume DESC NULLS LAST")

        # Build event-group CTE using string concat (no f-string multiline)
        eid = _EVENT_ID_EXPR
        raw_cte = (
            "WITH raw AS ("
            "  SELECT"
            f"   ({eid}) AS event_id,"
            "    source AS platform,"
            "    title, category_name, tags, status, yes_price,"
            "    volume_total, volume_24h, volume_7d, liquidity,"
            "    end_date, image_url, source_url, source_market_id,"
            "    ROW_NUMBER() OVER ("
            f"     PARTITION BY ({eid}), source"
            "      ORDER BY COALESCE(volume_total, 0) DESC"
            "    ) AS rn"
            "  FROM predictions_silver.markets"
            f" {where}"
            "),"
            "events AS ("
            "  SELECT"
            "    event_id, platform,"
            "    MAX(title)      FILTER (WHERE rn = 1) AS rep_title,"
            "    MAX(image_url)  FILTER (WHERE rn = 1) AS rep_image,"
            "    MAX(source_url) FILTER (WHERE rn = 1) AS rep_url,"
            "    MAX(yes_price)  FILTER (WHERE rn = 1) AS rep_yes_price,"
            "    MODE() WITHIN GROUP (ORDER BY category_name)  AS category,"
            "    COUNT(*)                                       AS market_count,"
            "    COALESCE(SUM(volume_total), 0)                 AS total_volume,"
            "    COALESCE(SUM(volume_24h),   0)                 AS volume_24h,"
            "    COALESCE(SUM(volume_7d),    0)                 AS volume_1_week,"
            "    COALESCE(SUM(liquidity),    0)                 AS total_liquidity,"
            "    MAX(end_date)                                  AS max_end_date,"
            "    BOOL_OR(status = 'active' OR status = 'open')  AS is_active"
            "  FROM raw GROUP BY event_id, platform"
            ")"
        )

        total = db.execute(
            text(raw_cte + " SELECT COUNT(*) FROM events"), count_params
        ).scalar() or 0

        pcnt_rows = db.execute(
            text(raw_cte + " SELECT platform, COUNT(*) AS cnt FROM events GROUP BY platform"),
            count_params,
        ).fetchall()
        platform_counts_map = {r.platform: r.cnt for r in pcnt_rows}

        agg = db.execute(text(
            raw_cte +
            " SELECT"
            "  COUNT(*) AS total_events,"
            "  COALESCE(SUM(market_count), 0) AS total_markets,"
            "  COALESCE(SUM(total_volume), 0) AS total_volume,"
            "  COALESCE(SUM(volume_24h),   0) AS volume_24h,"
            "  COALESCE(SUM(volume_1_week),0) AS volume_1_week,"
            "  COALESCE(AVG(total_volume), 0) AS avg_vol,"
            "  COALESCE(SUM(market_count) FILTER (WHERE platform='polymarket'), 0) AS poly_mkt,"
            "  COALESCE(SUM(total_volume) FILTER (WHERE platform='polymarket'), 0) AS poly_vol,"
            "  COALESCE(SUM(market_count) FILTER (WHERE platform='kalshi'),     0) AS kal_mkt,"
            "  COALESCE(SUM(total_volume) FILTER (WHERE platform='kalshi'),     0) AS kal_vol,"
            "  COALESCE(SUM(market_count) FILTER (WHERE platform='limitless'),  0) AS lim_mkt,"
            "  COALESCE(SUM(total_volume) FILTER (WHERE platform='limitless'),  0) AS lim_vol,"
            "  COALESCE(SUM(market_count) FILTER (WHERE platform='opiniontrade'),0) AS ot_mkt,"
            "  COALESCE(SUM(total_volume) FILTER (WHERE platform='opiniontrade'),0) AS ot_vol"
            " FROM events"
        ), count_params).fetchone()

        aggregate_metrics = {
            "total_events":          int(agg.total_events   or 0),
            "total_markets":         int(agg.total_markets  or 0),
            "total_volume":          float(agg.total_volume or 0),
            "volume_24h":            float(agg.volume_24h   or 0),
            "volume_1_week":         float(agg.volume_1_week or 0),
            "avg_volume_per_event":  float(agg.avg_vol      or 0),
            "avg_markets_per_event": 0,
            "polymarket_markets":    int(agg.poly_mkt or 0),
            "polymarket_volume":     float(agg.poly_vol or 0),
            "kalshi_markets":        int(agg.kal_mkt  or 0),
            "kalshi_volume":         float(agg.kal_vol or 0),
            "limitless_markets":     int(agg.lim_mkt  or 0),
            "limitless_volume":      float(agg.lim_vol or 0),
            "opiniontrade_markets":  int(agg.ot_mkt   or 0),
            "opiniontrade_volume":   float(agg.ot_vol  or 0),
        }

        rows = db.execute(text(
            raw_cte +
            f" SELECT * FROM events ORDER BY {order_by} LIMIT :limit OFFSET :offset"
        ), params).fetchall()

        db_events = []
        for e in rows:
            title_str = e.rep_title or slug_to_title(e.event_id)
            db_events.append({
                "event_id":          e.event_id,
                "platform":          e.platform,
                "title":             title_str,
                "event_title":       title_str,
                "event_description": None,
                "category":          e.category or "other",
                "market_count":      int(e.market_count or 0),
                "top_market": {
                    "yes_price":  float(e.rep_yes_price) if e.rep_yes_price else None,
                    "source_url": e.rep_url,
                },
                "total_volume":  float(e.total_volume   or 0),
                "liquidity":     float(e.total_liquidity or 0),
                "volume_24h":    float(e.volume_24h     or 0),
                "volume_1_week": float(e.volume_1_week  or 0),
                "volume_7d":     float(e.volume_1_week  or 0),
                "status":        "active" if e.is_active else "closed",
                "start_time":    None,
                "end_time":      int(e.max_end_date.timestamp()) if e.max_end_date else None,
                "image":         e.rep_image,
                "link": (
                    f"https://polymarket.com/event/{e.event_id}"
                    if e.platform == "polymarket" else e.rep_url
                ),
                "tags":       [],
                "snapshot_at": None,
            })

        pages = (total + page_size - 1) // page_size if total else 0
        return {
            "events": db_events,
            "pagination": {"page": page, "page_size": page_size, "total": total, "pages": pages},
            "total":       total,
            "total_pages": pages,
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
    """Get analytics for an event from predictions_silver.markets."""
    try:
        platform_map = {
            "poly": "polymarket", "polymarket": "polymarket",
            "kalshi": "kalshi", "limitless": "limitless",
            "opiniontrade": "opiniontrade",
        }
        platform = platform_map.get(platform.lower(), platform)

        result = db.execute(text(
            "SELECT COUNT(*) AS market_count,"
            " SUM(volume_total) AS total_volume,"
            " SUM(volume_24h)   AS volume_24h,"
            " AVG(yes_price)    AS avg_yes_price,"
            " MAX(volume_24h)   AS max_market_volume"
            " FROM predictions_silver.markets"
            " WHERE source = :platform"
            f" AND ({_EVENT_ID_EXPR}) = :event_id"
        ), {"platform": platform, "event_id": event_id}).fetchone()

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
    """Get a single event with all its markets from predictions_silver.markets."""
    try:
        platform_map = {
            "poly": "polymarket", "polymarket": "polymarket",
            "kalshi": "kalshi", "limitless": "limitless",
            "opiniontrade": "opiniontrade",
        }
        platform = platform_map.get(platform.lower(), platform)

        mkt_rows = db.execute(text(
            "SELECT id, source_market_id, slug, title, question, description,"
            "       yes_price, no_price, volume_24h, volume_total, volume_7d,"
            "       liquidity, trade_count_24h, unique_traders,"
            "       end_date, image_url, source_url, status, category_name, tags"
            " FROM predictions_silver.markets"
            " WHERE source = :platform"
            f" AND ({_EVENT_ID_EXPR}) = :event_id"
            " ORDER BY COALESCE(volume_total, 0) DESC NULLS LAST LIMIT 200"
        ), {"platform": platform, "event_id": event_id}).fetchall()

        if not mkt_rows:
            raise HTTPException(status_code=404, detail="Event not found")

        top = mkt_rows[0]
        total_vol = sum(float(m.volume_total or 0) for m in mkt_rows)
        total_24h = sum(float(m.volume_24h  or 0) for m in mkt_rows)
        total_7d  = sum(float(m.volume_7d   or 0) for m in mkt_rows)

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
            yes_p = float(m.yes_price or 0)
            no_p  = float(m.no_price or 0) if m.no_price else round(1 - yes_p, 4)
            markets_list.append({
                "id":               str(m.id),
                "market_id":        m.source_market_id,
                "source_market_id": m.source_market_id,
                "title":            m.question or m.title,
                "description":      m.description,
                "yes_price":        yes_p,
                "no_price":         no_p,
                "volume_24h":       float(m.volume_24h  or 0),
                "volume_total":     float(m.volume_total or 0),
                "volume_7d":        float(m.volume_7d   or 0),
                "liquidity":        float(m.liquidity   or 0),
                "trade_count_24h":  int(m.trade_count_24h or 0),
                "unique_traders":   int(m.unique_traders  or 0),
                "end_date":         int(m.end_date.timestamp()) if m.end_date else None,
                "image_url":        m.image_url,
                "source_url":       source_url,
                "status":           m.status,
            })

        title_str = top.title or slug_to_title(event_id)
        return {
            "event": {
                "event_id":          event_id,
                "platform":          platform,
                "title":             title_str,
                "event_title":       title_str,
                "event_description": top.description,
                "category":          top.category_name or "other",
                "market_count":      len(mkt_rows),
                "total_volume":      total_vol,
                "volume_24h":        total_24h,
                "volume_1_week":     total_7d,
                "volume_7d":         total_7d,
                "status":            top.status or "active",
                "start_time":        None,
                "end_time":          int(top.end_date.timestamp()) if top.end_date else None,
                "image":             top.image_url,
                "link": (
                    f"https://polymarket.com/event/{event_id}"
                    if platform == "polymarket" else top.source_url
                ),
                "tags": list(top.tags) if top.tags else [],
            },
            "markets":       markets_list,
            "price_history": [],
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error getting event details: %s", e)
        raise HTTPException(status_code=500, detail=str(e))
