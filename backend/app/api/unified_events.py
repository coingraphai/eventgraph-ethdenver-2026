"""
Unified Events API - Pure Database Approach
Groups predictions_silver.markets by event_slug (Polymarket) / event_ticker (Kalshi).
Limitless markets are standalone events.
NO live API calls. All data from DB only.
"""
from fastapi import APIRouter, Query, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import logging
import calendar
from datetime import datetime

from app.database.session import get_db

router = APIRouter()
logger = logging.getLogger(__name__)


# =============================================================================
# UTILITY FUNCTIONS
# =============================================================================

def slug_to_title(slug: str) -> str:
    """Convert event_slug to human-readable title.
    'democratic-presidential-nominee-2028' -> 'Democratic Presidential Nominee 2028'
    """
    if not slug:
        return "Unknown Event"
    words = slug.replace("-", " ").split()
    lowercase_words = {"a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for", "of", "vs", "by"}
    uppercase_words = {"us", "uk", "eu", "ufc", "nba", "nfl", "mlb", "nhl", "pga", "gdp", "cpi", "fed", "btc", "eth",
                       "fifa", "epl", "mls", "la", "cfa", "efl", "ncaa"}
    result = []
    for i, word in enumerate(words):
        w = word.lower()
        if w in uppercase_words:
            result.append(word.upper())
        elif i == 0 or w not in lowercase_words:
            result.append(word.capitalize())
        else:
            result.append(w)
    return " ".join(result)


def dt_to_ts(dt) -> Optional[int]:
    """Convert datetime/date to Unix timestamp or None."""
    if dt is None:
        return None
    try:
        if hasattr(dt, 'timetuple'):
            return int(calendar.timegm(dt.timetuple()))
    except Exception:
        pass
    return None


def compute_ann_roi(yes_price: Optional[float], end_date) -> Optional[float]:
    """Annualised ROI if YES resolves: ((1-p)/p) * (365/days_left) * 100"""
    if not yes_price or not (0 < yes_price < 1) or end_date is None:
        return None
    try:
        if hasattr(end_date, 'hour'):
            end_dt = end_date.replace(tzinfo=None)
        else:
            from datetime import date, time, datetime as _dt
            end_dt = _dt.combine(end_date, time.min)
        days_left = (end_dt - datetime.utcnow()).days
        if days_left > 0:
            return round(((1 - yes_price) / yes_price) * (365 / days_left) * 100, 1)
    except Exception:
        pass
    return None


# =============================================================================
# PYDANTIC MODELS
# =============================================================================

class EventSummary(BaseModel):
    platform: str           # polymarket | kalshi | limitless
    event_id: str           # event_slug / event_ticker / source_market_id
    title: str              # human-readable title
    image_url: Optional[str] = None
    category: Optional[str] = None
    market_count: int = 1
    total_volume: float = 0.0
    volume_24h: float = 0.0
    end_time: Optional[int] = None   # unix timestamp
    sample_titles: List[str] = []    # first 3 market titles for tooltip


class EventsListResponse(BaseModel):
    events: List[EventSummary]
    total: int
    page: int
    page_size: int
    total_pages: int
    platform_counts: Dict[str, int]


class MarketInEvent(BaseModel):
    market_id: str
    title: str
    yes_price: Optional[float] = None
    no_price: Optional[float] = None
    volume_total: Optional[float] = None
    volume_24h: Optional[float] = None
    end_time: Optional[int] = None
    status: str = "open"
    source_url: Optional[str] = None
    image_url: Optional[str] = None
    category: Optional[str] = None
    price_change_pct_24h: Optional[float] = None
    price_change_24h: Optional[float] = None
    volume_change_pct_24h: Optional[float] = None
    trade_count_24h: Optional[int] = None
    unique_traders_24h: Optional[int] = None
    ann_roi: Optional[float] = None


class EventInsights(BaseModel):
    most_likely: Optional[Dict[str, Any]] = None      # highest YES price market
    highest_roi: Optional[Dict[str, Any]] = None      # highest ann_roi market
    most_active: Optional[Dict[str, Any]] = None      # most volume_24h
    price_buckets: Dict[str, int] = {}                # distribution: <20, 20-40, 40-60, 60-80, >80
    total_volume: float = 0
    volume_24h: float = 0
    avg_yes_price: Optional[float] = None
    markets_with_price: int = 0


class EventDetailResponse(BaseModel):
    platform: str
    event_id: str
    title: str
    image_url: Optional[str] = None
    category: Optional[str] = None
    market_count: int
    total_volume: float
    volume_24h: float
    end_time: Optional[int] = None
    markets: List[MarketInEvent]
    insights: EventInsights


