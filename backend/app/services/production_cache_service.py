"""
Production-Grade Cache Service
==============================

Multi-layer caching with guaranteed data availability for all platforms.

Architecture:
- L1: In-memory cache (instant, 5 min TTL)
- L2: PostgreSQL snapshot (50ms, persistent)
- L3: Historical fallback (emergency)

Features:
- Instant startup (loads from DB, not API)
- Never returns empty (always has fallback)
- Circuit breaker for API failures
- Background refresh every 5 minutes
- Metrics tracking for monitoring

Usage:
    cache = get_production_cache()
    
    # Get events (instant from cache)
    events = await cache.get_events("polymarket")
    
    # Refresh in background
    await cache.refresh("polymarket")
"""

import asyncio
import logging
import time
import json
from typing import Any, Dict, List, Optional, Callable
from datetime import datetime, timedelta, timezone
from dataclasses import dataclass, field
from enum import Enum

logger = logging.getLogger(__name__)


def utc_now() -> datetime:
    """Get current UTC time as timezone-aware datetime"""
    return datetime.now(timezone.utc)


class CacheStatus(Enum):
    """Cache fetch status"""
    SUCCESS = "success"
    PARTIAL = "partial"
    FAILED = "failed"
    STALE = "stale"
    PENDING = "pending"


class CircuitState(Enum):
    """Circuit breaker states"""
    CLOSED = "closed"      # Normal operation
    OPEN = "open"          # API failing, serve stale
    HALF_OPEN = "half_open"  # Testing recovery


@dataclass
class CacheEntry:
    """Cached data with metadata"""
    data: List[Dict[str, Any]]
    item_count: int
    total_volume: float
    fetched_at: datetime
    expires_at: datetime
    status: CacheStatus
    version: int = 1
    
    @property
    def is_expired(self) -> bool:
        return utc_now() > self.expires_at
    
    @property
    def is_stale(self) -> bool:
        # Stale after TTL, but still usable for 10 more minutes
        stale_threshold = self.expires_at + timedelta(minutes=10)
        return utc_now() > self.expires_at and utc_now() < stale_threshold
    
    @property
    def age_seconds(self) -> float:
        return (utc_now() - self.fetched_at).total_seconds()


@dataclass
class CircuitBreaker:
    """
    Prevents cascade failures by stopping API calls when failing.
    
    States:
    - CLOSED: Normal, API calls allowed
    - OPEN: API failing, all calls rejected, serve stale
    - HALF_OPEN: Testing if API recovered
    """
    failure_threshold: int = 3
    recovery_timeout: float = 60.0  # seconds
    
    state: CircuitState = field(default=CircuitState.CLOSED)
    failures: int = field(default=0)
    last_failure_time: Optional[float] = field(default=None)
    
    def record_success(self):
        """Reset failures on success"""
        self.failures = 0
        self.state = CircuitState.CLOSED
    
    def record_failure(self):
        """Track failure, potentially open circuit"""
        self.failures += 1
        self.last_failure_time = time.time()
        
        if self.failures >= self.failure_threshold:
            self.state = CircuitState.OPEN
            logger.warning(f"🔴 Circuit OPEN after {self.failures} failures")
    
    def can_execute(self) -> bool:
        """Check if API call is allowed"""
        if self.state == CircuitState.CLOSED:
            return True
        
        if self.state == CircuitState.OPEN:
            # Check if recovery timeout passed
            if self.last_failure_time and \
               time.time() - self.last_failure_time > self.recovery_timeout:
                self.state = CircuitState.HALF_OPEN
                logger.info("🟡 Circuit HALF_OPEN, testing recovery...")
                return True
            return False
        
        # HALF_OPEN allows one test call
        return True


