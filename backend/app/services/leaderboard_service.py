"""
Leaderboard Service - Aggregates top traders across prediction market platforms

Fetches REAL trader data from trader_stats database table.
Data is populated by trader_tracker service which processes actual trades from platform APIs.
"""

import httpx
from typing import List, Dict, Optional
from datetime import datetime, timedelta
import asyncpg
import random

from app.database.session import get_async_pool


class LeaderboardService:
    """Service for fetching and ranking top traders"""
    
    def __init__(self):
        self.cache_duration = timedelta(minutes=5)
        self._cache: Dict[str, tuple] = {}  # cache_key -> (data, timestamp)
    
    async def get_combined_leaderboard(
        self,
        limit: int = 100,
        time_window: str = "all_time",
        platform: Optional[str] = None
    ) -> List[Dict]:
        """
        Get top traders from database (REAL DATA)
        
        Args:
            limit: Number of traders to return (max 2000)
            time_window: "24h", "7d", "30d", "all_time"
            platform: "polymarket", "kalshi", "limitless", or None for all
        
        Returns:
            List of trader dicts with stats
        """
        # Check cache
        cache_key = f"leaderboard_{platform}_{time_window}_{limit}"
        if cache_key in self._cache:
            data, timestamp = self._cache[cache_key]
            if datetime.utcnow() - timestamp < self.cache_duration:
                return data
        
        # Determine which PnL column to use for ranking
        pnl_column_map = {
            "24h": "pnl_24h",
            "7d": "pnl_7d",
            "30d": "pnl_30d",
            "all_time": "total_pnl"
        }
        pnl_column = pnl_column_map.get(time_window, "total_pnl")
        
        # Build query
        db_pool = await get_async_pool()
        
        query = f"""
            SELECT
                wallet_address,
                platform,
                total_pnl,
                pnl_24h,
                pnl_7d,
                pnl_30d,
                total_volume,
                volume_24h,
                volume_7d,
                volume_30d,
                total_trades,
                trades_24h,
                trades_7d,
                trades_30d,
                win_rate,
                roi_percent,
                avg_position_size,
                sharpe_ratio,
                max_drawdown_percent,
                consistency_score,
                avg_hold_duration_hours,
                is_whale,
                is_active_7d,
                strategy_type,
                top_market_1,
                top_market_1_volume,
                top_market_2,
                top_market_2_volume,
                top_market_3,
                top_market_3_volume,
                first_trade_at,
                last_trade_at,
                last_updated_at
            FROM trader_stats
            WHERE {pnl_column} IS NOT NULL
        """
        
        params = []
        if platform:
            query += " AND platform = $1"
            params.append(platform)
        
        query += f" ORDER BY {pnl_column} DESC LIMIT {limit}"
        
        # Execute query
        async with db_pool.acquire() as conn:
            rows = await conn.fetch(query, *params)
        
        # Format results
        traders = []
        url_patterns = {
            "polymarket": "https://polymarket.com/profile/",
            "kalshi": "https://kalshi.com/profile/",
        }
        
        for rank, row in enumerate(rows, 1):
            platform_name = row["platform"]
            profile_url = url_patterns.get(platform_name, "") + row["wallet_address"]
            
            # Determine PnL based on time window
            pnl_values = {
                "24h": row["pnl_24h"] or 0,
                "7d": row["pnl_7d"] or 0,
                "30d": row["pnl_30d"] or 0,
                "all_time": row["total_pnl"] or 0
            }
            
            trader = {
                "rank": rank,
                "wallet_address": row["wallet_address"],
                "platform": platform_name,
                "profile_url": profile_url,
                "pnl": pnl_values[time_window],
                "pnl_24h": row["pnl_24h"] or 0,
                "pnl_7d": row["pnl_7d"] or 0,
                "pnl_30d": row["pnl_30d"] or 0,
                "volume": row["total_volume"] or 0,
                "trades": row["total_trades"] or 0,
                "win_rate": float(row["win_rate"] or 0),
                "roi": float(row["roi_percent"] or 0),
                "avg_position_size": float(row["avg_position_size"] or 0),
                "last_trade": row["last_trade_at"].isoformat() if row["last_trade_at"] else None,
                "updated_at": row["last_updated_at"].isoformat() if row["last_updated_at"] else None,
                # Phase 1 enhanced fields
                "is_whale": row["is_whale"] or False,
                "is_active_7d": row["is_active_7d"] or False,
                "strategy_type": row["strategy_type"] or "unknown",
                "top_market_1": row["top_market_1"],
                "avg_hold_duration_hours": float(row["avg_hold_duration_hours"] or 0),
            }
            traders.append(trader)
        
        # Cache results
        self._cache[cache_key] = (traders, datetime.utcnow())
        
        return traders
    
    async def get_trader_profile(
        self,
        wallet_address: str,
        platform: str
    ) -> Optional[Dict]:
        """
        Get detailed trader profile
        
        Args:
            wallet_address: Trader wallet address
            platform: "polymarket", "kalshi", or "limitless"
        
        Returns:
            Trader profile dict or None if not found
        """
        # In a real implementation, fetch trader's positions and history
        # For now, return mock data
        
        url_patterns = {
            "polymarket": "https://polymarket.com/profile/",
            "kalshi": "https://kalshi.com/profile/",
            "limitless": "https://limitless.exchange/profile/"
        }
        
        # Generate mock profile
        profile = {
            "wallet_address": wallet_address,
            "platform": platform,
            "profile_url": url_patterns.get(platform, "") + wallet_address,
            "pnl": round(random.uniform(10000, 100000), 2),
            "volume": round(random.uniform(100000, 1000000), 2),
            "trades": random.randint(100, 1000),
            "win_rate": round(random.uniform(0.45, 0.75), 3),
            "current_positions": [],  # Would fetch from platform API
            "recent_trades": []  # Would fetch from platform API
        }
        
        return profile
    
    async def get_leaderboard_stats(self) -> Dict:
        """
        Get aggregate statistics across all traders
        
        Returns:
            Dict with aggregate stats
        """
        db_pool = await get_async_pool()
        
        async with db_pool.acquire() as conn:
            row = await conn.fetchrow("""
                SELECT
                    COUNT(*) as total_traders,
                    SUM(total_pnl) as total_pnl,
                    SUM(total_volume) as total_volume,
                    SUM(total_trades) as total_trades,
                    AVG(win_rate) as avg_win_rate,
                    COUNT(*) FILTER (WHERE platform = 'polymarket') as polymarket_count,
                    COUNT(*) FILTER (WHERE platform = 'kalshi') as kalshi_count,
                    COUNT(*) FILTER (WHERE platform = 'limitless') as limitless_count
                FROM trader_stats
            """)
        
        if not row:
            return {
                "total_traders": 0,
                "total_pnl": 0,
                "total_volume": 0,
                "total_trades": 0,
                "avg_win_rate": 0,
                "platform_breakdown": {}
            }
        
        return {
            "total_traders": row["total_traders"] or 0,
            "total_pnl": float(row["total_pnl"] or 0),
            "total_volume": float(row["total_volume"] or 0),
            "total_trades": row["total_trades"] or 0,
            "avg_win_rate": float(row["avg_win_rate"] or 0),
            "platform_breakdown": {
                "polymarket": row["polymarket_count"] or 0,
                "kalshi": row["kalshi_count"] or 0,
                "limitless": row["limitless_count"] or 0
            }
        }


# Singleton instance
leaderboard_service = LeaderboardService()
