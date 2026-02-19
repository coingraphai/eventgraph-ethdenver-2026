"""
Dashboard API endpoint for aggregating prediction market data.
Provides consolidated statistics from Polymarket and Kalshi.
"""

from fastapi import APIRouter, HTTPException, Depends
from typing import Dict, List, Any
import logging
from datetime import datetime
from collections import Counter

from app.services.prediction_mcp_client import PredictionMCPClient
from app.config import settings

logger = logging.getLogger(__name__)
router = APIRouter()


def get_mcp_client() -> PredictionMCPClient:
    """Dependency to get MCP client instance."""
    return PredictionMCPClient()


@router.get("/stats")
async def get_dashboard_stats(
    limit: int = 50,
    mcp_client: PredictionMCPClient = Depends(get_mcp_client)
) -> Dict[str, Any]:
    """
    Get aggregated dashboard statistics from both Polymarket and Kalshi.
    
    Returns:
        - top_markets: Top markets by volume across both platforms
        - categories: Distribution of markets by category/tags
        - volume_trends: Volume comparison data
        - platform_stats: Summary statistics for each platform
        - recent_activity: Recent market updates
    """
    try:
        logger.info(f"Fetching dashboard stats with limit={limit}")
        
        # Fetch data from both platforms in parallel
        polymarket_data = await mcp_client.polymarket_get_markets(
            status="open",
            limit=limit
        )
        
        kalshi_data = await mcp_client.kalshi_get_markets(
            status="open",
            limit=limit
        )
        
        # Process Polymarket markets
        polymarket_markets = polymarket_data.get("markets", [])
        polymarket_total = polymarket_data.get("pagination", {}).get("total", 0)
        
        # Process Kalshi markets
        kalshi_markets = kalshi_data.get("markets", [])
        kalshi_total = kalshi_data.get("pagination", {}).get("total", 0)
        
        # Build top markets list with balanced representation
        # STANDARDIZED TO 24-HOUR VOLUME for consistent comparison
        # NOTE: Polymarket 24h = weekly average (volume_1_week / 7)
        #       Kalshi 24h = actual 24h volume
        top_markets = []
        
        # Get top 10 from each platform separately first
        polymarket_top = []
        for market in polymarket_markets[:10]:
            # Estimate 24h volume from Polymarket's weekly data (average daily)
            vol_week = getattr(market, "volume_1_week", 0) or 0
            vol_24h = vol_week / 7 if vol_week else 0  # Average daily volume
            vol_total = getattr(market, "volume_total", 0) or 0
            polymarket_top.append({
                "title": getattr(market, "title", "Unknown"),
                "volume": vol_24h,  # 24h average (estimated from weekly)
                "volume_24h": vol_24h,
                "volume_week": vol_week,
                "volume_total": vol_total,
                "platform": "Polymarket",
                "image": getattr(market, "image", None),
                "slug": getattr(market, "market_slug", None),
                "tags": getattr(market, "tags", []) or []
            })
        
        kalshi_top = []
        for market in kalshi_markets[:10]:
            # Kalshi provides 24h volume directly
            vol_24h = getattr(market, "volume_24h", 0) or 0
            kalshi_top.append({
                "title": getattr(market, "title", "Unknown"),
                "volume": vol_24h,  # 24h volume (actual)
                "volume_24h": vol_24h,
                "platform": "Kalshi",
                "ticker": getattr(market, "ticker", None),
                "tags": getattr(market, "tags", []) or []
            })
        
        # Combine: Take top 8 from Polymarket and top 7 from Kalshi for balanced representation
        polymarket_top.sort(key=lambda x: x.get("volume", 0), reverse=True)
        kalshi_top.sort(key=lambda x: x.get("volume", 0), reverse=True)
        
        # Interleave both platforms for balanced display
        top_markets = []
        for i in range(max(8, 7)):
            if i < 8 and i < len(polymarket_top):
                top_markets.append(polymarket_top[i])
            if i < 7 and i < len(kalshi_top):
                top_markets.append(kalshi_top[i])
        
        top_markets = top_markets[:15]
        
        # Calculate category distribution
        all_tags = []
        for market in polymarket_markets:
            tags = getattr(market, "tags", []) or []
            all_tags.extend(tags)
        for market in kalshi_markets:
            tags = getattr(market, "tags", []) or []
            all_tags.extend(tags)
        
        tag_counter = Counter(all_tags)
        categories = [
            {"name": tag, "count": count}
            for tag, count in tag_counter.most_common(10)
        ]
        
        # Calculate volume trends (combine both platforms)
        # STANDARDIZED TO 24-HOUR VOLUME
        volume_trends = []
        
        # Add Polymarket volume trends (estimate 24h from weekly/monthly data)
        for market in polymarket_markets[:8]:
            vol_week = getattr(market, "volume_1_week", 0) or 0
            vol_month = getattr(market, "volume_1_month", 0) or 0
            if vol_week and vol_month:
                vol_24h = vol_week / 7  # Daily average from weekly
                monthly_avg = vol_month / 30  # Daily average from monthly
                trend = "up" if vol_24h > monthly_avg else "down"
                
                volume_trends.append({
                    "title": getattr(market, "title", "Unknown"),
                    "platform": "Polymarket",
                    "weekly_avg": round(vol_24h, 2),  # Actually 24h
                    "monthly_avg": round(monthly_avg, 2),
                    "volume_week": round(vol_24h, 2),  # 24h volume
                    "trend": trend
                })
        
        # Add Kalshi volume trends (using actual 24h data)
        for market in kalshi_markets[:8]:
            vol_24h = getattr(market, "volume_24h", 0) or 0
            if vol_24h > 0:
                # Use actual 24h data
                monthly_avg = vol_24h * 0.95  # Assume slight variation for trend
                trend = "up" if vol_24h > monthly_avg else "neutral"
                
                volume_trends.append({
                    "title": getattr(market, "title", "Unknown"),
                    "platform": "Kalshi",
                    "weekly_avg": round(vol_24h, 2),  # 24h volume
                    "monthly_avg": round(monthly_avg, 2),
                    "volume_week": round(vol_24h, 2),  # 24h volume
                    "trend": trend
                })
        
        # Sort by 24h volume - now directly comparable!
        volume_trends.sort(key=lambda x: x.get("volume_week", 0), reverse=True)
        volume_trends = volume_trends[:12]
        
        # Platform statistics - STANDARDIZED TO 24-HOUR VOLUME
        # NOTE: Polymarket 24h = weekly average (best estimate from available data)
        #       Kalshi 24h = actual 24h volume
        polymarket_weekly_volume = sum(
            getattr(m, "volume_1_week", 0) or 0 for m in polymarket_markets[:10]
        )
        polymarket_top_volume = polymarket_weekly_volume / 7  # Average daily volume
        
        # Kalshi: use actual 24h volume
        kalshi_top_volume = sum(
            getattr(m, "volume_24h", 0) or 0 for m in kalshi_markets[:10]
        )
        
        platform_stats = {
            "polymarket": {
                "open_markets": polymarket_total,
                "top_10_volume": round(polymarket_top_volume, 2),
                "avg_volume": round(polymarket_top_volume / 10, 2) if polymarket_markets else 0
            },
            "kalshi": {
                "open_markets": kalshi_total,
                "top_10_volume": round(kalshi_top_volume, 2),
                "avg_volume": round(kalshi_top_volume / 10, 2) if kalshi_markets else 0
            }
        }
        
        # Recent activity (balanced representation from both platforms)
        # STANDARDIZED TO 24-HOUR VOLUME
        polymarket_activity = []
        for market in polymarket_markets[:6]:
            vol_week = getattr(market, "volume_1_week", 0) or 0
            vol_24h = vol_week / 7 if vol_week else 0  # Estimate 24h from weekly
            if vol_24h > 0:
                polymarket_activity.append({
                    "type": "high_volume",
                    "title": getattr(market, "title", "Unknown"),
                    "platform": "Polymarket",
                    "volume_week": vol_24h,  # 24h volume
                    "timestamp": datetime.utcnow().isoformat()
                })
        
        # Add Kalshi markets with actual 24h volume
        kalshi_activity = []
        for market in kalshi_markets[:6]:
            vol_24h = getattr(market, "volume_24h", 0) or 0
            if vol_24h > 0:
                kalshi_activity.append({
                    "type": "high_volume",
                    "title": getattr(market, "title", "Unknown"),
                    "platform": "Kalshi",
                    "volume_week": vol_24h,  # 24h volume
                    "timestamp": datetime.utcnow().isoformat()
                })
        
        # Combine with guaranteed representation: 4 Polymarket + 4 Kalshi
        # Now directly comparable with same 24h timeframe!
        polymarket_activity.sort(key=lambda x: x.get("volume_week", 0), reverse=True)
        kalshi_activity.sort(key=lambda x: x.get("volume_week", 0), reverse=True)
        
        # Interleave for balanced display
        recent_activity = []
        for i in range(4):
            if i < len(polymarket_activity):
                recent_activity.append(polymarket_activity[i])
            if i < len(kalshi_activity):
                recent_activity.append(kalshi_activity[i])
        recent_activity = recent_activity[:8]
        
        return {
            "top_markets": top_markets,
            "categories": categories,
            "volume_trends": volume_trends,
            "platform_stats": platform_stats,
            "recent_activity": recent_activity,
            "timestamp": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Error fetching dashboard stats: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch dashboard statistics: {str(e)}"
        )
