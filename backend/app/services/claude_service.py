"""
Claude Service with MCP Tool Calling
Uses Claude's native tool calling to interact with prediction market data
"""
import os
import json
import logging
from typing import List, Dict, Any, Optional, AsyncGenerator
from datetime import datetime

from app.config import settings
from app.services.prediction_mcp_client import prediction_mcp_client
from app.services.prediction_tools import prediction_internal_tools

logger = logging.getLogger(__name__)

# Try to import Anthropic
try:
    from anthropic import Anthropic
    ANTHROPIC_AVAILABLE = True
except ImportError:
    ANTHROPIC_AVAILABLE = False
    logger.warning("Anthropic library not installed")


class ClaudeService:
    """
    Claude Service with MCP Tool Integration
    
    Uses Claude's native tool calling feature to invoke prediction market
    tools from the MCP server.
    """
    
    def __init__(self):
        self.client = None
        self.sonnet_model = "claude-sonnet-4-5-20250929"
        self.haiku_model = "claude-3-5-haiku-20241022"
        self.mcp_client = prediction_mcp_client
        self.internal_tools = prediction_internal_tools
        
        if ANTHROPIC_AVAILABLE and settings.ANTHROPIC_API_KEY:
            self.client = Anthropic(api_key=settings.ANTHROPIC_API_KEY)
            logger.info("Claude service initialized with MCP + internal tools")
        else:
            logger.warning("Claude service not available - check ANTHROPIC_API_KEY")
    
    def _get_system_prompt(self) -> str:
        """Enhanced system prompt with chain-of-thought, intent detection, and structured output"""
        return """You are **CoinGraph AI**, an expert prediction markets analyst with access to real-time data from Polymarket, Kalshi, Limitless, and OpinionTrade. You provide institutional-grade analysis with structured, data-rich responses.

## Your Capabilities

You have two categories of tools:
1. **Internal Tools** (INSTANT, <1ms) — Access our cached database of 20,000+ events across 4 platforms:
   - `search_events` — Search events by keyword, platform, category
   - `get_market_overview` — Total events, markets, volume across all platforms
   - `get_top_markets` — Top markets by volume with filtering
   - `get_category_breakdown` — Category stats across platforms
   - `compare_platforms` — Platform comparison (Polymarket vs Kalshi vs Limitless vs OpinionTrade)
   - `get_event_detail` — Detailed info on specific events

2. **External Tools** (API calls to Dome) — Live market data:
   - `polymarket_get_markets` — Live Polymarket data with search
   - `kalshi_get_markets` — Live Kalshi data
   - `polymarket_get_trade_history` — Recent trades/orders
   - `polymarket_get_market_price` — Current token prices
   - `polymarket_get_orderbook_history` — Orderbook snapshots
   - `matching_markets_sports` — Cross-platform sports matching

## Intent Detection Strategy

Before calling tools, classify the user's intent:
- **Overview/Stats** → `get_market_overview` (instant)
- **Search/Find** → `search_events` (instant, keyword-based)
- **Top/Trending/Popular** → `get_top_markets` (instant, sorted by volume)
- **Categories/Breakdown** → `get_category_breakdown` (instant)
- **Compare Platforms** → `compare_platforms` (instant)
- **Specific Event** → `get_event_detail` or `search_events` (instant)
- **Live Prices/Odds** → `polymarket_get_markets` or `kalshi_get_markets` (API)
- **Trade History/Whales** → `polymarket_get_trade_history` (API)
- **General Question** → Answer from knowledge, no tool needed

**PREFER internal tools** — they are 1000x faster. Only use external API tools when the user specifically needs live prices, trade history, or orderbook data.

## Data Model — CRITICAL TERMINOLOGY

Our data has a clear hierarchy you MUST respect in your responses:
- **Event** = A parent container (e.g., "Republican Presidential Nominee 2028"). Each event has a title, category, platform, and total volume.
- **Market** = An individual outcome/contract within an event (e.g., "Will Trump win the Republican nomination?"). Each event can contain 1 or many markets.

**Column naming rules:**
- When listing events (from search_events, get_top_markets, etc.), the name column MUST be labeled "EVENT", NOT "MARKET"
- The count column showing how many outcomes an event has should be labeled "MARKETS" (it counts the individual contracts)
- Only use "MARKET" as a column header when showing individual outcome contracts within a single event

## Response Formatting Rules

**ALWAYS structure your responses professionally:**

1. **Title with Emoji** — Start with a relevant emoji + bold title:
   - 📊 for market data/stats
   - � for search results
   - 🏆 for rankings/top lists
   - ⚖️ for comparisons
   - � for trends/analysis
   - �💰 for volume/financial data
   - 🎯 for predictions/probabilities

2. **ALWAYS use markdown tables** when presenting multiple items:
   ```
   | # | EVENT | PLATFORM | VOLUME | MARKETS |
   |---|-------|----------|--------|---------|
   | 1 | Republican Presidential Nominee 2028 | Polymarket | $252.6M | 31 |
   ```

3. **Structure with clear sections:**
   - ## Overview (summary stats)
   - ## Top Events (table)
   - ## Analysis (insights)
   - ## Summary (actionable takeaway)

4. **Data formatting:**
   - Volumes: **$1.2M**, **$45.3K** (abbreviated with $ and bold)
   - Probabilities: **75%** (bold percentage)
   - Counts: **8,314 events** (comma-separated, bold)
   - Platform names: Always capitalize (Polymarket, Kalshi, Limitless, OpinionTrade)

5. **Always cite data source:** "(from cached data)" or "(live from Polymarket API)"

## Few-Shot Examples

**User: "How many markets are there?"**
→ Call `get_market_overview` → Response:

📊 **Prediction Markets Overview**

| METRIC | VALUE |
|--------|-------|
| Total Events | **20,000+** |
| Total Markets | **21,683** |
| Total Volume | **$3.98B** |
| Avg Volume/Event | **$478K** |

### Platform Breakdown
| PLATFORM | EVENTS | SHARE |
|----------|--------|-------|
| Kalshi | **4,594** | 55.3% |
| Polymarket | **3,368** | 40.5% |
| Limitless | **352** | 4.2% |
| OpinionTrade | **268** | ~1% |

---

**User: "Top crypto markets"**
→ Call `search_events(query="crypto")` or `get_top_markets(category="crypto")` → Response with ranked table using EVENT column header.

**User: "Compare Polymarket and Kalshi"**
→ Call `compare_platforms` → Response with side-by-side comparison table of all 4 platforms using PLATFORM as key column.

---

If you cannot find relevant data, explain what data is available and suggest how the user can refine their question. Never make up data — always use tool results."""
    
    def _get_tools(self) -> List[Dict[str, Any]]:
        """Get Claude-compatible tool definitions (internal + external)"""
        # Internal tools first (fast, cached) + external API tools
        internal = self.internal_tools.get_tool_schemas()
        external = self.mcp_client.get_mcp_tools_schema()
        return internal + external
    
    async def _execute_tool(self, tool_name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
        """Route tool execution to internal or external handler"""
        # Internal tools (from our cached data)
        internal_tool_names = {
            "search_events", "get_market_overview", "get_event_detail",
            "get_top_markets", "get_category_breakdown", "compare_platforms"
        }
        
        if tool_name in internal_tool_names:
            return await self.internal_tools.execute_tool(tool_name, arguments)
        else:
            return await self.mcp_client.execute_tool(tool_name, arguments)
    
    async def chat(
        self,
        user_message: str,
        chat_history: Optional[List[Dict[str, str]]] = None,
        context_type: str = "predictions"
    ) -> Dict[str, Any]:
        """
        Simple chat without tool calling
        """
        if not self.client:
            return {
                "answer": "Claude service is not configured. Please set ANTHROPIC_API_KEY.",
                "timestamp": datetime.now().isoformat(),
                "error": True
            }
        
        try:
            messages = []
            if chat_history:
                for msg in chat_history[-10:]:
                    messages.append({
                        "role": msg.get("role", "user"),
                        "content": msg.get("content", "")
                    })
            
            messages.append({
                "role": "user",
                "content": user_message
            })
            
            response = self.client.messages.create(
                model=self.sonnet_model,
                max_tokens=4096,
                temperature=0.3,
                system=self._get_system_prompt(),
                messages=messages
            )
            
            answer = ""
            for block in response.content:
                if hasattr(block, 'text'):
                    answer += block.text
            
            return {
                "answer": answer,
                "timestamp": datetime.now().isoformat(),
                "model": self.sonnet_model
            }
            
        except Exception as e:
            logger.error(f"Claude API error: {str(e)}")
            return {
                "answer": f"Error: {str(e)}",
                "timestamp": datetime.now().isoformat(),
                "error": True
            }
    
    async def chat_with_mcp(
        self,
        user_message: str,
        chat_history: Optional[List[Dict[str, str]]] = None,
        show_reasoning: bool = True,
        context_type: str = "predictions"
    ) -> Dict[str, Any]:
        """
        Chat with MCP tool calling
        
        Claude will automatically decide which tools to call based on the user's question,
        execute them, and provide a comprehensive response.
        """
        if not self.client:
            return {
                "answer": "Claude service is not configured. Please set ANTHROPIC_API_KEY.",
                "timestamp": datetime.now().isoformat(),
                "error": True
            }
        
        try:
            # Build messages
            messages = []
            if chat_history:
                for msg in chat_history[-10:]:
                    messages.append({
                        "role": msg.get("role", "user"),
                        "content": msg.get("content", "")
                    })
            
            messages.append({
                "role": "user",
                "content": user_message
            })
            
            # Get tools
            tools = self._get_tools()
            tool_calls = []
            
            # Initial API call with tools
            response = self.client.messages.create(
                model=self.sonnet_model,
                max_tokens=4096,
                temperature=0.3,
                system=self._get_system_prompt(),
                tools=tools,
                messages=messages
            )
            
            # Check if Claude wants to use tools
            while response.stop_reason == "tool_use":
                # Process tool calls
                tool_use_blocks = [
                    block for block in response.content 
                    if hasattr(block, 'type') and block.type == "tool_use"
                ]
                
                # Add assistant's response to messages
                messages.append({
                    "role": "assistant",
                    "content": response.content
                })
                
                # Execute each tool and collect results
                tool_results = []
                for tool_block in tool_use_blocks:
                    tool_name = tool_block.name
                    tool_input = tool_block.input
                    tool_id = tool_block.id
                    
                    logger.info(f"🔧 Executing tool: {tool_name} with {tool_input}")
                    
                    # Execute the tool (routes to internal or external)
                    result = await self._execute_tool(tool_name, tool_input)
                    
                    tool_calls.append({
                        "tool": tool_name,
                        "input": tool_input,
                        "result_preview": str(result)[:200] + "..." if len(str(result)) > 200 else str(result)
                    })
                    
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": tool_id,
                        "content": json.dumps(result)[:10000]  # Limit size
                    })
                
                # Add tool results to messages
                messages.append({
                    "role": "user",
                    "content": tool_results
                })
                
                # Continue conversation with tool results
                response = self.client.messages.create(
                    model=self.sonnet_model,
                    max_tokens=4096,
                    temperature=0.3,
                    system=self._get_system_prompt(),
                    tools=tools,
                    messages=messages
                )
            
            # Extract final answer
            answer = ""
            for block in response.content:
                if hasattr(block, 'text'):
                    answer += block.text
            
            return {
                "answer": answer,
                "timestamp": datetime.now().isoformat(),
                "model": self.sonnet_model,
                "tool_calls": tool_calls,
                "mcp_source": "dome_api"
            }
            
        except Exception as e:
            logger.error(f"Claude MCP error: {str(e)}")
            # Fall back to simple chat
            result = await self.chat(user_message, chat_history, context_type)
            result["error_info"] = str(e)
            return result
    
    async def stream_chat_with_mcp(
        self,
        user_message: str,
        chat_history: Optional[List[Dict[str, str]]] = None,
        context_type: str = "predictions"
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Stream chat response with MCP tool calling
        
        Yields events as they happen:
        - {"type": "thinking", "content": "..."}
        - {"type": "tool_call", "tool": "...", "input": {...}}
        - {"type": "tool_result", "tool": "...", "result_preview": "..."}
        - {"type": "token", "content": "..."}
        - {"type": "done", "content": "full response"}
        """
        if not self.client:
            yield {"type": "error", "content": "Claude service not configured"}
            return
        
        try:
            messages = []
            if chat_history:
                for msg in chat_history[-10:]:
                    messages.append({
                        "role": msg.get("role", "user"),
                        "content": msg.get("content", "")
                    })
            
            messages.append({
                "role": "user",
                "content": user_message
            })
            
            tools = self._get_tools()
            
            yield {"type": "thinking", "content": "Analyzing your question and selecting tools..."}
            
            # Initial API call
            response = self.client.messages.create(
                model=self.sonnet_model,
                max_tokens=4096,
                temperature=0.3,
                system=self._get_system_prompt(),
                tools=tools,
                messages=messages
            )
            
            # Handle tool calls
            tool_iterations = 0
            max_iterations = 5
            
            while response.stop_reason == "tool_use" and tool_iterations < max_iterations:
                tool_iterations += 1
                
                tool_use_blocks = [
                    block for block in response.content 
                    if hasattr(block, 'type') and block.type == "tool_use"
                ]
                
                messages.append({
                    "role": "assistant",
                    "content": response.content
                })
                
                tool_results = []
                for tool_block in tool_use_blocks:
                    tool_name = tool_block.name
                    tool_input = tool_block.input
                    tool_id = tool_block.id
                    
                    # Determine tool source for UI display
                    internal_names = {"search_events", "get_market_overview", "get_event_detail",
                                     "get_top_markets", "get_category_breakdown", "compare_platforms"}
                    tool_source = "cache" if tool_name in internal_names else "api"
                    
                    yield {
                        "type": "tool_call",
                        "tool": tool_name,
                        "input": tool_input,
                        "source": tool_source,
                    }
                    
                    result = await self._execute_tool(tool_name, tool_input)
                    
                    yield {
                        "type": "tool_result",
                        "tool": tool_name,
                        "source": tool_source,
                        "result_preview": str(result)[:300] + "..." if len(str(result)) > 300 else str(result)
                    }
                    
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": tool_id,
                        "content": json.dumps(result)[:10000]
                    })
                
                messages.append({
                    "role": "user",
                    "content": tool_results
                })
                
                yield {"type": "thinking", "content": "Analyzing data and composing response..."}
                
                response = self.client.messages.create(
                    model=self.sonnet_model,
                    max_tokens=4096,
                    temperature=0.3,
                    system=self._get_system_prompt(),
                    tools=tools,
                    messages=messages
                )
            
            # Extract and stream final answer
            full_answer = ""
            for block in response.content:
                if hasattr(block, 'text'):
                    text = block.text
                    full_answer += text
                    
                    # Stream by lines to preserve markdown table structure
                    lines = text.split('\n')
                    for i, line in enumerate(lines):
                        content = line + '\n' if i < len(lines) - 1 else line
                        yield {"type": "token", "content": content}
            
            yield {"type": "done", "content": full_answer}
            
        except Exception as e:
            logger.error(f"Stream error: {str(e)}")
            yield {"type": "error", "content": str(e)}


# Global instance
claude_service = ClaudeService()
