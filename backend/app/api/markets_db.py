"""
Markets API endpoints - Database-backed version
Fetches data from predictions_gold and predictions_silver schemas
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc, func, text
from typing import Dict, List, Any, Optional
import logging
from datetime import datetime, timedelta

from app.database.session import get_db
from app.models.gold_layer import (
    MarketDetailCache,
    MarketPriceHistory,
    MarketTradeActivity,
    MarketOrderbookDepth,
    RelatedMarkets,
    MarketStatistics,
    MarketSearchCache,
    FilterAggregates,
    WatchlistPopularMarkets,
    RecentlyResolvedMarkets,
    CategoryBreakdownByPlatform,
)

logger = logging.getLogger(__name__)
router = APIRouter()


# ============================================
# MARKET DETAIL PAGE ENDPOINTS
# ============================================

@router.get("/{market_id}/details")
async def get_market_details(
    market_id: str,
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Get full market details (cached)
    Updates every 15 minutes
    """
    try:
        # Try to find by UUID first, then by source_market_id
        market = db.query(MarketDetailCache).filter(
            (MarketDetailCache.market_id == market_id) |
            (MarketDetailCache.source_market_id == market_id)
        ).order_by(
            desc(MarketDetailCache.cached_at)
        ).first()
        
        if not market:
            raise HTTPException(status_code=404, detail=f"Market {market_id} not found")
        
        return {
            "market_id": str(market.market_id),
            "source": market.source,
            "source_market_id": market.source_market_id,
            "question": market.question,
            "description": market.description,
            "category": market.category,
            "end_date": market.end_date.isoformat() if market.end_date else None,
            "total_volume": float(market.total_volume or 0),
            "volume_24h": float(market.volume_24h or 0),
            "yes_price": float(market.yes_price or 0),
            "no_price": float(market.no_price or 0),
            "liquidity": float(market.liquidity or 0),
            "created_at": market.created_at.isoformat() if market.created_at else None,
            "status": market.status,
            "image_url": market.image_url,
            "cached_at": market.cached_at.isoformat(),
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching market details: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{market_id}/price-history")
async def get_price_history(
    market_id: str,
    interval: str = Query("1h", description="Time interval: 5m, 15m, 1h, 4h, 1d"),
    days: int = Query(7, description="Number of days to look back"),
    db: Session = Depends(get_db)
) -> List[Dict[str, Any]]:
    """
    Get price history for charts (OHLC candles)
    Updates in real-time
    """
    try:
        cutoff = datetime.utcnow() - timedelta(days=days)
        
        prices = db.query(MarketPriceHistory).filter(
            MarketPriceHistory.source_market_id == market_id,
            MarketPriceHistory.period_start >= cutoff
        ).order_by(
            MarketPriceHistory.period_start
        ).all()
        
        return [
            {
                "period_start": p.period_start.isoformat(),
                "period_end": p.period_end.isoformat() if p.period_end else None,
                "open": float(p.open_price or 0),
                "high": float(p.high_price or 0),
                "low": float(p.low_price or 0),
                "close": float(p.close_price or 0),
                "volume": float(p.volume_period or 0),
                "trade_count": p.trade_count or 0,
            }
            for p in prices
        ]
        
    except Exception as e:
        logger.error(f"Error fetching price history: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{market_id}/volume-history")
async def get_volume_history(
    market_id: str,
    hours: int = Query(24, description="Number of hours to look back"),
    db: Session = Depends(get_db)
) -> List[Dict[str, Any]]:
    """
    Get volume history for charts (hourly bars)
    Updates in real-time
    """
    try:
        cutoff = datetime.utcnow() - timedelta(hours=hours)
        
        volumes = db.query(MarketTradeActivity).filter(
            MarketTradeActivity.source_market_id == market_id,
            MarketTradeActivity.hour_start >= cutoff
        ).order_by(
            MarketTradeActivity.hour_start
        ).all()
        
        return [
            {
                "hour_start": v.hour_start.isoformat(),
                "trade_count": v.trade_count or 0,
                "total_volume": float(v.total_volume or 0),
                "buy_volume": float(v.buy_volume or 0),
                "sell_volume": float(v.sell_volume or 0),
                "unique_traders": v.unique_traders or 0,
                "avg_trade_size": float(v.avg_trade_size or 0),
            }
            for v in volumes
        ]
        
    except Exception as e:
        logger.error(f"Error fetching volume history: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{market_id}/trades")
async def get_recent_trades(
    market_id: str,
    limit: int = Query(50, description="Number of trades to return"),
    db: Session = Depends(get_db)
) -> List[Dict[str, Any]]:
    """
    Get recent trades for a market (real-time from silver layer)
    """
    try:
        # Query trades from silver layer
        result = db.execute(text("""
            SELECT 
                traded_at,
                quantity,
                price,
                total_value,
                taker_address,
                side
            FROM predictions_silver.trades
            WHERE source_market_id = :market_id
            ORDER BY traded_at DESC
            LIMIT :limit
        """), {"market_id": market_id, "limit": limit})
        
        trades = result.fetchall()
        
        return [
            {
                "traded_at": t.traded_at.isoformat() if t.traded_at else None,
                "quantity": float(t.quantity or 0),
                "price": float(t.price or 0),
                "total_value": float(t.total_value or 0),
                "taker_address": t.taker_address[:10] + "..." if t.taker_address else None,
                "side": t.side,
            }
            for t in trades
        ]
        
    except Exception as e:
        logger.error(f"Error fetching recent trades: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{market_id}/orderbook")
async def get_orderbook(
    market_id: str,
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Get orderbook depth for visualization
    Updates in real-time
    """
    try:
        orderbook = db.query(MarketOrderbookDepth).filter(
            MarketOrderbookDepth.market_id == market_id
        ).order_by(
            desc(MarketOrderbookDepth.snapshot_at)
        ).first()
        
        if not orderbook:
            return {
                "market_id": market_id,
                "bids": [],
                "asks": [],
                "spread": 0,
                "total_bid_depth": 0,
                "total_ask_depth": 0,
                "mid_price": 0.5,
                "snapshot_at": None,
            }
        
        return {
            "market_id": str(orderbook.market_id),
            "bids": orderbook.bids or [],
            "asks": orderbook.asks or [],
            "spread": float(orderbook.spread or 0),
            "total_bid_depth": float(orderbook.total_bid_depth or 0),
            "total_ask_depth": float(orderbook.total_ask_depth or 0),
            "mid_price": float(orderbook.mid_price or 0.5),
            "snapshot_at": orderbook.snapshot_at.isoformat() if orderbook.snapshot_at else None,
        }
        
    except Exception as e:
        logger.error(f"Error fetching orderbook: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{market_id}/similar")
async def get_similar_markets(
    market_id: str,
    limit: int = Query(10, description="Number of similar markets to return"),
    db: Session = Depends(get_db)
) -> List[Dict[str, Any]]:
    """
    Get similar/related markets
    Updates every 15 minutes
    """
    try:
        # Get latest snapshot
        latest_snapshot = db.query(
            func.max(RelatedMarkets.snapshot_at)
        ).filter(
            RelatedMarkets.source_market_id == market_id
        ).scalar()
        
        if not latest_snapshot:
            return []
        
        similar = db.query(RelatedMarkets).filter(
            RelatedMarkets.source_market_id == market_id,
            RelatedMarkets.snapshot_at == latest_snapshot
        ).order_by(
            RelatedMarkets.rank
        ).limit(limit).all()
        
        return [
            {
                "related_market_id": s.related_market_id,
                "title": s.related_title,
                "similarity_score": float(s.similarity_score or 0),
                "yes_price": float(s.yes_price or 0),
                "volume_24h": float(s.volume_24h or 0),
                "rank": s.rank,
            }
            for s in similar
        ]
        
    except Exception as e:
        logger.error(f"Error fetching similar markets: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{market_id}/statistics")
async def get_market_statistics(
    market_id: str,
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Get market statistics (aggregated metrics)
    Updates every 15 minutes
    """
    try:
        stats = db.query(MarketStatistics).filter(
            MarketStatistics.market_id == market_id
        ).order_by(
            desc(MarketStatistics.computed_at)
        ).first()
        
        if not stats:
            return {
                "market_id": market_id,
                "total_trades": 0,
                "unique_traders": 0,
                "avg_trade_size": 0,
                "largest_trade": 0,
                "price_volatility": 0,
                "volume_24h": 0,
                "volume_7d": 0,
                "resolution_date": None,
                "computed_at": None,
            }
        
        return {
            "market_id": str(stats.market_id),
            "total_trades": stats.total_trades or 0,
            "unique_traders": stats.unique_traders or 0,
            "avg_trade_size": float(stats.avg_trade_size or 0),
            "largest_trade": float(stats.largest_trade or 0),
            "price_volatility": float(stats.price_volatility or 0),
            "volume_24h": float(stats.volume_24h or 0),
            "volume_7d": float(stats.volume_7d or 0),
            "resolution_date": stats.resolution_date.isoformat() if stats.resolution_date else None,
            "computed_at": stats.computed_at.isoformat() if stats.computed_at else None,
        }
        
    except Exception as e:
        logger.error(f"Error fetching market statistics: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================
# MARKETS/EXPLORE PAGE ENDPOINTS
# ============================================

@router.get("/search")
async def search_markets(
    q: str = Query(..., description="Search query"),
    limit: int = Query(20, description="Number of results"),
    source: Optional[str] = Query(None, description="Filter by platform"),
    category: Optional[str] = Query(None, description="Filter by category"),
    db: Session = Depends(get_db)
) -> List[Dict[str, Any]]:
    """
    Full-text search across markets
    Updates every 15 minutes
    """
    try:
        # Build base query
        query = db.query(MarketSearchCache)
        
        # Add full-text search if search_vector exists
        # Fallback to LIKE if tsvector not available
        search_query = f"%{q}%"
        query = query.filter(
            (MarketSearchCache.question.ilike(search_query)) |
            (MarketSearchCache.description.ilike(search_query))
        )
        
        # Apply filters
        if source:
            query = query.filter(MarketSearchCache.source == source.lower())
        if category:
            query = query.filter(MarketSearchCache.category_name == category)
        
        # Order by popularity and limit
        results = query.order_by(
            desc(MarketSearchCache.popularity_score)
        ).limit(limit).all()
        
        return [
            {
                "market_id": str(r.market_id),
                "question": r.question,
                "description": r.description[:200] + "..." if r.description and len(r.description) > 200 else r.description,
                "category": r.category_name,
                "source": r.source,
                "yes_price": float(r.yes_price or 0),
                "volume_24h": float(r.volume_24h or 0),
                "popularity_score": r.popularity_score or 0,
            }
            for r in results
        ]
        
    except Exception as e:
        logger.error(f"Error searching markets: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/filters")
async def get_filter_aggregates(db: Session = Depends(get_db)) -> Dict[str, List[Dict[str, Any]]]:
    """
    Get pre-computed filter counts for sidebar
    Updates every 5 minutes
    """
    try:
        # Get latest snapshot
        latest_snapshot = db.query(
            func.max(FilterAggregates.snapshot_at)
        ).scalar()
        
        if not latest_snapshot:
            return {"categories": [], "platforms": [], "statuses": [], "volumes": []}
        
        filters = db.query(FilterAggregates).filter(
            FilterAggregates.snapshot_at == latest_snapshot
        ).order_by(
            FilterAggregates.filter_type,
            FilterAggregates.sort_order
        ).all()
        
        # Group by filter type
        result = {
            "categories": [],
            "platforms": [],
            "statuses": [],
            "volumes": [],
        }
        
        for f in filters:
            item = {
                "value": f.filter_value,
                "display_name": f.display_name or f.filter_value,
                "total_count": f.total_count or 0,
                "active_count": f.active_count or 0,
                "icon": f.icon,
            }
            
            if f.filter_type == "category":
                result["categories"].append(item)
            elif f.filter_type == "platform":
                result["platforms"].append(item)
            elif f.filter_type == "status":
                result["statuses"].append(item)
            elif f.filter_type == "volume":
                result["volumes"].append(item)
        
        return result
        
    except Exception as e:
        logger.error(f"Error fetching filter aggregates: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/popular")
async def get_popular_markets(
    limit: int = Query(50, description="Number of markets to return"),
    db: Session = Depends(get_db)
) -> List[Dict[str, Any]]:
    """
    Get most popular markets by watchlist adds and views
    Updates every 15 minutes
    """
    try:
        # Get latest snapshot
        latest_snapshot = db.query(
            func.max(WatchlistPopularMarkets.snapshot_at)
        ).scalar()
        
        if not latest_snapshot:
            return []
        
        markets = db.query(WatchlistPopularMarkets).filter(
            WatchlistPopularMarkets.snapshot_at == latest_snapshot
        ).order_by(
            WatchlistPopularMarkets.popularity_rank
        ).limit(limit).all()
        
        return [
            {
                "market_id": str(m.market_id),
                "question": m.question,
                "source": m.source,
                "yes_price": float(m.yes_price or 0),
                "volume_24h": float(m.volume_24h or 0),
                "popularity_rank": m.popularity_rank,
                "trade_count_24h": m.trade_count_24h or 0,
            }
            for m in markets
        ]
        
    except Exception as e:
        logger.error(f"Error fetching popular markets: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/recently-resolved")
async def get_recently_resolved(
    limit: int = Query(20, description="Number of markets to return"),
    db: Session = Depends(get_db)
) -> List[Dict[str, Any]]:
    """
    Get recently resolved markets with outcomes
    Updates every 15 minutes
    """
    try:
        # Get latest snapshot
        latest_snapshot = db.query(
            func.max(RecentlyResolvedMarkets.snapshot_at)
        ).scalar()
        
        if not latest_snapshot:
            return []
        
        markets = db.query(RecentlyResolvedMarkets).filter(
            RecentlyResolvedMarkets.snapshot_at == latest_snapshot
        ).order_by(
            desc(RecentlyResolvedMarkets.resolved_at)
        ).limit(limit).all()
        
        return [
            {
                "market_id": str(m.market_id),
                "question": m.question,
                "source": m.source,
                "outcome": m.outcome,
                "resolved_at": m.resolved_at.isoformat() if m.resolved_at else None,
                "final_yes_price": float(m.final_yes_price or 0),
                "total_volume": float(m.total_volume or 0),
            }
            for m in markets
        ]
        
    except Exception as e:
        logger.error(f"Error fetching recently resolved markets: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/category-breakdown")
async def get_category_breakdown(db: Session = Depends(get_db)) -> List[Dict[str, Any]]:
    """
    Get 2D category x platform breakdown matrix
    Updates every 15 minutes
    """
    try:
        # Get latest snapshot
        latest_snapshot = db.query(
            func.max(CategoryBreakdownByPlatform.snapshot_at)
        ).scalar()
        
        if not latest_snapshot:
            return []
        
        breakdown = db.query(CategoryBreakdownByPlatform).filter(
            CategoryBreakdownByPlatform.snapshot_at == latest_snapshot
        ).order_by(
            CategoryBreakdownByPlatform.source,
            desc(CategoryBreakdownByPlatform.total_volume_24h)
        ).all()
        
        return [
            {
                "source": b.source,
                "category_name": b.category_name,
                "market_count": b.market_count or 0,
                "total_volume_24h": float(b.total_volume_24h or 0),
                "pct_of_platform_volume": float(b.pct_of_platform_volume or 0),
            }
            for b in breakdown
        ]
        
    except Exception as e:
        logger.error(f"Error fetching category breakdown: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================
# LIST ALL MARKETS (with pagination)
# ============================================

@router.get("/")
async def list_markets(
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(20, ge=1, le=100, description="Items per page"),
    source: Optional[str] = Query(None, description="Filter by platform"),
    category: Optional[str] = Query(None, description="Filter by category"),
    status: Optional[str] = Query(None, description="Filter by status (open/closed)"),
    sort_by: str = Query("volume_24h", description="Sort field"),
    sort_order: str = Query("desc", description="Sort order (asc/desc)"),
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    List all markets with filtering and pagination
    Queries silver layer directly for freshest data
    """
    try:
        offset = (page - 1) * limit
        
        # Build dynamic query
        base_query = """
            SELECT 
                id,
                question,
                source,
                source_market_id,
                category,
                yes_price,
                volume_24h,
                liquidity,
                status,
                end_date,
                created_at
            FROM predictions_silver.markets
            WHERE 1=1
        """
        
        params = {"limit": limit, "offset": offset}
        
        if source:
            base_query += " AND source = :source"
            params["source"] = source.lower()
        if category:
            base_query += " AND category = :category"
            params["category"] = category
        if status:
            base_query += " AND status = :status"
            params["status"] = status
        
        # Add sorting
        sort_column = "volume_24h" if sort_by not in ["volume_24h", "yes_price", "created_at", "end_date"] else sort_by
        sort_dir = "DESC" if sort_order.lower() == "desc" else "ASC"
        base_query += f" ORDER BY {sort_column} {sort_dir} NULLS LAST"
        base_query += " LIMIT :limit OFFSET :offset"
        
        result = db.execute(text(base_query), params)
        markets = result.fetchall()
        
        # Get total count
        count_query = "SELECT COUNT(*) FROM predictions_silver.markets WHERE 1=1"
        if source:
            count_query += f" AND source = '{source.lower()}'"
        if category:
            count_query += f" AND category = '{category}'"
        if status:
            count_query += f" AND status = '{status}'"
        
        total = db.execute(text(count_query)).scalar()
        
        return {
            "markets": [
                {
                    "id": str(m.id),
                    "question": m.question,
                    "source": m.source,
                    "source_market_id": m.source_market_id,
                    "category": m.category,
                    "yes_price": float(m.yes_price or 0),
                    "volume_24h": float(m.volume_24h or 0),
                    "liquidity": float(m.liquidity or 0),
                    "status": m.status,
                    "end_date": m.end_date.isoformat() if m.end_date else None,
                    "created_at": m.created_at.isoformat() if m.created_at else None,
                }
                for m in markets
            ],
            "pagination": {
                "page": page,
                "limit": limit,
                "total": total,
                "pages": (total + limit - 1) // limit if total else 0,
            }
        }
        
    except Exception as e:
        logger.error(f"Error listing markets: {e}")
        raise HTTPException(status_code=500, detail=str(e))
