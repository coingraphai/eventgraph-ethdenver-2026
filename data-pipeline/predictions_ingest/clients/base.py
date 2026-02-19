"""
Base API client with rate limiting, retries, and common functionality.
All source-specific clients inherit from this class.
"""
import asyncio
import hashlib
import json
import time
from abc import ABC, abstractmethod
from typing import Any, Optional
from uuid import uuid4

import httpx
import structlog
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential_jitter,
)

from predictions_ingest.config import get_settings
from predictions_ingest.models import DataSource, IngestionType

logger = structlog.get_logger()


class RateLimiter:
    """Token bucket rate limiter with async support."""
    
    def __init__(self, rate: float, capacity: Optional[float] = None):
        """
        Initialize rate limiter.
        
        Args:
            rate: Tokens per second
            capacity: Maximum burst capacity (default: rate * 2)
        """
        self.rate = rate
        self.capacity = capacity or rate * 2
        self.tokens = self.capacity
        self.last_update = time.monotonic()
        self._lock = asyncio.Lock()
    
    async def acquire(self, tokens: float = 1.0) -> float:
        """
        Acquire tokens, waiting if necessary.
        
        Returns:
            Wait time in seconds (0 if no wait needed)
        """
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


class BaseAPIClient(ABC):
    """
    Abstract base class for all API clients.
    Provides rate limiting, retries, metrics, and common functionality.
    """
    
    # Must be set by subclasses
    SOURCE: DataSource = None
    BASE_URL: str = ""
    
    def __init__(
        self,
        rate_limit_rps: Optional[float] = None,
        timeout_seconds: Optional[int] = None,
        max_retries: Optional[int] = None,
    ):
        self._settings = get_settings()
        self._client: Optional[httpx.AsyncClient] = None
        
        # Rate limiting
        rps = rate_limit_rps or self._get_default_rate_limit()
        self._rate_limiter = RateLimiter(rps)
        
        # Timeout
        self._timeout = timeout_seconds or self._settings.api_timeout_seconds
        
        # Retry configuration
        self._max_retries = max_retries or self._settings.retry_max_attempts
        
        # Metrics
        self._request_count = 0
        self._error_count = 0
        self._bytes_transferred = 0
        self._total_latency_ms = 0
    
    @abstractmethod
    def _get_default_rate_limit(self) -> float:
        """Get default rate limit for this source."""
        pass
    
    @abstractmethod
    def _get_headers(self) -> dict[str, str]:
        """Get headers for requests (including auth)."""
        pass
    
    async def __aenter__(self) -> "BaseAPIClient":
        await self.connect()
        return self
    
    async def __aexit__(self, *args) -> None:
        await self.close()
    
    async def connect(self) -> None:
        """Initialize the HTTP client."""
        self._client = httpx.AsyncClient(
            base_url=self.BASE_URL,
            timeout=httpx.Timeout(self._timeout),
            limits=httpx.Limits(
                max_connections=self._settings.max_concurrency * 2,
                max_keepalive_connections=self._settings.max_concurrency,
            ),
            headers=self._get_headers(),
        )
        logger.info(
            "API client connected",
            source=self.SOURCE.value if self.SOURCE else "unknown",
            base_url=self.BASE_URL,
        )
    
    async def close(self) -> None:
        """Close the HTTP client."""
        if self._client:
            await self._client.aclose()
            self._client = None
            logger.info(
                "API client closed",
                source=self.SOURCE.value if self.SOURCE else "unknown",
                requests_made=self._request_count,
                errors=self._error_count,
            )
    
    @staticmethod
    def compute_content_hash(data: Any) -> str:
        """
        Compute SHA-256 hash of content for deduplication.
        Returns first 16 characters of the hash.
        """
        if isinstance(data, (dict, list)):
            content = json.dumps(data, sort_keys=True, default=str)
        else:
            content = str(data)
        return hashlib.sha256(content.encode()).hexdigest()[:16]
    
    async def _make_request(
        self,
        method: str,
        path: str,
        params: Optional[dict[str, Any]] = None,
        json_body: Optional[dict[str, Any]] = None,
        **kwargs,
    ) -> httpx.Response:
        """
        Make a single HTTP request with rate limiting.
        Does not include retry logic (handled by caller).
        """
        if not self._client:
            raise RuntimeError("Client not connected. Call connect() first.")
        
        # Apply rate limiting
        wait_time = await self._rate_limiter.acquire()
        
        log = logger.bind(
            source=self.SOURCE.value if self.SOURCE else "unknown",
            method=method,
            path=path,
        )
        
        start = time.monotonic()
        
        try:
            response = await self._client.request(
                method,
                path,
                params=params,
                json=json_body,
                **kwargs,
            )
            
            elapsed_ms = (time.monotonic() - start) * 1000
            self._request_count += 1
            self._total_latency_ms += elapsed_ms
            
            if response.content:
                self._bytes_transferred += len(response.content)
            
            log.debug(
                "API request completed",
                status=response.status_code,
                latency_ms=round(elapsed_ms, 2),
                wait_time=round(wait_time, 3),
            )
            
            # Handle rate limiting response
            if response.status_code == 429:
                retry_after = int(response.headers.get("Retry-After", 5))
                log.warning("Rate limited", retry_after=retry_after)
                await asyncio.sleep(retry_after)
                raise httpx.HTTPStatusError(
                    "Rate limited",
                    request=response.request,
                    response=response,
                )
            
            # Don't retry client errors (except 429)
            if 400 <= response.status_code < 500:
                log.warning(
                    "Client error",
                    status=response.status_code,
                    body=response.text[:500],
                )
                return response
            
            response.raise_for_status()
            return response
            
        except Exception as e:
            self._error_count += 1
            log.error("API request failed", error=str(e))
            raise
    
    async def get(
        self,
        path: str,
        params: Optional[dict[str, Any]] = None,
        **kwargs,
    ) -> dict[str, Any]:
        """
        Make a GET request with retries.
        Returns parsed JSON response.
        """
        response = await self._request_with_retry("GET", path, params=params, **kwargs)
        return response.json()
    
    async def post(
        self,
        path: str,
        json_body: Optional[dict[str, Any]] = None,
        **kwargs,
    ) -> dict[str, Any]:
        """
        Make a POST request with retries.
        Returns parsed JSON response.
        """
        response = await self._request_with_retry(
            "POST", path, json_body=json_body, **kwargs
        )
        return response.json()
    
    @retry(
        retry=retry_if_exception_type((httpx.HTTPStatusError, httpx.TransportError)),
        stop=stop_after_attempt(5),
        wait=wait_exponential_jitter(initial=1, max=60, jitter=5),
        reraise=True,
    )
    async def _request_with_retry(
        self,
        method: str,
        path: str,
        **kwargs,
    ) -> httpx.Response:
        """Make request with retry logic."""
        return await self._make_request(method, path, **kwargs)
    
    async def paginate(
        self,
        path: str,
        params: Optional[dict[str, Any]] = None,
        page_param: str = "page",
        limit_param: str = "limit",
        limit: int = 100,
        data_key: Optional[str] = "data",
        total_key: Optional[str] = None,
        max_pages: int = 0,
    ) -> list[dict[str, Any]]:
        """
        Fetch all pages from a paginated endpoint.
        
        Args:
            path: API endpoint path
            params: Additional query parameters
            page_param: Name of page parameter (default: "page")
            limit_param: Name of limit parameter (default: "limit")
            limit: Items per page
            data_key: Key in response containing data (None if response is the array)
            total_key: Key containing total count (for progress logging)
            max_pages: Maximum pages to fetch (0 = unlimited)
        
        Returns:
            Combined list of all items from all pages
        """
        all_items = []
        page = 1
        params = params or {}
        
        while True:
            # Apply pagination
            page_params = {
                **params,
                page_param: page,
                limit_param: limit,
            }
            
            response = await self.get(path, params=page_params)
            
            # Extract items
            if data_key:
                items = response.get(data_key, [])
            else:
                items = response if isinstance(response, list) else []
            
            all_items.extend(items)
            
            # Log progress
            total = None
            if total_key and isinstance(response, dict):
                total = response.get(total_key)
            
            logger.debug(
                "Paginated fetch",
                path=path,
                page=page,
                items_this_page=len(items),
                total_so_far=len(all_items),
                total_available=total,
            )
            
            # Check if we should continue
            if len(items) < limit:
                break
            if max_pages > 0 and page >= max_pages:
                logger.info("Reached max pages limit", max_pages=max_pages)
                break
            
            page += 1
        
        return all_items
    
    def get_metrics(self) -> dict[str, Any]:
        """Get client metrics."""
        avg_latency = (
            self._total_latency_ms / self._request_count
            if self._request_count > 0
            else 0
        )
        return {
            "source": self.SOURCE.value if self.SOURCE else "unknown",
            "requests": self._request_count,
            "errors": self._error_count,
            "error_rate": self._error_count / max(self._request_count, 1),
            "bytes_transferred": self._bytes_transferred,
            "avg_latency_ms": round(avg_latency, 2),
        }
