"""
Dome API client for Polymarket and Kalshi data.
https://docs.domeapi.com

Dome provides a unified API for multiple prediction market platforms.
"""
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Optional

import structlog

from predictions_ingest.clients.base import BaseAPIClient
from predictions_ingest.config import get_settings
from predictions_ingest.models import (
    Category,
    DataSource,
    Event,
    Market,
    MarketStatus,
    OrderbookSnapshot,
    OrderLevel,
    Outcome,
    PriceSnapshot,
    Trade,
    TradeSide,
)

logger = structlog.get_logger()


class DomeClient(BaseAPIClient):
    """
    Client for Dome API (Polymarket + Kalshi).
    
    Rate limits (Dev tier): 100 QPS, 500 per 10 seconds
    Auth: X-API-Key header
    
    Endpoints:
    - Polymarket: /polymarket/markets, /polymarket/orders (trades)
    - Kalshi: /kalshi/markets, /kalshi/trades
    """
    
    BASE_URL = "https://api.domeapi.io/v1"
    
    def __init__(
        self,
        source: DataSource,
        api_key: Optional[str] = None,
        **kwargs,
    ):
        """
        Initialize Dome client for a specific source.
        
        Args:
            source: DataSource.POLYMARKET or DataSource.KALSHI
            api_key: Dome API key (defaults to env var)
        """
        if source not in (DataSource.POLYMARKET, DataSource.KALSHI):
            raise ValueError(f"DomeClient only supports polymarket and kalshi, got: {source}")
        
        self.SOURCE = source
        self._api_key = api_key or get_settings().dome_api_key
        
        if not self._api_key:
            raise ValueError("Dome API key is required. Set DOME_API_KEY env var.")
        
        super().__init__(**kwargs)
    
    @property
    def supports_trades(self) -> bool:
        """Check if this source supports trade history via Dome API."""
        return self.SOURCE in (DataSource.POLYMARKET, DataSource.KALSHI)
    
    def _get_default_rate_limit(self) -> float:
        return get_settings().dome_rate_limit_rps
    
    def _get_headers(self) -> dict[str, str]:
        return {
            "X-API-Key": self._api_key,
            "Accept": "application/json",
            "User-Agent": "PredictionsIngest/1.0",
        }
    
    @property
    def _prefix(self) -> str:
        """Get API path prefix for this source."""
        return "polymarket" if self.SOURCE == DataSource.POLYMARKET else "kalshi"
    
    # =========================================================================
    # MARKETS
    # =========================================================================
    
    async def fetch_markets(
        self,
        limit: int = 100,
        offset: int = 0,
        pagination_key: Optional[str] = None,
        active_only: bool = False,
        min_volume: Optional[int] = None,
        **kwargs,
    ) -> tuple[list[dict[str, Any]], Optional[str]]:
        """
        Fetch markets from the API.
        
        Args:
            limit: Number of markets per request
            offset: Offset for pagination (deprecated for Kalshi, use pagination_key)
            pagination_key: Cursor for pagination (recommended for Kalshi)
            active_only: Filter to active markets only
            min_volume: Minimum 24h volume in USD (server-side filtering)
        
        Returns:
            Tuple of (markets list, next_pagination_key)
        """
        params = {
            "limit": limit,
        }
        
        # Use cursor-based pagination if available (required for Kalshi with large offsets)
        if pagination_key:
            params["pagination_key"] = pagination_key
        elif offset > 0:
            # Only use offset for Polymarket or small offsets
            if self.SOURCE == DataSource.KALSHI and offset >= 10000:
                logger.warning(
                    "Kalshi offset pagination limited to 10,000. Use cursor pagination.",
                    offset=offset,
                )
            params["offset"] = offset
            
        if active_only:
            # Use status=open to get truly active markets (~16k)
            # Note: closed=false returns 319k markets (too many)
            params["status"] = "open"
        
        # Always sort by volume descending to get highest-volume markets first.
        # This ensures near-settled markets (e.g. KW @ 94%) with low 24h volume
        # but high total volume are not arbitrarily excluded.
        # NOTE: Dome API requires min_volume to be set for sort_by=volume to
        # actually work. Without min_volume, the API ignores sort_by and returns
        # markets in an arbitrary order. min_volume=1 is the minimum effective value.
        params["sort_by"] = "volume"
        params["order"] = "desc"
        params["min_volume"] = max(min_volume or 0, 1)  # Always at least 1 for sort to work
            
        params.update(kwargs)
        
        response = await self.get(f"/{self._prefix}/markets", params=params)
        
        # Extract markets and pagination info
        if isinstance(response, list):
            return response, None
        
        markets = response.get("markets", [])
        pagination = response.get("pagination", {})
        # Dome API uses pagination_key, next_key, or next_cursor depending on endpoint
        next_key = pagination.get("pagination_key") or pagination.get("next_key") or pagination.get("next_cursor")
        
        return markets, next_key
    
    async def fetch_all_markets(
        self,
        active_only: bool = False,
        max_records: int = 0,
        min_volume: Optional[int] = None,
    ) -> list[dict[str, Any]]:
        """
        Fetch all markets using cursor-based pagination.
        
        IMPORTANT: Dome API no longer supports offset pagination beyond 10,000 records.
        All sources must use cursor-based pagination with pagination_key.
        
        When active_only=True, uses status=open parameter for server-side filtering.
        This excludes closed markets and returns only open markets.
        
        When min_volume is set, API returns markets sorted by volume (descending).
        Combined with max_records, this fetches the TOP N markets by volume.
        
        Args:
            active_only: Filter to active markets only
            max_records: Stop after this many records (0=unlimited). When combined with 
                        min_volume, gets the TOP N highest volume markets.
            min_volume: Minimum 24h volume in USD (server-side filtering)
        """
        all_markets = []
        limit = 100
        pagination_key = None
        page_num = 0
        
        while True:
            # Always use cursor-based pagination (required for Polymarket after 10k records)
            markets, next_key = await self.fetch_markets(
                limit=limit,
                pagination_key=pagination_key,
                active_only=active_only,
                min_volume=min_volume,
            )
            
            if not markets:
                break
            
            # Server-side filtering with closed=false parameter
            all_markets.extend(markets)
            
            logger.info(
                "Fetched markets batch",
                source=self.SOURCE.value,
                page=page_num + 1,
                batch_size=len(markets),
                total=len(all_markets),
                pagination_type="cursor",
            )
            
            page_num += 1
            
            # Check termination conditions
            if len(markets) < limit:
                break
            if max_records > 0 and len(all_markets) >= max_records:
                break
            
            # Update pagination state - move to next cursor
            if not next_key:
                break
            pagination_key = next_key
        
        return all_markets
    
    def normalize_market(self, raw: dict[str, Any]) -> Market:
        """Transform raw API market data to unified Market model."""
        
        # Parse outcomes
        outcomes = []
        raw_outcomes = raw.get("outcomes", []) or raw.get("tokens", [])
        for i, outcome in enumerate(raw_outcomes):
            if isinstance(outcome, dict):
                outcomes.append(Outcome(
                    id=str(outcome.get("id", i)),
                    name=outcome.get("name", outcome.get("outcome", f"Outcome {i}")),
                    token_id=outcome.get("token_id") or outcome.get("tokenId"),
                    price=self._to_decimal(outcome.get("price")),
                ))
            elif isinstance(outcome, str):
                outcomes.append(Outcome(id=str(i), name=outcome))
        
        # Determine status
        status = MarketStatus.ACTIVE
        if raw.get("resolved") or raw.get("is_resolved"):
            status = MarketStatus.RESOLVED
        elif raw.get("closed") or raw.get("is_closed"):
            status = MarketStatus.CLOSED
        elif not raw.get("active", True):
            status = MarketStatus.PAUSED
        
        # Extract prices
        # Kalshi uses last_price on 0-100 cent scale; others use 0-1 decimal
        _primary_yes = (
            raw.get("yes_price") or
            raw.get("yesPrice") or
            raw.get("outcomePrices", {}).get("Yes") or
            (outcomes[0].price if outcomes else None)
        )
        _kalshi_last = raw.get("last_price")
        raw_yes = _primary_yes if _primary_yes is not None else _kalshi_last
        # If price came from Kalshi's last_price field, it's ALWAYS on 0-100 cent scale
        # (edge case: last_price=1 is NOT > 1, so plain ">" check would miss it)
        _from_kalshi_cents = _primary_yes is None and _kalshi_last is not None
        raw_no = (
            raw.get("no_price") or
            raw.get("noPrice") or
            raw.get("outcomePrices", {}).get("No") or
            (outcomes[1].price if len(outcomes) > 1 else None)
        )
        yes_price = self._to_decimal(raw_yes)
        # Kalshi prices are on 0-100 scale → convert to 0-1
        if yes_price is not None and (yes_price > Decimal("1") or _from_kalshi_cents):
            yes_price = yes_price / Decimal("100")
        no_price = self._to_decimal(raw_no)
        if no_price is not None and no_price > Decimal("1"):
            no_price = no_price / Decimal("100")
        # Derive no_price from yes_price if missing (binary markets)
        if no_price is None and yes_price is not None:
            no_price = Decimal("1") - yes_price
        
        return Market(
            source=self.SOURCE,
            source_market_id=str(raw.get("market_ticker") or raw.get("ticker") or raw.get("id") or raw.get("condition_id") or raw.get("market_id")),
            slug=raw.get("slug") or raw.get("ticker_name") or raw.get("market_ticker"),
            condition_id=raw.get("condition_id") or raw.get("conditionId"),
            question_id=raw.get("question_id") or raw.get("questionId"),
            
            title=raw.get("title") or raw.get("question") or raw.get("name", ""),
            description=raw.get("description"),
            question=raw.get("question") or raw.get("title"),
            
            category_id=raw.get("category_id") or raw.get("categoryId"),
            category_name=self._extract_category(raw),
            tags=raw.get("tags", []) or [],
            
            status=status,
            is_active=status == MarketStatus.ACTIVE,
            is_resolved=status == MarketStatus.RESOLVED,
            resolution_value=raw.get("resolution") or raw.get("resolved_value"),
            
            outcomes=outcomes,
            outcome_count=len(outcomes) or 2,
            
            yes_price=yes_price,
            no_price=no_price,
            last_trade_price=self._to_decimal(raw.get("last_trade_price") or raw.get("last_price")),
            mid_price=self._calculate_mid_price(yes_price, no_price),
            spread=self._calculate_spread(raw),
            
            # Volume fields - map platform-specific names
            volume_24h=self._to_decimal(
                raw.get("volume_24h") or raw.get("volume24hr") or raw.get("volume_1_day"),
                Decimal("0")
            ),
            volume_7d=self._to_decimal(
                raw.get("volume_7d") or raw.get("volume_1_week") or raw.get("volume7d"),
                Decimal("0")
            ),
            volume_30d=self._to_decimal(
                raw.get("volume_30d") or raw.get("volume_1_month") or raw.get("volume30d"),
                Decimal("0")
            ),
            volume_total=self._to_decimal(
                raw.get("volume_total") or raw.get("volume") or raw.get("total_volume"),
                Decimal("0")
            ),
            liquidity=self._to_decimal(raw.get("liquidity") or raw.get("liquidityUsd"), Decimal("0")),
            open_interest=self._to_decimal(raw.get("open_interest") or raw.get("openInterest"), Decimal("0")),
            
            trade_count_24h=raw.get("trade_count_24h", 0) or 0,
            trade_count_total=raw.get("num_trades", 0) or raw.get("trade_count", 0) or 0,
            
            created_at_source=self._parse_datetime(raw.get("created_at") or raw.get("createdAt") or raw.get("start_time")),
            start_date=self._parse_datetime(raw.get("start_date") or raw.get("startDate") or raw.get("start_time")),
            end_date=self._parse_datetime(raw.get("end_date") or raw.get("endDate") or raw.get("close_time") or raw.get("end_time")),
            resolution_date=self._parse_datetime(raw.get("resolution_date") or raw.get("resolvedAt") or raw.get("completed_time")),
            
            image_url=raw.get("image") or raw.get("image_url") or raw.get("imageUrl"),
            icon_url=raw.get("icon") or raw.get("icon_url"),
            source_url=self._construct_market_url(raw),
            
            extra_data={
                k: v for k, v in raw.items()
                if k not in {
                    "id", "title", "description", "question", "category",
                    "outcomes", "yes_price", "no_price", "volume", "liquidity"
                }
            },
        )
    
    def _construct_market_url(self, raw: dict[str, Any]) -> Optional[str]:
        """Construct market URL from raw data based on platform."""
        # If URL is provided, use it
        if raw.get("url") or raw.get("market_url"):
            return raw.get("url") or raw.get("market_url")
        
        # Polymarket: https://polymarket.com/event/{slug} or https://polymarket.com/market/{slug}
        if self.SOURCE == DataSource.POLYMARKET:
            slug = raw.get("slug") or raw.get("market_slug")
            condition_id = raw.get("condition_id") or raw.get("conditionId")
            if slug:
                return f"https://polymarket.com/event/{slug}"
            elif condition_id:
                return f"https://polymarket.com/markets/{condition_id}"
        
        # Kalshi: https://kalshi.com/markets/{ticker}
        elif self.SOURCE == DataSource.KALSHI:
            ticker = raw.get("market_ticker") or raw.get("ticker")
            if ticker:
                return f"https://kalshi.com/markets/{ticker}"
        
        return None
    
    def _extract_category(self, raw: dict[str, Any]) -> Optional[str]:
        """Extract category from raw data based on platform."""
        # Standard category field
        if raw.get("category") or raw.get("category_name"):
            return raw.get("category") or raw.get("category_name")
        
        # Polymarket: Use first tag as category (tags like ['politics', 'crypto', 'sports'])
        if self.SOURCE == DataSource.POLYMARKET:
            tags = raw.get("tags", [])
            if tags and len(tags) > 0:
                # Capitalize first letter
                return tags[0].title()
        
        # Kalshi: Try to extract from event_ticker (e.g., "KXPOL" -> "Politics")
        elif self.SOURCE == DataSource.KALSHI:
            event_ticker = raw.get("event_ticker", "")
            if event_ticker:
                # Common Kalshi prefixes
                kalshi_categories = {
                    "KXPOL": "Politics",
                    "KXELEC": "Elections", 
                    "KXWEATHER": "Weather",
                    "KXRAIN": "Weather",
                    "KXSNOW": "Weather",
                    "KXTEMP": "Weather",
                    "KXHIGH": "Weather",
                    "KXLOW": "Weather",
                    "KXECON": "Economics",
                    "KXGDP": "Economics",
                    "KXINFL": "Economics",
                    "KXUNRATE": "Economics",
                    "KXCPI": "Economics",
                    "KXNASDAQ": "Finance",
                    "KXSP500": "Finance",
                    "KXDJI": "Finance",
                    "KXNYSE": "Finance",
                    "KXBTC": "Crypto",
                    "KXETH": "Crypto",
                    "KXSPORTS": "Sports",
                    "KXNFL": "Sports",
                    "KXNBA": "Sports",
                    "KXMLB": "Sports",
                    "KXNHL": "Sports",
                    "KXTORNADO": "Weather",
                }
                # Try to match prefix
                for prefix, category in kalshi_categories.items():
                    if event_ticker.startswith(prefix):
                        return category
                # Default to "General" for unknown prefixes
                return "General"
        
        return None
    
    # =========================================================================
    # EVENTS
    # =========================================================================
    
    async def fetch_events(
        self, 
        limit: int = 100, 
        pagination_key: Optional[str] = None,
        active_only: bool = False,
    ) -> tuple[list[dict[str, Any]], Optional[str]]:
        """
        Fetch events (market groupings) using cursor-based pagination.
        
        Args:
            limit: Number of events per page
            pagination_key: Cursor for pagination
            active_only: If True, only fetch active events
        
        Returns:
            Tuple of (events list, next_pagination_key)
        """
        if self.SOURCE != DataSource.POLYMARKET:
            logger.debug("Events only available for Polymarket")
            return [], None
        
        params = {"limit": limit}
        if pagination_key:
            params["pagination_key"] = pagination_key
        if active_only:
            params["active"] = "true"
            
        response = await self.get(f"/{self._prefix}/events", params=params)
        
        # Extract events and pagination info
        if isinstance(response, list):
            return response, None
        
        events = response.get("events", [])
        pagination = response.get("pagination", {})
        next_key = pagination.get("next_key") or pagination.get("next_cursor") or pagination.get("pagination_key")
        
        return events, next_key
    
    async def fetch_all_events(self, active_only: bool = False, max_events: int = 0) -> list[dict[str, Any]]:
        """
        Fetch all events using cursor-based pagination.
        
        Args:
            active_only: If True, only fetch active events (recommended)
            max_events: Maximum number of events to fetch (0 = no limit)
        """
        all_events = []
        pagination_key = None
        limit = 100
        page_num = 0
        
        while True:
            events, next_key = await self.fetch_events(
                limit=limit, 
                pagination_key=pagination_key,
                active_only=active_only
            )
            if not events:
                break
            
            all_events.extend(events)
            page_num += 1
            
            logger.info(
                "Fetched events batch",
                source=self.SOURCE.value,
                page=page_num,
                batch_size=len(events),
                total=len(all_events),
            )
            
            # Stop if we've reached max_events
            if max_events > 0 and len(all_events) >= max_events:
                logger.info(f"Reached max_events limit: {max_events}")
                break
            
            if len(events) < limit:
                break
            if not next_key:
                break
                
            pagination_key = next_key
        
        return all_events
    
    def normalize_event(self, raw: dict[str, Any]) -> Event:
        """Transform raw event data to Event model."""
        return Event(
            source=self.SOURCE,
            source_event_id=raw.get("event_slug", ""),  # Use event_slug as the ID
            title=raw.get("title") or raw.get("name", ""),
            description=raw.get("subtitle"),  # Dome API uses "subtitle" not "description"
            slug=raw.get("event_slug"),  # Dome API uses "event_slug" not "slug"
            category_id=raw.get("category_id"),
            category_name=raw.get("category"),
            tags=raw.get("tags", []) or [],
            is_active=raw.get("status") in ['open', 'active'],  # Determine from status field
            market_count=raw.get("market_count", 0) or len(raw.get("markets", [])),
            total_volume=self._to_decimal(raw.get("volume_fiat_amount"), Decimal("0")),  # Dome uses volume_fiat_amount
            total_liquidity=self._to_decimal(raw.get("liquidity"), Decimal("0")),
            start_date=self._parse_datetime(raw.get("start_time")),  # Dome uses start_time (timestamp)
            end_date=self._parse_datetime(raw.get("end_time")),  # Dome uses end_time (timestamp)
            image_url=raw.get("image") or raw.get("image_url"),
            extra_data=raw,
        )
    
    # =========================================================================
    # TRADE HISTORY / ORDERS
    # =========================================================================
    
    async def fetch_trade_history(
        self,
        market_id: Optional[str] = None,
        limit: int = 100,
        cursor: Optional[str] = None,
        since: Optional[datetime] = None,
    ) -> list[dict[str, Any]]:
        """
        Fetch trade history (orders).
        
        Note: Polymarket uses /polymarket/orders endpoint
              Kalshi uses /kalshi/trades endpoint
        
        Args:
            market_id: Filter by market (optional)
            limit: Number of trades to fetch
            cursor: Cursor for pagination
            since: Filter trades after this timestamp
            
        Returns:
            List of trade/order records
        """
        params: dict[str, Any] = {"limit": limit}
        
        if market_id:
            params["market_id"] = market_id
        if cursor:
            params["cursor"] = cursor
        if since:
            params["since"] = since.isoformat()
        
        # Use different endpoints based on source
        if self.SOURCE == DataSource.POLYMARKET:
            endpoint = f"/{self._prefix}/orders"
        elif self.SOURCE == DataSource.KALSHI:
            endpoint = f"/{self._prefix}/trades"
        else:
            # Fallback for any other source
            endpoint = f"/{self._prefix}/trade-history"
        
        response = await self.get(endpoint, params=params)
        
        # Extract trades list from response
        # Different endpoints use different response keys
        if isinstance(response, dict):
            trades = (
                response.get("orders") or  # Polymarket
                response.get("trades") or  # Kalshi
                response.get("data") or 
                []
            )
            return trades if isinstance(trades, list) else []
        return []
    
    async def _fetch_trade_history_raw(
        self,
        market_id: Optional[str] = None,
        limit: int = 100,
        cursor: Optional[str] = None,
        since: Optional[datetime] = None,
    ) -> dict[str, Any]:
        """
        Internal method to fetch raw trade history response with pagination info.
        Used by fetch_all_trades for pagination support.
        """
        params: dict[str, Any] = {"limit": limit}
        
        if market_id:
            params["market_id"] = market_id
        if cursor:
            params["cursor"] = cursor
            params["pagination_key"] = cursor  # Polymarket uses pagination_key
        if since:
            # Convert datetime to Unix timestamp (Polymarket uses start_time as integer)
            params["start_time"] = int(since.timestamp())
        
        # Use different endpoints based on source
        if self.SOURCE == DataSource.POLYMARKET:
            endpoint = f"/{self._prefix}/orders"
        elif self.SOURCE == DataSource.KALSHI:
            endpoint = f"/{self._prefix}/trades"
        else:
            endpoint = f"/{self._prefix}/trade-history"
        
        return await self.get(endpoint, params=params)
    
    async def fetch_all_trades(
        self,
        market_id: Optional[str] = None,
        since: Optional[datetime] = None,
        max_records: int = 0,
    ) -> list[dict[str, Any]]:
        """
        Fetch all trades with cursor pagination.
        
        Note: Trade history endpoint may not be available for all sources.
        Returns empty list if endpoint is not found or returns non-dict response.
        """
        all_trades = []
        cursor = None
        
        while True:
            try:
                response = await self._fetch_trade_history_raw(
                    market_id=market_id,
                    limit=100,
                    cursor=cursor,
                    since=since,
                )
                
                # Handle non-dict responses (e.g., 404 error strings)
                if not isinstance(response, dict):
                    logger.debug(
                        "Trade history endpoint returned non-dict response",
                        response_type=type(response).__name__,
                        source=self.SOURCE.value,
                    )
                    break
                
                # Different endpoints use different response keys:
                # - Polymarket /orders: response['orders']
                # - Kalshi /trades: response['trades'] or response['data']
                trades = (
                    response.get("orders") or 
                    response.get("trades") or 
                    response.get("data") or 
                    []
                )
                if not trades:
                    break
                
                # Client-side filtering by timestamp if since parameter provided
                # (API may not support server-side filtering)
                if since:
                    filtered_trades = []
                    for trade in trades:
                        # Parse trade timestamp - different sources use different fields
                        trade_time_str = (
                            trade.get("timestamp") or 
                            trade.get("created_at") or 
                            trade.get("traded_at") or 
                            trade.get("execution_time")
                        )
                        if trade_time_str:
                            try:
                                # Handle both ISO format and Unix timestamps
                                if isinstance(trade_time_str, (int, float)):
                                    trade_time = datetime.fromtimestamp(trade_time_str)
                                else:
                                    trade_time = datetime.fromisoformat(trade_time_str.replace('Z', '+00:00'))
                                
                                if trade_time >= since:
                                    filtered_trades.append(trade)
                                # Stop pagination if we've reached trades older than since
                                elif len(filtered_trades) > 0:
                                    # We have some matching trades, but now hit older ones - stop
                                    all_trades.extend(filtered_trades)
                                    logger.debug(
                                        "Stopping pagination - reached trades older than since timestamp",
                                        since=since.isoformat(),
                                        oldest_trade=trade_time.isoformat(),
                                        trades_found=len(all_trades),
                                    )
                                    return all_trades
                            except (ValueError, TypeError):
                                # Can't parse timestamp, include the trade
                                filtered_trades.append(trade)
                        else:
                            # No timestamp field, include the trade
                            filtered_trades.append(trade)
                    
                    all_trades.extend(filtered_trades)
                    
                    # If we got no matching trades in this page, stop pagination
                    if not filtered_trades and len(all_trades) > 0:
                        logger.debug(
                            "Stopping pagination - no trades match since filter in current page",
                            since=since.isoformat(),
                            trades_found=len(all_trades),
                        )
                        break
                else:
                    all_trades.extend(trades)
                
                # Get next cursor from pagination object or top-level
                pagination = response.get("pagination", {})
                cursor = (
                    pagination.get("pagination_key") or
                    pagination.get("cursor") or
                    response.get("next_cursor") or 
                    response.get("cursor")
                )
                if not cursor:
                    break
                if max_records > 0 and len(all_trades) >= max_records:
                    break
                    
            except Exception as e:
                logger.debug(
                    "Failed to fetch trade history",
                    error=str(e),
                    source=self.SOURCE.value,
                    market_id=market_id,
                )
                break
        
        return all_trades
    
    def normalize_trade(self, raw: dict[str, Any], market_id: Optional[str] = None) -> Trade:
        """
        Transform raw trade data to Trade model.
        
        Args:
            raw: Raw trade data from API
            market_id: Optional market_id to use if not in raw data
        
        Handles both Polymarket /orders format and Kalshi /trades format:
        - Polymarket: shares, price, order_hash, condition_id, user, taker, timestamp (unix)
        - Kalshi: count, yes_price, no_price, yes_price_dollars, no_price_dollars, 
                  taker_side, trade_id, market_ticker, created_time
        """
        # Handle Kalshi-specific format
        if self.SOURCE == DataSource.KALSHI:
            # Kalshi uses 'count' for quantity
            quantity = self._to_decimal(raw.get("count"), Decimal("0"))
            
            # Kalshi has taker_side ('yes' or 'no') and separate prices
            taker_side = (raw.get("taker_side") or "").lower()
            
            # Get price in dollars (prefer _dollars suffix)
            if taker_side == "yes":
                price = self._to_decimal(
                    raw.get("yes_price_dollars") or 
                    (raw.get("yes_price", 0) / 100 if raw.get("yes_price") else None),
                    Decimal("0")
                )
                outcome = "yes"
            else:
                price = self._to_decimal(
                    raw.get("no_price_dollars") or 
                    (raw.get("no_price", 0) / 100 if raw.get("no_price") else None),
                    Decimal("0")
                )
                outcome = "no"
            
            # taker_side determines if they bought yes or bought no
            # buying "yes" = BUY, buying "no" = SELL
            side = TradeSide.BUY if taker_side == "yes" else TradeSide.SELL
            
            # Market ID from market_ticker
            source_market_id = str(raw.get("market_ticker") or market_id or "")
            
            # Trade ID
            trade_id = str(raw.get("trade_id") or raw.get("id") or "")
            
            # Timestamp from created_time (unix epoch)
            traded_at = self._parse_datetime(raw.get("created_time")) or datetime.now(timezone.utc)
            
            return Trade(
                source=self.SOURCE,
                source_trade_id=trade_id,
                source_market_id=source_market_id,
                side=side,
                outcome=outcome,
                outcome_index=0 if taker_side == "yes" else 1,
                price=price,
                quantity=quantity,
                total_value=price * quantity,
                fee=Decimal("0"),
                maker_address=None,
                taker_address=None,
                block_number=None,
                transaction_hash=None,
                traded_at=traded_at,
            )
        
        # Polymarket and other sources
        price = self._to_decimal(raw.get("price"), Decimal("0"))
        
        # Quantity: Polymarket uses 'shares' or 'shares_normalized', Kalshi uses 'quantity'
        quantity = self._to_decimal(
            raw.get("shares_normalized") or  # Polymarket normalized shares
            raw.get("quantity") or 
            raw.get("size") or 
            raw.get("amount") or
            raw.get("shares"),  # Polymarket raw shares (in smallest unit)
            Decimal("0")
        )
        
        # Determine side
        side_str = (raw.get("side") or raw.get("type") or "buy").lower()
        side = TradeSide.BUY if side_str in ("buy", "b", "bid") else TradeSide.SELL
        
        # Get market_id from raw data or fallback parameter
        source_market_id = str(
            raw.get("market_id") or 
            raw.get("marketId") or 
            raw.get("condition_id") or  # Polymarket
            raw.get("token_id") or  # Polymarket alternative
            market_id or 
            ""
        )
        
        # Trade ID: Polymarket uses order_hash, Kalshi uses id/trade_id
        trade_id = str(
            raw.get("order_hash") or  # Polymarket
            raw.get("id") or 
            raw.get("trade_id") or 
            raw.get("tx_hash") or  # Fallback to tx hash
            ""
        )
        
        return Trade(
            source=self.SOURCE,
            source_trade_id=trade_id,
            source_market_id=source_market_id,
            side=side,
            outcome=raw.get("outcome") or raw.get("outcome_name") or raw.get("token_label"),  # Polymarket
            outcome_index=raw.get("outcome_index"),
            price=price,
            quantity=quantity,
            total_value=price * quantity,
            fee=self._to_decimal(raw.get("fee"), Decimal("0")),
            maker_address=raw.get("maker") or raw.get("maker_address") or raw.get("user"),  # Polymarket
            taker_address=raw.get("taker") or raw.get("taker_address"),
            block_number=raw.get("block_number") or raw.get("blockNumber"),
            transaction_hash=raw.get("transaction_hash") or raw.get("txHash") or raw.get("tx_hash"),
            traded_at=self._parse_datetime(
                raw.get("timestamp") or raw.get("traded_at") or raw.get("created_at")
            ) or datetime.now(timezone.utc),
        )
    
    # =========================================================================
    # MARKET PRICES
    # =========================================================================
    
    async def fetch_market_price(
        self,
        market_ticker: str,
    ) -> dict[str, Any]:
        """Fetch current price for a market by ticker."""
        response = await self.get(
            f"/{self._prefix}/market-price/{market_ticker}",
        )
        return response
    
    async def fetch_market_prices_batch(
        self,
        market_ids: list[str],
    ) -> list[dict[str, Any]]:
        """Fetch prices for multiple markets."""
        # Dome may support batch endpoint, otherwise fetch individually
        results = []
        for market_id in market_ids:
            try:
                price = await self.fetch_market_price(market_id)
                results.append(price)
            except Exception as e:
                logger.warning(
                    "Failed to fetch price",
                    market_id=market_id,
                    error=str(e)
                )
        return results
    
    def normalize_price(self, raw: dict[str, Any], market_id: str) -> PriceSnapshot:
        """Transform raw price data to PriceSnapshot model."""
        # Kalshi market-price endpoint returns {"yes": {"price": 0.94}, "no": {"price": 0.06}}
        # Flat formats: yes_price, yesPrice, last_price, price
        _yes_nested = raw.get("yes") or {}
        _no_nested = raw.get("no") or {}
        raw_yes = (
            raw.get("yes_price")
            or raw.get("yesPrice")
            or raw.get("last_price")
            or raw.get("price")
            or (_yes_nested.get("price") if isinstance(_yes_nested, dict) else None)
        )
        raw_no = (
            raw.get("no_price")
            or raw.get("noPrice")
            or (_no_nested.get("price") if isinstance(_no_nested, dict) else None)
        )
        yes_price = self._to_decimal(raw_yes)
        # Kalshi prices are on 0-100 cent scale → convert to 0-1
        # Edge case: last_price=1 (1 cent) is NOT > 1, so we also check source
        # But the nested yes.price format is already on 0-1 scale (Dome normalizes it)
        _from_kalshi_cents = (
            self.SOURCE == DataSource.KALSHI
            and not (raw.get("yes_price") or raw.get("yesPrice"))
            and not isinstance(_yes_nested, dict)  # nested format is already 0-1
        )
        if yes_price is not None and (yes_price > Decimal("1") or _from_kalshi_cents):
            yes_price = yes_price / Decimal("100")
        no_price = self._to_decimal(raw_no)
        if no_price is not None and no_price > Decimal("1"):
            no_price = no_price / Decimal("100")
        if no_price is None and yes_price is not None:
            no_price = Decimal("1") - yes_price
        
        return PriceSnapshot(
            source=self.SOURCE,
            source_market_id=market_id,
            yes_price=yes_price,
            no_price=no_price,
            mid_price=self._calculate_mid_price(yes_price, no_price),
            best_bid=self._to_decimal(raw.get("best_bid") or raw.get("bid")),
            best_ask=self._to_decimal(raw.get("best_ask") or raw.get("ask")),
            spread=self._to_decimal(raw.get("spread")),
            volume_1h=self._to_decimal(raw.get("volume_1h"), Decimal("0")),
            trade_count_1h=raw.get("trade_count_1h", 0),
            snapshot_at=self._parse_datetime(raw.get("timestamp")) or datetime.now(timezone.utc),
        )
    
    # =========================================================================
    # ORDERBOOK
    # =========================================================================
    
    async def fetch_orderbook(
        self,
        market_id: str,
        depth: int = 20,
    ) -> dict[str, Any]:
        """Fetch orderbook for a market."""
        response = await self.get(
            f"/{self._prefix}/orderbooks",
            params={"market_id": market_id, "depth": depth}
        )
        return response
    
    def normalize_orderbook(self, raw: dict[str, Any], market_id: str) -> OrderbookSnapshot:
        """Transform raw orderbook data to OrderbookSnapshot model."""
        
        def parse_levels(levels: list) -> list[OrderLevel]:
            result = []
            for level in (levels or []):
                if isinstance(level, dict):
                    result.append(OrderLevel(
                        price=self._to_decimal(level.get("price"), Decimal("0")),
                        size=self._to_decimal(level.get("size") or level.get("quantity"), Decimal("0")),
                        orders=level.get("orders", 1),
                    ))
                elif isinstance(level, (list, tuple)) and len(level) >= 2:
                    result.append(OrderLevel(
                        price=self._to_decimal(level[0], Decimal("0")),
                        size=self._to_decimal(level[1], Decimal("0")),
                    ))
            return result
        
        bids = parse_levels(raw.get("bids", []))
        asks = parse_levels(raw.get("asks", []))
        
        best_bid = bids[0].price if bids else None
        best_ask = asks[0].price if asks else None
        
        return OrderbookSnapshot(
            source=self.SOURCE,
            source_market_id=market_id,
            best_bid=best_bid,
            best_ask=best_ask,
            spread=best_ask - best_bid if (best_bid and best_ask) else None,
            mid_price=(best_bid + best_ask) / 2 if (best_bid and best_ask) else None,
            total_bid_depth=sum(b.size for b in bids),
            total_ask_depth=sum(a.size for a in asks),
            bids=bids,
            asks=asks,
            snapshot_at=self._parse_datetime(raw.get("timestamp")) or datetime.now(timezone.utc),
        )
    
    # =========================================================================
    # CANDLESTICKS
    # =========================================================================
    
    async def fetch_candlesticks(
        self,
        market_id: str,
        interval: str = "1h",
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        """
        Fetch OHLCV candlestick data.
        
        Args:
            market_id: Market identifier
            interval: Candle interval (1m, 5m, 15m, 1h, 4h, 1d)
            limit: Number of candles
        """
        if self.SOURCE != DataSource.POLYMARKET:
            return []
        
        response = await self.get(
            f"/{self._prefix}/candlesticks",
            params={
                "market_id": market_id,
                "interval": interval,
                "limit": limit,
            }
        )
        return response if isinstance(response, list) else response.get("data", [])
    
    # =========================================================================
    # HELPERS
    # =========================================================================
    
    @staticmethod
    def _to_decimal(value: Any, default: Optional[Decimal] = None) -> Optional[Decimal]:
        """Convert value to Decimal safely."""
        if value is None:
            return default
        try:
            return Decimal(str(value))
        except (ValueError, TypeError):
            return default
    
    @staticmethod
    def _parse_datetime(value: Any) -> Optional[datetime]:
        """Parse datetime from various formats. Always returns timezone-aware datetime."""
        if value is None:
            return None
        if isinstance(value, datetime):
            # Ensure it's timezone-aware
            if value.tzinfo is None:
                return value.replace(tzinfo=timezone.utc)
            return value
        if isinstance(value, (int, float)):
            # Unix timestamp
            try:
                if value > 1e12:  # Milliseconds
                    value = value / 1000
                return datetime.fromtimestamp(value, tz=timezone.utc)
            except (ValueError, OSError):
                return None
        if isinstance(value, str):
            # ISO format
            try:
                dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
                # Ensure it's timezone-aware
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                return dt
            except ValueError:
                pass
        return None
    
    @staticmethod
    def _calculate_mid_price(
        yes_price: Optional[Decimal],
        no_price: Optional[Decimal],
    ) -> Optional[Decimal]:
        """Calculate mid price from yes/no prices."""
        if yes_price is not None and no_price is not None:
            return (yes_price + no_price) / 2
        return yes_price or no_price
    
    @staticmethod
    def _calculate_spread(raw: dict[str, Any]) -> Optional[Decimal]:
        """Extract or calculate spread."""
        if "spread" in raw:
            return DomeClient._to_decimal(raw["spread"])
        bid = DomeClient._to_decimal(raw.get("best_bid") or raw.get("bid"))
        ask = DomeClient._to_decimal(raw.get("best_ask") or raw.get("ask"))
        if bid and ask:
            return ask - bid
        return None


# =============================================================================
# CONVENIENCE FACTORIES
# =============================================================================

def create_polymarket_client(**kwargs) -> DomeClient:
    """Create a Dome client configured for Polymarket."""
    return DomeClient(source=DataSource.POLYMARKET, **kwargs)


def create_kalshi_client(**kwargs) -> DomeClient:
    """Create a Dome client configured for Kalshi."""
    return DomeClient(source=DataSource.KALSHI, **kwargs)