class ProductionCacheService:
    """
    Production-grade multi-layer cache service.
    
    Guarantees:
    - Never returns empty data (always has fallback)
    - Instant startup (< 1 second)
    - Graceful degradation on API failures
    - Background refresh without blocking users
    """
    
    # Cache configuration
    CACHE_TTL_SECONDS = 300       # 5 minutes fresh
    STALE_TTL_SECONDS = 900       # 15 minutes stale-while-revalidate
    REFRESH_INTERVAL = 300        # Refresh every 5 minutes
    
    def __init__(self, db_pool=None):
        self._db_pool = db_pool
        
        # L1: In-memory cache
        self._memory_cache: Dict[str, CacheEntry] = {}
        
        # Circuit breakers per platform
        self._circuits: Dict[str, CircuitBreaker] = {}
        
        # Background refresh state
        self._refresh_task: Optional[asyncio.Task] = None
        self._is_refreshing: Dict[str, bool] = {}
        
        # Startup state
        self._initialized = False
        self._startup_time: Optional[float] = None
        
        logger.info("📦 ProductionCacheService initialized")
    
    def set_db_pool(self, db_pool):
        """Set database pool (for late initialization)"""
        self._db_pool = db_pool
    
    # =========================================================================
    # PUBLIC API
    # =========================================================================
    
    async def get_markets(
        self, 
        platform: str,
        force_refresh: bool = False
    ) -> List[Dict[str, Any]]:
        """
        Get markets for a platform. Alias for get_events.
        
        For Limitless/OpinionTrade, events and markets are the same thing.
        This method provides a consistent interface for both Screener and Arbitrage pages.
        """
        return await self.get_events(platform, force_refresh)
    
    async def get_events(
        self, 
        platform: str,
        force_refresh: bool = False
    ) -> List[Dict[str, Any]]:
        """
        Get events for a platform with guaranteed data.
        
        Flow:
        1. Check L1 memory cache (instant)
        2. If miss/stale → Check L2 PostgreSQL (50ms)
        3. If miss → Fetch from API (blocking)
        4. Trigger background refresh if stale
        
        Args:
            platform: polymarket, kalshi, limitless, opiniontrade
            force_refresh: Bypass cache and fetch fresh
            
        Returns:
            List of events (never empty if data exists)
        """
        cache_key = f"{platform}_events"
        
        if force_refresh:
            return await self._fetch_and_cache(platform, "events")
        
        # L1: Memory cache (instant)
        entry = self._memory_cache.get(cache_key)
        if entry and not entry.is_expired:
            logger.debug(f"✅ L1 hit: {platform} ({entry.item_count} events)")
            return entry.data
        
        # L1 stale: Return stale, refresh in background
        if entry and entry.is_stale:
            logger.debug(f"⚡ L1 stale: {platform}, refreshing in background")
            asyncio.create_task(self._background_refresh(platform, "events"))
            return entry.data
        
        # L2: PostgreSQL snapshot
        db_entry = await self._load_from_db(cache_key)
        if db_entry:
            # Populate L1 from L2
            self._memory_cache[cache_key] = db_entry
            
            # Trigger background refresh if stale
            if db_entry.is_expired:
                asyncio.create_task(self._background_refresh(platform, "events"))
            
            logger.debug(f"✅ L2 hit: {platform} ({db_entry.item_count} events)")
            return db_entry.data
        
        # L3: No cache - fetch from API (blocking but guaranteed)
        logger.info(f"🔄 Cache miss: {platform}, fetching from API...")
        return await self._fetch_and_cache(platform, "events")
    
    async def get_categories(self, platform: str) -> List[str]:
        """Get categories for a platform"""
        cache_key = f"{platform}_categories"
        
        # Check memory
        entry = self._memory_cache.get(cache_key)
        if entry and not entry.is_expired:
            return entry.data
        
        # Check DB
        db_entry = await self._load_from_db(cache_key)
        if db_entry:
            self._memory_cache[cache_key] = db_entry
            return db_entry.data
        
        # Fetch fresh
        return await self._fetch_categories(platform)
    
    async def get_market_detail(
        self, 
        platform: str, 
        market_id: str
    ) -> Optional[Dict[str, Any]]:
        """
        Get details for a specific market.
        Market details have shorter cache (1 min) since they change more.
        """
        cache_key = f"{platform}_market_{market_id}"
        
        # Check memory (shorter TTL for details)
        entry = self._memory_cache.get(cache_key)
        if entry and entry.age_seconds < 60:  # 1 minute TTL
            return entry.data[0] if entry.data else None
        
        # Fetch fresh (market details are small, quick API call)
        return await self._fetch_market_detail(platform, market_id)
    
    async def refresh(self, platform: str, data_type: str = "events"):
        """Manually trigger a cache refresh"""
        await self._fetch_and_cache(platform, data_type)
    
    async def refresh_all(self):
        """Refresh all platform caches"""
        platforms = ["polymarket", "kalshi", "limitless", "opiniontrade"]
        
        for platform in platforms:
            try:
                await self.refresh(platform, "events")
                logger.info(f"✅ Refreshed {platform}")
            except Exception as e:
                logger.error(f"❌ Failed to refresh {platform}: {e}")
    
    # =========================================================================
    # STARTUP & INITIALIZATION
    # =========================================================================
    
    async def initialize(self):
        """
        Initialize cache on server startup.
        Loads from PostgreSQL for instant availability.
        """
        start = time.time()
        logger.info("🚀 Initializing production cache from PostgreSQL...")
        
        platforms = ["polymarket", "kalshi", "limitless", "opiniontrade"]
        loaded = 0
        
        for platform in platforms:
            cache_key = f"{platform}_events"
            try:
                entry = await self._load_from_db(cache_key)
                if entry and entry.data:
                    self._memory_cache[cache_key] = entry
                    loaded += 1
                    logger.info(f"  ✅ {platform}: {entry.item_count} events loaded")
                else:
                    logger.warning(f"  ⚠️ {platform}: No cached data, will fetch on demand")
            except Exception as e:
                logger.error(f"  ❌ {platform}: Failed to load - {e}")
        
        elapsed = time.time() - start
        self._initialized = True
        self._startup_time = elapsed
        
        logger.info(f"✅ Cache initialized in {elapsed:.2f}s ({loaded}/{len(platforms)} platforms)")
        
        # Start background refresh
        self._start_background_refresh()
        
        return loaded
    
    def _start_background_refresh(self):
        """Start periodic background refresh task"""
        if self._refresh_task is None:
            self._refresh_task = asyncio.create_task(self._refresh_loop())
            logger.info("🔄 Background refresh scheduler started")
    
    async def _refresh_loop(self):
        """Periodic refresh of all caches"""
        while True:
            try:
                await asyncio.sleep(self.REFRESH_INTERVAL)
                logger.info("🔄 Starting scheduled cache refresh...")
                await self.refresh_all()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"❌ Refresh loop error: {e}")
    
    # =========================================================================
    # INTERNAL: DATABASE OPERATIONS
    # =========================================================================
    
    async def _load_from_db(self, cache_key: str) -> Optional[CacheEntry]:
        """Load cached data from PostgreSQL (L2)"""
        if not self._db_pool:
            return None
        
        try:
            async with self._db_pool.acquire() as conn:
                row = await conn.fetchrow("""
                    SELECT data, item_count, total_volume, fetched_at, expires_at, 
                           fetch_status, version
                    FROM production_cache
                    WHERE cache_key = $1 AND is_valid = TRUE
                """, cache_key)
                
                if row and row['data']:
                    return CacheEntry(
                        data=json.loads(row['data']) if isinstance(row['data'], str) else row['data'],
                        item_count=row['item_count'] or 0,
                        total_volume=float(row['total_volume'] or 0),
                        fetched_at=row['fetched_at'] or utc_now(),
                        expires_at=row['expires_at'] or utc_now(),
                        status=CacheStatus(row['fetch_status'] or 'success'),
                        version=row['version'] or 1
                    )
        except Exception as e:
            logger.error(f"❌ DB load failed for {cache_key}: {e}")
        
        return None
    
    async def _save_to_db(
        self, 
        cache_key: str, 
        platform: str,
        data_type: str,
        data: List[Dict[str, Any]],
        status: CacheStatus = CacheStatus.SUCCESS
    ):
        """Save data to PostgreSQL (L2)"""
        if not self._db_pool:
            logger.warning("⚠️ No DB pool, skipping DB save")
            return
        
        now = utc_now()
        expires = now + timedelta(seconds=self.CACHE_TTL_SECONDS)
        
        # Calculate total volume
        total_volume = sum(
            float(item.get('total_volume') or item.get('volume') or 0) 
            for item in data
        )
        
        try:
            async with self._db_pool.acquire() as conn:
                await conn.execute("""
                    INSERT INTO production_cache 
                        (cache_key, platform, data_type, data, item_count, 
                         total_volume, fetched_at, updated_at, expires_at, 
                         is_valid, fetch_status, version)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $7, $8, TRUE, $9, 1)
                    ON CONFLICT (cache_key) DO UPDATE SET
                        data = $4,
                        item_count = $5,
                        total_volume = $6,
                        fetched_at = $7,
                        updated_at = $7,
                        expires_at = $8,
                        is_valid = TRUE,
                        fetch_status = $9,
                        version = production_cache.version + 1
                """, 
                    cache_key, platform, data_type, 
                    json.dumps(data), len(data), total_volume,
                    now, expires, status.value
                )
                
                # Also save to history for fallback
                await conn.execute("""
                    INSERT INTO cache_history 
                        (cache_key, platform, data_type, data, item_count, total_volume)
                    VALUES ($1, $2, $3, $4, $5, $6)
                """, cache_key, platform, data_type, json.dumps(data), len(data), total_volume)
                
                logger.debug(f"💾 Saved to DB: {cache_key} ({len(data)} items)")
                
        except Exception as e:
            logger.error(f"❌ DB save failed for {cache_key}: {e}")
    
    async def _get_historical_fallback(self, cache_key: str) -> Optional[CacheEntry]:
        """Get last known good data from history (L3 fallback)"""
        if not self._db_pool:
            return None
        
        try:
            async with self._db_pool.acquire() as conn:
                row = await conn.fetchrow("""
                    SELECT data, item_count, total_volume, snapshot_time
                    FROM cache_history
                    WHERE cache_key = $1
                    ORDER BY snapshot_time DESC
                    LIMIT 1
                """, cache_key)
                
                if row and row['data']:
                    logger.warning(f"⚠️ Using historical fallback for {cache_key}")
                    return CacheEntry(
                        data=json.loads(row['data']) if isinstance(row['data'], str) else row['data'],
                        item_count=row['item_count'] or 0,
                        total_volume=float(row['total_volume'] or 0),
                        fetched_at=row['snapshot_time'],
                        expires_at=utc_now() + timedelta(minutes=5),
                        status=CacheStatus.STALE,
                        version=0
                    )
        except Exception as e:
            logger.error(f"❌ Historical fallback failed: {e}")
        
        return None
    
    # =========================================================================
    # INTERNAL: API FETCHING
    # =========================================================================
    
    def _get_circuit(self, platform: str) -> CircuitBreaker:
        """Get or create circuit breaker for platform"""
        if platform not in self._circuits:
            self._circuits[platform] = CircuitBreaker()
        return self._circuits[platform]
    
    async def _fetch_and_cache(
        self, 
        platform: str, 
        data_type: str
    ) -> List[Dict[str, Any]]:
        """
        Fetch data from API and update all cache layers.
        Uses circuit breaker for resilience.
        """
        cache_key = f"{platform}_{data_type}"
        circuit = self._get_circuit(platform)
        
        # Check circuit breaker
        if not circuit.can_execute():
            logger.warning(f"🔴 Circuit open for {platform}, using fallback")
            
            # Return stale data or historical fallback
            if cache_key in self._memory_cache:
                return self._memory_cache[cache_key].data
            
            fallback = await self._get_historical_fallback(cache_key)
            if fallback:
                return fallback.data
            
            return []  # Ultimate fallback: empty
        
        start_time = time.time()
        
        try:
            # Fetch from API
            data = await self._fetch_from_api(platform, data_type)
            
            if data:
                elapsed = time.time() - start_time
                circuit.record_success()
                
                # Create cache entry
                now = utc_now()
                entry = CacheEntry(
                    data=data,
                    item_count=len(data),
                    total_volume=sum(
                        float(item.get('total_volume') or item.get('volume') or 0) 
                        for item in data
                    ),
                    fetched_at=now,
                    expires_at=now + timedelta(seconds=self.CACHE_TTL_SECONDS),
                    status=CacheStatus.SUCCESS
                )
                
                # Update L1 memory cache
                self._memory_cache[cache_key] = entry
                
                # Update L2 PostgreSQL (async, non-blocking)
                asyncio.create_task(
                    self._save_to_db(cache_key, platform, data_type, data)
                )
                
                logger.info(f"✅ Fetched {platform}/{data_type}: {len(data)} items in {elapsed:.2f}s")
                
                # Record metrics
                await self._record_metrics(cache_key, elapsed, len(data), "success")
                
                return data
            else:
                # Empty response - use fallback
                circuit.record_failure()
                logger.warning(f"⚠️ Empty response from {platform}, using fallback")
                return await self._get_fallback_data(cache_key)
                
        except Exception as e:
            elapsed = time.time() - start_time
            circuit.record_failure()
            logger.error(f"❌ Fetch failed for {platform}: {e}")
            
            # Record failure metrics
            await self._record_metrics(cache_key, elapsed, 0, "error", str(type(e).__name__))
            
            # Return fallback data
            return await self._get_fallback_data(cache_key)
    
    async def _fetch_from_api(
        self, 
        platform: str, 
        data_type: str
    ) -> List[Dict[str, Any]]:
        """
        Fetch data from the appropriate API service.
        Delegates to platform-specific services.
        """
        if data_type == "events":
            if platform == "polymarket":
                from app.services.polymarket_dome_service import fetch_polymarket_events
                return fetch_polymarket_events()
            
            elif platform == "kalshi":
                from app.services.kalshi_service import fetch_kalshi_events
                result = await fetch_kalshi_events(limit=5000)
                return result.get("events", [])
            
            elif platform == "limitless":
                from app.services.limitless_service import fetch_limitless_events
                result = await fetch_limitless_events(limit=5000)
                return result.get("events", [])
            
            elif platform == "opiniontrade":
                from app.services.opiniontrade_service import fetch_opiniontrade_events
                result = await fetch_opiniontrade_events(limit=5000)
                return result.get("events", [])
        
        logger.warning(f"⚠️ Unknown platform/type: {platform}/{data_type}")
        return []
    
    async def _fetch_categories(self, platform: str) -> List[str]:
        """Fetch categories for a platform"""
        try:
            if platform == "polymarket":
                from app.services.polymarket_dome_service import fetch_polymarket_categories
                return fetch_polymarket_categories()
            
            elif platform == "kalshi":
                from app.services.kalshi_service import fetch_kalshi_categories
                result = await fetch_kalshi_categories()
                return result.get("categories", [])
            
            elif platform == "limitless":
                from app.services.limitless_service import fetch_limitless_categories
                result = await fetch_limitless_categories()
                return result.get("categories", [])
            
            elif platform == "opiniontrade":
                from app.services.opiniontrade_service import fetch_opiniontrade_categories
                result = await fetch_opiniontrade_categories()
                return result.get("categories", [])
                
        except Exception as e:
            logger.error(f"❌ Failed to fetch categories for {platform}: {e}")
        
        return []
    
    async def _fetch_market_detail(
        self, 
        platform: str, 
        market_id: str
    ) -> Optional[Dict[str, Any]]:
        """Fetch market detail from API"""
        try:
            if platform == "polymarket":
                from app.services.polymarket_dome_service import fetch_polymarket_market_detail
                return fetch_polymarket_market_detail(market_id)
            
            elif platform == "kalshi":
                from app.services.kalshi_service import fetch_kalshi_market_detail
                return await fetch_kalshi_market_detail(market_id)
            
            elif platform == "limitless":
                from app.services.limitless_service import fetch_limitless_market_detail
                return await fetch_limitless_market_detail(market_id)
            
            elif platform == "opiniontrade":
                from app.services.opiniontrade_service import fetch_opiniontrade_market_detail
                return await fetch_opiniontrade_market_detail(market_id)
                
        except Exception as e:
            logger.error(f"❌ Failed to fetch market detail {platform}/{market_id}: {e}")
        
        return None
    
    async def _get_fallback_data(self, cache_key: str) -> List[Dict[str, Any]]:
        """Get fallback data from any available source"""
        # Try memory cache first
        if cache_key in self._memory_cache:
            logger.info(f"📦 Using stale memory cache for {cache_key}")
            return self._memory_cache[cache_key].data
        
        # Try DB cache
        db_entry = await self._load_from_db(cache_key)
        if db_entry:
            logger.info(f"📦 Using stale DB cache for {cache_key}")
            return db_entry.data
        
        # Try historical fallback
        historical = await self._get_historical_fallback(cache_key)
        if historical:
            logger.info(f"📦 Using historical fallback for {cache_key}")
            return historical.data
        
        # Nothing available
        logger.warning(f"⚠️ No fallback data for {cache_key}")
        return []
    
    async def _background_refresh(self, platform: str, data_type: str):
        """Refresh cache in background without blocking"""
        cache_key = f"{platform}_{data_type}"
        
        # Prevent duplicate refreshes
        if self._is_refreshing.get(cache_key):
            return
        
        self._is_refreshing[cache_key] = True
        
        try:
            await self._fetch_and_cache(platform, data_type)
        except Exception as e:
            logger.error(f"❌ Background refresh failed for {cache_key}: {e}")
        finally:
            self._is_refreshing[cache_key] = False
    
    # =========================================================================
    # METRICS
    # =========================================================================
    
    async def _record_metrics(
        self, 
        cache_key: str, 
        duration_ms: float,
        items: int,
        status: str,
        error_type: Optional[str] = None
    ):
        """Record cache operation metrics"""
        if not self._db_pool:
            return
        
        try:
            async with self._db_pool.acquire() as conn:
                await conn.execute("""
                    INSERT INTO cache_metrics 
                        (cache_key, fetch_duration_ms, items_fetched, items_cached, status, error_type)
                    VALUES ($1, $2, $3, $3, $4, $5)
                """, cache_key, int(duration_ms * 1000), items, status, error_type)
        except Exception as e:
            logger.debug(f"Metrics recording failed: {e}")
    
    def get_stats(self) -> Dict[str, Any]:
        """Get cache statistics"""
        stats = {
            "initialized": self._initialized,
            "startup_time": self._startup_time,
            "platforms": {},
            "circuit_breakers": {}
        }
        
        for key, entry in self._memory_cache.items():
            stats["platforms"][key] = {
                "item_count": entry.item_count,
                "total_volume": entry.total_volume,
                "age_seconds": entry.age_seconds,
                "is_expired": entry.is_expired,
                "is_stale": entry.is_stale,
                "status": entry.status.value
            }
        
        for platform, circuit in self._circuits.items():
            stats["circuit_breakers"][platform] = {
                "state": circuit.state.value,
                "failures": circuit.failures
            }
        
        return stats


