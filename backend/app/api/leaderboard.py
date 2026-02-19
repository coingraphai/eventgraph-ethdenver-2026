"""
Leaderboard API Endpoints

Provides top traders across prediction market platforms with external profile links
"""

from fastapi import APIRouter, Query
from typing import Optional, List
from datetime import datetime

from app.services.leaderboard_service import leaderboard_service

router = APIRouter()


@router.get("/leaderboard")
async def get_leaderboard(
    limit: int = Query(100, ge=1, le=2000, description="Number of traders to return (max 2000)"),
    time_window: str = Query("all_time", regex="^(24h|7d|30d|all_time)$", description="Time window for stats"),
    platform: Optional[str] = Query(None, regex="^(polymarket|kalshi|limitless)$", description="Filter by platform")
):
    """
    Get top traders ranked by profit & loss (PnL) - REAL DATA FROM DATABASE
    
    Data is populated from actual trades tracked via platform APIs.
    Supports up to 2000 traders.
    
    Time windows:
    - 24h: Last 24 hours
    - 7d: Last 7 days
    - 30d: Last 30 days
    - all_time: All time stats
    
    Platforms:
    - polymarket: Polymarket traders
    - kalshi: Kalshi traders
    - limitless: Limitless Exchange traders
    - None: All platforms combined
    
    Returns:
        List of traders with stats and external profile URLs
    """
    try:
        traders = await leaderboard_service.get_combined_leaderboard(
            limit=limit,
            time_window=time_window,
            platform=platform
        )
        
        return {
            "success": True,
            "traders": traders,
            "count": len(traders),
            "time_window": time_window,
            "platform": platform or "all",
            "updated_at": datetime.utcnow().isoformat()
        }
    
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "traders": []
        }


@router.get("/leaderboard/trader/{wallet_address}")
async def get_trader_profile(
    wallet_address: str,
    platform: str = Query(..., regex="^(polymarket|kalshi|limitless)$", description="Platform for this trader")
):
    """
    Get detailed trader profile
    
    Note: Returns external profile URL for redirection.
    Frontend should redirect users to platform's native profile page.
    
    Args:
        wallet_address: Trader's wallet address
        platform: Platform where trader is active
    
    Returns:
        Trader profile with external URL
    """
    try:
        profile = await leaderboard_service.get_trader_profile(
            wallet_address=wallet_address,
            platform=platform
        )
        
        if not profile:
            return {
                "success": False,
                "error": "Trader not found",
                "profile": None
            }
        
        return {
            "success": True,
            "profile": profile,
            "updated_at": datetime.utcnow().isoformat()
        }
    
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "profile": None
        }


@router.get("/leaderboard/stats")
async def get_leaderboard_stats():
    """
    Get aggregate leaderboard statistics
    
    Returns:
        Summary stats across all platforms
    """
    try:
        # Get top 100 from each platform
        all_traders = await leaderboard_service.get_combined_leaderboard(limit=100)
        
        # Calculate aggregate stats
        total_pnl = sum(t["pnl"] for t in all_traders)
        total_volume = sum(t["volume"] for t in all_traders)
        total_trades = sum(t["trades"] for t in all_traders)
        avg_win_rate = sum(t["win_rate"] for t in all_traders) / len(all_traders) if all_traders else 0
        
        # Platform breakdown
        platform_counts = {}
        for trader in all_traders:
            platform = trader["platform"]
            platform_counts[platform] = platform_counts.get(platform, 0) + 1
        
        return {
            "success": True,
            "stats": {
                "total_traders": len(all_traders),
                "total_pnl": round(total_pnl, 2),
                "total_volume": round(total_volume, 2),
                "total_trades": total_trades,
                "avg_win_rate": round(avg_win_rate, 3),
                "platform_breakdown": platform_counts
            },
            "updated_at": datetime.utcnow().isoformat()
        }
    
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "stats": {}
        }
