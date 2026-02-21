"""
Dashboard API endpoint - Database-backed version
Fetches data from predictions_gold schema instead of API calls
"""

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from sqlalchemy import desc, func, text
from typing import Dict, List, Any
import logging
from datetime import datetime, timedelta, timezone
import asyncio

from app.database.session import get_db
from app.models.gold_layer import (
    MarketMetricsSummary,
    TopMarketsSnapshot,
    CategoryDistribution,
    VolumeTrends,
    HighVolumeActivity,
    PlatformComparison,
    TrendingCategories,
)

logger = logging.getLogger(__name__)
router = APIRouter()

# Simple in-memory cache for platform stats
_platform_stats_cache = {
    "data": None,
    "timestamp": None,
    "ttl": 300  # 5 minutes cache
}

async def get_cached_platform_stats():
    """Get cached platform stats or fetch new ones"""
    now = datetime.utcnow()
    
    # Check if cache is valid
    if (_platform_stats_cache["data"] is not None and 
        _platform_stats_cache["timestamp"] is not None and
        (now - _platform_stats_cache["timestamp"]).total_seconds() < _platform_stats_cache["ttl"]):
        logger.info("Returning cached platform stats")
        return _platform_stats_cache["data"]
    
    # Fetch fresh data from APIs in parallel
    logger.info("Fetching fresh platform stats from APIs")
    results = {}
    
    async def fetch_polymarket():
        try:
            # Polymarket from database
            from app.database.session import get_db
            db = next(get_db())
            try:
                comparison = db.query(PlatformComparison).filter(
                    PlatformComparison.platform == "polymarket"
                ).first()
                if comparison:
                    return {
                        "platform": "polymarket",
                        "total_markets": comparison.total_markets,
                        "open_markets": comparison.active_markets,
                    }
            finally:
                db.close()
        except Exception as e:
            logger.warning(f"Could not fetch Polymarket stats: {e}")
        return {"platform": "polymarket", "total_markets": 16000, "open_markets": 11000}
    
    async def fetch_kalshi():
        try:
            from app.services.kalshi_service import fetch_kalshi_categories
            cats = await fetch_kalshi_categories()
            total = sum(cat.get("count", 0) for cat in cats)
            return {"platform": "kalshi", "total_markets": total, "open_markets": 1000}
        except Exception as e:
            logger.warning(f"Could not fetch Kalshi stats: {e}")
            return {"platform": "kalshi", "total_markets": 1000, "open_markets": 1000}
    
    async def fetch_limitless():
        try:
            from app.services.limitless_service import fetch_limitless_categories
            cats = await fetch_limitless_categories()
            total = sum(cat.get("count", 0) for cat in cats)
            return {"platform": "limitless", "total_markets": total, "open_markets": total}
        except Exception as e:
            logger.warning(f"Could not fetch Limitless stats: {e}")
            return {"platform": "limitless", "total_markets": 700, "open_markets": 700}
    
    async def fetch_opiniontrade():
        try:
            from app.services.opiniontrade_service import fetch_opiniontrade_categories
            cats = await fetch_opiniontrade_categories()
            total = sum(cat.get("count", 0) for cat in cats)
            return {"platform": "opiniontrade", "total_markets": total, "open_markets": total}
        except Exception as e:
            logger.warning(f"Could not fetch OpinionTrade stats: {e}")
            return {"platform": "opiniontrade", "total_markets": 267, "open_markets": 267}
    
    # Fetch all in parallel with timeout
    try:
        platform_data = await asyncio.gather(
            fetch_polymarket(),
            fetch_kalshi(),
            fetch_limitless(),
            fetch_opiniontrade(),
            return_exceptions=True
        )
        
        for data in platform_data:
            if isinstance(data, dict) and "platform" in data:
                results[data["platform"]] = {
                    **data,
                    "top_10_volume": 0,
                    "avg_volume": 0,
                    "volume_24h": 0,
                }
    except Exception as e:
        logger.error(f"Error fetching platform stats: {e}")
    
    # Update cache
    _platform_stats_cache["data"] = results
    _platform_stats_cache["timestamp"] = now
    
    return results


