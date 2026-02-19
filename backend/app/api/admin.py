"""
Admin API for database maintenance and batch operations
"""
from fastapi import APIRouter, BackgroundTasks, HTTPException
from typing import Dict, Any
import logging

from app.services.polymarket_price_batch import run_polymarket_price_update

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/admin/polymarket/update-prices")
async def trigger_price_update(
    max_markets: int = 1000,
    background_tasks: BackgroundTasks = None
) -> Dict[str, Any]:
    """
    Trigger batch price update for Polymarket markets.
    
    This endpoint uses multithreading to fetch prices efficiently.
    - Processes up to `max_markets` markets
    - Uses 10 concurrent threads
    - Respects API rate limits
    - Updates database in bulk
    
    Args:
        max_markets: Maximum number of markets to update (default: 1000)
        
    Returns:
        Statistics about the update process
    """
    try:
        # Clear any stale database connections
        from app.database.session import engine
        engine.dispose()
        
        logger.info(f"Starting batch price update for {max_markets} markets")
        stats = await run_polymarket_price_update(max_markets=max_markets)
        
        return {
            "status": "success",
            "message": f"Updated prices for {stats['prices_updated']} markets",
            "statistics": stats
        }
        
    except Exception as e:
        logger.error(f"Failed to update prices: {e}", exc_info=True)
        
        # Try to clear connections on error
        try:
            from app.database.session import engine
            engine.dispose()
        except:
            pass
            
        raise HTTPException(
            status_code=500,
            detail=f"Price update failed: {str(e)}"
        )


@router.get("/admin/polymarket/price-coverage")
async def get_price_coverage() -> Dict[str, Any]:
    """
    Get statistics about Polymarket price coverage in the database.
    
    Returns:
        Statistics about how many markets have prices vs. missing prices
    """
    from app.database.session import SessionLocal
    from sqlalchemy import text
    
    session = SessionLocal()
    try:
        result = session.execute(text("""
            SELECT 
                COUNT(*) as total_markets,
                COUNT(yes_price) as with_prices,
                COUNT(*) - COUNT(yes_price) as missing_prices,
                ROUND(COUNT(yes_price)::numeric / NULLIF(COUNT(*), 0)::numeric * 100, 2) as coverage_pct,
                SUM(CASE WHEN yes_price IS NULL THEN volume_total ELSE 0 END) as missing_volume,
                SUM(volume_total) as total_volume
            FROM predictions_silver.markets
            WHERE source = 'polymarket'
        """))
        
        row = result.fetchone()
        
        return {
            "total_markets": row[0],
            "markets_with_prices": row[1],
            "markets_missing_prices": row[2],
            "coverage_percentage": float(row[3]) if row[3] else 0.0,
            "volume_missing_prices": float(row[4]) if row[4] else 0.0,
            "total_volume": float(row[5]) if row[5] else 0.0
        }
        
    finally:
        session.close()


@router.get("/admin/database/stats")
async def get_database_stats() -> Dict[str, Any]:
    """
    Get overall database statistics for all platforms.
    
    Returns:
        Statistics by platform including market counts and data coverage
    """
    from app.database.session import SessionLocal
    from sqlalchemy import text
    
    session = SessionLocal()
    try:
        result = session.execute(text("""
            SELECT 
                source as platform,
                COUNT(*) as total_markets,
                COUNT(yes_price) as with_yes_price,
                COUNT(volume_24h) as with_volume_24h,
                COUNT(liquidity) as with_liquidity,
                ROUND(COUNT(yes_price)::numeric / NULLIF(COUNT(*), 0)::numeric * 100, 1) as price_pct,
                ROUND(COUNT(volume_24h)::numeric / NULLIF(COUNT(*), 0)::numeric * 100, 1) as vol_24h_pct,
                SUM(volume_total) as total_volume
            FROM predictions_silver.markets
            GROUP BY source
            ORDER BY total_markets DESC
        """))
        
        platforms = []
        for row in result:
            platforms.append({
                "platform": row[0],
                "total_markets": row[1],
                "with_yes_price": row[2],
                "with_volume_24h": row[3],
                "with_liquidity": row[4],
                "price_coverage_pct": float(row[5]) if row[5] else 0.0,
                "volume_24h_coverage_pct": float(row[6]) if row[6] else 0.0,
                "total_volume_usd": float(row[7]) if row[7] else 0.0
            })
        
        return {
            "platforms": platforms,
            "total_markets": sum(p["total_markets"] for p in platforms)
        }
        
    finally:
        session.close()
