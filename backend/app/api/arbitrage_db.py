"""
Arbitrage DB endpoint — Pure database, zero live API calls.

Fetches predictions_silver.markets for both Polymarket and Kalshi,
matches individual markets by title similarity (same algorithm as arbitrage.py),
finds YES-price spreads and returns them as arbitrage opportunities.

Endpoint: GET /api/arbitrage/opportunities-db
Cache: 2 minutes in-memory
Response: identical schema to /api/arbitrage/opportunities
"""

from fastapi import APIRouter, Query, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Dict, Any, Optional
import time
import logging
import math
from collections import defaultdict

from app.database.session import get_db
from app.api.arbitrage import (
    ArbitrageOpportunity,
    ArbitrageStats,
    ArbitrageResponse,
    calculate_similarity,
    _extract_entities,
    _extract_subject_entities,
)
import re

router = APIRouter()
logger = logging.getLogger(__name__)


# ── Post-match validation: catch semantic mismatches the title-matching misses ──
_DOLLAR_RE = re.compile(r'\$[\d,]+(?:\.\d+)?[kKmMbB]?')
_NUMBER_RE = re.compile(r'\b\d[\d,]*(?:\.\d+)?\b')

def _titles_are_semantically_same(title1: str, title2: str) -> bool:
    """
    Extra validation after title matching.
    Returns False if the two titles are about fundamentally different things
    despite sharing keywords (e.g. Bitcoin $75K vs Bitcoin $150K).
    """
    t1 = title1.lower()
    t2 = title2.lower()

    # 1) Dollar amount mismatch: "$75,000" vs "$150,000" = different market
    dollars1 = set(_DOLLAR_RE.findall(t1))
    dollars2 = set(_DOLLAR_RE.findall(t2))
    if dollars1 and dollars2 and not dollars1 & dollars2:
        return False

    # 2) Different sport: NBA vs NFL, MLB vs NHL, etc.
    sports = [("nba", "nfl"), ("nba", "mlb"), ("nba", "nhl"),
              ("nfl", "mlb"), ("nfl", "nhl"), ("mlb", "nhl"),
              ("premier league", "champions league"),
              ("world cup", "premier league")]
    for s1, s2 in sports:
        if (s1 in t1 and s2 in t2) or (s2 in t1 and s1 in t2):
            return False

    # 3) "Pro Football" (NFL) vs "Pro Basketball" (NBA) — Kalshi naming
    #    But DON'T reject when one says "NBA" and other says "Pro Basketball"
    #    (those are the SAME sport, just different naming conventions)
    has_football_1 = "football" in t1 or "nfl" in t1 or "pro football" in t1
    has_football_2 = "football" in t2 or "nfl" in t2 or "pro football" in t2
    has_basketball_1 = "basketball" in t1 or "nba" in t1 or "pro basketball" in t1
    has_basketball_2 = "basketball" in t2 or "nba" in t2 or "pro basketball" in t2
    if has_football_1 and has_basketball_2 and not has_football_2:
        return False
    if has_football_2 and has_basketball_1 and not has_football_1:
        return False

    # 4) Completely different question topic despite shared entity
    #    e.g. "Will bitcoin hit $1m before GTA VI?" vs "What will the price of GTA VI be?"
    #    One is about Bitcoin, the other about a game price
    if ("bitcoin" in t1 or "btc" in t1) and ("bitcoin" not in t2 and "btc" not in t2):
        return False
    if ("bitcoin" in t2 or "btc" in t2) and ("bitcoin" not in t1 and "btc" not in t1):
        return False

    # 5) "recession" ≠ "downturn" ≠ "crash" — these are related but different markets
    #    Only flag when one title has a specific topic and the other doesn't
    if ("recession" in t1) != ("recession" in t2):
        if ("downturn" in t1) != ("downturn" in t2):
            return False

    # 6) Different years (e.g. 2025 vs 2026 vs 2028)
    years1 = set(re.findall(r'\b20[2-3]\d\b', t1))
    years2 = set(re.findall(r'\b20[2-3]\d\b', t2))
    if years1 and years2 and not years1 & years2:
        # Different years and no overlap — likely different markets
        # Exception: "2025-26" season format where one title might say 2025 and other 2026
        combined = years1 | years2
        if not any(abs(int(a) - int(b)) <= 1 for a in years1 for b in years2):
            return False

    return True

