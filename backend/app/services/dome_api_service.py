"""
Dome API Service - On-demand trades and orderbook data

Fetches real-time trades and orderbook data directly from Dome API
without storing in database. Faster and reduces database load.
"""

import logging
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta
import httpx
import os

logger = logging.getLogger(__name__)

# Dome API configuration
DOME_API_BASE = "https://api.domeapi.io/v1"
DOME_API_KEY = os.getenv("DOME_API_KEY", "***REDACTED_DOME_KEY***")


class DomeAPIService:
    """
    Direct Dome API integration for real-time trades and orderbooks.
    
    On-demand endpoints (no database storage):
    - get_trades(market_id, hours=24, min_usd=1000, limit=500)
    - get_orderbook(token_id, depth=20)
    """
    
    def __init__(self):
        self.client = httpx.AsyncClient(
            timeout=30.0,
            headers={"X-API-KEY": DOME_API_KEY}
        )
        logger.info("🎯 Dome API Service initialized (on-demand mode)")
    
    async def __aenter__(self):
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.client.aclose()
    
    async def close(self):
        """Cleanup HTTP client"""
        await self.client.aclose()
    
    # ==================== TRADES ====================
    
    async def get_trades(
        self,
        market_id: str,
        hours: int = 24,
        min_usd: float = 1000,
        limit: int = 500,
        platform: str = "polymarket"
    ) -> Dict[str, Any]:
        """
        Fetch recent trades for a market directly from Dome API.
        
        Args:
            market_id: Market/condition ID (Polymarket uses condition_id)
            hours: Fetch trades from last N hours (default: 24)
            min_usd: Minimum trade value in USD (client-side filter)
            limit: Maximum trades to return (default: 500)
            platform: Platform name (polymarket, kalshi, etc.)
        
        Returns:
            {
                "trades": [...],  # List of trade records
                "total_count": 123,
                "filtered_count": 45,  # After min_usd filter
                "time_range": {
                    "start": "2026-02-02T10:00:00Z",
                    "end": "2026-02-02T12:00:00Z"
                },
                "filters": {
                    "min_usd": 1000,
                    "hours": 24
                }
            }
        """
        try:
            # Calculate start_time (Unix timestamp in seconds)
            since_time = datetime.utcnow() - timedelta(hours=hours)
            start_time = int(since_time.timestamp())
            
            # Build API request
            url = f"{DOME_API_BASE}/{platform}/orders"
            params = {
                "market_id": market_id,
                "start_time": start_time,
                "limit": 1000,  # Max per page, we'll collect up to `limit`
            }
            
            logger.info(f"Fetching trades from Dome API: {market_id}, last {hours}h")
            
            # Fetch trades with pagination
            all_trades = []
            cursor = None
            
            while len(all_trades) < limit:
                if cursor:
                    params["pagination_key"] = cursor
                
                response = await self.client.get(url, params=params)
                response.raise_for_status()
                data = response.json()
                
                # Extract trades (Polymarket uses "orders" key)
                trades = data.get("orders", [])
                if not trades:
                    break
                
                all_trades.extend(trades)
                
                # Check for next page
                pagination = data.get("pagination", {})
                cursor = pagination.get("pagination_key")
                if not cursor:
                    break
            
            # Limit to requested max
            all_trades = all_trades[:limit]
            
            # Filter by min_usd (client-side)
            filtered_trades = []
            for trade in all_trades:
                # Calculate trade value
                try:
                    price = float(trade.get("price", 0))
                    quantity = float(trade.get("shares", 0) or trade.get("quantity", 0))
                    total_value = price * quantity
                    
                    if total_value >= min_usd:
                        # Normalize trade data
                        filtered_trades.append({
                            "trade_id": trade.get("order_hash") or trade.get("id"),
                            "timestamp": trade.get("timestamp"),
                            "side": trade.get("side"),  # BUY or SELL
                            "price": price,
                            "quantity": quantity,
                            "total_value": total_value,
                            "market_slug": trade.get("market_slug"),
                            "token_label": trade.get("token_label"),
                        })
                except (ValueError, TypeError):
                    continue
            
            return {
                "trades": filtered_trades,
                "total_count": len(all_trades),
                "filtered_count": len(filtered_trades),
                "time_range": {
                    "start": since_time.isoformat(),
                    "end": datetime.utcnow().isoformat(),
                },
                "filters": {
                    "min_usd": min_usd,
                    "hours": hours,
                },
            }
        
        except httpx.HTTPStatusError as e:
            logger.error(f"Dome API error: {e.response.status_code} - {e.response.text}")
            return {
                "trades": [],
                "total_count": 0,
                "filtered_count": 0,
                "error": f"API error: {e.response.status_code}",
            }
        except Exception as e:
            logger.error(f"Error fetching trades: {e}")
            return {
                "trades": [],
                "total_count": 0,
                "filtered_count": 0,
                "error": str(e),
            }
    
    # ==================== ORDERBOOK ====================
    
    async def get_orderbook(
        self,
        token_id: str,
        depth: int = 20,
        platform: str = "polymarket"
    ) -> Dict[str, Any]:
        """
        Fetch current orderbook snapshot for a token.
        
        Args:
            token_id: Token ID (required for Polymarket)
            depth: Number of price levels (default: 20)
            platform: Platform name (polymarket, kalshi, etc.)
        
        Returns:
            {
                "bids": [...],  # Buy orders
                "asks": [...],  # Sell orders
                "spread": 0.05,
                "mid_price": 0.52,
                "timestamp": "2026-02-02T12:00:00Z"
            }
        """
        try:
            url = f"{DOME_API_BASE}/{platform}/orderbook/{token_id}"
            
            logger.info(f"Fetching orderbook from Dome API: {token_id}")
            
            response = await self.client.get(url)
            response.raise_for_status()
            data = response.json()
            
            # Extract orderbook data
            bids = data.get("bids", [])[:depth]
            asks = data.get("asks", [])[:depth]
            
            # Calculate spread and mid price
            best_bid = float(bids[0]["price"]) if bids else 0
            best_ask = float(asks[0]["price"]) if asks else 0
            spread = best_ask - best_bid if best_bid and best_ask else 0
            mid_price = (best_bid + best_ask) / 2 if best_bid and best_ask else 0
            
            return {
                "bids": bids,
                "asks": asks,
                "spread": spread,
                "mid_price": mid_price,
                "best_bid": best_bid,
                "best_ask": best_ask,
                "timestamp": datetime.utcnow().isoformat(),
            }
        
        except httpx.HTTPStatusError as e:
            logger.error(f"Dome API error: {e.response.status_code} - {e.response.text}")
            return {
                "bids": [],
                "asks": [],
                "error": f"API error: {e.response.status_code}",
            }
        except Exception as e:
            logger.error(f"Error fetching orderbook: {e}")
            return {
                "bids": [],
                "asks": [],
                "error": str(e),
            }
