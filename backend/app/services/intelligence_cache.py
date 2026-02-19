"""
Intelligence Dashboard Caching Service
Provides multi-tier caching for dashboard data:
1. Memory cache (60 seconds) - fastest
2. Database cache (5 minutes) - persistent
3. Fresh API fetch - fallback

Also stores historical snapshots for trend analysis.
"""
import asyncio
import json
import logging
from datetime import datetime, timedelta
from typing import Any, Dict, Optional
import hashlib

logger = logging.getLogger(__name__)

# In-memory cache
_memory_cache: Dict[str, Dict[str, Any]] = {}
_memory_cache_ttl = 60  # 60 seconds

# Database cache TTL
_db_cache_ttl = 300  # 5 minutes


class IntelligenceCacheService:
    """Service for caching intelligence dashboard data."""
    
    def __init__(self, db_pool=None):
        self.db_pool = db_pool
        self._memory_cache: Dict[str, Dict[str, Any]] = {}
    
    def _get_cache_key(self, key_parts: list) -> str:
        """Generate a cache key from parts."""
        key_string = ":".join(str(p) for p in key_parts)
        return hashlib.md5(key_string.encode()).hexdigest()[:16]
    
    def _is_memory_cache_valid(self, cache_key: str) -> bool:
        """Check if memory cache is still valid."""
        if cache_key not in self._memory_cache:
            return False
        
        cached = self._memory_cache[cache_key]
        if datetime.now() > cached.get("expires_at", datetime.min):
            del self._memory_cache[cache_key]
            return False
        
        return True
    
    def get_from_memory(self, cache_key: str) -> Optional[Dict[str, Any]]:
        """Get data from memory cache."""
        if self._is_memory_cache_valid(cache_key):
            logger.debug(f"Memory cache hit for {cache_key}")
            return self._memory_cache[cache_key]["data"]
        return None
    
    def set_in_memory(self, cache_key: str, data: Dict[str, Any], ttl_seconds: int = None) -> None:
        """Store data in memory cache."""
        ttl = ttl_seconds or _memory_cache_ttl
        self._memory_cache[cache_key] = {
            "data": data,
            "created_at": datetime.now(),
            "expires_at": datetime.now() + timedelta(seconds=ttl),
        }
        logger.debug(f"Stored in memory cache: {cache_key}")
    
    async def get_from_db(self, cache_key: str) -> Optional[Dict[str, Any]]:
        """Get data from database cache."""
        if not self.db_pool:
            return None
        
        try:
            async with self.db_pool.acquire() as conn:
                row = await conn.fetchrow(
                    """
                    SELECT data, expires_at 
                    FROM intelligence_cache 
                    WHERE cache_key = $1 AND expires_at > NOW()
                    """,
                    cache_key
                )
                
                if row:
                    logger.debug(f"Database cache hit for {cache_key}")
                    return json.loads(row["data"])
        except Exception as e:
            logger.warning(f"Database cache read error: {e}")
        
        return None
    
    async def set_in_db(self, cache_key: str, data: Dict[str, Any], ttl_seconds: int = None) -> None:
        """Store data in database cache."""
        if not self.db_pool:
            return
        
        ttl = ttl_seconds or _db_cache_ttl
        expires_at = datetime.now() + timedelta(seconds=ttl)
        
        try:
            async with self.db_pool.acquire() as conn:
                await conn.execute(
                    """
                    INSERT INTO intelligence_cache (cache_key, data, expires_at, updated_at)
                    VALUES ($1, $2, $3, NOW())
                    ON CONFLICT (cache_key) 
                    DO UPDATE SET data = $2, expires_at = $3, updated_at = NOW(), version = intelligence_cache.version + 1
                    """,
                    cache_key,
                    json.dumps(data),
                    expires_at
                )
                logger.debug(f"Stored in database cache: {cache_key}")
        except Exception as e:
            logger.warning(f"Database cache write error: {e}")
    
    async def get_cached(
        self, 
        cache_key: str, 
        fetch_func, 
        memory_ttl: int = None,
        db_ttl: int = None
    ) -> Dict[str, Any]:
        """
        Multi-tier cache lookup:
        1. Check memory cache
        2. Check database cache
        3. Call fetch function
        4. Store in both caches
        """
        # Try memory cache first
        data = self.get_from_memory(cache_key)
        if data:
            return data
        
        # Try database cache
        data = await self.get_from_db(cache_key)
        if data:
            # Populate memory cache from DB
            self.set_in_memory(cache_key, data, memory_ttl)
            return data
        
        # Fetch fresh data
        logger.info(f"Cache miss for {cache_key}, fetching fresh data")
        data = await fetch_func()
        
        # Store in both caches
        self.set_in_memory(cache_key, data, memory_ttl)
        await self.set_in_db(cache_key, data, db_ttl)
        
        return data
    
    async def save_snapshot(self, data: Dict[str, Any]) -> None:
        """Save a historical snapshot for trend analysis."""
        if not self.db_pool:
            return
        
        try:
            global_metrics = data.get("global_metrics", {})
            
            async with self.db_pool.acquire() as conn:
                await conn.execute(
                    """
                    INSERT INTO intelligence_snapshots 
                    (snapshot_time, total_markets, total_volume, platform_data, category_data)
                    VALUES (NOW(), $1, $2, $3, $4)
                    """,
                    global_metrics.get("total_markets", 0),
                    global_metrics.get("estimated_total_volume", 0),
                    json.dumps(global_metrics.get("platform_volumes", {})),
                    json.dumps(global_metrics.get("categories", {}))
                )
                logger.info("Saved intelligence snapshot")
        except Exception as e:
            logger.warning(f"Failed to save snapshot: {e}")
    
    async def get_historical_data(self, days: int = 7) -> list:
        """Get historical snapshots for trend charts."""
        if not self.db_pool:
            return []
        
        try:
            async with self.db_pool.acquire() as conn:
                rows = await conn.fetch(
                    """
                    SELECT 
                        snapshot_time,
                        total_markets,
                        total_volume,
                        platform_data,
                        category_data
                    FROM intelligence_snapshots
                    WHERE snapshot_time > NOW() - INTERVAL '%s days'
                    ORDER BY snapshot_time ASC
                    """,
                    days
                )
                
                return [
                    {
                        "timestamp": row["snapshot_time"].isoformat(),
                        "total_markets": row["total_markets"],
                        "total_volume": float(row["total_volume"]),
                        "platform_data": json.loads(row["platform_data"]) if row["platform_data"] else {},
                        "category_data": json.loads(row["category_data"]) if row["category_data"] else {},
                    }
                    for row in rows
                ]
        except Exception as e:
            logger.warning(f"Failed to get historical data: {e}")
            return []
    
    def invalidate(self, cache_key: str) -> None:
        """Invalidate a specific cache key."""
        if cache_key in self._memory_cache:
            del self._memory_cache[cache_key]
            logger.debug(f"Invalidated memory cache: {cache_key}")
    
    def invalidate_all(self) -> None:
        """Clear all memory caches."""
        self._memory_cache.clear()
        logger.info("Cleared all memory caches")


# Global cache service instance
_cache_service: Optional[IntelligenceCacheService] = None


def get_cache_service(db_pool=None) -> IntelligenceCacheService:
    """Get or create the cache service singleton."""
    global _cache_service
    if _cache_service is None:
        _cache_service = IntelligenceCacheService(db_pool)
    elif db_pool and _cache_service.db_pool is None:
        _cache_service.db_pool = db_pool
    return _cache_service


async def cleanup_old_snapshots(db_pool, days_to_keep: int = 30) -> int:
    """Clean up old snapshots to save space."""
    try:
        async with db_pool.acquire() as conn:
            result = await conn.execute(
                """
                DELETE FROM intelligence_snapshots 
                WHERE snapshot_time < NOW() - INTERVAL '%s days'
                """,
                days_to_keep
            )
            deleted = int(result.split()[-1])
            if deleted > 0:
                logger.info(f"Cleaned up {deleted} old snapshots")
            return deleted
    except Exception as e:
        logger.warning(f"Failed to cleanup old snapshots: {e}")
        return 0