@router.get("/market-metrics")
async def get_market_metrics(db: Session = Depends(get_db)) -> Dict[str, Any]:
    """
    Get overall market metrics (dashboard header cards)
    Updates every 5 minutes
    """
    try:
        # Get latest snapshot
        metrics = db.query(MarketMetricsSummary).order_by(
            desc(MarketMetricsSummary.snapshot_timestamp)
        ).first()
        
        if not metrics:
            raise HTTPException(status_code=404, detail="No market metrics available")
        
        return {
            "total_markets": metrics.total_markets,
            "combined_volume_24h": float(metrics.combined_volume_24h or 0),
            "avg_volume_per_market": float(metrics.avg_volume_per_market or 0),
            "polymarket": {
                "open_markets": metrics.polymarket_open_markets,
                "volume_24h": float(metrics.polymarket_volume_24h or 0),
                "growth_24h_pct": float(metrics.polymarket_growth_24h_pct or 0),
            },
            "kalshi": {
                "open_markets": metrics.kalshi_open_markets,
                "volume_24h": float(metrics.kalshi_volume_24h or 0),
                "growth_24h_pct": float(metrics.kalshi_growth_24h_pct or 0),
            },
            "limitless": {
                "open_markets": metrics.limitless_open_markets or 0,
                "volume_24h": float(metrics.limitless_volume_24h or 0),
                "growth_24h_pct": float(metrics.limitless_growth_24h_pct or 0),
            },
            "trend_direction": metrics.trend_direction,
            "change_pct_24h": float(metrics.change_pct_24h or 0),
            "change_pct_7d": float(metrics.change_pct_7d or 0),
            "timestamp": metrics.snapshot_timestamp.isoformat(),
        }
        
    except Exception as e:
        logger.error(f"Error fetching market metrics: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/top-markets")
async def get_top_markets(
    limit: int = 10,
    db: Session = Depends(get_db)
) -> List[Dict[str, Any]]:
    """
    Get top markets by volume (ranked 1-10)
    Updates every 5 minutes
    """
    try:
        # Get latest snapshot timestamp
        latest_timestamp = db.query(
            func.max(TopMarketsSnapshot.snapshot_timestamp)
        ).scalar()
        
        if not latest_timestamp:
            return []
        
        # Get top markets from latest snapshot
        markets = db.query(TopMarketsSnapshot).filter(
            TopMarketsSnapshot.snapshot_timestamp == latest_timestamp
        ).order_by(
            TopMarketsSnapshot.rank
        ).limit(limit).all()
        
        return [
            {
                "rank": m.rank,
                "market_id": str(m.market_id),
                "title": m.title,
                "title_short": m.title_short,
                "platform": m.platform,
                "volume_24h": float(m.volume_24h_usd or 0),
                "volume_total": float(m.volume_total_usd or 0),
                "volume_millions": float(m.volume_millions or 0),
                "category": m.category,
                "tags": m.tags or [],
                "image_url": m.image_url,
            }
            for m in markets
        ]
        
    except Exception as e:
        logger.error(f"Error fetching top markets: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/category-distribution")
async def get_category_distribution(db: Session = Depends(get_db)) -> List[Dict[str, Any]]:
    """
    Get category distribution for pie chart
    Updates every 15 minutes
    """
    try:
        # Get latest snapshot
        latest_timestamp = db.query(
            func.max(CategoryDistribution.snapshot_timestamp)
        ).scalar()
        
        if not latest_timestamp:
            return []
        
        categories = db.query(CategoryDistribution).filter(
            CategoryDistribution.snapshot_timestamp == latest_timestamp
        ).order_by(
            desc(CategoryDistribution.percentage)
        ).all()
        
        return [
            {
                "category": c.category,
                "display_order": c.display_order,
                "market_count": c.market_count,
                "percentage": float(c.percentage or 0),
                "polymarket_count": c.polymarket_count,
                "kalshi_count": c.kalshi_count,
                "limitless_count": c.limitless_count or 0,
                "total_volume_24h": float(c.total_volume_24h or 0),
                "avg_volume_per_market": float(c.avg_volume_per_market or 0),
            }
            for c in categories
        ]
        
    except Exception as e:
        logger.error(f"Error fetching category distribution: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/volume-trends")
