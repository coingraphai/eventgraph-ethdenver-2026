"""
Caching middleware for API responses
Uses in-memory TTL cache for frequently accessed data
"""

from functools import wraps
from typing import Any, Callable, Optional
from cachetools import TTLCache
from datetime import datetime
import hashlib
import json
import logging

logger = logging.getLogger(__name__)


# Cache instances with different TTLs
# Format: TTLCache(maxsize, ttl_in_seconds)

# 5-minute cache for rapidly changing data
cache_5min = TTLCache(maxsize=500, ttl=300)

# 15-minute cache for moderately changing data  
cache_15min = TTLCache(maxsize=500, ttl=900)

# 1-hour cache for slower changing data
cache_1hour = TTLCache(maxsize=200, ttl=3600)

# 24-hour cache for daily aggregates
cache_1day = TTLCache(maxsize=100, ttl=86400)


# Cache mapping by name
CACHES = {
    "5min": cache_5min,
    "15min": cache_15min,
    "1hour": cache_1hour,
    "1day": cache_1day,
}


def make_cache_key(*args, **kwargs) -> str:
    """Generate a unique cache key from function arguments"""
    key_data = {
        "args": args,
        "kwargs": sorted(kwargs.items())
    }
    key_str = json.dumps(key_data, sort_keys=True, default=str)
    return hashlib.md5(key_str.encode()).hexdigest()


def cached(
    ttl: str = "15min",
    key_prefix: Optional[str] = None,
):
    """
    Decorator for caching async function results
    
    Args:
        ttl: Cache TTL - "5min", "15min", "1hour", or "1day"
        key_prefix: Optional prefix for cache key
    
    Usage:
        @cached(ttl="15min", key_prefix="market_details")
        async def get_market_details(market_id: str):
            ...
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Get the appropriate cache
            cache = CACHES.get(ttl, cache_15min)
            
            # Generate cache key
            prefix = key_prefix or func.__name__
            cache_key = f"{prefix}:{make_cache_key(*args, **kwargs)}"
            
            # Check cache
            if cache_key in cache:
                logger.debug(f"Cache HIT: {cache_key}")
                return cache[cache_key]
            
            # Cache miss - call function
            logger.debug(f"Cache MISS: {cache_key}")
            result = await func(*args, **kwargs)
            
            # Store in cache
            cache[cache_key] = result
            
            return result
        
        return wrapper
    return decorator


def cached_sync(
    ttl: str = "15min",
    key_prefix: Optional[str] = None,
):
    """
    Decorator for caching synchronous function results
    
    Args:
        ttl: Cache TTL - "5min", "15min", "1hour", or "1day"
        key_prefix: Optional prefix for cache key
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args, **kwargs):
            # Get the appropriate cache
            cache = CACHES.get(ttl, cache_15min)
            
            # Generate cache key
            prefix = key_prefix or func.__name__
            cache_key = f"{prefix}:{make_cache_key(*args, **kwargs)}"
            
            # Check cache
            if cache_key in cache:
                logger.debug(f"Cache HIT: {cache_key}")
                return cache[cache_key]
            
            # Cache miss - call function
            logger.debug(f"Cache MISS: {cache_key}")
            result = func(*args, **kwargs)
            
            # Store in cache
            cache[cache_key] = result
            
            return result
        
        return wrapper
    return decorator


def invalidate_cache(pattern: Optional[str] = None, ttl: Optional[str] = None):
    """
    Invalidate cache entries matching a pattern or all entries in a specific cache
    
    Args:
        pattern: Optional key prefix pattern to match
        ttl: Optional specific cache to clear ("5min", "15min", "1hour", "1day")
    """
    caches_to_clear = [CACHES[ttl]] if ttl and ttl in CACHES else CACHES.values()
    
    for cache in caches_to_clear:
        if pattern:
            # Find and remove matching keys
            keys_to_remove = [
                key for key in cache.keys()
                if key.startswith(pattern)
            ]
            for key in keys_to_remove:
                del cache[key]
            logger.info(f"Invalidated {len(keys_to_remove)} cache entries matching '{pattern}'")
        else:
            # Clear entire cache
            cache.clear()
            logger.info("Cleared entire cache")


def get_cache_stats() -> dict:
    """Get statistics about all caches"""
    return {
        name: {
            "size": len(cache),
            "maxsize": cache.maxsize,
            "ttl": cache.ttl,
            "currsize": cache.currsize,
        }
        for name, cache in CACHES.items()
    }


# ============================================
# Cache configuration for specific endpoints
# ============================================

# Mapping of endpoints to their recommended cache TTL
ENDPOINT_CACHE_CONFIG = {
    # Dashboard endpoints (moderate refresh)
    "market_metrics": "15min",
    "top_markets": "5min",
    "category_distribution": "15min",
    "volume_trends": "5min",
    "platform_comparison": "15min",
    "trending_categories": "15min",
    
    # Market detail endpoints
    "market_details": "15min",
    "price_history": "5min",
    "volume_history": "5min",
    "recent_trades": "5min",
    "orderbook": "5min",
    "similar_markets": "15min",
    "market_statistics": "15min",
    
    # Markets/Explore endpoints
    "search_markets": "5min",
    "filter_aggregates": "5min",
    "popular_markets": "15min",
    "recently_resolved": "15min",
    "category_breakdown": "15min",
    
    # Analytics endpoints (slower refresh)
    "volume_distribution": "1hour",
    "lifecycle_funnel": "1hour",
    "top_traders": "15min",
    "category_performance": "1hour",
    "platform_share": "1hour",
    "activity_heatmap": "1hour",
    "resolution_accuracy": "1day",
}


def get_recommended_ttl(endpoint: str) -> str:
    """Get recommended cache TTL for an endpoint"""
    return ENDPOINT_CACHE_CONFIG.get(endpoint, "15min")
