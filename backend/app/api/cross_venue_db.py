"""
Cross-Venue endpoint - Hybrid live+DB approach.
  Kalshi:     live service cache (5-min fresh) → groups by event_ticker, live YES prices
  Polymarket: live Dome API markets fetch (5-min TTL) → groups by event_slug, live YES prices
Falls back to DB for both platforms when live cache is unavailable.
"""
from fastapi import APIRouter, Query, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import time
import logging
import calendar
import threading
from datetime import datetime

import httpx

from app.database.session import get_db

router = APIRouter()
logger = logging.getLogger(__name__)

# ── Polymarket live markets cache (separate from cross-venue result cache) ────
_poly_live: Dict[str, Any] = {
    "data": None,   # Dict[event_slug, List[raw_market_dict]]
    "ts": 0.0,
    "ttl": 300.0,   # 5 min — same as Kalshi service TTL
    "loading": False,
}

def _get_poly_live() -> Optional[Dict[str, List[Dict]]]:
    """Return live Polymarket per-market cache if fresh, else None."""
    now = time.time()
    if _poly_live["data"] and (now - _poly_live["ts"]) < _poly_live["ttl"]:
        return _poly_live["data"]
    return None

def _refresh_poly_live_bg():
    """Background thread: fetch all Polymarket open markets from Dome API."""
    if _poly_live["loading"]:
        return
    _poly_live["loading"] = True
    try:
        from app.config import settings
        api_key = getattr(settings, "DOME_API_KEY", "") or ""
        headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
        base = "https://api.domeapi.io"
        markets_by_slug: Dict[str, List[Dict]] = {}
        limit = 100
        offset = 0
        max_markets = 3000  # cap to avoid too-long fetch
        while offset < max_markets:
            resp = httpx.get(
                f"{base}/v1/polymarket/markets",
                params={"limit": limit, "offset": offset, "status": "open", "min_volume": 1000},
                headers=headers,
                timeout=20.0,
            )
            resp.raise_for_status()
            batch = resp.json().get("markets", [])
            if not batch:
                break
            for m in batch:
                slug = m.get("event_slug") or ""
                if not slug:
                    continue
                markets_by_slug.setdefault(slug, []).append(m)
            offset += limit
            if len(batch) < limit:
                break
        total_mkts = sum(len(v) for v in markets_by_slug.values())
        logger.info(f"Cross-venue: Poly live cache: {len(markets_by_slug)} events, {total_mkts} markets")
        _poly_live["data"] = markets_by_slug
        _poly_live["ts"] = time.time()
    except Exception as e:
        logger.warning(f"Cross-venue: Poly live fetch failed, using DB: {e}")
    finally:
        _poly_live["loading"] = False

def _ensure_poly_live():
    """Trigger background refresh if cache is stale."""
    if not _poly_live["data"] or (time.time() - _poly_live["ts"]) >= _poly_live["ttl"]:
        t = threading.Thread(target=_refresh_poly_live_bg, daemon=True)
        t.start()


# ── tiny in-memory cache (2 min TTL) ──────────────────────────────────────────
_cache: Dict[str, Any] = {"data": None, "ts": 0.0, "ttl": 120.0}


def _bust_cache() -> None:
    """Force re-matching on next request (call after config changes)."""
    _cache["data"] = None
    _cache["ts"] = 0.0

STOP_WORDS = {
    "will", "the", "a", "an", "be", "is", "are", "was", "were", "have",
    "has", "had", "do", "does", "did", "for", "of", "to", "in", "on",
    "at", "by", "from", "with", "this", "that", "it", "its", "what",
    "who", "how", "when", "where", "which", "than", "and", "or", "not",
    "before", "after", "during", "over", "above", "below", "between",
    "win", "won", "lose", "lost", "get", "got", "make", "made",
}

def _tokens(text_: str) -> set:
    """Extract meaningful word tokens for similarity."""
    words = text_.lower().replace("?", "").replace(",", "").split()
    return {w for w in words if len(w) >= 4 and w not in STOP_WORDS}

def _jaccard(a: set, b: set) -> float:
    if not a or not b:
        return 0.0
    inter = len(a & b)
    union = len(a | b)
    return inter / union if union else 0.0