async def get_volume_trends(
    days: int = 7,
    limit: int = 20,
    db: Session = Depends(get_db)
) -> List[Dict[str, Any]]:
    """
    Get volume trends - top markets by volume trend
    """
    try:
        # Get latest snapshot
        latest_timestamp = db.query(
            func.max(VolumeTrends.snapshot_timestamp)
        ).scalar()
        
        if not latest_timestamp:
            return []
        
        trends = db.query(VolumeTrends).filter(
            VolumeTrends.snapshot_timestamp == latest_timestamp
        ).order_by(
            desc(VolumeTrends.rank_by_trend)
        ).limit(limit).all()
        
        return [
            {
                "market_id": str(t.market_id),
                "title": t.title,
                "title_short": t.title_short,
                "platform": t.platform,
                "volume_24h": float(t.volume_24h or 0),
                "volume_7d": float(t.volume_7d or 0),
                "volume_weekly_avg": float(t.volume_weekly_avg or 0),
                "trend_direction": t.trend_direction,
                "trend_strength": float(t.trend_strength or 0),
                "volume_change_24h_pct": float(t.volume_change_24h_pct or 0),
                "volume_change_7d_pct": float(t.volume_change_7d_pct or 0),
                "rank_by_volume": t.rank_by_volume,
                "rank_by_trend": t.rank_by_trend,
            }
            for t in trends
        ]
        
    except Exception as e:
        logger.error(f"Error fetching volume trends: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/activity-feed")
async def get_activity_feed(
    limit: int = 50,
    db: Session = Depends(get_db)
) -> List[Dict[str, Any]]:
    """
    Get recent high-volume activity
    Updates every 5 minutes
    """
    try:
        activities = db.query(HighVolumeActivity).order_by(
            desc(HighVolumeActivity.detected_at)
        ).limit(limit).all()
        
        return [
            {
                "type": a.activity_type,  # Frontend expects 'type'
                "title": a.title,
                "platform": a.platform,
                "volume_week": float(a.volume_24h or 0) * 7,  # Approximate weekly from 24h
                "timestamp": a.detected_at.isoformat() if a.detected_at else None,  # Frontend expects 'timestamp'
                # Additional fields for potential use
                "market_id": str(a.market_id),
                "title_short": a.title_short,
                "activity_type": a.activity_type,
                "activity_description": a.activity_description,
                "volume_24h": float(a.volume_24h or 0),
                "volume_change_pct": float(a.volume_change_pct or 0),
                "price_change_pct": float(a.price_change_pct or 0),
                "current_price": float(a.current_price or 0),
                "importance_score": a.importance_score,
                "category": a.category,
                "image_url": a.image_url,
            }
            for a in activities
        ]
        
    except Exception as e:
        logger.error(f"Error fetching activity feed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/platform-comparison")
async def get_platform_comparison(db: Session = Depends(get_db)) -> List[Dict[str, Any]]:
    """
    Get platform comparison metrics
    Updates every 15 minutes
    """
    try:
        # Get latest snapshot
        latest_timestamp = db.query(
            func.max(PlatformComparison.snapshot_timestamp)
        ).scalar()
        
        if not latest_timestamp:
            return []
        
        platforms = db.query(PlatformComparison).filter(
            PlatformComparison.snapshot_timestamp == latest_timestamp
        ).order_by(
            PlatformComparison.display_order
        ).all()
        
        return [
            {
                "platform": p.platform,
                "total_markets": p.total_markets,
                "active_markets": p.active_markets,
                "resolved_markets_24h": p.resolved_markets_24h or 0,
                "volume_24h": float(p.volume_24h or 0),
                "volume_7d": float(p.volume_7d or 0),
                "volume_millions": float(p.volume_millions or 0),
                "avg_volume_thousands": float(p.avg_volume_thousands or 0),
                "growth_24h_pct": float(p.growth_24h_pct or 0),
                "growth_7d_pct": float(p.growth_7d_pct or 0),
                "market_share_pct": float(p.market_share_pct or 0),
                "trade_count_24h": p.trade_count_24h or 0,
                "unique_traders_24h": p.unique_traders_24h or 0,
                "avg_trade_size": float(p.avg_trade_size or 0),
            }
            for p in platforms
        ]
        
    except Exception as e:
        logger.error(f"Error fetching platform comparison: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/trending-categories")
