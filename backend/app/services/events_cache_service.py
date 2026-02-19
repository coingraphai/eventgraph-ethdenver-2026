"""
Events Cache Service
World-class caching layer for prediction market events.

Architecture:
- Redis for persistent, distributed caching (optional, falls back to in-memory)
- Background refresh every 15 minutes
- Precomputed aggregations for instant responses
- Warm cache on startup
"""
import asyncio
import json
import logging
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional
from dataclasses import dataclass, asdict
from enum import Enum
import os

logger = logging.getLogger(__name__)

# Try to import redis, but make it optional
try:
    import redis.asyncio as redis
    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False
    logger.info("Redis not installed, using in-memory cache")


class CacheLayer(str, Enum):
    """Cache layers for tiered caching"""
    MEMORY = "memory"  # L1: Fast, local, lost on restart
    REDIS = "redis"    # L2: Persistent, shared across instances


@dataclass
class CacheStats:
    """Cache statistics"""
    hits: int = 0
    misses: int = 0
    last_refresh: Optional[datetime] = None
    polymarket_count: int = 0
    kalshi_count: int = 0
    total_events: int = 0
    refresh_in_progress: bool = False


class EventsCacheService:
    """
    High-performance caching service for prediction market events.
    
    Features:
    - Dual-layer caching (Memory + Redis)
    - Background refresh with configurable interval
    - Cache warming on startup
    - Statistics and monitoring
    """
    
    # Cache configuration
    CACHE_TTL_SECONDS = 1800  # 30 minutes
    BACKGROUND_REFRESH_INTERVAL = 900  # 15 minutes
    ANALYTICS_CACHE_TTL = 300  # 5 minutes for event analytics
    CACHE_KEY_PREFIX = "coingraph:events"
    
    # Cache keys
    KEY_ALL_EVENTS = f"{CACHE_KEY_PREFIX}:all"
    KEY_POLYMARKET = f"{CACHE_KEY_PREFIX}:polymarket"
    KEY_KALSHI = f"{CACHE_KEY_PREFIX}:kalshi"
    KEY_AGGREGATED = f"{CACHE_KEY_PREFIX}:aggregated"
    KEY_ANALYTICS = f"{CACHE_KEY_PREFIX}:analytics"
    KEY_STATS = f"{CACHE_KEY_PREFIX}:stats"
    KEY_LAST_REFRESH = f"{CACHE_KEY_PREFIX}:last_refresh"
    
    def __init__(self):
        self._memory_cache: Dict[str, Dict[str, Any]] = {}
        self._redis: Optional[Any] = None
        self._stats = CacheStats()
        self._refresh_task: Optional[asyncio.Task] = None
        self._initialized = False
        
    async def initialize(self):
        """Initialize cache service, connect to Redis if available"""
        if self._initialized:
            return
            
        # Try to connect to Redis
        redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")
        
        if REDIS_AVAILABLE:
            try:
                self._redis = redis.from_url(
                    redis_url,
                    encoding="utf-8",
                    decode_responses=True,
                    socket_timeout=5.0,
                    socket_connect_timeout=5.0,
                )
                # Test connection
                await self._redis.ping()
                logger.info(f"Connected to Redis at {redis_url}")
            except Exception as e:
                logger.warning(f"Redis connection failed, using memory cache: {e}")
                self._redis = None
        
        self._initialized = True
        
    async def close(self):
        """Close connections"""
        if self._refresh_task:
            self._refresh_task.cancel()
            try:
                await self._refresh_task
            except asyncio.CancelledError:
                pass
                
        if self._redis:
            await self._redis.close()
            
    # =========================================================================
    # Core Cache Operations
    # =========================================================================
    
    async def get(self, key: str) -> Optional[Any]:
        """Get value from cache (L1 Memory -> L2 Redis)"""
        # L1: Check memory cache first
        if key in self._memory_cache:
            entry = self._memory_cache[key]
            if datetime.utcnow() < entry["expires_at"]:
                self._stats.hits += 1
                return entry["data"]
            else:
                del self._memory_cache[key]
        
        # L2: Check Redis
        if self._redis:
            try:
                data = await self._redis.get(key)
                if data:
                    parsed = json.loads(data)
                    # Populate L1 cache
                    self._memory_set(key, parsed, ttl=300)  # 5 min in L1
                    self._stats.hits += 1
                    return parsed
            except Exception as e:
                logger.error(f"Redis get error: {e}")
        
        self._stats.misses += 1
        return None
    
    async def set(
        self, 
        key: str, 
        data: Any, 
        ttl: int = CACHE_TTL_SECONDS,
        layers: List[CacheLayer] = None
    ):
        """Set value in cache layers"""
        if layers is None:
            layers = [CacheLayer.MEMORY, CacheLayer.REDIS]
            
        # L1: Memory cache
        if CacheLayer.MEMORY in layers:
            self._memory_set(key, data, ttl)
        
        # L2: Redis cache
        if CacheLayer.REDIS in layers and self._redis:
            try:
                await self._redis.setex(
                    key,
                    ttl,
                    json.dumps(data, default=str)
                )
            except Exception as e:
                logger.error(f"Redis set error: {e}")
    
    def _memory_set(self, key: str, data: Any, ttl: int):
        """Set value in memory cache"""
        self._memory_cache[key] = {
            "data": data,
            "expires_at": datetime.utcnow() + timedelta(seconds=ttl),
        }
    
    async def delete(self, key: str):
        """Delete from all cache layers"""
        if key in self._memory_cache:
            del self._memory_cache[key]
            
        if self._redis:
            try:
                await self._redis.delete(key)
            except Exception as e:
                logger.error(f"Redis delete error: {e}")
    
    async def clear_all(self):
        """Clear all events cache"""
        self._memory_cache.clear()
        
        if self._redis:
            try:
                keys = await self._redis.keys(f"{self.CACHE_KEY_PREFIX}:*")
                if keys:
                    await self._redis.delete(*keys)
            except Exception as e:
                logger.error(f"Redis clear error: {e}")
    
    # =========================================================================
    # Events-specific Operations
    # =========================================================================
    
    async def get_all_events(self) -> Optional[Dict[str, Any]]:
        """Get all events from cache"""
        return await self.get(self.KEY_ALL_EVENTS)
    
    async def set_all_events(
        self, 
        events: List[Dict], 
        platform_counts: Dict[str, int]
    ):
        """Cache all events with metadata"""
        data = {
            "events": events,
            "platform_counts": platform_counts,
            "cached_at": datetime.utcnow().isoformat(),
            "total": len(events),
        }
        await self.set(self.KEY_ALL_EVENTS, data)
        
        # Update stats
        self._stats.polymarket_count = platform_counts.get("polymarket", 0)
        self._stats.kalshi_count = platform_counts.get("kalshi", 0)
        self._stats.total_events = len(events)
        self._stats.last_refresh = datetime.utcnow()
    
    async def get_aggregated_response(
        self,
        platform: str = "all",
        category: str = "all",
        search: Optional[str] = None,
        page: int = 1,
        page_size: int = 20,
    ) -> Optional[Dict[str, Any]]:
        """
        Get pre-filtered and paginated response.
        Uses cache key based on query parameters.
        """
        cache_key = f"{self.KEY_AGGREGATED}:{platform}:{category}:{search or ''}:{page}:{page_size}"
        return await self.get(cache_key)
    
    async def set_aggregated_response(
        self,
        response: Dict[str, Any],
        platform: str = "all",
        category: str = "all",
        search: Optional[str] = None,
        page: int = 1,
        page_size: int = 20,
    ):
        """Cache a specific query response for instant retrieval"""
        cache_key = f"{self.KEY_AGGREGATED}:{platform}:{category}:{search or ''}:{page}:{page_size}"
        # Short TTL for query-specific cache
        await self.set(cache_key, response, ttl=300)
    
    # =========================================================================
    # Event Analytics Cache Operations
    # =========================================================================
    
    async def get_event_analytics(
        self,
        platform: str,
        event_id: str,
        include_trades: bool = True,
        max_markets: int = 100,
    ) -> Optional[Dict[str, Any]]:
        """
        Get cached event analytics response.
        This is the key to instant loading!
        """
        cache_key = f"{self.KEY_ANALYTICS}:{platform}:{event_id}:{include_trades}:{max_markets}"
        return await self.get(cache_key)
    
    async def set_event_analytics(
        self,
        platform: str,
        event_id: str,
        analytics_data: Dict[str, Any],
        include_trades: bool = True,
        max_markets: int = 100,
    ):
        """
        Cache event analytics response for instant retrieval.
        TTL: 5 minutes (fresh enough for market data)
        """
        cache_key = f"{self.KEY_ANALYTICS}:{platform}:{event_id}:{include_trades}:{max_markets}"
        await self.set(cache_key, analytics_data, ttl=self.ANALYTICS_CACHE_TTL)
    
    async def invalidate_event_analytics(self, platform: str, event_id: str):
        """Invalidate analytics cache for a specific event"""
        # Clear all variations of this event's cache
        for trades in [True, False]:
            for markets in [50, 100, 200]:
                cache_key = f"{self.KEY_ANALYTICS}:{platform}:{event_id}:{trades}:{markets}"
                await self.delete(cache_key)
    
    # =========================================================================
    # Background Refresh
    # =========================================================================
    
    def start_background_refresh(self, refresh_callback):
        """Start background refresh task"""
        if self._refresh_task is not None:
            return
            
        async def refresh_loop():
            while True:
                try:
                    await asyncio.sleep(self.BACKGROUND_REFRESH_INTERVAL)
                    logger.info("Starting background events refresh...")
                    self._stats.refresh_in_progress = True
                    await refresh_callback()
                    logger.info("Background events refresh completed")
                except asyncio.CancelledError:
                    break
                except Exception as e:
                    logger.error(f"Background refresh error: {e}")
                finally:
                    self._stats.refresh_in_progress = False
        
        self._refresh_task = asyncio.create_task(refresh_loop())
        logger.info(f"Background refresh started (interval: {self.BACKGROUND_REFRESH_INTERVAL}s)")
    
    def stop_background_refresh(self):
        """Stop background refresh task"""
        if self._refresh_task:
            self._refresh_task.cancel()
            self._refresh_task = None
    
    # =========================================================================
    # Statistics & Monitoring
    # =========================================================================
    
    def get_stats(self) -> Dict[str, Any]:
        """Get cache statistics"""
        hit_rate = 0
        total = self._stats.hits + self._stats.misses
        if total > 0:
            hit_rate = round(self._stats.hits / total * 100, 2)
            
        return {
            "hits": self._stats.hits,
            "misses": self._stats.misses,
            "hit_rate": f"{hit_rate}%",
            "last_refresh": self._stats.last_refresh.isoformat() if self._stats.last_refresh else None,
            "polymarket_count": self._stats.polymarket_count,
            "kalshi_count": self._stats.kalshi_count,
            "total_events": self._stats.total_events,
            "refresh_in_progress": self._stats.refresh_in_progress,
            "memory_cache_size": len(self._memory_cache),
            "redis_connected": self._redis is not None,
        }
    
    def is_cache_warm(self) -> bool:
        """Check if cache has been warmed"""
        return self._stats.last_refresh is not None


# Global singleton instance
_cache_service: Optional[EventsCacheService] = None


def get_events_cache_service() -> EventsCacheService:
    """Get or create the global cache service instance"""
    global _cache_service
    if _cache_service is None:
        _cache_service = EventsCacheService()
    return _cache_service