# ── 2-minute in-memory cache ───────────────────────────────────────────────────
_cache: Dict[str, Any] = {"data": None, "ts": 0.0, "ttl": 120.0}

# ── SQL queries ────────────────────────────────────────────────────────────────
_POLY_SQL = """
SELECT
    source_market_id   AS market_id,
    title,
    yes_price,
    no_price,
    COALESCE(volume_total, 0) AS volume
FROM predictions_silver.markets
WHERE is_active = TRUE
  AND source = 'polymarket'
  AND yes_price IS NOT NULL
  AND yes_price > 0.01
  AND yes_price < 0.99
ORDER BY COALESCE(volume_total, 0) DESC NULLS LAST
LIMIT 1000
"""

_KALSHI_SQL = """
SELECT
    source_market_id   AS market_id,
    title,
    yes_price,
    no_price,
    COALESCE(volume_total, 0) AS volume
FROM predictions_silver.markets
WHERE is_active = TRUE
  AND source = 'kalshi'
  AND yes_price IS NOT NULL
  AND yes_price > 0.01
  AND yes_price < 0.99
ORDER BY COALESCE(volume_total, 0) DESC NULLS LAST
LIMIT 1000
"""

_PLATFORM_LABELS = {"poly": "Polymarket", "kalshi": "Kalshi"}