def _slug_to_title(slug: str) -> str:
    if not slug:
        return "Unknown"
    UPPER = {"us", "uk", "eu", "fed", "btc", "eth", "ufc", "nba", "nfl",
             "mlb", "nhl", "pga", "gdp", "cpi", "epl", "mls", "ncaa"}
    LOW = {"a", "an", "the", "and", "or", "but", "in", "on", "at", "to",
           "for", "of", "vs", "by"}
    parts = slug.replace("-", " ").split()
    result = []
    for i, w in enumerate(parts):
        lw = w.lower()
        if lw in UPPER:
            result.append(lw.upper())
        elif i == 0 or lw not in LOW:
            result.append(w.capitalize())
        else:
            result.append(lw)
    return " ".join(result)

def _dt_to_ts(dt) -> Optional[int]:
    if dt is None:
        return None
    try:
        return int(calendar.timegm(dt.timetuple()))
    except Exception:
        return None


# ── Pydantic models ────────────────────────────────────────────────────────────
class DbMarket(BaseModel):
    market_id: str
    title: str
    yes_price: Optional[float] = None
    no_price: Optional[float] = None
    volume: float = 0.0
    url: Optional[str] = None

class DbPlatformEvent(BaseModel):
    event_id: str
    title: str
    url: str
    total_volume: float
    market_count: int
    end_date: Optional[int] = None
    category: Optional[str] = None
    image_url: Optional[str] = None
    markets: List[DbMarket] = []

class DbCrossVenueEvent(BaseModel):
    canonical_title: str
    similarity_score: float
    match_confidence: str
    polymarket: DbPlatformEvent
    kalshi: DbPlatformEvent
    total_volume: float
    volume_difference: float
    volume_ratio: float
    market_count_diff: int
    end_date_match: bool
    price_spread: Optional[float] = None  # avg abs YES price diff between matched markets

class DbCrossVenueStats(BaseModel):
    total_matches: int
    high_confidence: int
    medium_confidence: int
    avg_similarity: float
    total_volume: float
    polymarket_events: int
    kalshi_events: int
    query_ms: int

class DbCrossVenueResponse(BaseModel):
    events: List[DbCrossVenueEvent]
    stats: DbCrossVenueStats


# ── SQL to pull grouped events ─────────────────────────────────────────────────
_POLY_SQL = """
SELECT
    extra_data->>'event_slug'                                                        AS event_id,
    (array_agg(title         ORDER BY COALESCE(volume_total,0) DESC NULLS LAST))[1] AS title,
    (array_agg(image_url     ORDER BY COALESCE(volume_total,0) DESC NULLS LAST))[1] AS image_url,
    (array_agg(category_name ORDER BY COALESCE(volume_total,0) DESC NULLS LAST))[1] AS category,
    SUM(COALESCE(volume_total, 0))   AS total_volume,
    COUNT(*)                          AS market_count,
    MIN(end_date)                     AS earliest_end,
    json_agg(json_build_object(
        'market_id',  source_market_id,
        'title',      title,
        'yes_price',  yes_price,
        'no_price',   no_price,
        'volume',     COALESCE(volume_total, 0)
    ) ORDER BY COALESCE(volume_total,0) DESC NULLS LAST) AS markets
FROM predictions_silver.markets
WHERE is_active = TRUE
  AND source = 'polymarket'
  AND extra_data->>'event_slug' IS NOT NULL
GROUP BY extra_data->>'event_slug'
ORDER BY total_volume DESC NULLS LAST
LIMIT 200
"""

_KALSHI_SQL = """
SELECT
    extra_data->>'event_ticker'                                                      AS event_id,
    (array_agg(title         ORDER BY COALESCE(volume_total,0) DESC NULLS LAST))[1] AS title,
    NULL::text                                                                        AS image_url,
    (array_agg(category_name ORDER BY COALESCE(volume_total,0) DESC NULLS LAST))[1] AS category,
    SUM(COALESCE(volume_total, 0))   AS total_volume,
    COUNT(*)                          AS market_count,
    MIN(end_date)                     AS earliest_end,
    json_agg(json_build_object(
        'market_id',  source_market_id,
        'title',      title,
        'yes_price',  yes_price,
        'no_price',   no_price,
        'volume',     COALESCE(volume_total, 0)
    ) ORDER BY COALESCE(volume_total,0) DESC NULLS LAST) AS markets
FROM predictions_silver.markets
WHERE is_active = TRUE
  AND source = 'kalshi'
  AND extra_data->>'event_ticker' IS NOT NULL
GROUP BY extra_data->>'event_ticker'
ORDER BY total_volume DESC NULLS LAST
LIMIT 300
"""


