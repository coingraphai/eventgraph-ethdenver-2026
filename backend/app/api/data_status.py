"""
Data freshness status endpoint.
Returns when each source's market data was last updated, so the UI
can show traders exactly how stale (or live) the prices are.

Cached for 30 seconds to avoid hammering the DB on every header render.
"""

import time
import logging
from typing import Optional
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.database.session import get_db

logger = logging.getLogger(__name__)

router = APIRouter()

# --- 30-second in-memory cache ---
_cache: dict = {"data": None, "ts": 0.0}
CACHE_TTL = 30  # seconds


def _format_age(age_seconds: Optional[int]) -> str:
    """Human-readable age string: 'just now', '4m ago', '2h ago', etc."""
    if age_seconds is None:
        return "unknown"
    if age_seconds < 60:
        return "just now"
    if age_seconds < 3600:
        return f"{age_seconds // 60}m ago"
    return f"{age_seconds // 3600}h ago"


def _status_from_age(age_seconds: Optional[int]) -> str:
    """
    live    — updated within the last 10 minutes  (pipeline running normally)
    stale   — 10–60 minutes old                   (pipeline may have missed a run)
    delayed — older than 1 hour                   (pipeline down or DB issue)
    """
    if age_seconds is None:
        return "unknown"
    if age_seconds < 600:
        return "live"
    if age_seconds < 3600:
        return "stale"
    return "delayed"


@router.get("/data-status", tags=["system"])
def get_data_status(db: Session = Depends(get_db)):
    """
    Returns the freshness of market data for each source (polymarket, kalshi, limitless).

    Response:
    {
      "sources": {
        "polymarket": { "last_updated": "ISO8601", "age_seconds": 180, "age_text": "3m ago",
                        "market_count": 487, "status": "live" },
        ...
      },
      "overall_last_updated": "ISO8601",
      "overall_age_seconds": 180,
      "overall_age_text":    "3m ago",
      "status": "live"
    }
    """
    now = time.time()

    # Serve from cache if still fresh
    if _cache["data"] is not None and (now - _cache["ts"]) < CACHE_TTL:
        return _cache["data"]

    try:
        rows = db.execute(text("""
            SELECT
                source,
                MAX(last_updated_at)  AS last_updated,
                COUNT(*)              AS market_count
            FROM predictions_silver.markets
            WHERE is_active = true
            GROUP BY source
            ORDER BY source
        """)).fetchall()

        sources: dict = {}
        overall_ts = None

        for row in rows:
            lu = row.last_updated  # datetime or None
            age = int(now - lu.timestamp()) if lu else None

            sources[row.source] = {
                "last_updated":  lu.isoformat() if lu else None,
                "age_seconds":   age,
                "age_text":      _format_age(age),
                "market_count":  row.market_count,
                "status":        _status_from_age(age),
            }

            if lu and (overall_ts is None or lu > overall_ts):
                overall_ts = lu

        overall_age = int(now - overall_ts.timestamp()) if overall_ts else None

        result = {
            "sources":               sources,
            "overall_last_updated":  overall_ts.isoformat() if overall_ts else None,
            "overall_age_seconds":   overall_age,
            "overall_age_text":      _format_age(overall_age),
            "status":                _status_from_age(overall_age),
        }

    except Exception as e:
        logger.warning(f"data-status query failed: {e}")
        result = {
            "sources":               {},
            "overall_last_updated":  None,
            "overall_age_seconds":   None,
            "overall_age_text":      "unavailable",
            "status":                "unknown",
        }

    _cache["data"] = result
    _cache["ts"] = now
    return result