def _build_opportunity(pm: Dict, km: Dict, sim: float, idx: int) -> Optional[ArbitrageOpportunity]:
    """Build an ArbitrageOpportunity from a matched poly/kalshi pair."""
    poly_price   = pm["price"]
    kalshi_price = km["price"]

    if not poly_price or not kalshi_price:
        return None
    if not (0 < poly_price < 1 and 0 < kalshi_price < 1):
        return None

    prices  = {"poly": poly_price, "kalshi": kalshi_price}
    volumes = {"poly": pm["volume"], "kalshi": km["volume"]}

    sorted_prices        = sorted(prices.items(), key=lambda x: x[1])
    best_buy_platform,  best_buy_price  = sorted_prices[0]
    best_sell_platform, best_sell_price = sorted_prices[-1]

    spread         = best_sell_price - best_buy_price
    spread_percent = (spread / best_buy_price * 100) if best_buy_price > 0 else 0

    # ── Filter out noise & invalid opportunities ────────────────────────────
    # 1) Data-error outliers (>80% spread is almost certainly stale data)
    if spread_percent > 80:
        return None
    # 2) Minimum absolute spread: 2¢. Anything smaller is tick noise,
    #    especially given Kalshi's 1¢ increment vs Poly's fractional cents.
    if spread < 0.02:
        return None
    # 3) Minimum volume: at least $1,000 on each side to be tradeable
    min_volume = min(volumes.values())
    if min_volume < 1_000:
        return None

    profit_potential = spread * min(min_volume * 0.02, 5_000)

    # ── Feasibility ──────────────────────────────────────────────────────────
    vol_score     = min(100, max(0, math.log10(max(min_volume, 1)) * 20))
    balance_score = (min_volume / max(volumes.values())) * 100 if max(volumes.values()) > 0 else 0
    if spread_percent <= 2:
        spread_score = 40
    elif spread_percent <= 10:
        spread_score = 100
    elif spread_percent <= 25:
        spread_score = 70
    elif spread_percent <= 50:
        spread_score = 30
    else:
        spread_score = 10
    feasibility_score = round((vol_score * 0.45) + (balance_score * 0.25) + (spread_score * 0.30), 1)
    feasibility_label = (
        "excellent" if feasibility_score >= 70
        else "good"   if feasibility_score >= 50
        else "fair"   if feasibility_score >= 30
        else "poor"
    )

    if min_volume > 100_000:
        estimated_slippage = 0.5
    elif min_volume > 50_000:
        estimated_slippage = 1.0
    elif min_volume > 10_000:
        estimated_slippage = 2.0
    elif min_volume > 5_000:
        estimated_slippage = 3.5
    else:
        estimated_slippage = 5.0

    # ── Confidence ───────────────────────────────────────────────────────────
    # Real arbitrage opportunities are small, persistent spreads on liquid markets.
    # Large spreads (>25%) almost always mean stale data or mismatched markets.
    if spread_percent <= 10 and min_volume > 50_000:
        confidence = "high"
    elif spread_percent <= 20 and min_volume > 10_000:
        confidence = "medium"
    else:
        confidence = "low"

    # ── Strategy text ─────────────────────────────────────────────────────────
    buy_label   = _PLATFORM_LABELS.get(best_buy_platform,  best_buy_platform)
    sell_label  = _PLATFORM_LABELS.get(best_sell_platform, best_sell_platform)
    buy_cents   = best_buy_price  * 100
    sell_cents  = best_sell_price * 100
    sell_no_cents = (1 - best_sell_price) * 100
    spread_cents = spread * 100
    total_cost_cents = buy_cents + sell_no_cents

    strategy_summary = (
        f"BUY YES on {buy_label} at {buy_cents:.1f}¢ + "
        f"BUY NO on {sell_label} at {sell_no_cents:.1f}¢ → "
        f"Lock in {spread_cents:.1f}¢ profit per share"
    )
    strategy_steps = [
        f"1. Buy YES shares on {buy_label} at {buy_cents:.1f}¢ each",
        f"2. Simultaneously buy NO shares on {sell_label} at {sell_no_cents:.1f}¢ each",
        f"3. Total cost per share: {total_cost_cents:.1f}¢ — Guaranteed payout: 100¢",
        f"4. If event resolves YES → {buy_label} YES pays $1 (profit {100 - buy_cents:.1f}¢), {sell_label} NO expires (loss {sell_no_cents:.1f}¢)",
        f"5. If event resolves NO → {buy_label} YES expires (loss {buy_cents:.1f}¢), {sell_label} NO pays $1 (profit {100 - sell_no_cents:.1f}¢)",
        f"6. Net profit either way: {spread_cents:.1f}¢ per share ({spread_percent:.1f}% return)",
    ]

    return ArbitrageOpportunity(
        id=f"db-{idx}",
        title=pm["title"] or km["title"],
        platforms=["poly", "kalshi"],
        prices=prices,
        volumes=volumes,
        market_ids={"poly": pm["market_id"], "kalshi": km["market_id"]},
        best_buy_platform=best_buy_platform,
        best_buy_price=round(best_buy_price, 4),
        best_sell_platform=best_sell_platform,
        best_sell_price=round(best_sell_price, 4),
        spread_percent=round(spread_percent, 2),
        profit_potential=round(profit_potential, 2),
        confidence=confidence,
        match_score=round(sim, 3),
        feasibility_score=feasibility_score,
        feasibility_label=feasibility_label,
        min_side_volume=round(min_volume, 2),
        estimated_slippage=estimated_slippage,
        strategy_summary=strategy_summary,
        strategy_steps=strategy_steps,
    )


