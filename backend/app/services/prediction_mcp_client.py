"""
Prediction Markets MCP Client
Interfaces with the DomeAPI using the unified SDK for prediction market data
"""
import os
import logging
from typing import Dict, Any, Optional, List
from datetime import datetime

logger = logging.getLogger(__name__)

try:
    from dome_api_sdk import DomeClient, DomeSDKConfig
    DOME_SDK_AVAILABLE = True
except ImportError:
    DOME_SDK_AVAILABLE = False
    logger.warning("dome-api-sdk not installed. Install with: pip install dome-api-sdk")


class PredictionMCPClient:
    """
    Client for accessing prediction market data via Dome's unified SDK
    
    Uses the official Dome SDK for cleaner, more reliable access to:
    - Polymarket markets and data
    - Kalshi markets and data
    - Cross-platform matching and analysis
    """
    
    def __init__(self):
        self.dome_api_key = os.getenv("DOME_API_KEY", "")
        self.client = None
        
        if not self.dome_api_key:
            logger.warning("DOME_API_KEY not set - prediction market data unavailable")
        elif not DOME_SDK_AVAILABLE:
            logger.error("dome-api-sdk not installed - cannot connect to DomeAPI")
        else:
            try:
                # Create SDK config
                config: DomeSDKConfig = {
                    "api_key": self.dome_api_key,
                    "base_url": None,  # Use default
                    "timeout": 30.0
                }
                self.client = DomeClient(config=config)
                logger.info("PredictionMCPClient initialized with Dome SDK")
            except Exception as e:
                logger.error(f"Failed to initialize DomeClient: {e}")
    
    def _handle_error(self, e: Exception, context: str = "") -> Dict[str, Any]:
        """Handle and log errors consistently"""
        error_msg = f"{context}: {str(e)}" if context else str(e)
        logger.error(error_msg)
        return {"error": error_msg}
    
    def _ensure_client(self) -> bool:
        """Check if client is available"""
        if not self.client:
            return False
        return True
    
    def _make_serializable(self, obj):
        """Convert SDK objects to JSON-serializable dicts"""
        if obj is None:
            return None
        if isinstance(obj, (str, int, float, bool)):
            return obj
        if isinstance(obj, (list, tuple)):
            return [self._make_serializable(item) for item in obj]
        if isinstance(obj, dict):
            return {k: self._make_serializable(v) for k, v in obj.items()}
        # Try __dict__ for SDK objects
        if hasattr(obj, '__dict__'):
            return {k: self._make_serializable(v) for k, v in obj.__dict__.items() if not k.startswith('_')}
        # Try to convert via str
        try:
            return str(obj)
        except Exception:
            return None
    
    # ===========================================================================
    # Polymarket Tools
    # ===========================================================================
    
    async def polymarket_get_markets(
        self,
        status: Optional[str] = None,
        tags: Optional[List[str]] = None,
        market_slug: Optional[str] = None,
        search: Optional[str] = None,
        limit: int = 20
    ) -> Dict[str, Any]:
        """
        Get Polymarket prediction markets
        
        Args:
            status: Filter by status (open, closed)
            tags: Filter by tags (e.g., ["politics", "sports"])
            market_slug: Get specific market by slug
            search: Search query text (requires status parameter)
            limit: Max results to return
        """
        if not self._ensure_client():
            return {"error": "DomeClient not initialized"}
        
        try:
            # Build filter parameters
            filters = {}
            if limit:
                filters["limit"] = limit
            if status:
                filters["status"] = status
            if market_slug:
                filters["market_slug"] = [market_slug] if isinstance(market_slug, str) else market_slug
            if tags:
                filters["tags"] = tags if isinstance(tags, list) else [tags]
            if search:
                filters["search"] = search
                if not status:
                    filters["status"] = "open"  # Search requires status
            
            # Use the SDK's get_markets method (pass params as single dict arg)
            response = self.client.polymarket.markets.get_markets(filters)
            return {
                "markets": response.markets if hasattr(response, 'markets') else [],
                "pagination": {
                    "total": response.pagination.total if hasattr(response, 'pagination') and hasattr(response.pagination, 'total') else 0
                }
            }
        except Exception as e:
            return self._handle_error(e, "polymarket_get_markets")
    
    async def polymarket_get_trade_history(
        self,
        market_slug: Optional[str] = None,
        token_id: Optional[str] = None,
        limit: int = 50
    ) -> Dict[str, Any]:
        """Get Polymarket trade history (orders)"""
        if not self._ensure_client():
            return {"error": "DomeClient not initialized"}
        
        try:
            filters = {"limit": limit}
            if market_slug:
                filters["market_slug"] = market_slug
            if token_id:
                filters["token_id"] = token_id
            
            orders = self.client.polymarket.orders.get_orders(**filters)
            return {"orders": orders if isinstance(orders, list) else [orders]}
        except Exception as e:
            return self._handle_error(e, "polymarket_get_trade_history")
    
    async def polymarket_get_orderbook_history(
        self,
        token_id: str,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        limit: int = 20
    ) -> Dict[str, Any]:
        """Get Polymarket orderbook snapshots"""
        if not self._ensure_client():
            return {"error": "DomeClient not initialized"}
        
        try:
            filters = {"token_id": token_id, "limit": limit}
            if start_time:
                filters["start_time"] = start_time
            if end_time:
                filters["end_time"] = end_time
            
            orderbooks = self.client.polymarket.markets.get_orderbooks(**filters)
            return {"orderbooks": orderbooks if isinstance(orderbooks, list) else [orderbooks]}
        except Exception as e:
            return self._handle_error(e, "polymarket_get_orderbook_history")
    
    async def polymarket_get_market_price(
        self,
        token_id: str,
        at_time: Optional[datetime] = None
    ) -> Dict[str, Any]:
        """Get current or historical price for a market token"""
        if not self._ensure_client():
            return {"error": "DomeClient not initialized"}
        
        try:
            filters = {"token_id": token_id}
            if at_time:
                filters["at_time"] = at_time
            
            price = self.client.polymarket.markets.get_market_price(**filters)
            return price if isinstance(price, dict) else {"price": price}
        except Exception as e:
            return self._handle_error(e, "polymarket_get_market_price")
    
    
    # ===========================================================================
    # Kalshi Tools
    # ===========================================================================
    
    async def kalshi_get_markets(
        self,
        status: Optional[str] = None,
        limit: int = 20
    ) -> Dict[str, Any]:
        """Get Kalshi prediction markets"""
        if not self._ensure_client():
            return {"error": "DomeClient not initialized"}
        
        try:
            filters = {}
            if limit:
                filters["limit"] = limit
            if status:
                filters["status"] = status
            
            response = self.client.kalshi.markets.get_markets(filters)
            return {
                "markets": response.markets if hasattr(response, 'markets') else [],
                "pagination": {
                    "total": response.pagination.total if hasattr(response, 'pagination') and hasattr(response.pagination, 'total') else 0
                }
            }
        except Exception as e:
            return self._handle_error(e, "kalshi_get_markets")
    
    async def kalshi_get_trade_history(
        self,
        limit: int = 50
    ) -> Dict[str, Any]:
        """Get Kalshi trade history"""
        if not self._ensure_client():
            return {"error": "DomeClient not initialized"}
        
        try:
            trades = self.client.kalshi.get_trades(limit=limit)
            return {"trades": trades if isinstance(trades, list) else [trades]}
        except Exception as e:
            return self._handle_error(e, "kalshi_get_trade_history")
    
    # ===========================================================================
    # Cross-Platform Tools
    # ===========================================================================
    
    async def matching_markets_sports(
        self,
        sport: Optional[str] = None
    ) -> Dict[str, Any]:
        """Find matching markets across Polymarket and Kalshi for sports"""
        if not self._ensure_client():
            return {"error": "DomeClient not initialized"}
        
        try:
            # Get markets from both platforms
            poly_markets = await self.polymarket_get_markets(tags=["sports"], limit=50)
            kalshi_markets = await self.kalshi_get_markets(limit=50)
            
            # Simple matching logic - can be enhanced
            return {
                "polymarket": poly_markets.get("markets", []),
                "kalshi": kalshi_markets.get("markets", []),
                "note": "Cross-platform matching requires custom logic based on event names"
            }
        except Exception as e:
            return self._handle_error(e, "matching_markets_sports")
    
    # ===========================================================================
    # Convenience Methods
    # ===========================================================================
    
    async def search_markets(
        self,
        query: str,
        platform: str = "polymarket",
        limit: int = 20
    ) -> Dict[str, Any]:
        """Search for markets by text query"""
        if platform == "kalshi":
            return await self.kalshi_get_markets(limit=limit)
        else:
            return await self.polymarket_get_markets(search=query, status="open", limit=limit)
    
    async def get_trending_markets(
        self,
        platform: str = "polymarket",
        limit: int = 10
    ) -> Dict[str, Any]:
        """Get trending/popular markets (sorted by volume)"""
        if platform == "kalshi":
            return await self.kalshi_get_markets(status="open", limit=limit)
        else:
            return await self.polymarket_get_markets(status="open", limit=limit)
    
    def get_mcp_tools_schema(self) -> List[Dict[str, Any]]:
        """
        Return Claude-compatible tool definitions for the MCP tools
        This allows Claude to decide which tool to call
        """
        return [
            {
                "name": "polymarket_get_markets",
                "description": "Get Polymarket prediction markets. Can filter by status (open/resolved), tags (politics, sports, crypto, etc), or get a specific market by slug.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "status": {
                            "type": "string",
                            "description": "Filter by market status: open, closed",
                            "enum": ["open", "closed"]
                        },
                        "tags": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "Filter by tags like 'politics', 'sports', 'crypto'"
                        },
                        "market_slug": {
                            "type": "string",
                            "description": "Get specific market by its URL slug"
                        },
                        "search": {
                            "type": "string",
                            "description": "Text search query (requires status parameter)"
                        },
                        "limit": {
                            "type": "integer",
                            "description": "Max results (default 20)",
                            "default": 20
                        }
                    }
                }
            },
            {
                "name": "kalshi_get_markets",
                "description": "Get Kalshi prediction markets. Kalshi is a regulated US exchange with markets on events.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "status": {
                            "type": "string",
                            "description": "Filter by status: open, closed",
                            "enum": ["open", "closed"]
                        },
                        "limit": {
                            "type": "integer",
                            "default": 20
                        }
                    }
                }
            },
            {
                "name": "polymarket_get_trade_history",
                "description": "Get recent trades/orders for Polymarket markets. Useful for whale tracking and trade flow analysis.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "market_slug": {
                            "type": "string",
                            "description": "Market slug to get trades for"
                        },
                        "token_id": {
                            "type": "string",
                            "description": "Token ID to filter trades"
                        },
                        "limit": {
                            "type": "integer",
                            "default": 50
                        }
                    }
                }
            },
            {
                "name": "polymarket_get_market_price",
                "description": "Get current or historical price for a specific market token",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "token_id": {
                            "type": "string",
                            "description": "Token ID to get price for"
                        }
                    },
                    "required": ["token_id"]
                }
            },
            {
                "name": "polymarket_get_orderbook_history",
                "description": "Get historical orderbook snapshots for liquidity analysis",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "token_id": {
                            "type": "string",
                            "description": "Token ID"
                        },
                        "limit": {
                            "type": "integer",
                            "default": 20
                        }
                    },
                    "required": ["token_id"]
                }
            },
            {
                "name": "matching_markets_sports",
                "description": "Find equivalent sports betting markets across Polymarket and Kalshi",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "sport": {
                            "type": "string",
                            "description": "Sport to search for (nfl, nba, mlb, etc)"
                        }
                    }
                }
            }
        ]
    
    async def execute_tool(self, tool_name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
        """Execute a tool by name with given arguments"""
        tool_map = {
            "polymarket_get_markets": self.polymarket_get_markets,
            "kalshi_get_markets": self.kalshi_get_markets,
            "polymarket_get_trade_history": self.polymarket_get_trade_history,
            "polymarket_get_orderbook_history": self.polymarket_get_orderbook_history,
            "polymarket_get_market_price": self.polymarket_get_market_price,
            "kalshi_get_trade_history": self.kalshi_get_trade_history,
            "matching_markets_sports": self.matching_markets_sports,
        }
        
        if tool_name not in tool_map:
            return {"error": f"Unknown tool: {tool_name}"}
        
        try:
            result = await tool_map[tool_name](**arguments)
            # Ensure result is JSON-serializable (SDK objects may not be)
            return self._make_serializable(result)
        except Exception as e:
            return self._handle_error(e, f"execute_tool({tool_name})")


# Global instance
prediction_mcp_client = PredictionMCPClient()