def _build_kalshi_from_live() -> Optional[List[tuple]]:
    """
    Build Kalshi (DbPlatformEvent, tokens) tuples directly from the Kalshi
    service's in-memory market cache (refreshed every 5 minutes).
    Returns None if the live cache is empty or unavailable, so callers can
    fall back to the DB query.
    """
    try:
        from app.services.kalshi_service import get_kalshi_client
        client = get_kalshi_client()
        # The full-fetch cache key populated on startup / background refresh
        raw_markets = client._cache.get("kalshi_markets_open_full")
        if not raw_markets:
            return None

        # Group individual markets by event_ticker
        groups: Dict[str, List[Dict[str, Any]]] = {}
        for m in raw_markets:
            ticker = (m.get("event_ticker") or "").upper()
            if not ticker:
                continue
            groups.setdefault(ticker, []).append(m)

        result: List[tuple] = []
        for ticker, raw_list in groups.items():
            # Sort by volume descending (highest-volume market first)
            raw_list.sort(key=lambda m: m.get("volume", 0) or 0, reverse=True)

            markets: List[DbMarket] = []
            total_volume = 0.0
            for m in raw_list[:20]:
                title = m.get("title", "")
                # Replicate Kalshi service price logic
                yes_bid  = m.get("yes_bid")
                yes_ask  = m.get("yes_ask")
                last_prc = m.get("last_price")
                yes_p    = m.get("yes_price")   # some API versions return direct price
                if yes_bid is not None and yes_ask is not None:
                    yes_price = ((yes_bid + yes_ask) / 2.0) / 100.0
                elif yes_ask is not None:
                    yes_price = yes_ask / 100.0
                elif yes_bid is not None:
                    yes_price = yes_bid / 100.0
                elif last_prc is not None:
                    yes_price = last_prc / 100.0
                elif yes_p is not None:
                    # Direct yes_price field — scale depends on API version
                    yes_price = yes_p if yes_p <= 1.0 else yes_p / 100.0
                else:
                    yes_price = None
                no_price = (1.0 - yes_price) if yes_price is not None else None
                vol = float(m.get("volume", 0) or 0)
                total_volume += vol
                mkt_ticker = m.get("market_ticker", "")
                markets.append(DbMarket(
                    market_id=mkt_ticker,
                    title=title,
                    yes_price=yes_price,
                    no_price=no_price,
                    volume=vol,
                    url=f"https://kalshi.com/markets/{mkt_ticker.lower()}",
                ))

            if not markets:
                continue

            # Tokens: all market titles (no event-level ticker text needed
            # because market titles already contain the full question text)
            all_text = " ".join(m.title for m in markets)
            tokens = _tokens(all_text)

            ev = DbPlatformEvent(
                event_id=ticker,
                title=raw_list[0].get("title", ticker),
                url=f"https://kalshi.com/markets/{ticker.lower()}",
                total_volume=total_volume,
                market_count=len(markets),
                end_date=None,
                category=None,
                image_url=None,
                markets=markets,
            )
            result.append((ev, tokens))

        result.sort(key=lambda x: x[0].total_volume, reverse=True)
        # Log top prices for debugging
        sample = [(ev.event_id, ev.markets[0].yes_price if ev.markets else None) for ev, _ in result[:5]]
        logger.info(f"Cross-venue: built {len(result)} Kalshi events from LIVE cache. Top5: {sample}")
        return result
    except Exception as e:
        logger.warning(f"Cross-venue: live Kalshi cache unavailable, falling back to DB: {e}")
        return None


