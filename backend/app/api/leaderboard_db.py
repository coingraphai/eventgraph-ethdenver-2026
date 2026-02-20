"""
Leaderboard DB endpoint — Pure database, zero live API calls.

Derives top-trader stats from predictions_silver.trades:
  • trade_count, total_volume, buy/sell split
  • estimated PnL  (sell_volume − buy_volume)
  • estimated win-rate (% of trades where price direction favoured the trader)
  • 24 h / 7 d / 30 d slices
  • ROI, avg trade size, markets traded, last trade

Endpoint: GET /api/leaderboard-db
Cache:    2 minutes in-memory
"""

from fastapi import APIRouter, Query, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from pydantic import BaseModel
from typing import List, Optional
import time
import logging
from datetime import datetime, timezone

from app.database.session import get_db

router = APIRouter()
logger = logging.getLogger(__name__)

_cache = {"data": None, "ts": 0.0, "ttl": 120.0}

# ── SQL ────────────────────────────────────────────────────────────────────────
_SQL = """
SELECT
    taker_address                                                                  AS wallet_address,
    source                                                                         AS platform,
    COUNT(*)                                                                       AS trade_count,

    COALESCE(SUM(total_value), 0)                                                 AS total_volume,
    COALESCE(SUM(CASE WHEN side = 'buy'  THEN total_value ELSE 0 END), 0)        AS buy_volume,
    COALESCE(SUM(CASE WHEN side = 'sell' THEN total_value ELSE 0 END), 0)        AS sell_volume,

    -- time-sliced volumes
    COALESCE(SUM(CASE WHEN traded_at >= NOW() - INTERVAL '24 hours'
                      THEN total_value ELSE 0 END), 0)                            AS vol_24h,
    COALESCE(SUM(CASE WHEN traded_at >= NOW() - INTERVAL '7 days'
                      THEN total_value ELSE 0 END), 0)                            AS vol_7d,
    COALESCE(SUM(CASE WHEN traded_at >= NOW() - INTERVAL '30 days'
                      THEN total_value ELSE 0 END), 0)                            AS vol_30d,

    -- time-sliced trade counts
    COALESCE(SUM(CASE WHEN traded_at >= NOW() - INTERVAL '24 hours' THEN 1 ELSE 0 END), 0) AS trades_24h,
    COALESCE(SUM(CASE WHEN traded_at >= NOW() - INTERVAL '7 days'   THEN 1 ELSE 0 END), 0) AS trades_7d,
    COALESCE(SUM(CASE WHEN traded_at >= NOW() - INTERVAL '30 days'  THEN 1 ELSE 0 END), 0) AS trades_30d,

    COALESCE(AVG(total_value), 0)                                                 AS avg_trade_size,
    COUNT(DISTINCT source_market_id)                                               AS markets_traded,
    MAX(traded_at)                                                                 AS last_trade,

    -- estimated win-rate:
    -- a buy at price < 0.5 means "bought cheap" (bullish position < fair value)
    -- a sell at price > 0.5 means "sold high" (closed/shorted above fair value)
    -- both are theoretically favourable directions for the trader
    ROUND(
        COALESCE(
            SUM(CASE WHEN (side = 'buy'  AND price < 0.5)
                       OR  (side = 'sell' AND price > 0.5)
                     THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(*), 0),
        0) , 3
    )                                                                              AS win_rate_est

FROM predictions_silver.trades
WHERE taker_address IS NOT NULL
  AND taker_address <> ''
GROUP BY taker_address, source
HAVING COUNT(*) >= :min_trades
ORDER BY SUM(total_value) DESC NULLS LAST
LIMIT :limit
"""

# ── Pydantic models ────────────────────────────────────────────────────────────
class TraderRow(BaseModel):
    rank: int
    wallet_address: str
    platform: str
    profile_url: str

    # volume
    trade_count: int
    total_volume: float
    buy_volume: float
    sell_volume: float
    avg_trade_size: float
    markets_traded: int

    # time-sliced volume
    vol_24h: float
    vol_7d: float
    vol_30d: float
    trades_24h: int
    trades_7d: int
    trades_30d: int

    # derived
    est_pnl: float         # sell - buy (positive = net cash-in)
    roi_pct: float         # est_pnl / buy_volume * 100
    win_rate_est: float    # 0–1

    # flags
    is_whale: bool
    is_active_24h: bool
    is_active_7d: bool

    last_trade: Optional[str] = None


