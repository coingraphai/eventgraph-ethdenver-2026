"""
Limitless Exchange API client.
Extends existing functionality with multi-source architecture.
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


class LimitlessClient(BaseAPIClient):
    """
    Client for Limitless Exchange API.
    
    API Docs: https://api.limitless.exchange/api-v1
    Rate limit: ~10 RPS (conservative estimate)
    """
    
    SOURCE = DataSource.LIMITLESS
    
    def __init__(self, **kwargs):
        settings = get_settings()
        self.BASE_URL = settings.limitless_api_base_url
        super().__init__(**kwargs)
    
    def _get_default_rate_limit(self) -> float:
        return get_settings().limitless_rate_limit_rps
    
    def _get_headers(self) -> dict[str, str]:
        return {
            "Accept": "application/json",
            "User-Agent": "PredictionsIngest/1.0",
        }
    
    # =========================================================================
    # CATEGORIES
    # =========================================================================
    
    async def fetch_categories(self) -> list[dict[str, Any]]:
        """Fetch all categories."""
        response = await self.get("/categories")
        return response if isinstance(response, list) else []
    
    def normalize_category(self, raw: dict[str, Any]) -> Category:
        """Transform raw category to Category model."""
        metadata = raw.get("metadata") or {}
        return Category(
            source=self.SOURCE,
            source_category_id=str(raw.get("id")),
            name=raw.get("name") or raw.get("title", ""),
            slug=raw.get("slug"),
            description=raw.get("description"),
            market_count=raw.get("marketCount", 0),
            active_market_count=raw.get("activeMarketCount", 0),
            icon_url=raw.get("iconUrl") or metadata.get("logoUrl"),
        )
    
    # =========================================================================
    # MARKETS
    # =========================================================================
    
    async def fetch_markets_page(
        self,
        page: int = 1,
        limit: int = 25,
        sort_by: Optional[str] = None,
        category_id: Optional[int] = None,
    ) -> dict[str, Any]:
        """
        Fetch a page of active markets.
        
        Args:
            page: Page number (1-indexed)
            limit: Items per page (max 25)
            sort_by: trending, ending_soon, high_value, lp_rewards, newest
            category_id: Filter by category
        """
        params: dict[str, Any] = {
            "page": page,
            "limit": min(limit, 25),  # API max is 25
        }
        if sort_by:
            params["sortBy"] = sort_by
        if category_id:
            params["categoryId"] = category_id
        
        return await self.get("/markets/active", params=params)
    
    async def fetch_all_markets(
        self,
        sort_by: Optional[str] = None,
        category_id: Optional[int] = None,
    ) -> list[dict[str, Any]]:
        """Fetch all active markets (handles pagination)."""
        all_markets = []
        page = 1
        
        while True:
            response = await self.fetch_markets_page(
                page=page,
                limit=25,
                sort_by=sort_by,
                category_id=category_id,
            )
            
            markets = response.get("data", [])
            total = response.get("totalMarketsCount", 0)
            
            if not markets:
                break
            
            all_markets.extend(markets)
            
            logger.info(
                "Fetched markets page",
                source="limitless",
                page=page,
                batch_size=len(markets),
                total=len(all_markets),
                total_available=total,
            )
            
            if len(all_markets) >= total or len(markets) < 25:
                break
            
            page += 1
        
        return all_markets
    
    async def fetch_market_details(self, slug: str) -> dict[str, Any]:
        """Fetch detailed market data by slug."""
        return await self.get(f"/markets/{slug}")
    
    async def fetch_market_slugs(self) -> list[str]:
        """Fetch list of all active market slugs (for delta detection)."""
        response = await self.get("/markets/active/slugs")
        return response if isinstance(response, list) else []
    
    def normalize_market(self, raw: dict[str, Any]) -> Market:
        """Transform raw market data to unified Market model."""
        
        # Parse outcomes from tokens/positionIds
        outcomes = []
        tokens = raw.get("tokens", {}) or {}
        prices = raw.get("prices", []) or []
        position_ids = raw.get("positionIds", []) or []
        
        # Tokens can be a dict {"yes": "...", "no": "..."} or a list
        if isinstance(tokens, dict):
            # New format: dict with yes/no keys
            yes_token = tokens.get("yes")
            no_token = tokens.get("no")
            yes_price = prices[0] if len(prices) > 0 else None
            no_price = prices[1] if len(prices) > 1 else None
            
            outcomes = [
                Outcome(id="0", name="Yes", token_id=yes_token, price=self._to_decimal(yes_price)),
                Outcome(id="1", name="No", token_id=no_token, price=self._to_decimal(no_price)),
            ]
        elif isinstance(tokens, list) and tokens:
            # Old format: list of token objects
            for i, token in enumerate(tokens):
                if isinstance(token, dict):
                    outcomes.append(Outcome(
                        id=str(token.get("id", i)),
                        name=token.get("name", f"Outcome {i}"),
                        token_id=position_ids[i] if i < len(position_ids) else None,
                        price=self._to_decimal(token.get("price")),
                    ))
        elif position_ids:
            outcomes = [
                Outcome(id="0", name="Yes", token_id=position_ids[0] if position_ids else None),
                Outcome(id="1", name="No", token_id=position_ids[1] if len(position_ids) > 1 else None),
            ]
        
        # Determine status
        status = MarketStatus.ACTIVE
        raw_status = (raw.get("status") or "").lower()
        if raw_status == "resolved" or raw.get("resolved"):
            status = MarketStatus.RESOLVED
        elif raw_status == "closed" or raw.get("closed"):
            status = MarketStatus.CLOSED
        
        # Extract prices from various possible locations
        yes_price = self._to_decimal(
            raw.get("yesPrice") or
            (prices[0] if len(prices) > 0 else None)
        )
        no_price = self._to_decimal(
            raw.get("noPrice") or
            (prices[1] if len(prices) > 1 else None)
        )
        
        # Get category info - can be string, dict, or list
        categories = raw.get("categories", raw.get("category", []))
        category_id = None
        category_name = None
        
        if isinstance(categories, dict):
            category_id = str(categories.get("id", ""))
            category_name = categories.get("name", "")
        elif isinstance(categories, list) and categories:
            first_cat = categories[0]
            if isinstance(first_cat, dict):
                category_id = str(first_cat.get("id", ""))
                category_name = first_cat.get("name", "")
            else:
                category_name = str(first_cat)
        elif categories:
            category_name = str(categories)
        
        return Market(
            source=self.SOURCE,
            source_market_id=str(raw.get("id") or raw.get("slug")),
            slug=raw.get("slug"),
            
            title=raw.get("title") or raw.get("question") or "",
            description=raw.get("description"),
            question=raw.get("title"),
            
            category_id=category_id,
            category_name=category_name,
            tags=raw.get("tags", []) or [],
            
            status=status,
            is_active=status == MarketStatus.ACTIVE,
            is_resolved=status == MarketStatus.RESOLVED,
            resolution_value=raw.get("resolvedOutcome"),
            
            outcomes=outcomes,
            outcome_count=len(outcomes) or 2,
            
            yes_price=yes_price,
            no_price=no_price,
            last_trade_price=self._to_decimal(raw.get("lastTradePrice")),
            mid_price=self._calculate_mid_price(yes_price, no_price),
            
            # Volume is in micro-units (1e6), convert to USD
            volume_24h=self._to_decimal(raw.get("volume24h") or raw.get("volumeDay"), Decimal("0")) / Decimal("1000000"),
            volume_total=self._to_decimal(raw.get("totalVolume") or raw.get("volume"), Decimal("0")) / Decimal("1000000"),
            liquidity=self._to_decimal(raw.get("liquidity") or raw.get("liquidityUsd"), Decimal("0")),
            
            trade_count_24h=raw.get("tradeCount24h", 0),
            unique_traders=raw.get("uniqueTraders", 0),
            
            created_at_source=self._parse_datetime(raw.get("createdAt")),
            end_date=self._parse_datetime(raw.get("expirationDate") or raw.get("deadline")),
            resolution_date=self._parse_datetime(raw.get("resolvedAt")),
            last_trade_at=self._parse_datetime(raw.get("lastTradeAt")),
            
            image_url=raw.get("imageUrl") or raw.get("image"),
            icon_url=raw.get("iconUrl"),
            source_url=f"https://limitless.exchange/markets/{raw.get('slug')}",
            
            extra_data={
                "market_type": raw.get("marketType"),
                "venue": raw.get("venue"),
                "collateral_token": raw.get("collateralToken"),
                "creator": raw.get("creator"),
            },
        )
    
    # =========================================================================
    # HISTORICAL PRICES
    # =========================================================================
    
    async def fetch_historical_prices(
        self,
        slug: str,
        interval: str = "1h",
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        """
        Fetch historical price data for a market.
        
        Args:
            slug: Market slug
            interval: Time interval (1h, 4h, 1d)
            limit: Number of data points
        """
        response = await self.get(
            f"/markets/{slug}/historical-price",
            params={"interval": interval, "limit": limit}
        )
        return response if isinstance(response, list) else response.get("data", [])
    
    def normalize_price(self, raw: dict[str, Any], market_id: str) -> PriceSnapshot:
        """Transform historical price data to PriceSnapshot."""
        yes_price = self._to_decimal(raw.get("yes") or raw.get("yesPrice"))
        no_price = self._to_decimal(raw.get("no") or raw.get("noPrice"))
        
        return PriceSnapshot(
            source=self.SOURCE,
            source_market_id=market_id,
            yes_price=yes_price,
            no_price=no_price,
            mid_price=self._calculate_mid_price(yes_price, no_price),
            open_price=self._to_decimal(raw.get("open")),
            high_price=self._to_decimal(raw.get("high")),
            low_price=self._to_decimal(raw.get("low")),
            close_price=self._to_decimal(raw.get("close")),
            volume_1h=self._to_decimal(raw.get("volume"), Decimal("0")),
            trade_count_1h=raw.get("tradeCount", 0),
            snapshot_at=self._parse_datetime(raw.get("timestamp") or raw.get("time")) or datetime.now(timezone.utc),
        )
    
    # =========================================================================
    # ORDERBOOK
    # =========================================================================
    
    async def fetch_orderbook(self, slug: str) -> dict[str, Any]:
        """Fetch current orderbook for a market."""
        return await self.get(f"/markets/{slug}/orderbook")
    
    def normalize_orderbook(self, raw: dict[str, Any], market_id: str) -> OrderbookSnapshot:
        """Transform orderbook data to OrderbookSnapshot."""
        
        def parse_levels(levels: list) -> list[OrderLevel]:
            result = []
            for level in (levels or []):
                if isinstance(level, dict):
                    result.append(OrderLevel(
                        price=self._to_decimal(level.get("price"), Decimal("0")),
                        size=self._to_decimal(level.get("size") or level.get("quantity"), Decimal("0")),
                        orders=level.get("count", 1),
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
            snapshot_at=datetime.now(timezone.utc),
        )
    
    # =========================================================================
    # MARKET EVENTS / TRADES
    # =========================================================================
    
    async def fetch_market_events(
        self,
        slug: str,
        limit: int = 100,
        cursor: Optional[str] = None,
    ) -> dict[str, Any]:
        """Fetch trade events for a market."""
        params: dict[str, Any] = {"limit": limit}
        if cursor:
            params["cursor"] = cursor
        
        return await self.get(f"/markets/{slug}/events", params=params)
    
    async def fetch_all_market_events(
        self,
        slug: str,
        max_records: int = 0,
    ) -> list[dict[str, Any]]:
        """Fetch all trade events for a market."""
        all_events = []
        cursor = None
        
        while True:
            response = await self.fetch_market_events(slug, cursor=cursor)
            
            events = response.get("data", []) if isinstance(response, dict) else response
            if not events:
                break
            
            all_events.extend(events)
            
            cursor = response.get("nextCursor") or response.get("cursor")
            if not cursor:
                break
            if max_records > 0 and len(all_events) >= max_records:
                break
        
        return all_events
    
    def normalize_trade(self, raw: dict[str, Any], market_id: str) -> Trade:
        """Transform trade event to Trade model."""
        price = self._to_decimal(raw.get("price"), Decimal("0"))
        quantity = self._to_decimal(raw.get("amount") or raw.get("size"), Decimal("0"))
        
        side_str = (raw.get("side") or raw.get("type") or "buy").lower()
        side = TradeSide.BUY if side_str in ("buy", "b") else TradeSide.SELL
        
        return Trade(
            source=self.SOURCE,
            source_trade_id=str(raw.get("id") or raw.get("tradeId") or ""),
            source_market_id=market_id,
            side=side,
            outcome=raw.get("outcome") or raw.get("outcomeName"),
            price=price,
            quantity=quantity,
            total_value=price * quantity,
            maker_address=raw.get("maker") or raw.get("user"),
            taker_address=raw.get("taker"),
            block_number=raw.get("blockNumber"),
            transaction_hash=raw.get("txHash") or raw.get("transactionHash"),
            traded_at=self._parse_datetime(raw.get("timestamp") or raw.get("createdAt")) or datetime.now(timezone.utc),
        )
    
    # =========================================================================
    # FEED
    # =========================================================================
    
    async def fetch_feed(
        self,
        slug: str,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        """Fetch activity feed for a market."""
        response = await self.get(
            f"/markets/{slug}/get-feed-events",
            params={"limit": limit}
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
            try:
                if value > 1e12:
                    value = value / 1000
                return datetime.fromtimestamp(value, tz=timezone.utc)
            except (ValueError, OSError):
                return None
        if isinstance(value, str):
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
        """Calculate mid price."""
        if yes_price is not None and no_price is not None:
            return (yes_price + no_price) / 2
        return yes_price or no_price
