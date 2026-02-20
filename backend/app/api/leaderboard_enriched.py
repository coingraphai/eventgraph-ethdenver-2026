"""
Leaderboard Enriched — Top 100 traders from DB + Dome API enrichment.

Combines predictions_silver.trades aggregates with live Dome API data:
  • total REDEEM winnings  (from /polymarket/activity)
  • biggest single win
  • markets won (REDEEM count)
  • wallet handle/pseudonym (from /polymarket/wallet?eoa=)

Endpoint: GET /api/leaderboard-enriched
Cache:    10 minutes (first load ~10-20s while Dome API fetches, subsequent <50ms)
Limit:    100 traders
"""

import asyncio
import httpx
import time
import logging
from typing import Optional, List
from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from pydantic import BaseModel

from app.database.session import get_db

router = APIRouter()
logger = logging.getLogger(__name__)

DOME_API_BASE = "https://api.domeapi.io/v1"
DOME_API_KEY  = "***REDACTED_DOME_KEY***"

_cache: dict = {"data": None, "ts": 0.0, "ttl": 600.0}  # 10-minute cache

# ── SQL ────────────────────────────────────────────────────────────────────────
_SQL = """
SELECT
    taker_address                                                                 AS wallet_address,
    source                                                                        AS platform,
    COUNT(*)                                                                      AS trade_count,
    COALESCE(SUM(total_value), 0)                                                AS total_volume,
    COALESCE(SUM(CASE WHEN side = 'buy'  THEN total_value ELSE 0 END), 0)       AS buy_volume,
    COALESCE(SUM(CASE WHEN side = 'sell' THEN total_value ELSE 0 END), 0)       AS sell_volume,
    COALESCE(SUM(CASE WHEN traded_at >= NOW() - INTERVAL '24 hours'
                      THEN total_value ELSE 0 END), 0)                           AS vol_24h,
    COALESCE(SUM(CASE WHEN traded_at >= NOW() - INTERVAL '7 days'
                      THEN total_value ELSE 0 END), 0)                           AS vol_7d,
    COALESCE(SUM(CASE WHEN traded_at >= NOW() - INTERVAL '30 days'
                      THEN total_value ELSE 0 END), 0)                           AS vol_30d,
    COALESCE(SUM(CASE WHEN traded_at >= NOW() - INTERVAL '24 hours' THEN 1 ELSE 0 END), 0) AS trades_24h,
    COALESCE(SUM(CASE WHEN traded_at >= NOW() - INTERVAL '7 days'   THEN 1 ELSE 0 END), 0) AS trades_7d,
    COALESCE(SUM(CASE WHEN traded_at >= NOW() - INTERVAL '30 days'  THEN 1 ELSE 0 END), 0) AS trades_30d,
    COALESCE(AVG(total_value), 0)                                                AS avg_trade_size,
    COUNT(DISTINCT source_market_id)                                              AS markets_traded,
    MAX(traded_at)                                                                AS last_trade
FROM predictions_silver.trades
WHERE taker_address IS NOT NULL AND taker_address <> ''
GROUP BY taker_address, source
HAVING COUNT(*) >= 1
ORDER BY SUM(total_value) DESC NULLS LAST
LIMIT 100
"""

# ── Pydantic models ────────────────────────────────────────────────────────────
class EnrichedTrader(BaseModel):
    rank: int
    wallet_address: str
    display_name: str        # handle/pseudonym or truncated wallet
    platform: str
    profile_url: str

    trade_count: int
    total_volume: float
    buy_volume: float
    sell_volume: float
    avg_trade_size: float
    markets_traded: int

    vol_24h: float
    vol_7d: float
    vol_30d: float
    trades_24h: int
    trades_7d: int
    trades_30d: int

    is_whale: bool
    is_active_24h: bool
    is_active_7d: bool
    last_trade: Optional[str] = None

    # Dome API enrichment
    handle: Optional[str] = None
    total_winnings: float = 0.0
    biggest_win: float = 0.0
    markets_won: int = 0
    dome_enriched: bool = False


class EnrichedResponse(BaseModel):
    success: bool
    traders: List[EnrichedTrader]
    count: int
    total_unique_traders: int
    query_ms: int
    enriched_count: int
    updated_at: str


# ── Helpers ────────────────────────────────────────────────────────────────────
def _profile_url(platform: str, wallet: str) -> str:
    if platform == "polymarket": return f"https://polymarket.com/profile/{wallet}"
    if platform == "kalshi":     return f"https://kalshi.com/profile/{wallet}"
    return "#"


def _fmt_wallet(w: str) -> str:
    if w.startswith("0x") and len(w) >= 10:
        return f"{w[:6]}…{w[-4:]}"
    return w[:12] + "…" if len(w) > 12 else w