class LeaderboardDBResponse(BaseModel):
    success: bool
    traders: List[TraderRow]
    count: int
    total_unique_traders: int
    platform: str
    query_ms: int
    updated_at: str


def _profile_url(platform: str, wallet: str) -> str:
    if platform == "polymarket":
        return f"https://polymarket.com/profile/{wallet}"
    if platform == "kalshi":
        return f"https://kalshi.com/profile/{wallet}"
    if platform == "limitless":
        return f"https://limitless.exchange/profile/{wallet}"
    return "#"


@router.get("/leaderboard-db", response_model=LeaderboardDBResponse)
def get_leaderboard_db(
    limit:      int = Query(100, ge=1, le=500,  description="Max traders to return"),
    min_trades: int = Query(1,   ge=1, le=50,   description="Min trades for inclusion"),
    platform: Optional[str] = Query(None, description="Filter: polymarket | kalshi | limitless"),
    db: Session = Depends(get_db),
):
    """
    Pure-DB leaderboard. Aggregates predictions_silver.trades by wallet address.
    No live API calls. 2-minute cache.
    """
    t0 = time.time()

    cache_key = f"{limit}_{min_trades}_{platform or 'all'}"
    now = time.time()
    if _cache["data"] and (now - _cache["ts"]) < _cache["ttl"] and _cache.get("key") == cache_key:
        all_traders = _cache["data"]["traders"]
        total_unique = _cache["data"]["total_unique"]
        logger.info("Leaderboard DB: cache hit")
    else:
        sql = _SQL
        if platform:
            sql = sql.replace(
                "WHERE taker_address IS NOT NULL",
                f"WHERE taker_address IS NOT NULL\n  AND source = '{platform}'"
            )

        rows = db.execute(text(sql), {"limit": limit, "min_trades": min_trades}).fetchall()
        logger.info(f"Leaderboard DB: {len(rows)} traders fetched")

        all_traders = []
        for i, row in enumerate(rows):
            buy_vol  = float(row.buy_volume  or 0)
            sell_vol = float(row.sell_volume or 0)
            est_pnl  = sell_vol - buy_vol
            roi_pct  = (est_pnl / buy_vol * 100) if buy_vol > 0 else 0.0
            total_vol = float(row.total_volume or 0)
            avg_size  = float(row.avg_trade_size or 0)

            last_trade_str = None
            if row.last_trade:
                lt = row.last_trade
                if hasattr(lt, "isoformat"):
                    last_trade_str = lt.isoformat()
                else:
                    last_trade_str = str(lt)

            all_traders.append(TraderRow(
                rank=i + 1,
                wallet_address=row.wallet_address,
                platform=row.platform,
                profile_url=_profile_url(row.platform, row.wallet_address),
                trade_count=int(row.trade_count or 0),
                total_volume=round(total_vol, 2),
                buy_volume=round(buy_vol, 2),
                sell_volume=round(sell_vol, 2),
                avg_trade_size=round(avg_size, 2),
                markets_traded=int(row.markets_traded or 0),
                vol_24h=round(float(row.vol_24h or 0), 2),
                vol_7d=round(float(row.vol_7d or 0), 2),
                vol_30d=round(float(row.vol_30d or 0), 2),
                trades_24h=int(row.trades_24h or 0),
                trades_7d=int(row.trades_7d or 0),
                trades_30d=int(row.trades_30d or 0),
                est_pnl=round(est_pnl, 2),
                roi_pct=round(roi_pct, 1),
                win_rate_est=round(float(row.win_rate_est or 0), 3),
                is_whale=total_vol >= 50_000 or avg_size >= 5_000,
                is_active_24h=int(row.trades_24h or 0) > 0,
                is_active_7d=int(row.trades_7d or 0) > 0,
                last_trade=last_trade_str,
            ))

        # total unique traders in DB (un-filtered)
        total_unique = db.execute(
            text("SELECT COUNT(DISTINCT taker_address) FROM predictions_silver.trades WHERE taker_address IS NOT NULL AND taker_address <> ''")
        ).scalar() or 0

        _cache["data"] = {"traders": all_traders, "total_unique": int(total_unique)}
        _cache["ts"]   = time.time()
        _cache["key"]  = cache_key

    return LeaderboardDBResponse(
        success=True,
        traders=all_traders,
        count=len(all_traders),
        total_unique_traders=int(_cache["data"]["total_unique"]),
        platform=platform or "all",
        query_ms=int((time.time() - t0) * 1000),
        updated_at=datetime.now(timezone.utc).isoformat(),
    )