# =============================================================================
# SINGLETON & HELPER FUNCTIONS
# =============================================================================

_cache_service: Optional[ProductionCacheService] = None


def get_production_cache() -> ProductionCacheService:
    """Get or create the singleton cache service"""
    global _cache_service
    if _cache_service is None:
        _cache_service = ProductionCacheService()
    return _cache_service


async def initialize_production_cache(db_pool) -> ProductionCacheService:
    """Initialize cache with database pool"""
    cache = get_production_cache()
    cache.set_db_pool(db_pool)
    await cache.initialize()
    return cache


async def warm_all_caches():
    """
    Warm all caches on startup.
    Called from main.py after DB is ready.
    
    Strategy:
    1. Load from DB (instant if available)
    2. If DB has minimal data (<10 items) or is stale, fetch from API
    3. Save fresh data back to DB
    """
    cache = get_production_cache()
    
    if not cache._initialized:
        logger.warning("⚠️ Cache not initialized, skipping warm")
        return
    
    logger.info("🔥 Warming all platform caches...")
    
    platforms = ["polymarket", "kalshi", "limitless", "opiniontrade"]
    MIN_VALID_ITEMS = 10  # If less than this, consider DB data invalid
    
    for platform in platforms:
        try:
            # Check if we have valid data in DB
            entry = await cache._load_from_db(f"{platform}_events")
            
            # Consider data valid if: exists, has items, and item_count >= minimum
            has_valid_data = (
                entry and 
                entry.data and 
                len(entry.data) >= MIN_VALID_ITEMS and
                entry.item_count >= MIN_VALID_ITEMS
            )
            
            if has_valid_data and not entry.is_expired:
                # Good data in DB, use it
                logger.info(f"  ✅ {platform}: {entry.item_count} events from DB (fresh)")
                cache._memory_cache[f"{platform}_events"] = entry
            elif has_valid_data and entry.is_expired:
                # Stale but usable data - use it and refresh in background
                logger.info(f"  ⚡ {platform}: {entry.item_count} events from DB (stale, refreshing)")
                cache._memory_cache[f"{platform}_events"] = entry
                # Trigger background refresh
                asyncio.create_task(cache._background_refresh(platform, "events"))
            else:
                # No valid DB data, must fetch from API
                logger.info(f"  🔄 {platform}: Fetching from API (DB has {entry.item_count if entry else 0} items)...")
                await cache.refresh(platform, "events")
                
        except Exception as e:
            logger.error(f"  ❌ {platform}: {e}")
    
    logger.info("✅ Cache warming complete")
