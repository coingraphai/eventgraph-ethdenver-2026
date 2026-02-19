"""
Analytics API endpoints - Database-backed version
Fetches data from predictions_gold schema for analytics visualizations
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc, func
from typing import Dict, List, Any, Optional
import logging
from datetime import datetime, timedelta

from app.database.session import get_db
from app.models.gold_layer import (
    VolumeDistributionHistogram,
    MarketLifecycleFunnel,
    TopTradersLeaderboard,
    CategoryPerformanceMetrics,
    PlatformMarketShareTimeseries,
    HourlyActivityHeatmap,
    ResolutionAccuracyTracker,
)

logger = logging.getLogger(__name__)
router = APIRouter()


# ============================================
# ANALYTICS PAGE ENDPOINTS
# ============================================

@router.get("/volume-distribution")
async def get_volume_distribution(db: Session = Depends(get_db)) -> List[Dict[str, Any]]:
    """
    Get volume distribution histogram data
    Updates daily
    """
    try:
        # Get latest snapshot
        latest_snapshot = db.query(
            func.max(VolumeDistributionHistogram.snapshot_at)
        ).scalar()
        
        if not latest_snapshot:
            return []
        
        distribution = db.query(VolumeDistributionHistogram).filter(
            VolumeDistributionHistogram.snapshot_at == latest_snapshot
        ).order_by(
            VolumeDistributionHistogram.bucket_order
        ).all()
        
        return [
            {
                "bucket_name": d.bucket_name,
                "bucket_min": float(d.bucket_min or 0),
                "bucket_max": float(d.bucket_max or 0),
                "market_count": d.market_count or 0,
                "pct_of_total": float(d.pct_of_total or 0),
            }
            for d in distribution
        ]
        
    except Exception as e:
        logger.error(f"Error fetching volume distribution: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/lifecycle-funnel")
async def get_lifecycle_funnel(db: Session = Depends(get_db)) -> List[Dict[str, Any]]:
    """
    Get market lifecycle funnel (created -> active -> resolved)
    Updates daily
    """
    try:
        # Get latest snapshot
        latest_snapshot = db.query(
            func.max(MarketLifecycleFunnel.snapshot_at)
        ).scalar()
        
        if not latest_snapshot:
            return []
        
        funnel = db.query(MarketLifecycleFunnel).filter(
            MarketLifecycleFunnel.snapshot_at == latest_snapshot
        ).order_by(
            MarketLifecycleFunnel.stage_order
        ).all()
        
        return [
            {
                "source": f.source,
                "lifecycle_stage": f.lifecycle_stage,
                "stage_order": f.stage_order,
                "market_count": f.market_count or 0,
                "pct_from_previous": float(f.pct_from_previous or 0),
            }
            for f in funnel
        ]
        
    except Exception as e:
        logger.error(f"Error fetching lifecycle funnel: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/top-traders")
async def get_top_traders(
    limit: int = Query(50, description="Number of traders to return"),
    source: Optional[str] = Query(None, description="Filter by platform"),
    db: Session = Depends(get_db)
) -> List[Dict[str, Any]]:
    """
    Get top traders leaderboard
    Updates every 15 minutes
    """
    try:
        # Get latest snapshot
        latest_snapshot = db.query(
            func.max(TopTradersLeaderboard.snapshot_at)
        ).scalar()
        
        if not latest_snapshot:
            return []
        
        query = db.query(TopTradersLeaderboard).filter(
            TopTradersLeaderboard.snapshot_at == latest_snapshot
        )
        
        if source:
            query = query.filter(TopTradersLeaderboard.source == source.lower())
        
        traders = query.order_by(
            TopTradersLeaderboard.rank
        ).limit(limit).all()
        
        return [
            {
                "rank": t.rank,
                "trader_address": t.trader_address[:10] + "..." + t.trader_address[-6:] if t.trader_address else None,
                "source": t.source,
                "total_trades": t.total_trades or 0,
                "total_volume": float(t.total_volume or 0),
                "win_rate": float(t.win_rate or 0),
                "markets_traded": t.markets_traded or 0,
                "pnl_estimate": float(t.pnl_estimate or 0),
            }
            for t in traders
        ]
        
    except Exception as e:
        logger.error(f"Error fetching top traders: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/category-performance")
async def get_category_performance(db: Session = Depends(get_db)) -> List[Dict[str, Any]]:
    """
    Get category performance metrics
    Updates daily
    """
    try:
        # Get latest snapshot
        latest_snapshot = db.query(
            func.max(CategoryPerformanceMetrics.snapshot_at)
        ).scalar()
        
        if not latest_snapshot:
            return []
        
        metrics = db.query(CategoryPerformanceMetrics).filter(
            CategoryPerformanceMetrics.snapshot_at == latest_snapshot
        ).order_by(
            desc(CategoryPerformanceMetrics.total_volume_7d)
        ).all()
        
        return [
            {
                "category_name": m.category_name,
                "active_markets": m.active_markets or 0,
                "total_volume_7d": float(m.total_volume_7d or 0),
                "avg_liquidity": float(m.avg_liquidity or 0),
                "resolution_rate": float(m.resolution_rate or 0),
                "volume_change_pct": float(m.volume_change_pct or 0),
            }
            for m in metrics
        ]
        
    except Exception as e:
        logger.error(f"Error fetching category performance: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/platform-share")
async def get_platform_market_share(
    days: int = Query(30, description="Number of days for timeseries"),
    db: Session = Depends(get_db)
) -> List[Dict[str, Any]]:
    """
    Get platform market share over time
    Updates daily
    """
    try:
        cutoff = datetime.utcnow() - timedelta(days=days)
        
        timeseries = db.query(PlatformMarketShareTimeseries).filter(
            PlatformMarketShareTimeseries.date >= cutoff.date()
        ).order_by(
            PlatformMarketShareTimeseries.date,
            PlatformMarketShareTimeseries.source
        ).all()
        
        return [
            {
                "date": t.date.isoformat(),
                "source": t.source,
                "daily_volume": float(t.daily_volume or 0),
                "market_share_pct": float(t.market_share_pct or 0),
                "cumulative_volume": float(t.cumulative_volume or 0),
            }
            for t in timeseries
        ]
        
    except Exception as e:
        logger.error(f"Error fetching platform market share: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/activity-heatmap")
async def get_activity_heatmap(
    days: int = Query(7, description="Number of days to include"),
    db: Session = Depends(get_db)
) -> List[Dict[str, Any]]:
    """
    Get hourly activity heatmap (hour x day of week)
    Updates hourly
    """
    try:
        cutoff = datetime.utcnow() - timedelta(days=days)
        
        heatmap = db.query(HourlyActivityHeatmap).filter(
            HourlyActivityHeatmap.hour_start >= cutoff
        ).order_by(
            HourlyActivityHeatmap.day_of_week,
            HourlyActivityHeatmap.hour_of_day
        ).all()
        
        return [
            {
                "hour_of_day": h.hour_of_day,
                "day_of_week": h.day_of_week,
                "trade_count": h.trade_count or 0,
                "total_volume": float(h.total_volume or 0),
                "unique_traders": h.unique_traders or 0,
            }
            for h in heatmap
        ]
        
    except Exception as e:
        logger.error(f"Error fetching activity heatmap: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/resolution-accuracy")
async def get_resolution_accuracy(db: Session = Depends(get_db)) -> List[Dict[str, Any]]:
    """
    Get resolution accuracy tracking (price vs actual outcome)
    Updates daily
    """
    try:
        # Get latest snapshot
        latest_snapshot = db.query(
            func.max(ResolutionAccuracyTracker.snapshot_at)
        ).scalar()
        
        if not latest_snapshot:
            return []
        
        accuracy = db.query(ResolutionAccuracyTracker).filter(
            ResolutionAccuracyTracker.snapshot_at == latest_snapshot
        ).order_by(
            ResolutionAccuracyTracker.source,
            ResolutionAccuracyTracker.category_name
        ).all()
        
        return [
            {
                "source": a.source,
                "category_name": a.category_name,
                "markets_resolved": a.markets_resolved or 0,
                "avg_final_price_vs_outcome": float(a.avg_final_price_vs_outcome or 0),
                "brier_score": float(a.brier_score or 0),
                "calibration_score": float(a.calibration_score or 0),
            }
            for a in accuracy
        ]
        
    except Exception as e:
        logger.error(f"Error fetching resolution accuracy: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================
# COMBINED ANALYTICS SUMMARY
# ============================================

@router.get("/summary")
async def get_analytics_summary(db: Session = Depends(get_db)) -> Dict[str, Any]:
    """
    Get combined analytics summary for overview cards
    """
    try:
        from app.models.gold_layer import MarketMetricsSummary, PlatformComparison
        
        # Get latest metrics
        metrics = db.query(MarketMetricsSummary).order_by(
            desc(MarketMetricsSummary.snapshot_at)
        ).first()
        
        # Get platform comparison
        latest_platform_snapshot = db.query(
            func.max(PlatformComparison.snapshot_at)
        ).scalar()
        
        platforms = []
        if latest_platform_snapshot:
            platforms = db.query(PlatformComparison).filter(
                PlatformComparison.snapshot_at == latest_platform_snapshot
            ).all()
        
        # Get top traders count
        latest_trader_snapshot = db.query(
            func.max(TopTradersLeaderboard.snapshot_at)
        ).scalar()
        
        total_traders = 0
        if latest_trader_snapshot:
            total_traders = db.query(
                func.count(TopTradersLeaderboard.trader_address)
            ).filter(
                TopTradersLeaderboard.snapshot_at == latest_trader_snapshot
            ).scalar() or 0
        
        return {
            "overview": {
                "total_markets": metrics.total_markets if metrics else 0,
                "active_markets": metrics.active_markets if metrics else 0,
                "total_volume_24h": float(metrics.total_volume_24h or 0) if metrics else 0,
                "total_volume_7d": float(metrics.total_volume_7d or 0) if metrics else 0,
                "total_traders": total_traders,
                "updated_at": metrics.snapshot_at.isoformat() if metrics else None,
            },
            "platforms": [
                {
                    "source": p.source,
                    "market_count": p.market_count or 0,
                    "volume_24h": float(p.volume_24h or 0),
                    "avg_liquidity": float(p.avg_liquidity or 0),
                }
                for p in platforms
            ],
        }
        
    except Exception as e:
        logger.error(f"Error fetching analytics summary: {e}")
        raise HTTPException(status_code=500, detail=str(e))