def _build_platform_event(row, platform: str) -> tuple:
    """Returns (DbPlatformEvent, title_tokens_set)."""
    eid = row.event_id or ""
    title = _slug_to_title(eid) if platform == "polymarket" else (row.title or eid)

    import json as _json
    raw_markets = row.markets if isinstance(row.markets, list) else _json.loads(row.markets or "[]")

    # Generate tokens from event title + ALL market titles.
    # This is critical for Kalshi: event tickers like "kxfedchairnom" produce a
    # top-market title of "Kevin Warsh" (tokens: {kevin,warsh}) which never
    # matches Polymarket's slug "who-will-trump-nominate-as-fed-chair" (tokens:
    # {trump,nominate,chair}).  By including all nominee market titles we get
    # overlapping tokens (e.g. "Donald Trump" nominee → {trump}) that allow the
    # correct Kalshi event to score above wrong question-format events.
    all_text = title + " " + " ".join(m.get("title", "") for m in raw_markets[:20])
    tokens = _tokens(all_text)
    markets = []
    for m in raw_markets[:20]:   # cap per event
        yp = float(m["yes_price"]) if m.get("yes_price") is not None else None
        np_ = float(m["no_price"]) if m.get("no_price") is not None else None
        mid = m.get("market_id", "")
        if platform == "polymarket":
            url = f"https://polymarket.com/event/{eid}"
        elif platform == "kalshi":
            url = f"https://kalshi.com/markets/{mid.lower()}"
        else:
            url = ""
        markets.append(DbMarket(
            market_id=mid,
            title=m.get("title", ""),
            yes_price=yp,
            no_price=np_,
            volume=float(m.get("volume", 0)),
            url=url,
        ))

    ev_url = (
        f"https://polymarket.com/event/{eid}" if platform == "polymarket"
        else f"https://kalshi.com/markets/{eid.lower()}"
    )
    ev = DbPlatformEvent(
        event_id=eid,
        title=title,
        url=ev_url,
        total_volume=float(row.total_volume or 0),
        market_count=int(row.market_count or 1),
        end_date=_dt_to_ts(row.earliest_end),
        category=(row.category or "").strip() or None,
        image_url=row.image_url,
        markets=markets,
    )
    return ev, tokens


def _price_spread(poly_mkts: List[DbMarket], kalshi_mkts: List[DbMarket]) -> Optional[float]:
    """Average absolute YES price difference across matched markets."""
    poly_prices = [m.yes_price for m in poly_mkts if m.yes_price is not None]
    kalshi_prices = [m.yes_price for m in kalshi_mkts if m.yes_price is not None]
    if not poly_prices or not kalshi_prices:
        return None
    avg_poly = sum(poly_prices) / len(poly_prices)
    avg_kalshi = sum(kalshi_prices) / len(kalshi_prices)
    return round(abs(avg_poly - avg_kalshi), 4)


@router.get("/cross-venue-events-db/refresh")
def bust_cross_venue_cache():
    """Force rebuild of the cross-venue cache on next request."""
    _bust_cache()
    return {"status": "ok", "message": "Cross-venue cache cleared — next request will rebuild"}