# =============================================================================
# EVENTS LIST ENDPOINT
# =============================================================================

# CTE SQL to build unified events from silver.markets.
# NOTE: array_agg with ORDER BY is NOT supported in window-function context in PostgreSQL,
# so we use GROUP BY aggregation instead.
_EVENTS_CTE = """
WITH poly_grouped AS (
    SELECT
        'polymarket'::text                                                             AS platform,
        extra_data->>'event_slug'                                                      AS event_id,
        (array_agg(title       ORDER BY COALESCE(volume_total,0) DESC NULLS LAST))[1] AS sample_title,
        (array_agg(image_url   ORDER BY COALESCE(volume_total,0) DESC NULLS LAST))[1] AS image_url,
        (array_agg(category_name ORDER BY COALESCE(volume_total,0) DESC NULLS LAST))[1] AS category,
        SUM(COALESCE(volume_total, 0))                                                 AS total_volume,
        SUM(COALESCE(volume_24h,   0))                                                 AS total_volume_24h,
        COUNT(*)                                                                        AS market_count,
        MIN(end_date)                                                                   AS earliest_end,
        array_agg(title ORDER BY COALESCE(volume_total,0) DESC NULLS LAST)             AS all_titles
    FROM predictions_silver.markets
    WHERE is_active = TRUE
      AND source = 'polymarket'
      AND extra_data->>'event_slug' IS NOT NULL
    GROUP BY extra_data->>'event_slug'
),
kalshi_grouped AS (
    SELECT
        'kalshi'::text                                                                 AS platform,
        extra_data->>'event_ticker'                                                    AS event_id,
        (array_agg(title       ORDER BY COALESCE(volume_total,0) DESC NULLS LAST))[1] AS sample_title,
        NULL::text                                                                     AS image_url,
        (array_agg(category_name ORDER BY COALESCE(volume_total,0) DESC NULLS LAST))[1] AS category,
        SUM(COALESCE(volume_total, 0))                                                 AS total_volume,
        SUM(COALESCE(volume_24h,   0))                                                 AS total_volume_24h,
        COUNT(*)                                                                        AS market_count,
        MIN(end_date)                                                                   AS earliest_end,
        array_agg(title ORDER BY COALESCE(volume_total,0) DESC NULLS LAST)             AS all_titles
    FROM predictions_silver.markets
    WHERE is_active = TRUE
      AND source = 'kalshi'
      AND extra_data->>'event_ticker' IS NOT NULL
    GROUP BY extra_data->>'event_ticker'
),
limitless_events AS (
    SELECT
        'limitless'::text                  AS platform,
        source_market_id                   AS event_id,
        title                              AS sample_title,
        image_url,
        category_name                      AS category,
        COALESCE(volume_total, 0)          AS total_volume,
        COALESCE(volume_24h,   0)          AS total_volume_24h,
        1::bigint                          AS market_count,
        end_date                           AS earliest_end,
        ARRAY[title]                       AS all_titles
    FROM predictions_silver.markets
    WHERE is_active = TRUE
      AND source = 'limitless'
),
all_events AS (
    SELECT * FROM poly_grouped
    UNION ALL
    SELECT * FROM kalshi_grouped
    UNION ALL
    SELECT * FROM limitless_events
)
SELECT *
FROM all_events
"""


def _build_event_summary(row, platform_filter: Optional[str] = None) -> EventSummary:
    platform = row.platform
    event_id = row.event_id or ""
    image_url = row.image_url

    # Derive human-readable title
    if platform == "polymarket":
        title = slug_to_title(event_id)
    else:
        title = (row.sample_title or "").strip()

    category = (row.category or "").strip() or None
    total_vol = float(row.total_volume or 0)
    vol_24h = float(row.total_volume_24h or 0)
    market_count = int(row.market_count or 1)
    end_ts = dt_to_ts(row.earliest_end)

    all_titles = row.all_titles or []
    sample_titles = [t for t in all_titles[:3] if t]

    return EventSummary(
        platform=platform,
        event_id=event_id,
        title=title,
        image_url=image_url,
        category=category,
        market_count=market_count,
        total_volume=total_vol,
        volume_24h=vol_24h,
        end_time=end_ts,
        sample_titles=sample_titles,
    )


