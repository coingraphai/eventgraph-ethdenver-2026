"""
Intelligence Dashboard - Database-backed
Queries predictions_silver.markets for aggregate market intelligence.
No live external API calls. Same JSON shape as before.
"""
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
    """No-op: cache built on first DB request."""
    pass


def start_intelligence_refresh():
    """No-op."""
    pass


def stop_intelligence_refresh():
    """No-op."""
    pass


@router.get("/intelligence")
async def get_intelligence_dashboard(
    refresh: bool = False,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Return aggregated market intelligence from the database. 5-min cache."""
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
        plat_rows = db.execute(text("""
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
        """)).fetchall()

        total_markets    = sum(int(r.market_count  or 0) for r in plat_rows)
        total_volume     = sum(float(r.total_volume or 0) for r in plat_rows)
        total_volume_24h = sum(float(r.volume_24h  or 0) for r in plat_rows)
        platform_counts  = {r.platform: int(r.market_count  or 0) for r in plat_rows}
        platform_volumes = {r.platform: float(r.total_volume or 0) for r in plat_rows}

        # Category stats
        cat_rows = db.execute(text("""
            SELECT
                COALESCE(category_name, 'other') AS category,
                COUNT(*)                         AS market_count,
                COALESCE(SUM(volume_total), 0)   AS total_volume
            FROM predictions_silver.markets
            WHERE is_active = TRUE
            GROUP BY COALESCE(category_name, 'other')
            ORDER BY total_volume DESC NULLS LAST
            LIMIT 20
        """)).fetchall()

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
        trend_rows = db.execute(text("""
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
        """)).fetchall()

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
