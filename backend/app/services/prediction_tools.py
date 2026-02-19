"""
Prediction Market Internal Tools
These tools call our own cached APIs for instant data access.
Claude uses these as MCP-style tool calls to answer user queries.
"""
import logging
import time
from typing import Dict, Any, Optional, List

logger = logging.getLogger(__name__)


class PredictionInternalTools:
    """
    Internal tools that access our own cached data.
    Much faster than external API calls since data is in-memory.
    """

    # =========================================================================
    # Tool: Search Events Across All Platforms
    # =========================================================================
    async def search_events(
        self,
        query: str = "",
        platform: str = "all",
        category: str = "all",
        limit: int = 20,
    ) -> Dict[str, Any]:
        """
        Search for prediction market events across all platforms.
        Uses our merged events cache for instant results.
        
        Args:
            query: Search text (matches event titles)
            platform: Filter by platform (all, polymarket, kalshi, limitless, opiniontrade)
            category: Filter by category (all, politics, sports, crypto, etc.)
            limit: Max results (default 20)
        """
        start = time.time()
        try:
            from app.api.events_db import _get_merged_cache, _build_merged_events_cache
            
            cached = _get_merged_cache()
            if cached is None:
                return {"error": "Cache warming up", "events": [], "total": 0}
            
            events = cached["events"]
            
            # Apply platform filter
            if platform != "all":
                events = [e for e in events if e.get("platform") == platform]
            
            # Apply category filter
            if category != "all":
                cat_lower = category.lower()
                events = [
                    e for e in events
                    if cat_lower in (e.get("category") or "").lower()
                    or cat_lower in str(e.get("tags") or []).lower()
                ]
            
            # Apply search filter
            if query:
                q_lower = query.lower()
                events = [
                    e for e in events
                    if q_lower in (e.get("title") or "").lower()
                    or q_lower in (e.get("event_id") or "").lower()
                ]
            
            total = len(events)
            results = events[:limit]
            
            # Simplify event data for Claude (reduce token usage)
            simplified = []
            for e in results:
                simplified.append({
                    "title": e.get("title", ""),
                    "platform": e.get("platform", ""),
                    "category": e.get("category", ""),
                    "status": e.get("status", ""),
                    "market_count": e.get("market_count", 1),
                    "total_volume": round(e.get("total_volume", 0) or 0, 2),
                    "yes_price": e.get("yes_price"),
                    "no_price": e.get("no_price"),
                    "event_id": e.get("event_id", ""),
                    "end_date": e.get("end_date", ""),
                    "volume_24h": round(e.get("volume_24h", 0) or 0, 2),
                })
            
            elapsed = (time.time() - start) * 1000
            logger.info(f"🔍 search_events('{query}', {platform}, {category}) → {total} results ({elapsed:.0f}ms)")
            
            return {
                "events": simplified,
                "total": total,
                "showing": len(simplified),
                "query": query,
                "platform_filter": platform,
                "category_filter": category,
                "response_time_ms": round(elapsed, 1),
            }
        except Exception as e:
            logger.error(f"search_events error: {e}")
            return {"error": str(e), "events": [], "total": 0}

    # =========================================================================
    # Tool: Get Market Overview Stats
    # =========================================================================
    async def get_market_overview(self) -> Dict[str, Any]:
        """
        Get high-level market overview stats across all platforms.
        Returns total events, markets, volume, and per-platform breakdowns.
        """
        start = time.time()
        try:
            from app.api.events_db import _get_merged_cache
            
            cached = _get_merged_cache()
            if cached is None:
                return {"error": "Cache warming up"}
            
            stats = cached.get("stats", {})
            platform_counts = cached.get("platform_counts", {})
            
            elapsed = (time.time() - start) * 1000
            return {
                "total_events": stats.get("total_events", 0),
                "total_markets": stats.get("total_markets", 0),
                "total_volume": round(stats.get("total_volume", 0), 2),
                "avg_volume_per_event": round(stats.get("avg_per_event", 0), 2),
                "platforms": {
                    "polymarket": {"events": platform_counts.get("polymarket", 0)},
                    "kalshi": {"events": platform_counts.get("kalshi", 0)},
                    "limitless": {"events": platform_counts.get("limitless", 0)},
                    "opiniontrade": {"events": platform_counts.get("opiniontrade", 0)},
                },
                "response_time_ms": round(elapsed, 1),
            }
        except Exception as e:
            logger.error(f"get_market_overview error: {e}")
            return {"error": str(e)}

    # =========================================================================
    # Tool: Get Event Detail with Markets
    # =========================================================================
    async def get_event_detail(
        self,
        event_id: str,
        platform: str = "polymarket",
    ) -> Dict[str, Any]:
        """
        Get detailed information about a specific event including all its markets.
        
        Args:
            event_id: The event ID/slug (e.g., "2028-us-presidential-election")
            platform: Platform name (polymarket, kalshi, limitless)
        """
        start = time.time()
        try:
            # Try to find in merged cache first (instant)
            from app.api.events_db import _get_merged_cache
            
            cached = _get_merged_cache()
            if cached:
                for e in cached["events"]:
                    if e.get("event_id") == event_id and e.get("platform") == platform:
                        elapsed = (time.time() - start) * 1000
                        return {
                            "event": {
                                "title": e.get("title", ""),
                                "platform": e.get("platform", ""),
                                "event_id": e.get("event_id", ""),
                                "category": e.get("category", ""),
                                "status": e.get("status", ""),
                                "market_count": e.get("market_count", 1),
                                "total_volume": round(e.get("total_volume", 0) or 0, 2),
                                "yes_price": e.get("yes_price"),
                                "no_price": e.get("no_price"),
                                "end_date": e.get("end_date", ""),
                                "start_date": e.get("start_date", ""),
                                "markets": e.get("markets", [])[:20],  # Limit markets
                            },
                            "source": "cache",
                            "response_time_ms": round(elapsed, 1),
                        }
            
            elapsed = (time.time() - start) * 1000
            return {
                "error": f"Event '{event_id}' not found on {platform}",
                "response_time_ms": round(elapsed, 1),
            }
        except Exception as e:
            logger.error(f"get_event_detail error: {e}")
            return {"error": str(e)}

    # =========================================================================
    # Tool: Get Top Markets by Volume
    # =========================================================================
    async def get_top_markets(
        self,
        platform: str = "all",
        category: str = "all",
        limit: int = 10,
        sort_by: str = "volume",
    ) -> Dict[str, Any]:
        """
        Get top prediction markets sorted by volume or other criteria.
        
        Args:
            platform: Filter by platform (all, polymarket, kalshi, limitless)
            category: Filter by category (all, politics, sports, crypto, etc.)
            limit: Number of top markets to return (default 10)
            sort_by: Sort criteria (volume, market_count)
        """
        start = time.time()
        try:
            from app.api.events_db import _get_merged_cache
            
            cached = _get_merged_cache()
            if cached is None:
                return {"error": "Cache warming up", "markets": []}
            
            events = cached["events"]
            
            # Filter
            if platform != "all":
                events = [e for e in events if e.get("platform") == platform]
            if category != "all":
                cat_lower = category.lower()
                events = [
                    e for e in events
                    if cat_lower in (e.get("category") or "").lower()
                ]
            
            # Sort
            if sort_by == "market_count":
                events.sort(key=lambda e: e.get("market_count", 1), reverse=True)
            else:  # default: volume
                events.sort(key=lambda e: e.get("total_volume", 0) or 0, reverse=True)
            
            # Take top N
            top = events[:limit]
            
            simplified = []
            for i, e in enumerate(top):
                simplified.append({
                    "rank": i + 1,
                    "title": e.get("title", ""),
                    "platform": e.get("platform", ""),
                    "category": e.get("category", ""),
                    "market_count": e.get("market_count", 1),
                    "total_volume": round(e.get("total_volume", 0) or 0, 2),
                    "yes_price": e.get("yes_price"),
                    "event_id": e.get("event_id", ""),
                })
            
            elapsed = (time.time() - start) * 1000
            logger.info(f"📊 get_top_markets({platform}, {category}, top {limit}) ({elapsed:.0f}ms)")
            
            return {
                "markets": simplified,
                "total_matching": len(events),
                "showing": len(simplified),
                "sort_by": sort_by,
                "response_time_ms": round(elapsed, 1),
            }
        except Exception as e:
            logger.error(f"get_top_markets error: {e}")
            return {"error": str(e), "markets": []}

    # =========================================================================
    # Tool: Get Category Breakdown
    # =========================================================================
    async def get_category_breakdown(
        self,
        platform: str = "all",
    ) -> Dict[str, Any]:
        """
        Get breakdown of events and volume by category.
        
        Args:
            platform: Filter by platform (all, polymarket, kalshi, limitless)
        """
        start = time.time()
        try:
            from app.api.events_db import _get_merged_cache
            
            cached = _get_merged_cache()
            if cached is None:
                return {"error": "Cache warming up"}
            
            events = cached["events"]
            
            if platform != "all":
                events = [e for e in events if e.get("platform") == platform]
            
            # Aggregate by category
            categories: Dict[str, Dict[str, Any]] = {}
            for e in events:
                cat = e.get("category") or "Other"
                if cat not in categories:
                    categories[cat] = {"event_count": 0, "total_volume": 0, "market_count": 0}
                categories[cat]["event_count"] += 1
                categories[cat]["total_volume"] += e.get("total_volume", 0) or 0
                categories[cat]["market_count"] += e.get("market_count", 1)
            
            # Sort by event count
            sorted_cats = sorted(
                categories.items(),
                key=lambda x: x[1]["event_count"],
                reverse=True,
            )
            
            result = []
            for cat_name, data in sorted_cats[:15]:  # Top 15 categories
                result.append({
                    "category": cat_name,
                    "events": data["event_count"],
                    "markets": data["market_count"],
                    "volume": round(data["total_volume"], 2),
                })
            
            elapsed = (time.time() - start) * 1000
            return {
                "categories": result,
                "total_categories": len(categories),
                "platform_filter": platform,
                "response_time_ms": round(elapsed, 1),
            }
        except Exception as e:
            logger.error(f"get_category_breakdown error: {e}")
            return {"error": str(e)}

    # =========================================================================
    # Tool: Compare Platforms
    # =========================================================================
    async def compare_platforms(self) -> Dict[str, Any]:
        """
        Compare prediction market platforms side by side.
        Shows event counts, market counts, volume for each platform.
        """
        start = time.time()
        try:
            from app.api.events_db import _get_merged_cache
            
            cached = _get_merged_cache()
            if cached is None:
                return {"error": "Cache warming up"}
            
            events = cached["events"]
            platforms: Dict[str, Dict[str, Any]] = {}
            
            for e in events:
                p = e.get("platform", "unknown")
                if p not in platforms:
                    platforms[p] = {
                        "event_count": 0,
                        "total_volume": 0,
                        "market_count": 0,
                        "top_event": None,
                        "top_volume": 0,
                    }
                platforms[p]["event_count"] += 1
                platforms[p]["total_volume"] += e.get("total_volume", 0) or 0
                platforms[p]["market_count"] += e.get("market_count", 1)
                
                vol = e.get("total_volume", 0) or 0
                if vol > platforms[p]["top_volume"]:
                    platforms[p]["top_volume"] = vol
                    platforms[p]["top_event"] = e.get("title", "")
            
            result = []
            for name, data in sorted(platforms.items(), key=lambda x: x[1]["total_volume"], reverse=True):
                result.append({
                    "platform": name,
                    "events": data["event_count"],
                    "markets": data["market_count"],
                    "total_volume": round(data["total_volume"], 2),
                    "avg_volume_per_event": round(data["total_volume"] / max(data["event_count"], 1), 2),
                    "top_event": data["top_event"],
                })
            
            elapsed = (time.time() - start) * 1000
            return {
                "platforms": result,
                "response_time_ms": round(elapsed, 1),
            }
        except Exception as e:
            logger.error(f"compare_platforms error: {e}")
            return {"error": str(e)}

    # =========================================================================
    # Tool Schemas for Claude
    # =========================================================================
    def get_tool_schemas(self) -> List[Dict[str, Any]]:
        """Return Claude-compatible tool definitions for all internal tools"""
        return [
            {
                "name": "search_events",
                "description": "Search for prediction market events by keyword across all 4 platforms (Polymarket, Kalshi, Limitless, OpinionTrade). Returns events with title, platform, volume, odds, and category. Use this when the user asks about specific topics, events, or markets.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "Search text to match against event titles (e.g., 'bitcoin', 'trump', 'super bowl', 'fed rate')"
                        },
                        "platform": {
                            "type": "string",
                            "description": "Filter by platform: all, polymarket, kalshi, limitless, opiniontrade",
                            "enum": ["all", "polymarket", "kalshi", "limitless", "opiniontrade"],
                            "default": "all"
                        },
                        "category": {
                            "type": "string",
                            "description": "Filter by category: all, politics, sports, crypto, science, culture, etc.",
                            "default": "all"
                        },
                        "limit": {
                            "type": "integer",
                            "description": "Max results to return (default 20, max 50)",
                            "default": 20
                        }
                    }
                }
            },
            {
                "name": "get_market_overview",
                "description": "Get high-level overview of all prediction markets: total events, total markets, total volume, and per-platform breakdown. Use when user asks general questions like 'how many markets are there?' or 'market overview'.",
                "input_schema": {
                    "type": "object",
                    "properties": {}
                }
            },
            {
                "name": "get_event_detail",
                "description": "Get detailed information about a specific prediction market event, including all individual markets within it. Use when the user asks about a specific event by name or ID.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "event_id": {
                            "type": "string",
                            "description": "The event ID or slug (e.g., '2028-us-presidential-election', 'super-bowl-lix')"
                        },
                        "platform": {
                            "type": "string",
                            "description": "Platform name",
                            "enum": ["polymarket", "kalshi", "limitless", "opiniontrade"],
                            "default": "polymarket"
                        }
                    },
                    "required": ["event_id"]
                }
            },
            {
                "name": "get_top_markets",
                "description": "Get the top prediction markets ranked by trading volume. Can filter by platform and category. Use when user asks for 'top markets', 'highest volume', 'most popular', 'trending markets', or 'best markets'.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "platform": {
                            "type": "string",
                            "description": "Filter by platform",
                            "enum": ["all", "polymarket", "kalshi", "limitless", "opiniontrade"],
                            "default": "all"
                        },
                        "category": {
                            "type": "string",
                            "description": "Filter by category",
                            "default": "all"
                        },
                        "limit": {
                            "type": "integer",
                            "description": "Number of top markets (default 10)",
                            "default": 10
                        },
                        "sort_by": {
                            "type": "string",
                            "description": "Sort criteria",
                            "enum": ["volume", "market_count"],
                            "default": "volume"
                        }
                    }
                }
            },
            {
                "name": "get_category_breakdown",
                "description": "Get breakdown of prediction markets by category showing event counts, market counts, and volume per category. Use when user asks 'what categories are available?', 'show categories', or 'category stats'.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "platform": {
                            "type": "string",
                            "description": "Filter by platform",
                            "enum": ["all", "polymarket", "kalshi", "limitless", "opiniontrade"],
                            "default": "all"
                        }
                    }
                }
            },
            {
                "name": "compare_platforms",
                "description": "Compare all 4 prediction market platforms side by side: Polymarket vs Kalshi vs Limitless vs OpinionTrade. Shows event counts, market counts, total volume, and top events per platform. Use when user asks to compare platforms or about platform differences.",
                "input_schema": {
                    "type": "object",
                    "properties": {}
                }
            },
        ]

    async def execute_tool(self, tool_name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
        """Execute an internal tool by name"""
        tool_map = {
            "search_events": self.search_events,
            "get_market_overview": self.get_market_overview,
            "get_event_detail": self.get_event_detail,
            "get_top_markets": self.get_top_markets,
            "get_category_breakdown": self.get_category_breakdown,
            "compare_platforms": self.compare_platforms,
        }
        
        if tool_name not in tool_map:
            return {"error": f"Unknown tool: {tool_name}"}
        
        try:
            return await tool_map[tool_name](**arguments)
        except TypeError as e:
            logger.error(f"Tool argument error for {tool_name}: {e}")
            return {"error": f"Invalid arguments for {tool_name}: {str(e)}"}
        except Exception as e:
            logger.error(f"Tool execution error for {tool_name}: {e}")
            return {"error": str(e)}


# Global instance
prediction_internal_tools = PredictionInternalTools()
