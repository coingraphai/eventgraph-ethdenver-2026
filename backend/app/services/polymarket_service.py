"""
Polymarket Service - Intelligent LLM-based routing

Similar to CoinMarketCap service, uses LLM to analyze queries and route to appropriate
Polymarket CLOB API endpoints. Supports trending, search, market details, events, and categories.
"""

import logging
import json
import time
from typing import Dict, Any, Optional, List
import httpx
from app.services.llm_client import get_llm_client, get_llm_model

logger = logging.getLogger(__name__)

# Polymarket API endpoints
CLOB_API_BASE = "https://clob.polymarket.com"
GAMMA_API_BASE = "https://gamma-api.polymarket.com"
DATA_API_BASE = "https://data-api.polymarket.com"  # Data API for historical/analytics


class PolymarketService:
    """
    Intelligent Polymarket service with LLM-based query routing.
    
    Available tools/endpoints:
    - trending: Get trending markets by volume
    - search: Search markets by keyword
    - market: Get specific market details
    - events: Get market events
    - category: Filter by category/tag
    """
    
    def __init__(self):
        # Use 30-second timeout like working Colab code
        self.client = httpx.Client(timeout=30.0)
        self.llm_client = get_llm_client()
        self.llm_model = get_llm_model()
        logger.info("🎯 Intelligent Polymarket Service initialized")
    
    def __del__(self):
        """Cleanup HTTP client"""
        try:
            self.client.close()
        except:
            pass
    
    # ==================== MAIN ENTRY POINT ====================
    
    def detect_and_execute_query(self, user_query: str) -> Optional[Dict[str, Any]]:
        """
        Main entry point: Analyze query with LLM, execute tool plan, return aggregated results.
        
        Args:
            user_query: Natural language query
        
        Returns:
            Structured data bundle or None if not prediction-related
        """
        # Step 1: LLM analyzes and creates tool plan
        analysis = self._analyze_polymarket_query(user_query)
        
        if not analysis.get("is_prediction_query"):
            logger.info("ℹ️ Query not identified as prediction-related")
            return None
        
        confidence = analysis.get("confidence", 0.0)
        if confidence < 0.6:
            logger.warning(f"⚠️ Low confidence ({confidence:.2f}) for prediction query")
            return None
        
        tool_plan = analysis.get("tool_plan", [])
        if not tool_plan:
            logger.warning("No tool plan generated")
            return {
                "type": "no_plan",
                "query_type": analysis.get("query_type"),
                "reasoning": analysis.get("reasoning"),
                "results": []
            }
        
        # Step 2: Execute tool plan
        logger.info(f"✅ Executing {len(tool_plan)} tool(s) via Polymarket API")
        results = []
        total_markets = 0
        
        for step in tool_plan:
            tool = step.get("tool")
            args = step.get("args", {})
            
            try:
                data = self._execute_tool(tool, args)
                # Count markets if data is a list
                if isinstance(data, list):
                    total_markets += len(data)
                
                results.append({
                    "tool": tool,
                    "args": args,
                    "data": data,
                    "success": True
                })
            except Exception as e:
                logger.error(f"❌ Tool execution failed: {tool} {args}: {str(e)}")
                results.append({
                    "tool": tool,
                    "args": args,
                    "error": str(e),
                    "success": False
                })
        
        return {
            "type": "polymarket_result_bundle",
            "query_type": analysis.get("query_type"),
            "reasoning": analysis.get("reasoning"),
            "confidence": confidence,
            "tool_plan": tool_plan,
            "results": results,
            "count": total_markets,  # Add count for predictions agent
            "source": "polymarket_clob_api"
        }
    
    # ==================== LLM ANALYZER ====================
    
    def _analyze_polymarket_query(self, user_query: str) -> Dict[str, Any]:
        """
        Use LLM to analyze query and generate execution plan.
        
        Available tools:
        - polymarket.trending: Get trending markets by volume
        - polymarket.search: Search by keyword
        - polymarket.market: Get specific market by ID
        - polymarket.events: Get market events
        - polymarket.category: Filter by tag/category
        """
        
        system_prompt = """You are a prediction markets query planner for Polymarket.

Analyze the user query and produce a JSON execution plan.

Available tools:
1. polymarket.active - Get active markets accepting orders
   Args: { "limit": number (default 20) }

2. polymarket.search - Search markets by keyword  
   Args: { "query": string, "limit": number (default 10) }

3. polymarket.market - Get specific market details
   Args: { "condition_id": string }

4. polymarket.orderbook - Get orderbook for a market
   Args: { "token_id": string }

5. polymarket.category - Filter by category tag
   Args: { "tag": string (crypto|politics|sports|etc), "limit": number }

6. polymarket.trending - Get popular markets
   Args: { "limit": number (default 20) }

Output strict JSON:
{
  "is_prediction_query": boolean,
  "query_type": "active" | "trending" | "search" | "market_detail" | "orderbook" | "category" | "general",
  "confidence": 0.0-1.0,
  "tool_plan": [
    {"tool": "polymarket.active", "args": {"limit": 20}},
    {"tool": "polymarket.search", "args": {"query": "bitcoin", "limit": 10}}
  ],
  "reasoning": "brief explanation"
}

Guidelines:
- Use 1-2 tools maximum that directly answer the question
- For "What prediction markets are available?" → use polymarket.active
- For "Bitcoin predictions" → use polymarket.search with query="bitcoin"
- For "Crypto markets" → use polymarket.category with tag="crypto"
- For "Show me the orderbook" → use polymarket.orderbook with token_id
- Omit irrelevant tools"""

        user_message = f'User Query: "{user_query}"\n\nReturn only JSON without markdown fences.'
        
        try:
            response = self.llm_client.chat.completions.create(
                model=self.llm_model,
                temperature=0.1,
                max_tokens=400,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_message}
                ]
            )
            
            text = response.choices[0].message.content or "{}"
            
            # Strip markdown fences if present
            if "```json" in text:
                text = text.split("```json")[1].split("```")[0].strip()
            elif "```" in text:
                parts = text.split("```")
                text = parts[1] if len(parts) >= 3 else text
            
            analysis = json.loads(text)
            
            logger.info(f"🧠 Query analysis: is_prediction={analysis.get('is_prediction_query', False)}, "
                       f"type={analysis.get('query_type')}, confidence={analysis.get('confidence', 0):.2f}")
            
            return analysis
            
        except json.JSONDecodeError as e:
            logger.error(f"❌ LLM returned non-JSON response: {str(e)}")
            return {
                "is_prediction_query": False,
                "confidence": 0.0,
                "reasoning": "JSON parse error"
            }
        except Exception as e:
            logger.error(f"❌ Error in query analysis: {str(e)}")
            return {
                "is_prediction_query": False,
                "confidence": 0.0,
                "reasoning": str(e)
            }
    
    # ==================== TOOL EXECUTOR ====================
    
    def _execute_tool(self, tool: str, args: Dict[str, Any]) -> Any:
        """Execute a specific Polymarket tool"""
        
        if tool == "polymarket.active":
            return self._get_active_markets(args.get("limit", 20))
        
        elif tool == "polymarket.trending":
            return self._get_trending_markets(args.get("limit", 20))
        
        elif tool == "polymarket.search":
            return self._search_markets(args.get("query", ""), args.get("limit", 10))
        
        elif tool == "polymarket.market":
            return self._get_market_detail(args.get("condition_id") or args.get("id"))
        
        elif tool == "polymarket.orderbook":
            return self._get_orderbook(args.get("token_id"))
        
        elif tool == "polymarket.category":
            return self._get_category_markets(args.get("tag", "crypto"), args.get("limit", 20))
        
        else:
            raise ValueError(f"Unknown tool: {tool}")
    
    # ==================== POLYMARKET API METHODS ====================
    
    def _get_active_markets(self, limit: int = 20) -> List[Dict[str, Any]]:
        """Get active markets accepting orders from CLOB API"""
        try:
            logger.info(f"📊 Fetching {limit} active markets from CLOB API")
            
            # Use sampling-markets endpoint for active markets
            response = self._api_request_with_retry(
                f"{CLOB_API_BASE}/sampling-markets",
                params={"active": "true"}
            )
            
            # Handle CLOB API response format
            if isinstance(response, dict) and "data" in response:
                markets = response["data"]
                logger.info(f"✅ Retrieved {len(markets)} active markets")
                return markets[:limit]
            elif isinstance(response, list):
                return response[:limit]
            
            return []
            
        except Exception as e:
            logger.error(f"❌ Error fetching active markets: {str(e)}")
            raise
    
    def _get_trending_markets(self, limit: int = 20) -> List[Dict[str, Any]]:
        """Get trending markets with multi-source fallback (Events -> Data API -> Gamma Markets)"""
        try:
            # Try 1: Events endpoint (most reliable, like working Colab code)
            logger.info(f"📈 Fetching active events with markets from Gamma API")
            
            try:
                response = self._api_request_with_retry(
                    f"{GAMMA_API_BASE}/events",
                    params={
                        "closed": "false",
                        "order": "id",
                        "ascending": "false",
                        "limit": 10
                    }
                )
                
                # Extract markets from events
                all_markets = []
                if isinstance(response, list) and len(response) > 0:
                    logger.info(f"📊 Received {len(response)} active events from Gamma API")
                    
                    for event in response:
                        for market in event.get('markets', []):
                            market['event_id'] = event.get('id', 'N/A')
                            market['event_title'] = event.get('title', 'N/A')
                            all_markets.append(market)
                    
                    if len(all_markets) > 0:
                        logger.info(f"✅ Extracted {len(all_markets)} markets from events, returning top {limit}")
                        return all_markets[:limit]
            except Exception as e:
                logger.warning(f"⚠️ Events endpoint failed: {str(e)}, trying Data API...")
            
            # Try 2: Data API markets endpoint
            try:
                response = self._api_request_with_retry(
                    f"{DATA_API_BASE}/markets",
                    params={"limit": limit, "active": "true"}
                )
                
                if isinstance(response, list) and len(response) > 0:
                    logger.info(f"✅ Retrieved {len(response)} markets from Data API")
                    return response[:limit]
                elif isinstance(response, dict) and "data" in response:
                    markets = response["data"][:limit]
                    logger.info(f"✅ Retrieved {len(markets)} markets from Data API")
                    return markets
            except Exception as e:
                logger.warning(f"⚠️ Data API failed: {str(e)}, trying Gamma markets...")
            
            # Try 3: Gamma markets endpoint (fallback)
            try:
                response = self._api_request_with_retry(
                    f"{GAMMA_API_BASE}/markets",
                    params={"limit": limit, "closed": "false"}
                )
                
                if isinstance(response, list) and len(response) > 0:
                    logger.info(f"✅ Retrieved {len(response)} markets from Gamma markets endpoint")
                    return response[:limit]
            except Exception as e:
                logger.error(f"❌ All endpoints failed. Last error: {str(e)}")
            
            return []
            
        except Exception as e:
            logger.error(f"❌ Error fetching trending markets: {str(e)}")
            return []
    
    def _search_markets(self, query: str, limit: int = 10) -> List[Dict[str, Any]]:
        """Search markets by keyword using CLOB API"""
        try:
            logger.info(f"🔍 Searching markets for: '{query}'")
            
            # Get active markets from CLOB API
            response = self._api_request_with_retry(
                f"{CLOB_API_BASE}/markets",
                params={"active": "true", "limit": 100}
            )
            
            # Handle CLOB API response format
            all_markets = []
            if isinstance(response, dict) and "data" in response:
                all_markets = response["data"]
            elif isinstance(response, list):
                all_markets = response
            
            if not all_markets:
                return []
            
            # Filter by query (case-insensitive search in question and description)
            query_lower = query.lower()
            filtered = [
                m for m in all_markets
                if query_lower in m.get("question", "").lower() or
                   query_lower in m.get("description", "").lower() or
                   any(query_lower in str(tag).lower() for tag in m.get("tags", []))
            ]
            
            logger.info(f"✅ Found {len(filtered)} markets matching '{query}'")
            return filtered[:limit]
            
        except Exception as e:
            logger.error(f"❌ Error searching markets: {str(e)}")
            raise
    
    def _get_market_detail(self, market_id: str) -> Dict[str, Any]:
        """Get specific market by condition_id from CLOB API"""
        try:
            logger.info(f"🔍 Fetching market details for condition_id: {market_id}")
            
            # CLOB API: GET /markets/{condition_id}
            market = self._api_request_with_retry(
                f"{CLOB_API_BASE}/markets/{market_id}"
            )
            
            # Handle response - could be single market or wrapped
            if isinstance(market, dict):
                if "data" in market:
                    market = market["data"]
                logger.info(f"✅ Retrieved market: {market.get('question', 'Unknown')}")
                return market
            
            return market
            
        except Exception as e:
            logger.error(f"❌ Error fetching market {market_id}: {str(e)}")
            raise
    
    def _get_orderbook(self, token_id: str) -> Dict[str, Any]:
        """Get orderbook for a specific token from CLOB API"""
        try:
            logger.info(f"📖 Fetching orderbook for token: {token_id}")
            
            # CLOB API: GET /book?token_id={token_id}
            orderbook = self._api_request_with_retry(
                f"{CLOB_API_BASE}/book",
                params={"token_id": token_id}
            )
            
            if isinstance(orderbook, dict):
                bids = len(orderbook.get("bids", []))
                asks = len(orderbook.get("asks", []))
                logger.info(f"✅ Retrieved orderbook: {bids} bids, {asks} asks")
                return orderbook
            
            return orderbook
            
        except Exception as e:
            logger.error(f"❌ Error fetching orderbook for {token_id}: {str(e)}")
            raise
    
    def _get_events(self, limit: int = 20) -> List[Dict[str, Any]]:
        """Get market events from Gamma API"""
        try:
            logger.info(f"📅 Fetching {limit} market events")
            
            # Events are on Gamma API
            events = self._api_request_with_retry(
                f"{GAMMA_API_BASE}/events",
                params={"limit": limit}
            )
            
            return events if isinstance(events, list) else []
            
        except Exception as e:
            logger.error(f"❌ Error fetching events: {str(e)}")
            raise
    
    def _get_category_markets(self, tag: str, limit: int = 20) -> List[Dict[str, Any]]:
        """Get markets by category tag from CLOB API"""
        try:
            logger.info(f"🏷️ Fetching markets in category: '{tag}'")
            
            # Get active markets from CLOB API and filter by tag
            response = self._api_request_with_retry(
                f"{CLOB_API_BASE}/markets",
                params={"active": "true", "limit": 100}
            )
            
            # Handle CLOB API response format
            all_markets = []
            if isinstance(response, dict) and "data" in response:
                all_markets = response["data"]
            elif isinstance(response, list):
                all_markets = response
            
            if not all_markets:
                logger.warning(f"⚠️ No markets returned from API")
                return []
            
            # Filter by tag - handle None values safely
            tag_lower = tag.lower()
            categorized = []
            for m in all_markets:
                tags = m.get("tags")
                # Ensure tags is iterable (list or tuple), not None
                if tags is None:
                    tags = []
                elif not isinstance(tags, (list, tuple)):
                    tags = [tags]  # Convert single value to list
                
                # Check if any tag matches
                if any(tag_lower in str(t).lower() for t in tags):
                    categorized.append(m)
            
            logger.info(f"✅ Found {len(categorized)} markets in '{tag}' category")
            return categorized[:limit]
            
        except Exception as e:
            logger.error(f"❌ Error fetching category markets: {str(e)}")
            return []  # Return empty list instead of raising
            raise
    
    # ==================== HTTP CLIENT WITH RETRY ====================
    
    def _api_request_with_retry(
        self,
        url: str,
        params: Dict[str, Any] = None,
        max_retries: int = 3
    ) -> Any:
        """Make HTTP request with retry logic and exponential backoff"""
        
        last_error = None
        backoff = 1.0
        
        for attempt in range(1, max_retries + 1):
            try:
                response = self.client.get(url, params=params)
                response.raise_for_status()
                return response.json()
                
            except (httpx.TimeoutException, httpx.ConnectError) as e:
                last_error = e
                if attempt < max_retries:
                    logger.warning(f"⚠️ Request timeout (attempt {attempt}/{max_retries}). "
                                 f"Retrying in {backoff}s...")
                    time.sleep(backoff)
                    backoff *= 2
                else:
                    logger.error(f"❌ All {max_retries} attempts failed")
                    
            except httpx.HTTPError as e:
                logger.error(f"❌ HTTP error on attempt {attempt}: {str(e)}")
                last_error = e
                raise
        
        raise RuntimeError(f"Failed after {max_retries} retries: {last_error}")
    
    # ==================== CONVENIENCE METHODS ====================
    
    def get_markets(self, limit: int = 20, **kwargs) -> Dict[str, Any]:
        """Convenience method for backward compatibility"""
        try:
            markets = self._get_trending_markets(limit)
            return {
                "data": markets,
                "type": "markets_list",
                "count": len(markets),
                "source": "polymarket_gamma_api"
            }
        except Exception as e:
            return {"error": str(e)}
    
    def search_markets(self, query: str, limit: int = 10) -> Dict[str, Any]:
        """Convenience method for backward compatibility"""
        try:
            markets = self._search_markets(query, limit)
            return {
                "data": markets,
                "type": "search_results",
                "query": query,
                "count": len(markets),
                "source": "polymarket_gamma_api"
            }
        except Exception as e:
            return {"error": str(e)}
    
    def get_trending_markets(self, limit: int = 10) -> Dict[str, Any]:
        """Convenience method for backward compatibility"""
        try:
            markets = self._get_trending_markets(limit)
            return {
                "data": markets,
                "type": "trending_markets",
                "count": len(markets),
                "source": "polymarket_gamma_api"
            }
        except Exception as e:
            return {"error": str(e)}
    
    def get_markets_by_category(self, category: str, limit: int = 20) -> Dict[str, Any]:
        """Convenience method for backward compatibility"""
        try:
            markets = self._get_category_markets(category, limit)
            return {
                "data": markets,
                "type": "category_markets",
                "category": category,
                "count": len(markets),
                "source": "polymarket_gamma_api"
            }
        except Exception as e:
            return {"error": str(e)}


# Global singleton instance
polymarket_service = PolymarketService()
