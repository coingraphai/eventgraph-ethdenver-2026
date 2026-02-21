"""
On-Demand Market Data API - Real-time trades and orderbooks

Fetches data directly from Dome API without database storage.
Faster and reduces database load for real-time data.
"""

from fastapi import APIRouter, Query, HTTPException
from typing import Optional, List, Dict, Any
import logging

from app.services.dome_api_service import DomeAPIService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/realtime", tags=["Real-time Market Data"])


# ============================================================================
# Trades Endpoints
# ============================================================================

@router.get("/trades/{platform}/{market_id}")
async def get_market_trades(
    platform: str,
    market_id: str,
    hours: int = Query(24, ge=1, le=168, description="Fetch trades from last N hours"),
    min_usd: float = Query(1000, ge=0, description="Minimum trade value in USD"),
    limit: int = Query(500, ge=10, le=2000, description="Maximum trades to return"),
):
    """
    Get recent trades for a market directly from Dome API (on-demand).
    
    **No database storage** - fetches real-time data from Dome API.
    
    Query Parameters:
    - hours: Fetch trades from last N hours (1-168, default: 24)
    - min_usd: Minimum trade value filter (default: 1000)
    - limit: Max trades to return (10-2000, default: 500)
    
    Example:
    ```
    GET /api/realtime/trades/polymarket/0x123abc?hours=24&min_usd=1000&limit=500
    ```
    
    Returns:
    ```json
    {
        "trades": [
            {
                "trade_id": "0xabc...",
                "timestamp": "2026-02-02T10:30:00Z",
                "side": "BUY",
                "price": 0.65,
                "quantity": 2500,
                "total_value": 1625.00
            }
        ],
        "total_count": 1234,
        "filtered_count": 89,
        "time_range": {...},
        "filters": {...}
    }
    ```
    """
    # Normalize platform names
    platform_map = {
        "poly": "polymarket",
        "polymarket": "polymarket",
        "kalshi": "kalshi",
        "limitless": "limitless",
        "opiniontrade": "opiniontrade"
    }
    normalized_platform = platform_map.get(platform.lower(), platform.lower())
    
    async with DomeAPIService() as service:
        result = await service.get_trades(
            market_id=market_id,
            hours=hours,
            min_usd=min_usd,
            limit=limit,
            platform=normalized_platform
        )
        
        # Return result even if there's an error but we have metadata
        # Only raise 503 if there's a critical error
        if "error" in result and not result.get("trades"):
            # Check if it's a 404 (market not found) vs other errors
            if "404" in str(result.get("error", "")) or "not found" in str(result.get("error", "")).lower():
                # Market not found - return empty trades with metadata
                return {
                    "trades": [],
                    "total_count": 0,
                    "filtered_count": 0,
                    "error": "Market data not available",
                    "filters": result.get("filters", {})
                }
            # Other errors - still raise 503
            raise HTTPException(
                status_code=503,
                detail=f"Failed to fetch trades: {result['error']}"
            )
        
        return result


# ============================================================================
# Orderbook Endpoints
# ============================================================================

@router.get("/orderbook/{platform}/{token_id}")
async def get_token_orderbook(
    platform: str,
    token_id: str,
    depth: int = Query(20, ge=5, le=100, description="Number of price levels"),
):
    """
    Get current orderbook snapshot for a token directly from Dome API (on-demand).
    
    **No database storage** - fetches real-time data from Dome API.
    
    Query Parameters:
    - depth: Number of bid/ask levels (5-100, default: 20)
    
    Example:
    ```
    GET /api/realtime/orderbook/polymarket/58519484510528087142...?depth=20
    ```
    
    Returns:
    ```json
    {
        "bids": [
            {"price": "0.65", "size": "1500"},
            {"price": "0.64", "size": "2000"}
        ],
        "asks": [
            {"price": "0.66", "size": "1200"},
            {"price": "0.67", "size": "1800"}
        ],
        "spread": 0.01,
        "mid_price": 0.655,
        "best_bid": 0.65,
        "best_ask": 0.66,
        "timestamp": "2026-02-02T12:00:00Z"
    }
    ```
    """
    # Normalize platform names
    platform_map = {
        "poly": "polymarket",
        "polymarket": "polymarket",
        "kalshi": "kalshi",
        "limitless": "limitless",
        "opiniontrade": "opiniontrade"
    }
    normalized_platform = platform_map.get(platform.lower(), platform.lower())
    
    async with DomeAPIService() as service:
        result = await service.get_orderbook(
            token_id=token_id,
            depth=depth,
            platform=normalized_platform
        )
        
        # Return result even if there's an error but we have metadata
        # Only raise 503 if there's a critical error
        if "error" in result and not result.get("bids"):
            # Check if it's a 404 (market not found) vs other errors
            if "404" in str(result.get("error", "")) or "not found" in str(result.get("error", "")).lower():
                # Market not found - return empty orderbook with metadata
                return {
                    "bids": [],
                    "asks": [],
                    "spread": 0,
                    "mid_price": 0,
                    "best_bid": 0,
                    "best_ask": 0,
                    "error": "Orderbook data not available",
                    "timestamp": None
                }
            # Other errors - still raise 503
            raise HTTPException(
                status_code=503,
                detail=f"Failed to fetch orderbook: {result['error']}"
            )
        
        return result


# ============================================================================
# Batch Endpoint (for multiple markets)
# ============================================================================

@router.post("/trades/batch")
async def get_batch_trades(
    request: Dict[str, Any]
):
    """
    Fetch trades for multiple markets in a single request.
    
    Request Body:
    ```json
    {
        "markets": [
            {"platform": "polymarket", "market_id": "0x123..."},
            {"platform": "polymarket", "market_id": "0x456..."}
        ],
        "hours": 24,
        "min_usd": 1000,
        "limit_per_market": 100
    }
    ```
    
    Returns:
    ```json
    {
        "results": {
            "0x123...": {"trades": [...], "total_count": 50},
            "0x456...": {"trades": [...], "total_count": 30}
        },
        "total_markets": 2,
        "total_trades": 80
    }
    ```
    """
    markets = request.get("markets", [])
    hours = request.get("hours", 24)
    min_usd = request.get("min_usd", 1000)
    limit_per_market = request.get("limit_per_market", 100)
    
    if not markets:
        raise HTTPException(status_code=400, detail="No markets provided")
    
    if len(markets) > 50:
        raise HTTPException(status_code=400, detail="Maximum 50 markets per batch request")
    
    results = {}
    total_trades = 0
    
    async with DomeAPIService() as service:
        for market in markets:
            platform = market.get("platform", "polymarket")
            market_id = market.get("market_id")
            
            if not market_id:
                continue
            
            result = await service.get_trades(
                market_id=market_id,
                hours=hours,
                min_usd=min_usd,
                limit=limit_per_market,
                platform=platform
            )
            
            results[market_id] = result
            total_trades += result.get("filtered_count", 0)
    
    return {
        "results": results,
        "total_markets": len(results),
        "total_trades": total_trades,
    }