async def get_trending_categories(
    limit: int = 8,
    db: Session = Depends(get_db)
) -> List[Dict[str, Any]]:
    """
    Get trending categories (top 8 by trend score)
    Updates every 15 minutes
    """
    try:
        # Get latest snapshot
        latest_timestamp = db.query(
            func.max(TrendingCategories.snapshot_timestamp)
        ).scalar()
        
        if not latest_timestamp:
            return []
        
        categories = db.query(TrendingCategories).filter(
            TrendingCategories.snapshot_timestamp == latest_timestamp
        ).order_by(
            TrendingCategories.rank
        ).limit(limit).all()
        
        return [
            {
                "category": c.category,
                "rank": c.rank,
                "market_count": c.market_count,
                "volume_24h": float(c.volume_24h or 0),
                "volume_change_24h_pct": float(c.volume_change_24h_pct or 0),
                "trend_direction": c.trend_direction,
                "trend_score": c.trend_score,
                "percentage_of_total": float(c.percentage_of_total or 0),
                "rank_change": c.rank_change,
            }
            for c in categories
        ]
        
    except Exception as e:
        logger.error(f"Error fetching trending categories: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stats")
async def get_dashboard_stats(
    limit: int = 50,
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Get all dashboard stats in one call (for backward compatibility)
    Uses cached platform stats for fast response
    """
    try:
        # Get cached platform stats (fast)
        platform_stats = await get_cached_platform_stats()
        
        # Get other data from database
        return {
            "market_metrics": await get_market_metrics(db),
            "top_markets": await get_top_markets(limit=15, db=db),
            "categories": await get_category_distribution(db),
            "volume_trends": await get_volume_trends(days=7, db=db),
            "platform_stats": platform_stats,
            "recent_activity": await get_activity_feed(limit=8, db=db),
            "trending_categories": await get_trending_categories(limit=8, db=db),
            "timestamp": datetime.utcnow().isoformat(),
        }
        
    except Exception as e:
        logger.error(f"Error fetching dashboard stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/data-freshness")
async def get_data_freshness(db: Session = Depends(get_db)) -> Dict[str, Any]:
    """
    Get the last update times for all data sources.
    Returns when each platform's data was last refreshed in the database.
    """
    try:
        result = db.execute(text("""
            SELECT 
                cache_key, 
                platform, 
                updated_at,
                item_count,
                fetch_status
            FROM production_cache 
            WHERE cache_key LIKE '%_events'
            ORDER BY updated_at DESC
        """)).fetchall()
        
        platforms = {}
        latest_update = None
        
        for row in result:
            update_time = row.updated_at
            if update_time:
                if latest_update is None or update_time > latest_update:
                    latest_update = update_time
                platforms[row.platform] = {
                    "updated_at": update_time.isoformat() if update_time else None,
                    "item_count": row.item_count or 0,
                    "status": row.fetch_status or "unknown"
                }
        
        return {
            "last_updated": latest_update.isoformat() if latest_update else None,
            "platforms": platforms,
            "server_time": datetime.now(timezone.utc).isoformat()
        }
    except Exception as e:
        logger.error(f"Error fetching data freshness: {e}")
        return {
            "last_updated": None,
            "platforms": {},
            "server_time": datetime.now(timezone.utc).isoformat(),
            "error": str(e)
        }