@router.get("/cross-venue-events-db", response_model=DbCrossVenueResponse)
def get_cross_venue_events_db(
    min_similarity: float = Query(0.15, ge=0.05, le=1.0),
    min_volume: float = Query(0, ge=0),
    limit: int = Query(60, ge=5, le=200),
    search: Optional[str] = Query(None),
    force: bool = Query(False, description="Force cache rebuild"),
    db: Session = Depends(get_db),
):
    """
    Pure DB cross-venue matching. No live API calls.
    Groups silver.markets by event_slug / event_ticker, matches by keyword Jaccard similarity.
    """
    t0 = time.time()

    # Kick off background Polymarket live fetch (non-blocking)
    _ensure_poly_live()

    # ── Serve from cache ──────────────────────────────────────────────────────
    now = time.time()
    if not force and _cache["data"] and (now - _cache["ts"]) < _cache["ttl"]:
        logger.info("Cross-venue DB: cache hit")
        all_matches: List[DbCrossVenueEvent] = _cache["data"]
    else:
        # ── Fetch from DB ─────────────────────────────────────────────────────
        poly_rows  = db.execute(text(_POLY_SQL)).fetchall()
        kalshi_rows = db.execute(text(_KALSHI_SQL)).fetchall()
        logger.info(f"Cross-venue DB: {len(poly_rows)} poly events, {len(kalshi_rows)} kalshi events")

        # ── Build structures ──────────────────────────────────────────────────
        live_poly = _get_poly_live()  # May be None on first request (populates in background)

        def _build_poly_event(r) -> tuple:
            """Build Polymarket event, overlaying live per-market prices when available."""
            ev, tokens = _build_platform_event(r, "polymarket")
            if live_poly and ev.event_id in live_poly:
                live_mkts = live_poly[ev.event_id]
                # Build a lookup: lowercased title → live price
                live_by_slug: Dict[str, float] = {}
                for lm in live_mkts:
                    slug = (lm.get("slug") or lm.get("question") or lm.get("title") or "").lower()
                    if slug:
                        # Try outcomes (Poly v2) or direct yes_price
                        outcomes = lm.get("outcomes", [])
                        yp = None
                        for o in outcomes:
                            if o.get("id") == "0" or str(o.get("name", "")).lower() == "yes":
                                yp = o.get("price")
                                break
                        if yp is None:
                            yp = lm.get("yes_price")
                        if yp is not None:
                            live_by_slug[slug] = float(yp)
                # Patch each DB market with live price
                for m in ev.markets:
                    key = m.title.lower()
                    if key in live_by_slug:
                        m.yes_price = live_by_slug[key]
                        m.no_price = 1.0 - m.yes_price
            return ev, tokens

        poly_events: List[tuple] = [_build_poly_event(r) for r in poly_rows]

        # Prefer live Kalshi service cache (5-min fresh) over stale DB rows
        kalshi_events: List[tuple] = (
            _build_kalshi_from_live()
            or [_build_platform_event(r, "kalshi") for r in kalshi_rows]
        )

        # ── Match ─────────────────────────────────────────────────────────────
        # Index kalshi by each of its tokens for fast lookup
        from collections import defaultdict
        kalshi_index: Dict[str, List[int]] = defaultdict(list)
        for i, (_, ktokens) in enumerate(kalshi_events):
            for t in ktokens:
                kalshi_index[t].append(i)

        matched_kalshi: set = set()
        all_matches = []

        for pe, ptokens in poly_events:
            # Candidate kalshi events
            candidate_idx: Dict[int, int] = {}
            for tok in ptokens:
                for ki in kalshi_index.get(tok, []):
                    if ki not in matched_kalshi:
                        candidate_idx[ki] = candidate_idx.get(ki, 0) + 1

            # Score candidates (only those with >=2 shared tokens are worth checking)
            best_sim = 0.0
            best_ki  = -1
            for ki, shared in candidate_idx.items():
                if shared < 2:
                    continue
                ke, ktokens_ = kalshi_events[ki]
                sim = _jaccard(ptokens, ktokens_)
                if sim > best_sim:
                    best_sim = sim
                    best_ki  = ki

            if best_ki < 0 or best_sim < 0.05:
                continue

            ke, _ = kalshi_events[best_ki]
            matched_kalshi.add(best_ki)

            confidence = "high" if best_sim >= 0.55 else "medium" if best_sim >= 0.28 else "low"

            total_vol = pe.total_volume + ke.total_volume
            vol_diff  = abs(pe.total_volume - ke.total_volume)
            vol_ratio = (
                max(pe.total_volume, ke.total_volume) /
                max(min(pe.total_volume, ke.total_volume), 1)
            )
            mkts_diff = abs(pe.market_count - ke.market_count)

            end_match = False
            if pe.end_date and ke.end_date:
                end_match = abs(pe.end_date - ke.end_date) < 30 * 86400

            canonical = pe.title if len(pe.title) >= len(ke.title) else ke.title

            all_matches.append(DbCrossVenueEvent(
                canonical_title=canonical,
                similarity_score=round(best_sim, 3),
                match_confidence=confidence,
                polymarket=pe,
                kalshi=ke,
                total_volume=total_vol,
                volume_difference=vol_diff,
                volume_ratio=round(vol_ratio, 2),
                market_count_diff=mkts_diff,
                end_date_match=end_match,
                price_spread=_price_spread(pe.markets, ke.markets),
            ))

        # Sort by total_volume desc
        all_matches.sort(key=lambda x: x.total_volume, reverse=True)
        _cache["data"] = all_matches
        _cache["ts"]   = time.time()
        logger.info(f"Cross-venue DB: matched {len(all_matches)} events in {time.time()-t0:.2f}s")

    # ── Filter ────────────────────────────────────────────────────────────────
    filtered = [
        e for e in all_matches
        if e.similarity_score >= min_similarity
        and e.total_volume >= min_volume
        and (
            not search
            or search.lower() in e.canonical_title.lower()
            or search.lower() in e.polymarket.title.lower()
            or search.lower() in e.kalshi.title.lower()
            or (e.polymarket.category or "").lower().find(search.lower()) >= 0
        )
    ][:limit]

    stats = DbCrossVenueStats(
        total_matches=len(filtered),
        high_confidence=sum(1 for e in filtered if e.match_confidence == "high"),
        medium_confidence=sum(1 for e in filtered if e.match_confidence == "medium"),
        avg_similarity=round(sum(e.similarity_score for e in filtered) / len(filtered), 3) if filtered else 0,
        total_volume=sum(e.total_volume for e in filtered),
        polymarket_events=len(all_matches),
        kalshi_events=len([e for e in all_matches]),
        query_ms=int((time.time() - t0) * 1000),
    )
    return DbCrossVenueResponse(events=filtered, stats=stats)
