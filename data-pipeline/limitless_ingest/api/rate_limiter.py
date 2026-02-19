"""
Rate limiter implementation for API requests.
"""
import asyncio
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Any

from limitless_ingest.utils import get_logger

logger = get_logger(__name__)


@dataclass
class RateLimitState:
    """State for rate limiting."""
    
    requests_per_second: float
    window_seconds: float = 1.0
    timestamps: deque[float] = field(default_factory=deque)
    _lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    
    def __post_init__(self) -> None:
        self.min_interval = 1.0 / self.requests_per_second


class RateLimiter:
    """
    Async rate limiter using token bucket algorithm.
    
    Supports:
    - Requests per second limiting
    - Burst allowance
    - Per-host rate limiting
    """
    
    def __init__(
        self,
        requests_per_second: float = 10.0,
        burst_size: int = 5,
        per_host: bool = True,
    ):
        """
        Initialize rate limiter.
        
        Args:
            requests_per_second: Maximum sustained request rate
            burst_size: Maximum burst size allowed
            per_host: Whether to track rate limits per host
        """
        self.requests_per_second = requests_per_second
        self.burst_size = burst_size
        self.per_host = per_host
        
        self._global_state = RateLimitState(requests_per_second)
        self._host_states: dict[str, RateLimitState] = {}
        self._lock = asyncio.Lock()
        
        # Track 429 responses for adaptive throttling
        self._throttle_until: float = 0
        self._consecutive_429s: int = 0
    
    async def acquire(self, host: str | None = None) -> float:
        """
        Acquire permission to make a request.
        
        Args:
            host: Optional host for per-host rate limiting
            
        Returns:
            Time waited in seconds
        """
        wait_time = 0.0
        
        # Check if we're in a throttle period from 429s
        now = time.monotonic()
        if now < self._throttle_until:
            wait_time = self._throttle_until - now
            logger.debug(
                "rate_limit_throttled",
                wait_seconds=wait_time,
                reason="429_backoff",
            )
            await asyncio.sleep(wait_time)
        
        # Get the appropriate state
        state = await self._get_state(host)
        
        async with state._lock:
            now = time.monotonic()
            
            # Remove timestamps outside the window
            window_start = now - state.window_seconds
            while state.timestamps and state.timestamps[0] < window_start:
                state.timestamps.popleft()
            
            # Check if we need to wait
            if len(state.timestamps) >= self.burst_size:
                # Calculate wait time
                oldest = state.timestamps[0]
                wait_until = oldest + state.window_seconds
                if wait_until > now:
                    wait_time += wait_until - now
                    logger.debug(
                        "rate_limit_wait",
                        wait_seconds=wait_time,
                        current_count=len(state.timestamps),
                    )
                    await asyncio.sleep(wait_until - now)
            
            # Record this request
            state.timestamps.append(time.monotonic())
        
        return wait_time
    
    async def _get_state(self, host: str | None) -> RateLimitState:
        """Get or create rate limit state for a host."""
        if not self.per_host or not host:
            return self._global_state
        
        async with self._lock:
            if host not in self._host_states:
                self._host_states[host] = RateLimitState(self.requests_per_second)
            return self._host_states[host]
    
    def record_429(self, retry_after: float | None = None) -> None:
        """
        Record a 429 Too Many Requests response.
        
        Args:
            retry_after: Retry-After header value in seconds
        """
        self._consecutive_429s += 1
        
        if retry_after:
            backoff = retry_after
        else:
            # Exponential backoff: 1, 2, 4, 8, 16... capped at 60
            backoff = min(2 ** self._consecutive_429s, 60)
        
        self._throttle_until = time.monotonic() + backoff
        
        logger.warning(
            "rate_limit_429",
            consecutive_429s=self._consecutive_429s,
            backoff_seconds=backoff,
        )
    
    def record_success(self) -> None:
        """Record a successful request (resets 429 counter)."""
        self._consecutive_429s = 0
    
    @property
    def current_rate(self) -> float:
        """Get current request rate per second."""
        now = time.monotonic()
        window_start = now - 1.0
        
        count = sum(
            1 for ts in self._global_state.timestamps
            if ts >= window_start
        )
        return count


class AdaptiveRateLimiter(RateLimiter):
    """
    Rate limiter that adapts based on server responses.
    
    Features:
    - Automatic rate reduction on 429s
    - Gradual rate increase on success
    - Configurable min/max bounds
    """
    
    def __init__(
        self,
        initial_rps: float = 10.0,
        min_rps: float = 1.0,
        max_rps: float = 50.0,
        **kwargs: Any,
    ):
        super().__init__(requests_per_second=initial_rps, **kwargs)
        
        self.min_rps = min_rps
        self.max_rps = max_rps
        self.initial_rps = initial_rps
        
        self._success_count = 0
        self._rps_increase_threshold = 100  # Successes before increasing
    
    def record_429(self, retry_after: float | None = None) -> None:
        """Reduce rate on 429."""
        super().record_429(retry_after)
        
        # Reduce rate by 50%
        new_rps = max(self.min_rps, self.requests_per_second * 0.5)
        if new_rps != self.requests_per_second:
            logger.info(
                "rate_limit_adjusted",
                old_rps=self.requests_per_second,
                new_rps=new_rps,
                reason="429_response",
            )
            self.requests_per_second = new_rps
            self._global_state.requests_per_second = new_rps
        
        self._success_count = 0
    
    def record_success(self) -> None:
        """Gradually increase rate on success."""
        super().record_success()
        
        self._success_count += 1
        
        if self._success_count >= self._rps_increase_threshold:
            # Increase rate by 10%
            new_rps = min(self.max_rps, self.requests_per_second * 1.1)
            if new_rps != self.requests_per_second:
                logger.info(
                    "rate_limit_adjusted",
                    old_rps=self.requests_per_second,
                    new_rps=new_rps,
                    reason="success_streak",
                )
                self.requests_per_second = new_rps
                self._global_state.requests_per_second = new_rps
            
            self._success_count = 0
