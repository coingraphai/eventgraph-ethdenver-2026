"""
HTTP client with retry logic and rate limiting.
"""
import asyncio
import hashlib
import time
from typing import Any
from uuid import UUID, uuid4

import httpx
import structlog
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential_jitter,
)

from limitless_ingest.config import get_settings

logger = structlog.get_logger()


class RateLimiter:
    """Token bucket rate limiter."""
    
    def __init__(self, rate: float, capacity: float | None = None):
        self.rate = rate  # tokens per second
        self.capacity = capacity or rate * 2  # max burst
        self.tokens = self.capacity
        self.last_update = time.monotonic()
        self._lock = asyncio.Lock()
    
    async def acquire(self, tokens: float = 1.0) -> float:
        """Acquire tokens, waiting if necessary. Returns wait time."""
        async with self._lock:
            now = time.monotonic()
            elapsed = now - self.last_update
            self.tokens = min(self.capacity, self.tokens + elapsed * self.rate)
            self.last_update = now
            
            if self.tokens >= tokens:
                self.tokens -= tokens
                return 0.0
            
            wait_time = (tokens - self.tokens) / self.rate
            await asyncio.sleep(wait_time)
            self.tokens = 0
            self.last_update = time.monotonic()
            return wait_time


class APIClient:
    """Async HTTP client for Limitless Exchange API."""
    
    def __init__(self):
        self._settings = get_settings()
        self._client: httpx.AsyncClient | None = None
        self._rate_limiter = RateLimiter(self._settings.rate_limit_rps)
        self._request_count = 0
        self._error_count = 0
    
    async def __aenter__(self) -> "APIClient":
        await self.connect()
        return self
    
    async def __aexit__(self, *args) -> None:
        await self.close()
    
    async def connect(self) -> None:
        """Initialize the HTTP client."""
        self._client = httpx.AsyncClient(
            base_url=self._settings.limitless_api_base_url,
            timeout=httpx.Timeout(self._settings.api_timeout_seconds),
            limits=httpx.Limits(
                max_connections=self._settings.max_concurrency,
                max_keepalive_connections=self._settings.max_concurrency,
            ),
            headers={
                "User-Agent": "LimitlessIngest/1.0",
                "Accept": "application/json",
            },
        )
    
    async def close(self) -> None:
        """Close the HTTP client."""
        if self._client:
            await self._client.aclose()
            self._client = None
    
    @staticmethod
    def compute_content_hash(data: dict[str, Any]) -> str:
        """Compute a hash of the response content for deduplication."""
        import json
        content = json.dumps(data, sort_keys=True, default=str)
        return hashlib.sha256(content.encode()).hexdigest()[:16]
    
    async def _make_request(
        self,
        method: str,
        path: str,
        params: dict[str, Any] | None = None,
        **kwargs,
    ) -> httpx.Response:
        """Make a single HTTP request with rate limiting."""
        if not self._client:
            raise RuntimeError("Client not connected. Call connect() first.")
        
        await self._rate_limiter.acquire()
        
        log = logger.bind(method=method, path=path, params=params)
        start = time.monotonic()
        
        try:
            response = await self._client.request(method, path, params=params, **kwargs)
            elapsed = (time.monotonic() - start) * 1000
            
            self._request_count += 1
            
            log.debug(
                "API request completed",
                status=response.status_code,
                latency_ms=round(elapsed, 2),
            )
            
            # Handle rate limiting
            if response.status_code == 429:
                retry_after = int(response.headers.get("Retry-After", 5))
                log.warning("Rate limited, waiting", retry_after=retry_after)
                await asyncio.sleep(retry_after)
                raise httpx.HTTPStatusError(
                    "Rate limited",
                    request=response.request,
                    response=response,
                )
            
            # Don't retry 4xx client errors (except 429 rate limit)
            if 400 <= response.status_code < 500:
                return response
            
            response.raise_for_status()
            return response
            
        except Exception as e:
            self._error_count += 1
            log.error("API request failed", error=str(e))
            raise
    
    @retry(
        retry=retry_if_exception_type((httpx.HTTPStatusError, httpx.TransportError)),
        stop=stop_after_attempt(5),
        wait=wait_exponential_jitter(initial=1, max=60, jitter=5),
        reraise=True,
    )
    async def get(
        self,
        path: str,
        params: dict[str, Any] | None = None,
        **kwargs,
    ) -> dict[str, Any] | None:
        """Make a GET request with retry logic. Returns None for 4xx errors."""
        response = await self._make_request("GET", path, params=params, **kwargs)
        if 400 <= response.status_code < 500:
            return None
        return response.json()
    
    async def fetch_categories(self) -> dict[str, Any]:
        """Fetch all categories."""
        return await self.get("/categories")
    
    async def fetch_tokens(self) -> dict[str, Any]:
        """Fetch all tokens."""
        return await self.get("/tokens")
    
    async def fetch_markets_page(
        self,
        page: int = 1,
        limit: int = 25,
        sort_by: str | None = None,
    ) -> dict[str, Any]:
        """Fetch a page of active markets."""
        params = {"page": page, "limit": min(limit, 25)}
        if sort_by:
            params["sortBy"] = sort_by
        return await self.get("/markets/active", params=params)
    
    async def fetch_all_markets(self) -> list[dict[str, Any]]:
        """Fetch all active markets (handles pagination)."""
        all_markets = []
        page = 1
        
        while True:
            response = await self.fetch_markets_page(page=page, limit=25)
            markets = response.get("data", [])
            total = response.get("totalMarketsCount", 0)
            
            all_markets.extend(markets)
            
            logger.info(
                "Fetched markets page",
                page=page,
                count=len(markets),
                total_fetched=len(all_markets),
                total_available=total,
            )
            
            if len(all_markets) >= total or not markets:
                break
            
            page += 1
        
        return all_markets
    
    async def fetch_market_detail(self, slug: str) -> dict[str, Any]:
        """Fetch detailed market info by slug."""
        return await self.get(f"/markets/{slug}")
    
    async def fetch_feed_page(
        self,
        page: int = 1,
        limit: int = 100,
    ) -> dict[str, Any]:
        """Fetch a page of feed events."""
        params = {"page": page, "limit": min(limit, 100)}
        return await self.get("/feed", params=params)
    
    async def fetch_recent_trades(
        self,
        max_pages: int = 25,
    ) -> list[dict[str, Any]]:
        """Fetch recent trades from feed (limited to accessible pages)."""
        all_trades = []
        
        for page in range(1, max_pages + 1):
            response = await self.fetch_feed_page(page=page, limit=100)
            trades = response.get("data", [])
            
            if not trades:
                logger.info("Feed exhausted", last_page=page - 1)
                break
            
            all_trades.extend(trades)
            
            logger.debug(
                "Fetched feed page",
                page=page,
                count=len(trades),
                total_fetched=len(all_trades),
            )
        
        return all_trades
    
    def get_stats(self) -> dict[str, int]:
        """Get client statistics."""
        return {
            "request_count": self._request_count,
            "error_count": self._error_count,
        }
