"""
Opinion Trade API client.
API Docs: https://docs.opinion.trade/developer-guide/opinion-open-api

Rate limit: 15 requests per second
Pagination: page and limit parameters (max 20 items per page)
Auth: apikey header required
"""
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Optional

import structlog

from predictions_ingest.clients.base import BaseAPIClient
from predictions_ingest.config import get_settings
from predictions_ingest.models import (
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


class OpinionTradeClient(BaseAPIClient):
    """
    Client for Opinion Trade API.
    
    API Docs: https://docs.opinion.trade/developer-guide/opinion-open-api
    Base URL: https://openapi.opinion.trade
    Rate limit: 15 RPS
    """
    
    SOURCE = DataSource.OPINIONTRADE
    
    def __init__(self, **kwargs):
        settings = get_settings()
        self.BASE_URL = settings.opiniontrade_api_base_url
        self._api_key = settings.opiniontrade_api_key
        super().__init__(**kwargs)
    
    def _get_default_rate_limit(self) -> float:
        return get_settings().opiniontrade_rate_limit_rps
    
    def _get_headers(self) -> dict[str, str]:
        return {
            "apikey": self._api_key,
            "Accept": "application/json",
            "User-Agent": "PredictionsIngest/1.0",
        }
    
    # =========================================================================
    # MARKETS
    # =========================================================================
    
    async def fetch_markets_page(
        self,
        page: int = 1,
        limit: int = 20,
    ) -> list[dict[str, Any]]:
        """
        Fetch a page of markets.
        
        Args:
            page: Page number (1-indexed)
            limit: Items per page (max 20)
        """
        params = {
            "page": page,
            "limit": min(limit, 20),  # API max is 20
        }
        response = await self.get("/openapi/market", params=params)
        
        # Handle response structure: {errmsg, errno, result: {total, list}}
        if isinstance(response, dict):
            result = response.get("result", {})
            if isinstance(result, dict):
                return result.get("list", [])
            return response.get("data", response.get("markets", []))
        elif isinstance(response, list):
            return response
        return []
    
    async def fetch_all_markets(self) -> list[dict[str, Any]]:
        """Fetch all markets (handles pagination)."""
        all_markets = []
        page = 1
        
        while True:
            markets = await self.fetch_markets_page(page=page, limit=20)
            
            if not markets:
                break
            
            all_markets.extend(markets)
            
            logger.info(
                "Fetched markets page",
                source="opiniontrade",
                page=page,
                batch_size=len(markets),
                total=len(all_markets),
            )
            
            # If we got less than 20, we've reached the end
            if len(markets) < 20:
                break
            
            page += 1
        
        return all_markets
    
    async def fetch_market_details(self, market_id: str) -> dict[str, Any]:
        """Fetch detailed market data by market ID."""
        return await self.get(f"/openapi/market/{market_id}")
    
    async def fetch_categorical_market_details(self, market_id: str) -> dict[str, Any]:
        """Fetch detailed categorical market data including child markets."""
        return await self.get(f"/openapi/market/categorical/{market_id}")
    
    # =========================================================================
    # PRICES
    # =========================================================================
    
    async def fetch_latest_price(self, token_id: str) -> dict[str, Any]:
        """
        Get the latest trade price for a specific token.
        
        Args:
            token_id: The token identifier
        """
        params = {"tokenId": token_id}
        return await self.get("/openapi/token/latest-price", params=params)
    
    async def fetch_price_history(
        self,
        token_id: str,
        start_time: Optional[int] = None,
        end_time: Optional[int] = None,
        fidelity: Optional[int] = None,
    ) -> list[dict[str, Any]]:
        """
        Get historical price data for a token (Polymarket-compatible format).
        
        Args:
            token_id: The token identifier
            start_time: Start timestamp (Unix seconds)
            end_time: End timestamp (Unix seconds)
            fidelity: Time granularity in minutes
        """
        params: dict[str, Any] = {"tokenId": token_id}
        if start_time:
            params["startTime"] = start_time
        if end_time:
            params["endTime"] = end_time
        if fidelity:
            params["fidelity"] = fidelity
        
        response = await self.get("/openapi/token/price-history", params=params)
        
        if isinstance(response, dict):
            return response.get("history", response.get("data", []))
        elif isinstance(response, list):
            return response
        return []
    
    # =========================================================================
    # ORDERBOOKS
    # =========================================================================
    
    async def fetch_orderbook(self, token_id: str) -> dict[str, Any]:
        """
        Get the orderbook (market depth) for a specific token.
        
        Args:
            token_id: The token identifier
        """
        params = {"tokenId": token_id}
        return await self.get("/openapi/token/orderbook", params=params)
    
    # =========================================================================
    # NORMALIZATION
    # =========================================================================
    
    def _extract_category(self, raw: dict[str, Any]) -> Optional[str]:
        """Extract category from raw data."""
        # Check for explicit category field
        if raw.get("category") or raw.get("categoryName"):
            return raw.get("category") or raw.get("categoryName")
        
        # Map marketType to category
        market_type = raw.get("marketType")
        if market_type is not None:
            # OpinionTrade marketType values (observed from data)
            # 0 = Crypto/Assets, 1 = Sports, 2 = Politics, etc.
            type_mapping = {
                0: "Crypto",
                1: "Sports", 
                2: "Politics",
                3: "Economics",
                4: "Entertainment",
                5: "Other",
            }
            return type_mapping.get(market_type, "General")
        
        # Try to infer from title
        title = (raw.get("marketTitle") or raw.get("title") or "").lower()
        if any(x in title for x in ["btc", "eth", "crypto", "bitcoin", "ethereum", "bnb", "sol"]):
            return "Crypto"
        elif any(x in title for x in ["nfl", "nba", "mlb", "soccer", "football", "sports"]):
            return "Sports"
        elif any(x in title for x in ["election", "president", "politics", "trump", "biden"]):
            return "Politics"
        
        return "General"
    
    def normalize_market(self, raw: dict[str, Any]) -> Market:
        """Transform raw Opinion Trade market to Market model."""
        # Determine market status from statusEnum
        status = MarketStatus.ACTIVE
        raw_status = str(raw.get("statusEnum", raw.get("status", ""))).lower()
        if raw_status in ("resolved", "settled"):
            status = MarketStatus.RESOLVED
        elif raw_status in ("closed",):
            status = MarketStatus.CLOSED
        elif raw_status == "paused":
            status = MarketStatus.PAUSED
        elif raw_status == "activated":
            status = MarketStatus.ACTIVE
        
        # Parse timestamps (Unix seconds)
        created_at = None
        if raw.get("createdAt"):
            try:
                created_at = datetime.fromtimestamp(raw["createdAt"], tz=timezone.utc)
            except Exception:
                pass
        
        end_date = None
        if raw.get("cutoffAt"):
            try:
                end_date = datetime.fromtimestamp(raw["cutoffAt"], tz=timezone.utc)
            except Exception:
                pass
        
        resolution_date = None
        if raw.get("resolvedAt") and raw["resolvedAt"] > 0:
            try:
                resolution_date = datetime.fromtimestamp(raw["resolvedAt"], tz=timezone.utc)
            except Exception:
                pass
        
        # Build outcomes from yes/no labels
        outcomes = []
        if raw.get("yesLabel") and raw.get("noLabel"):
            outcomes = [
                Outcome(id="yes", name=raw["yesLabel"]),
                Outcome(id="no", name=raw["noLabel"]),
            ]
        elif raw.get("outcomes"):
            for i, outcome in enumerate(raw["outcomes"]):
                if isinstance(outcome, dict):
                    outcomes.append(Outcome(
                        id=str(outcome.get("id", outcome.get("tokenId", i))),
                        name=outcome.get("name", outcome.get("value", f"Outcome {i}")),
                        price=float(outcome["price"]) if outcome.get("price") else None,
                    ))
        
        # Extract token IDs for price fetching
        token_ids = []
        if raw.get("yesTokenId"):
            token_ids.append(raw["yesTokenId"])
        if raw.get("noTokenId"):
            token_ids.append(raw["noTokenId"])
        
        # Build Market kwargs - only include fields that have values
        market_kwargs = {
            "source": self.SOURCE,
            "source_market_id": str(raw.get("marketId") or raw.get("id")),
            "title": raw.get("marketTitle") or raw.get("title") or raw.get("question") or "",
            "description": raw.get("rules") or raw.get("description"),
            "slug": None,
            "source_url": f"https://opinion.trade/market/{raw.get('marketId')}",
            "image_url": raw.get("thumbnailUrl") or raw.get("coverUrl"),
            "status": status,
            "category_name": self._extract_category(raw),
            "created_at_source": created_at,
            "end_date": end_date,
            "resolution_date": resolution_date,
            "outcomes": outcomes if outcomes else [],
            "extra_data": {
                "token_ids": token_ids,
                "market_type": raw.get("marketType"),
                "chain_id": raw.get("chainId"),
                "quote_token": raw.get("quoteToken"),
                "question_id": raw.get("questionId"),
            },
        }
        
        # Add optional Decimal fields only if they have values
        if raw.get("volume24h"):
            market_kwargs["volume_24h"] = Decimal(str(raw["volume24h"]))
        if raw.get("volume"):
            market_kwargs["total_volume"] = Decimal(str(raw["volume"]))
        if raw.get("liquidity"):
            market_kwargs["liquidity"] = Decimal(str(raw["liquidity"]))
        if raw.get("openInterest"):
            market_kwargs["open_interest"] = Decimal(str(raw["openInterest"]))
        
        return Market(**market_kwargs)
    
    def normalize_price(self, raw: dict[str, Any], market_id: str) -> PriceSnapshot:
        """Transform raw price data to PriceSnapshot model."""
        # Handle timestamp
        timestamp = datetime.now(tz=timezone.utc)
        if raw.get("timestamp") or raw.get("t") or raw.get("time"):
            raw_ts = raw.get("timestamp") or raw.get("t") or raw.get("time")
            try:
                if isinstance(raw_ts, (int, float)):
                    # Could be seconds or milliseconds
                    if raw_ts > 1e12:
                        timestamp = datetime.fromtimestamp(raw_ts / 1000, tz=timezone.utc)
                    else:
                        timestamp = datetime.fromtimestamp(raw_ts, tz=timezone.utc)
                else:
                    timestamp = datetime.fromisoformat(str(raw_ts).replace("Z", "+00:00"))
            except Exception:
                pass
        
        # Extract price
        price = None
        if raw.get("price") or raw.get("p"):
            price = Decimal(str(raw.get("price") or raw.get("p")))
        elif raw.get("close") or raw.get("c"):
            price = Decimal(str(raw.get("close") or raw.get("c")))
        
        return PriceSnapshot(
            source=self.SOURCE,
            source_market_id=market_id,
            snapshot_at=timestamp,
            yes_price=price,
            best_bid=Decimal(str(raw["bid"])) if raw.get("bid") else None,
            best_ask=Decimal(str(raw["ask"])) if raw.get("ask") else None,
        )
    
    def normalize_orderbook(self, raw: dict[str, Any], market_id: str) -> OrderbookSnapshot:
        """Transform raw orderbook to OrderbookSnapshot model."""
        bids = []
        asks = []
        
        for bid in raw.get("bids", []):
            if isinstance(bid, dict):
                bids.append(OrderLevel(
                    price=Decimal(str(bid.get("price", bid.get("p", 0)))),
                    size=Decimal(str(bid.get("size", bid.get("quantity", bid.get("q", 0))))),
                ))
            elif isinstance(bid, (list, tuple)) and len(bid) >= 2:
                bids.append(OrderLevel(
                    price=Decimal(str(bid[0])),
                    size=Decimal(str(bid[1])),
                ))
        
        for ask in raw.get("asks", []):
            if isinstance(ask, dict):
                asks.append(OrderLevel(
                    price=Decimal(str(ask.get("price", ask.get("p", 0)))),
                    size=Decimal(str(ask.get("size", ask.get("quantity", ask.get("q", 0))))),
                ))
            elif isinstance(ask, (list, tuple)) and len(ask) >= 2:
                asks.append(OrderLevel(
                    price=Decimal(str(ask[0])),
                    size=Decimal(str(ask[1])),
                ))
        
        # Calculate spread and best prices
        best_bid = bids[0].price if bids else None
        best_ask = asks[0].price if asks else None
        spread = None
        if best_bid and best_ask:
            spread = best_ask - best_bid
        
        return OrderbookSnapshot(
            source=self.SOURCE,
            source_market_id=market_id,
            snapshot_at=datetime.now(tz=timezone.utc),
            bids=bids,
            asks=asks,
            best_bid=best_bid,
            best_ask=best_ask,
            spread=spread,
        )
    
    def normalize_trade(self, raw: dict[str, Any], market_id: str) -> Trade:
        """Transform raw trade event to Trade model."""
        # Parse timestamp
        timestamp = datetime.now(tz=timezone.utc)
        if raw.get("timestamp") or raw.get("time") or raw.get("createdAt"):
            raw_ts = raw.get("timestamp") or raw.get("time") or raw.get("createdAt")
            try:
                if isinstance(raw_ts, (int, float)):
                    if raw_ts > 1e12:
                        timestamp = datetime.fromtimestamp(raw_ts / 1000, tz=timezone.utc)
                    else:
                        timestamp = datetime.fromtimestamp(raw_ts, tz=timezone.utc)
                else:
                    timestamp = datetime.fromisoformat(str(raw_ts).replace("Z", "+00:00"))
            except Exception:
                pass
        
        # Determine side
        side = TradeSide.BUY
        raw_side = str(raw.get("side", raw.get("type", ""))).lower()
        if raw_side in ("sell", "short", "no"):
            side = TradeSide.SELL
        
        return Trade(
            source=self.SOURCE,
            source_trade_id=str(raw.get("id") or raw.get("tradeId") or raw.get("transactionHash", "")),
            market_id=market_id,
            timestamp=timestamp,
            price=Decimal(str(raw.get("price", 0))),
            amount=Decimal(str(raw.get("amount", raw.get("size", raw.get("quantity", 0))))),
            side=side,
            maker=raw.get("maker"),
            taker=raw.get("taker"),
        )