async def _enrich_one(
    client: httpx.AsyncClient,
    sem: asyncio.Semaphore,
    wallet: str,
    platform: str,
) -> dict:
    """Fetch Dome API enrichment for a single wallet (Polymarket only)."""
    if platform != "polymarket":
        return {"dome_enriched": False}

    result = {
        "dome_enriched": False,
        "handle": None,
        "total_winnings": 0.0,
        "biggest_win": 0.0,
        "markets_won": 0,
    }

    async with sem:
        # ── Activity (REDEEM = winnings cashed out) ─────────────────────────
        try:
            r = await client.get(
                f"{DOME_API_BASE}/polymarket/activity?user={wallet}&limit=100",
                timeout=10,
            )
            if r.status_code == 200:
                acts = r.json().get("activities", [])
                winnings = [
                    a.get("price", 0) * a.get("shares_normalized", 0)
                    for a in acts
                    if a.get("side") == "REDEEM"
                ]
                if winnings:
                    result["total_winnings"] = round(sum(winnings), 2)
                    result["biggest_win"]    = round(max(winnings), 2)
                    result["markets_won"]    = len(winnings)
                result["dome_enriched"] = True
        except Exception as e:
            logger.debug(f"Activity fetch failed {wallet[:10]}: {e}")

        # ── Wallet handle ────────────────────────────────────────────────────
        try:
            r = await client.get(
                f"{DOME_API_BASE}/polymarket/wallet?eoa={wallet}",
                timeout=8,
            )
            if r.status_code == 200:
                d = r.json()
                result["handle"] = d.get("handle") or d.get("pseudonym") or None
        except Exception:
            pass

        await asyncio.sleep(0.05)  # gentle on the API
        return result


async def _enrich_all(db_rows: list) -> list:
    """Concurrently enrich all traders — max 15 simultaneous Dome API calls."""
    sem = asyncio.Semaphore(15)
    async with httpx.AsyncClient(
        timeout=12,
        headers={"X-API-KEY": DOME_API_KEY},
        limits=httpx.Limits(max_connections=20, max_keepalive_connections=15),
    ) as client:
        tasks = [
            _enrich_one(client, sem, row["wallet_address"], row["platform"])
            for row in db_rows
        ]
        return await asyncio.gather(*tasks, return_exceptions=True)


# ── Endpoint ───────────────────────────────────────────────────────────────────
@router.get("/leaderboard-enriched", response_model=EnrichedResponse)
def get_leaderboard_enriched(db: Session = Depends(get_db)):
    """
    Top 100 traders (DB) enriched with Dome API winnings + handles.
    10-minute cache. First load: ~10-20s. Subsequent: <50ms.
    """
    t0 = time.time()

    if _cache["data"] and (time.time() - _cache["ts"]) < _cache["ttl"]:
        logger.info("Leaderboard enriched: cache hit")
        return _cache["data"]

    # ── DB query ──────────────────────────────────────────────────────────────
    rows = db.execute(text(_SQL)).fetchall()
    logger.info(f"Leaderboard enriched: {len(rows)} traders from DB")

    total_unique = int(
        db.execute(
            text("SELECT COUNT(DISTINCT taker_address) FROM predictions_silver.trades "
                 "WHERE taker_address IS NOT NULL AND taker_address <> ''")
        ).scalar() or 0
    )

    db_traders = []
    for i, row in enumerate(rows):
        buy_vol   = float(row.buy_volume   or 0)
        sell_vol  = float(row.sell_volume  or 0)
        total_vol = float(row.total_volume or 0)
        avg_size  = float(row.avg_trade_size or 0)

        last_trade_str = None
        if row.last_trade:
            lt = row.last_trade
            last_trade_str = lt.isoformat() if hasattr(lt, "isoformat") else str(lt)

        db_traders.append({
            "rank": i + 1,
            "wallet_address": row.wallet_address,
            "platform":       row.platform,
            "profile_url":    _profile_url(row.platform, row.wallet_address),
            "trade_count":    int(row.trade_count or 0),
            "total_volume":   round(total_vol, 2),
            "buy_volume":     round(buy_vol, 2),
            "sell_volume":    round(sell_vol, 2),
            "avg_trade_size": round(avg_size, 2),
            "markets_traded": int(row.markets_traded or 0),
            "vol_24h":        round(float(row.vol_24h  or 0), 2),
            "vol_7d":         round(float(row.vol_7d   or 0), 2),
            "vol_30d":        round(float(row.vol_30d  or 0), 2),
            "trades_24h":     int(row.trades_24h or 0),
            "trades_7d":      int(row.trades_7d  or 0),
            "trades_30d":     int(row.trades_30d or 0),
            "is_whale":       total_vol >= 50_000 or avg_size >= 5_000,
            "is_active_24h":  int(row.trades_24h or 0) > 0,
            "is_active_7d":   int(row.trades_7d  or 0) > 0,
            "last_trade":     last_trade_str,
        })

    # ── Dome API enrichment ───────────────────────────────────────────────────
    enrichments = asyncio.run(_enrich_all(db_traders))

    traders = []
    enriched_count = 0
    for t, enrich in zip(db_traders, enrichments):
        if isinstance(enrich, Exception):
            enrich = {}
        if enrich.get("dome_enriched"):
            enriched_count += 1

        handle = enrich.get("handle")
        w = t["wallet_address"]
        display_name = handle if handle else _fmt_wallet(w)

        traders.append(EnrichedTrader(
            **t,
            display_name=display_name,
            handle=handle,
            total_winnings=float(enrich.get("total_winnings", 0)),
            biggest_win=float(enrich.get("biggest_win", 0)),
            markets_won=int(enrich.get("markets_won", 0)),
            dome_enriched=bool(enrich.get("dome_enriched")),
        ))

    response = EnrichedResponse(
        success=True,
        traders=traders,
        count=len(traders),
        total_unique_traders=total_unique,
        query_ms=int((time.time() - t0) * 1000),
        enriched_count=enriched_count,
        updated_at=datetime.now(timezone.utc).isoformat(),
    )

    _cache["data"] = response
    _cache["ts"]   = time.time()
    logger.info(f"Leaderboard enriched: done {len(traders)} traders, {enriched_count} enriched, {response.query_ms}ms")
    return response