@router.get("/events", response_model=EventsListResponse)
async def list_events(
    platform: str = Query("all", description="all | polymarket | kalshi | limitless"),
    category: str = Query("all", description="Category filter"),
    search: Optional[str] = Query(None, description="Search query"),
    sort: str = Query("volume_desc", description="volume_desc | volume_24h_desc | ending_soon | newest | market_count_desc"),
    page: int = Query(1, ge=1),
    page_size: int = Query(24, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """List events grouped from silver.markets. Pure DB — no live API calls."""

    # Build WHERE clause additions
    conditions = []
    params: Dict[str, Any] = {}

    if platform != "all":
        conditions.append("platform = :platform")
        params["platform"] = platform

    if search:
        conditions.append("(LOWER(sample_title) LIKE :search OR LOWER(event_id) LIKE :search)")
        params["search"] = f"%{search.lower()}%"

    # Category filter — loose ILIKE match on the category_name column
    CATEGORY_MAP = {
        "politics": "%polit%",
        "crypto":   "%crypt%",
        "sports":   "%sport%",
        "economy":  "%econom%",
        "entertainment": "%entertain%",
        "other":    None,  # catch-all — skip
    }
    if category != "all" and category in CATEGORY_MAP:
        pattern = CATEGORY_MAP[category]
        if pattern:
            conditions.append("LOWER(category) LIKE :cat_pattern")
            params["cat_pattern"] = pattern

    where_sql = ("WHERE " + " AND ".join(conditions)) if conditions else ""

    # ORDER BY
    ORDER_MAP = {
        "volume_desc":       "total_volume DESC NULLS LAST",
        "volume_24h_desc":   "total_volume_24h DESC NULLS LAST",
        "ending_soon":       "earliest_end ASC NULLS LAST",
        "newest":            "total_volume DESC NULLS LAST",   # best proxy without created_at in CTE
        "market_count_desc": "market_count DESC NULLS LAST",
    }
    order_clause = ORDER_MAP.get(sort, "total_volume DESC NULLS LAST")

    base_sql = _EVENTS_CTE

    # Count query
    count_sql = f"SELECT COUNT(*) FROM ({base_sql}) t {where_sql}"
    total = db.execute(text(count_sql), params).scalar() or 0

    # Data query
    offset = (page - 1) * page_size
    data_sql = f"""
        SELECT * FROM ({base_sql}) t
        {where_sql}
        ORDER BY {order_clause}
        LIMIT :limit OFFSET :offset
    """
    params["limit"] = page_size
    params["offset"] = offset

    rows = db.execute(text(data_sql), params).fetchall()

    events: List[EventSummary] = []
    platform_counts: Dict[str, int] = {"polymarket": 0, "kalshi": 0, "limitless": 0}

    for row in rows:
        ev = _build_event_summary(row)
        events.append(ev)
        if ev.platform in platform_counts:
            platform_counts[ev.platform] += 1

    total_pages = max(1, (total + page_size - 1) // page_size)

    return EventsListResponse(
        events=events,
        total=int(total),
        page=page,
        page_size=page_size,
        total_pages=total_pages,
        platform_counts=platform_counts,
    )


# =============================================================================
# EVENT DETAIL ENDPOINT
# =============================================================================

@router.get("/events/{platform}/{event_id:path}", response_model=EventDetailResponse)
async def get_event_detail(
    platform: str,
    event_id: str,
    db: Session = Depends(get_db),
):
    """Get all markets for a specific event + insights. Pure DB, no live API."""

    # Build WHERE clause per platform
    if platform == "polymarket":
        where_clause = "m.source = 'polymarket' AND m.extra_data->>'event_slug' = :event_id"
    elif platform == "kalshi":
        where_clause = "m.source = 'kalshi' AND m.extra_data->>'event_ticker' = :event_id"
    elif platform == "limitless":
        where_clause = "m.source = 'limitless' AND m.source_market_id = :event_id"
    else:
        where_clause = "FALSE"

    markets_sql = f"""
        SELECT
            m.source_market_id,
            m.title,
            m.category_name,
            m.image_url,
            m.yes_price,
            m.no_price,
            m.volume_total,
            m.volume_24h,
            m.volume_7d,
            m.end_date,
            m.status,
            m.source_url,
            m.slug,
            m.extra_data,
            g.price_change_pct_24h,
            g.price_change_24h,
            g.volume_change_pct_24h,
            g.trade_count_24h,
            g.unique_traders_24h
        FROM predictions_silver.markets m
        LEFT JOIN predictions_gold.market_detail_cache g
            ON g.source = m.source AND g.source_market_id = m.source_market_id
        WHERE m.is_active = TRUE
          AND {where_clause}
        ORDER BY COALESCE(m.volume_total, 0) DESC NULLS LAST
    """

    rows = db.execute(text(markets_sql), {"event_id": event_id}).fetchall()

    if not rows:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail=f"Event '{event_id}' not found on platform '{platform}'")

    markets: List[MarketInEvent] = []
    total_volume = 0.0
    volume_24h = 0.0
    event_image = None
    event_category = None

    for row in rows:
        yes_p = float(row.yes_price) if row.yes_price is not None else None
        no_p = float(row.no_price) if row.no_price is not None else (
            round(1 - yes_p, 4) if yes_p is not None else None
        )
        vol_tot = float(row.volume_total or 0)
        vol_24h = float(row.volume_24h or 0)
        total_volume += vol_tot
        volume_24h += vol_24h

        if not event_image and row.image_url:
            event_image = row.image_url
        if not event_category and row.category_name:
            event_category = row.category_name

        ann_roi = compute_ann_roi(yes_p, row.end_date)

        markets.append(MarketInEvent(
            market_id=row.source_market_id,
            title=row.title or "",
            yes_price=yes_p,
            no_price=no_p,
            volume_total=vol_tot,
            volume_24h=vol_24h,
            end_time=dt_to_ts(row.end_date),
            status=row.status or "open",
            source_url=row.source_url,
            image_url=row.image_url,
            category=row.category_name,
            price_change_pct_24h=float(row.price_change_pct_24h) if row.price_change_pct_24h is not None else None,
            price_change_24h=float(row.price_change_24h) if row.price_change_24h is not None else None,
            volume_change_pct_24h=float(row.volume_change_pct_24h) if row.volume_change_pct_24h is not None else None,
            trade_count_24h=int(row.trade_count_24h) if row.trade_count_24h is not None else None,
            unique_traders_24h=int(row.unique_traders_24h) if row.unique_traders_24h is not None else None,
            ann_roi=ann_roi,
        ))

    # Build event title
    if platform == "polymarket":
        event_title = slug_to_title(event_id)
    else:
        event_title = markets[0].title if markets else event_id

    # Build insights
    priced = [m for m in markets if m.yes_price is not None]
    prices = [m.yes_price for m in priced if m.yes_price]

    most_likely = None
    if priced:
        top = max(priced, key=lambda m: m.yes_price or 0)
        most_likely = {"market_id": top.market_id, "title": top.title, "yes_price": top.yes_price}

    highest_roi = None
    roi_markets = [m for m in markets if m.ann_roi is not None]
    if roi_markets:
        top_roi = max(roi_markets, key=lambda m: m.ann_roi or 0)
        highest_roi = {"market_id": top_roi.market_id, "title": top_roi.title, "ann_roi": top_roi.ann_roi, "yes_price": top_roi.yes_price}

    most_active = None
    active_markets = [m for m in markets if m.volume_24h and m.volume_24h > 0]
    if active_markets:
        top_act = max(active_markets, key=lambda m: m.volume_24h or 0)
        most_active = {"market_id": top_act.market_id, "title": top_act.title, "volume_24h": top_act.volume_24h}

    buckets = {"<20¢": 0, "20-40¢": 0, "40-60¢": 0, "60-80¢": 0, ">80¢": 0}
    for p in prices:
        pct = p * 100
        if pct < 20:
            buckets["<20¢"] += 1
        elif pct < 40:
            buckets["20-40¢"] += 1
        elif pct < 60:
            buckets["40-60¢"] += 1
        elif pct < 80:
            buckets["60-80¢"] += 1
        else:
            buckets[">80¢"] += 1

    avg_price = (sum(prices) / len(prices)) if prices else None

    insights = EventInsights(
        most_likely=most_likely,
        highest_roi=highest_roi,
        most_active=most_active,
        price_buckets=buckets,
        total_volume=total_volume,
        volume_24h=volume_24h,
        avg_yes_price=round(avg_price, 4) if avg_price else None,
        markets_with_price=len(priced),
    )

    # End time = earliest end across all markets
    end_times = [m.end_time for m in markets if m.end_time]
    earliest_end = min(end_times) if end_times else None

    return EventDetailResponse(
        platform=platform,
        event_id=event_id,
        title=event_title,
        image_url=event_image,
        category=event_category,
        market_count=len(markets),
        total_volume=total_volume,
        volume_24h=volume_24h,
        end_time=earliest_end,
        markets=markets,
        insights=insights,
    )
