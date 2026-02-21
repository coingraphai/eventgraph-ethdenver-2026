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


def _kalshi_event_title(titles: list, top_title: str) -> tuple:
    """
    Derive (event_title, top_candidate_name) from Kalshi multi-outcome market titles.

    E.g. titles = ["Will Trump nominate Kevin Hassett as Fed Chair?",
                   "Will Trump nominate Kevin Warsh as Fed Chair?"]
    Returns ("Who will Trump nominate as Fed Chair?", "Kevin Hassett")
    """
    clean = [t.strip() for t in titles if t and t.strip()]
    if len(clean) <= 1:
        return (clean[0] if clean else top_title, "")

    split = [t.split() for t in clean]
    min_len = min(len(s) for s in split)

    # Longest common prefix (word-level, ignore trailing punctuation)
    prefix_len = 0
    for i in range(min_len):
        if len({s[i].rstrip("?,.") for s in split}) == 1:
            prefix_len += 1
        else:
            break

    # Longest common suffix (word-level)
    rev = [list(reversed(s)) for s in split]
    suffix_len = 0
    for i in range(min_len - prefix_len):
        if len({s[i].rstrip("?,.") for s in rev}) == 1:
            suffix_len += 1
        else:
            break

    prefix_words = split[0][:prefix_len]
    suffix_words = list(reversed(rev[0][:suffix_len]))

    # Drop trailing articles/particles from prefix that precede the variable
    # e.g. "Will the [TEAM] win..." → prefix="Will the" → drop "the"
    _articles = {"the", "a", "an"}
    while prefix_words and prefix_words[-1].lower() in _articles:
        prefix_len -= 1
        prefix_words = prefix_words[:-1]

    # Re-extract candidate with corrected prefix_len
    top_split = (top_title or clean[0]).split()
    cand_end = len(top_split) - suffix_len if suffix_len > 0 else len(top_split)
    candidate = " ".join(top_split[prefix_len:cand_end]).strip("?,. ")
    # Strip leading articles from the candidate name itself
    # e.g. "the Tampa Bay" → "Tampa Bay"
    cand_words = candidate.split()
    while cand_words and cand_words[0].lower() in _articles:
        cand_words = cand_words[1:]
    candidate = " ".join(cand_words)

    if len(prefix_words) + len(suffix_words) < 2:
        return (clean[0], candidate)

    # Build event title: "Will X..." → "Who will X...?"
    if prefix_words and prefix_words[0].lower() == "will":
        event_title = "Who will " + " ".join(prefix_words[1:] + suffix_words)
    else:
        event_title = " ".join(prefix_words + suffix_words)

    event_title = event_title.strip()
    if not event_title.endswith("?"):
        event_title += "?"

    return (event_title, candidate)


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
    volume_7d: float = 0.0
    trades_24h: int = 0
    unique_traders: int = 0
    liquidity: float = 0.0
    daily_avg: float = 0.0          # average daily volume
    start_time: Optional[int] = None  # unix timestamp
    end_time: Optional[int] = None  # unix timestamp
    status: str = "active"          # active | closed | resolved | paused
    source_url: Optional[str] = None
    top_yes_price: Optional[float] = None  # YES price of highest-probability market
    top_no_price: Optional[float] = None   # NO price of highest-probability market
    top_prob_title: Optional[str] = None   # title of highest-probability market
    last_activity: Optional[int] = None  # unix timestamp of last trade
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
        (array_agg(title       ORDER BY COALESCE(yes_price,0) DESC NULLS LAST))[1]    AS sample_title,
        (array_agg(image_url   ORDER BY COALESCE(volume_total,0) DESC NULLS LAST))[1] AS image_url,
        (array_agg(category_name ORDER BY COALESCE(volume_total,0) DESC NULLS LAST))[1] AS category,
        SUM(COALESCE(volume_total, 0))                                                 AS total_volume,
        SUM(COALESCE(volume_24h,   0))                                                 AS total_volume_24h,
        SUM(COALESCE(volume_7d,    0))                                                 AS total_volume_7d,
        SUM(COALESCE(trade_count_24h, 0))                                              AS total_trades_24h,
        SUM(COALESCE(unique_traders, 0))                                               AS total_unique_traders,
        SUM(COALESCE(liquidity, 0))                                                    AS total_liquidity,
        COUNT(*)                                                                        AS market_count,
        MIN(end_date)                                                                   AS earliest_end,
        MAX(last_trade_at)                                                             AS last_activity,
        array_agg(title ORDER BY COALESCE(volume_total,0) DESC NULLS LAST)             AS all_titles,
        MIN(start_date)                                                                AS earliest_start,
        (array_agg(status     ORDER BY COALESCE(volume_total,0) DESC NULLS LAST))[1]  AS event_status,
        (array_agg(source_url ORDER BY COALESCE(volume_total,0) DESC NULLS LAST))[1]  AS event_source_url,
        (array_agg(yes_price  ORDER BY COALESCE(yes_price,0) DESC NULLS LAST))[1]     AS top_yes_price,
        (array_agg(no_price   ORDER BY COALESCE(yes_price,0) DESC NULLS LAST))[1]     AS top_no_price,
        (array_agg(title      ORDER BY COALESCE(yes_price,0) DESC NULLS LAST))[1]     AS top_prob_title
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
        (array_agg(title       ORDER BY COALESCE(yes_price,0) DESC NULLS LAST))[1]    AS sample_title,
        NULL::text                                                                     AS image_url,
        (array_agg(category_name ORDER BY COALESCE(volume_total,0) DESC NULLS LAST))[1] AS category,
        SUM(COALESCE(volume_total, 0))                                                 AS total_volume,
        SUM(COALESCE(volume_24h,   0))                                                 AS total_volume_24h,
        SUM(COALESCE(volume_7d,    0))                                                 AS total_volume_7d,
        SUM(COALESCE(trade_count_24h, 0))                                              AS total_trades_24h,
        SUM(COALESCE(unique_traders, 0))                                               AS total_unique_traders,
        SUM(COALESCE(liquidity, 0))                                                    AS total_liquidity,
        COUNT(*)                                                                        AS market_count,
        MIN(end_date)                                                                   AS earliest_end,
        MAX(last_trade_at)                                                             AS last_activity,
        array_agg(title ORDER BY COALESCE(volume_total,0) DESC NULLS LAST)             AS all_titles,
        MIN(start_date)                                                                AS earliest_start,
        (array_agg(status     ORDER BY COALESCE(volume_total,0) DESC NULLS LAST))[1]  AS event_status,
        (array_agg(source_url ORDER BY COALESCE(volume_total,0) DESC NULLS LAST))[1]  AS event_source_url,
        (array_agg(yes_price  ORDER BY COALESCE(yes_price,0) DESC NULLS LAST))[1]     AS top_yes_price,
        (array_agg(no_price   ORDER BY COALESCE(yes_price,0) DESC NULLS LAST))[1]     AS top_no_price,
        (array_agg(title      ORDER BY COALESCE(yes_price,0) DESC NULLS LAST))[1]     AS top_prob_title
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
        COALESCE(volume_7d,    0)          AS total_volume_7d,
        COALESCE(trade_count_24h, 0)       AS total_trades_24h,
        COALESCE(unique_traders, 0)        AS total_unique_traders,
        COALESCE(liquidity, 0)             AS total_liquidity,
        1::bigint                          AS market_count,
        end_date                           AS earliest_end,
        last_trade_at                      AS last_activity,
        ARRAY[title]                       AS all_titles,
        start_date                         AS earliest_start,
        status                             AS event_status,
        source_url                         AS event_source_url,
        yes_price                          AS top_yes_price,
        no_price                           AS top_no_price,
        title                              AS top_prob_title
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
    top_candidate = ""  # used for Kalshi multi-outcome subtitle
    if platform == "polymarket":
        title = slug_to_title(event_id)
    elif platform == "kalshi" and int(row.market_count or 1) > 1:
        # Multi-outcome: derive event question and extract top candidate name
        all_t = row.all_titles or []
        raw_top = (row.top_prob_title or row.sample_title or "").strip()
        derived_title, top_candidate = _kalshi_event_title(all_t, raw_top)
        title = derived_title or (row.sample_title or "").strip()
    else:
        title = (row.sample_title or "").strip()

    category = (row.category or "").strip() or None
    total_vol = float(row.total_volume or 0)
    vol_24h_raw = float(row.total_volume_24h or 0)
    vol_7d_raw = float(row.total_volume_7d or 0) if hasattr(row, 'total_volume_7d') else 0.0
    trades_24h = int(row.total_trades_24h or 0) if hasattr(row, 'total_trades_24h') else 0
    unique_traders = int(row.total_unique_traders or 0) if hasattr(row, 'total_unique_traders') else 0
    liquidity = float(row.total_liquidity or 0) if hasattr(row, 'total_liquidity') else 0.0
    market_count = int(row.market_count or 1)
    end_ts = dt_to_ts(row.earliest_end)
    last_activity_ts = dt_to_ts(row.last_activity) if hasattr(row, 'last_activity') else None

    # Cross-calculate missing volume metrics
    # Polymarket: has 7d volume, estimate 24h as 7d/7
    # Kalshi: has 24h volume, estimate 7d as 24h*7
    if platform == "polymarket":
        vol_7d = vol_7d_raw
        vol_24h = vol_24h_raw if vol_24h_raw > 0 else (vol_7d_raw / 7 if vol_7d_raw > 0 else 0)
    elif platform == "kalshi":
        vol_24h = vol_24h_raw
        vol_7d = vol_7d_raw if vol_7d_raw > 0 else (vol_24h_raw * 7 if vol_24h_raw > 0 else 0)
    else:  # limitless
        vol_24h = vol_24h_raw
        vol_7d = vol_7d_raw

    # Daily average: prefer 7d/7, fallback to 24h, fallback to total/90
    if vol_7d > 0:
        daily_avg = vol_7d / 7
    elif vol_24h > 0:
        daily_avg = vol_24h
    elif total_vol > 0:
        daily_avg = total_vol / 90  # rough estimate
    else:
        daily_avg = 0.0

    start_ts = dt_to_ts(row.earliest_start) if hasattr(row, 'earliest_start') else None
    event_status = ((row.event_status or "active").strip().lower()) if hasattr(row, 'event_status') else "active"
    top_yes_price = float(row.top_yes_price) if hasattr(row, 'top_yes_price') and row.top_yes_price is not None else None
    top_no_price  = float(row.top_no_price)  if hasattr(row, 'top_no_price')  and row.top_no_price  is not None else None
    top_prob_title = (row.top_prob_title or "").strip() or None if hasattr(row, 'top_prob_title') else None
    # For Kalshi multi-outcome events, use the extracted candidate name as subtitle
    if platform == "kalshi" and int(row.market_count or 1) > 1 and top_candidate:
        top_prob_title = top_candidate
    # Build event-level URL
    if platform == "polymarket":
        event_source_url = f"https://polymarket.com/event/{event_id}"
    elif platform == "kalshi":
        # Use the stored source_url of the highest-volume market — this is a
        # valid Kalshi URL (e.g. https://kalshi.com/markets/KXFEDCHAIRNOM-29-KH).
        # The event-ticker-only URL (/markets/KXSB-26) is invalid for multi-market
        # events because Kalshi's router needs the full 3-part path which requires
        # a series slug we don't have in the DB.
        db_url = (row.event_source_url or None) if hasattr(row, 'event_source_url') else None
        if db_url:
            event_source_url = db_url  # already valid
        elif event_id:
            event_source_url = f"https://kalshi.com/markets/{event_id}"
        else:
            event_source_url = None
    else:
        event_source_url = (row.event_source_url or None) if hasattr(row, 'event_source_url') else None

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
        volume_7d=vol_7d,
        trades_24h=trades_24h,
        unique_traders=unique_traders,
        liquidity=liquidity,
        daily_avg=daily_avg,
        start_time=start_ts,
        end_time=end_ts,
        status=event_status,
        source_url=event_source_url,
        top_yes_price=top_yes_price,
        top_no_price=top_no_price,
        top_prob_title=top_prob_title,
        last_activity=last_activity_ts,
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

    for row in rows:
        ev = _build_event_summary(row)
        events.append(ev)

    # Get total platform counts (unfiltered) - this shows ALL events per platform
    platform_counts_sql = f"""
        SELECT platform, COUNT(*) as cnt
        FROM ({base_sql}) t
        GROUP BY platform
    """
    platform_rows = db.execute(text(platform_counts_sql)).fetchall()
    platform_counts: Dict[str, int] = {"polymarket": 0, "kalshi": 0, "limitless": 0}
    for prow in platform_rows:
        if prow.platform in platform_counts:
            platform_counts[prow.platform] = int(prow.cnt)

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