@router.get("/opportunities-db", response_model=ArbitrageResponse)
def get_arbitrage_opportunities_db(
    min_spread:      float = Query(0.5,  ge=0.1, le=50.0,  description="Min spread %"),
    min_match_score: float = Query(0.50, ge=0.1, le=1.0,   description="Min similarity score"),
    limit:           int   = Query(200,  ge=1,   le=500,   description="Max results"),
    db: Session = Depends(get_db),
):
    """
    Pure-DB arbitrage scanner.
    Queries predictions_silver.markets directly — no live API calls.
    2-minute in-process cache.
    """
    t0 = time.time()

    # ── Cache hit ─────────────────────────────────────────────────────────────
    now = time.time()
    if _cache["data"] and (now - _cache["ts"]) < _cache["ttl"]:
        all_opps       = _cache["data"]["all_opps"]
        markets_scanned = _cache["data"]["markets_scanned"]
        logger.info("Arbitrage DB: cache hit")
    else:
        # ── Fetch from DB ──────────────────────────────────────────────────────
        poly_rows   = db.execute(text(_POLY_SQL)).fetchall()
        kalshi_rows = db.execute(text(_KALSHI_SQL)).fetchall()
        logger.info(f"Arbitrage DB: {len(poly_rows)} poly, {len(kalshi_rows)} kalshi markets")

        def row_to_market(row, platform: str) -> Dict:
            yp  = float(row.yes_price) if row.yes_price  is not None else None
            np_ = float(row.no_price)  if row.no_price   is not None else None
            # Derive yes price from no if needed
            if yp is None and np_ is not None and 0 < np_ < 1:
                yp = round(1.0 - np_, 4)
            return {
                "platform":  platform,
                "market_id": str(row.market_id or ""),
                "title":     str(row.title or ""),
                "price":     yp,
                "volume":    float(row.volume or 0),
            }

        poly_markets   = [row_to_market(r, "poly")   for r in poly_rows]
        kalshi_markets = [row_to_market(r, "kalshi") for r in kalshi_rows]

        # ── Build Kalshi inverted entity index ────────────────────────────────
        kalshi_entity_cache: List[set] = []
        kalshi_index: Dict[str, List[int]] = defaultdict(list)
        for i, km in enumerate(kalshi_markets):
            entities = _extract_entities(km["title"])
            kalshi_entity_cache.append(entities)
            for e in entities:
                kalshi_index[e].append(i)

        # ── Match Polymarket → Kalshi ─────────────────────────────────────────
        matched_kalshi: set = set()
        all_opps: List[ArbitrageOpportunity] = []

        for pm in poly_markets:
            if not pm["price"] or pm["price"] <= 0:
                continue

            p_entities = _extract_entities(pm["title"])
            if not p_entities:
                continue

            # Gather candidate kalshi indices (share ≥1 entity)
            candidate_counts: Dict[int, int] = {}
            for e in p_entities:
                for ki in kalshi_index.get(e, []):
                    if ki not in matched_kalshi:
                        candidate_counts[ki] = candidate_counts.get(ki, 0) + 1

            if not candidate_counts:
                continue

            # Score candidates — find best-matching unmatched kalshi market
            best_sim = 0.0
            best_ki  = -1
            for ki in candidate_counts:
                km = kalshi_markets[ki]
                if not km["price"] or km["price"] <= 0:
                    continue
                sim = calculate_similarity(pm["title"], km["title"])
                if sim > best_sim:
                    best_sim = sim
                    best_ki  = ki

            if best_ki < 0 or best_sim < 0.35:
                continue

            km = kalshi_markets[best_ki]

            # ── Semantic validation: catch false positives ────────────────────
            if not _titles_are_semantically_same(pm["title"], km["title"]):
                logger.debug(
                    f"Arb rejected (semantic mismatch): "
                    f"'{pm['title'][:50]}' ↔ '{km['title'][:50]}'"
                )
                continue

            matched_kalshi.add(best_ki)

            opp = _build_opportunity(pm, km, best_sim, len(all_opps))
            if opp:
                all_opps.append(opp)

        # Sort: confidence first, then spread desc
        _conf_order = {"high": 0, "medium": 1, "low": 2}
        all_opps.sort(key=lambda x: (_conf_order.get(x.confidence, 3), -x.spread_percent))

        markets_scanned = len(poly_markets) + len(kalshi_markets)
        _cache["data"] = {"all_opps": all_opps, "markets_scanned": markets_scanned}
        _cache["ts"]   = time.time()
        logger.info(
            f"Arbitrage DB: matched {len(all_opps)} opportunities "
            f"from {markets_scanned} markets in {time.time()-t0:.2f}s"
        )

    # ── Filter per-request ────────────────────────────────────────────────────
    filtered = [
        o for o in all_opps
        if o.spread_percent >= min_spread and o.match_score >= min_match_score
    ][:limit]

    total      = len(filtered)
    avg_spread = sum(o.spread_percent for o in filtered) / total if total else 0.0
    total_prof = sum(o.profit_potential for o in filtered)

    return ArbitrageResponse(
        opportunities=filtered,
        stats=ArbitrageStats(
            total_opportunities=total,
            avg_spread=round(avg_spread, 2),
            total_profit_potential=round(total_prof, 2),
            markets_scanned=markets_scanned,
            platform_pairs=1,
            scan_time=round(time.time() - t0, 3),
        ),
    )
