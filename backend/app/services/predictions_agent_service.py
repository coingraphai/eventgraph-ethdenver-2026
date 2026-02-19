"""
Predictions Agent Service

Dedicated service for processing prediction market queries using Polymarket data.
Completely separate from the main crypto chat - handles only prediction markets.
"""

import json
import logging
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from app.services.polymarket_service import polymarket_service
from app.services.llm_client import get_llm_client, get_llm_model

logger = logging.getLogger(__name__)


class PredictionsAgentService:
    """
    Prediction Markets AI Agent
    
    Processes natural language queries about prediction markets:
    - Trending markets
    - Market search
    - Category filtering
    - Market analysis and insights
    
    Provides natural language responses with thought process transparency.
    """
    
    def __init__(self, db_session: Session):
        self.client = get_llm_client()
        self.model = get_llm_model()
        self.db_session = db_session
        logger.info("🎯 Predictions Agent Service initialized")
    
    def process_prediction_query(
        self,
        user_query: str,
        conversation_history: List[Dict[str, str]] = None,
        deeper_research: bool = False
    ) -> Dict[str, Any]:
        """
        Process prediction market query with chain-of-thought reasoning.
        
        Args:
            user_query: User's natural language question about predictions
            conversation_history: Previous conversation context
            deeper_research: Whether to provide more detailed analysis
        
        Returns:
            Dict with answer, thought_process, and market data
        """
        thought_process = []
        
        try:
            # ============================================================
            # STEP 1: Analyze prediction query
            # ============================================================
            thought_process.append({
                "step": 1,
                "name": "query_analysis",
                "description": "🧠 Analyzing your prediction market query",
                "status": "in_progress"
            })
            
            logger.info(f"📥 Processing prediction query: '{user_query}'")
            
            # Use Polymarket service to detect and execute query
            polymarket_result = polymarket_service.detect_and_execute_query(user_query)
            
            if not polymarket_result:
                thought_process[-1].update({
                    "status": "complete",
                    "description": "ℹ️ Query not identified as prediction market related"
                })
                
                # Provide helpful response
                return {
                    "answer": self._generate_helpful_response(user_query),
                    "thought_process": thought_process,
                    "data_source": "none",
                    "suggestion": "Try asking about trending predictions, specific markets, or categories like crypto, politics, or sports."
                }
            
            # Check for errors in Polymarket response
            if "error" in polymarket_result:
                thought_process[-1].update({
                    "status": "failed",
                    "error": polymarket_result["error"]
                })
                
                return {
                    "answer": f"❌ I encountered an error fetching prediction market data: {polymarket_result['error']}",
                    "thought_process": thought_process,
                    "data_source": "polymarket",
                    "error": polymarket_result["error"]
                }
            
            # Successfully detected prediction query
            query_type = polymarket_result.get("type", "unknown")
            markets_count = polymarket_result.get("count", 0)
            
            thought_process[-1].update({
                "status": "complete",
                "description": f"✅ Identified as {query_type} query"
            })
            
            # ============================================================
            # STEP 2: Fetch prediction market data
            # ============================================================
            thought_process.append({
                "step": 2,
                "name": "data_retrieval",
                "description": f"📊 Fetching {query_type} data from Polymarket",
                "status": "in_progress"
            })
            
            thought_process[-1].update({
                "status": "complete",
                "description": f"✅ Retrieved {markets_count} prediction markets",
                "data_source": "Polymarket Gamma API"
            })
            
            logger.info(f"✅ Retrieved {markets_count} markets")
            
            # ============================================================
            # STEP 3: Synthesize natural language answer
            # ============================================================
            thought_process.append({
                "step": 3,
                "name": "answer_synthesis",
                "description": "✨ Analyzing prediction data and preparing your answer",
                "status": "in_progress"
            })
            
            final_answer = self._synthesize_prediction_answer(
                user_query,
                polymarket_result,
                conversation_history,
                deeper_research
            )
            
            thought_process[-1]["status"] = "complete"
            
            logger.info("✅ Answer synthesis complete")
            
            # Return complete response
            return {
                "answer": final_answer,
                "thought_process": thought_process,
                "data_source": "polymarket",
                "data_retrieved": polymarket_result,
                "markets_count": markets_count,
                "query_type": query_type
            }
            
        except Exception as e:
            logger.error(f"❌ Error processing prediction query: {str(e)}", exc_info=True)
            
            # Add error to thought process
            if thought_process:
                thought_process[-1].update({
                    "status": "failed",
                    "error": str(e)
                })
            
            return {
                "answer": f"❌ I encountered an unexpected error: {str(e)}",
                "thought_process": thought_process,
                "error": str(e)
            }
    
    def _synthesize_prediction_answer(
        self,
        user_query: str,
        polymarket_data: Dict[str, Any],
        conversation_history: List[Dict[str, str]] = None,
        deeper_research: bool = False
    ) -> str:
        """
        Synthesize natural language answer from Polymarket data using LLM.
        
        Args:
            user_query: Original user query
            polymarket_data: Market data from Polymarket
            conversation_history: Previous conversation context
            deeper_research: Whether to provide detailed analysis
        
        Returns:
            Natural language answer string
        """
        
        # Prepare depth instructions
        depth_instruction = ""
        if deeper_research:
            depth_instruction = """

DEEPER RESEARCH MODE ACTIVATED:
- Provide comprehensive analysis (400-600 words)
- Explain market sentiment and what drives predictions
- Discuss probability interpretations and what they mean
- Compare different outcomes and their implications
- Provide historical context if relevant
- Explain market liquidity and volume significance
- Discuss potential biases or limitations
- Include educational insights about prediction markets"""
        
        # Format Polymarket data as JSON
        data_json = json.dumps(polymarket_data, indent=2, default=str)
        
        # Determine query type for context
        query_type = polymarket_data.get("type", "unknown")
        markets_count = polymarket_data.get("count", 0)
        
        # Build messages for LLM
        messages = self._build_messages(
            system_prompt=f"""You are CoinGraph AI's Prediction Markets Expert.

You have access to REAL-TIME prediction market data from Polymarket, the world's largest prediction market platform.

PREDICTION MARKETS EXPLAINED:
Prediction markets allow people to bet on future events. Prices represent market-determined probabilities:
- A price of $0.75 means the market believes there's a 75% chance of that outcome
- Higher volume = more confidence in the probability
- Liquidity = how easy it is to enter/exit positions

YOUR TASK:
Analyze the provided prediction market data and answer the user's question clearly and informatively.

{depth_instruction}

FORMATTING GUIDELINES (Use Markdown):
- **ALWAYS use markdown tables** for multiple markets (with | separators)
- **Bold** market questions and key probabilities
- Use *italics* for timestamps, volumes, and context
- Format probabilities clearly: 75% or 75.3%
- Format volumes: $1.2M, $450K
- Use headers (##) for sections in longer responses
- Include emojis: 🎯 (probabilities), 💰 (volume), 📊 (markets), 📈 (trending), 🔥 (hot markets)
- Use > blockquotes for data source attribution
- Use bullet points (-) for key insights

**Table Format for Markets:**
| Market | Yes | No | Volume | Liquidity |
|--------|-----|-----|---------|-----------|
| Will Bitcoin reach $100k in 2024? | 65% | 35% | $2.1M | $450K |

CONTENT GUIDELINES:
- Present markets in order of relevance or volume
- Explain what the probabilities mean in plain English
- Highlight significant markets or surprising odds
- Provide context about why markets might be priced certain ways
- Mention volume and liquidity when significant
- Be clear that these are market predictions, not certainties
- If markets are closed, mention the resolution

IMPORTANT DISCLAIMERS:
- These are market-determined probabilities, not expert predictions
- Prediction markets can be wrong
- High volume suggests more confidence but doesn't guarantee accuracy
- Markets reflect collective wisdom but also biases

DATA SOURCE: Polymarket Gamma API (Real-time)
QUERY TYPE: {query_type}
MARKETS FOUND: {markets_count}""",
            user_message=f"""User query: {user_query}

Prediction market data from Polymarket:
{data_json}

Please provide a clear, informative answer about these prediction markets. Explain what the probabilities mean and highlight any interesting patterns or insights.""",
            history=conversation_history
        )
        
        # Call LLM for synthesis
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=0.7,  # Balanced for informative but natural responses
                max_tokens=2000 if deeper_research else 1200
            )
            
            answer = response.choices[0].message.content
            
            # Add data source attribution if not already included
            if "> Data source:" not in answer and "> Source:" not in answer:
                answer += "\n\n> 📊 Data source: Polymarket (Real-time)"
            
            return answer
            
        except Exception as e:
            logger.error(f"❌ Error in LLM synthesis: {str(e)}")
            
            # Fallback: Simple formatting of market data
            return self._format_fallback_answer(polymarket_data)
    
    def _format_fallback_answer(self, polymarket_data: Dict[str, Any]) -> str:
        """
        Fallback method to format market data if LLM fails.
        Simple markdown formatting without AI synthesis.
        """
        try:
            markets = polymarket_data.get("data", [])
            query_type = polymarket_data.get("type", "markets")
            
            if not markets:
                return "No prediction markets found matching your query."
            
            answer = f"## Prediction Markets\n\n"
            answer += f"Found {len(markets)} {query_type.replace('_', ' ')}:\n\n"
            
            for i, market in enumerate(markets[:10], 1):  # Limit to top 10
                question = market.get("question", "Unknown market")
                outcomes = market.get("outcomes", [])
                volume = market.get("volume", 0) or market.get("volume24hr", 0)
                
                answer += f"### {i}. {question}\n"
                
                if outcomes:
                    for outcome in outcomes:
                        name = outcome.get("name", "Unknown")
                        price = outcome.get("price", 0)
                        probability = float(price) * 100 if price else 0
                        answer += f"- **{name}**: {probability:.1f}%\n"
                
                if volume:
                    answer += f"- 💰 Volume: ${float(volume):,.0f}\n"
                
                answer += "\n"
            
            answer += "> 📊 Data source: Polymarket (Real-time)\n"
            
            return answer
            
        except Exception as e:
            logger.error(f"❌ Error in fallback formatting: {str(e)}")
            return f"Error formatting prediction market data: {str(e)}"
    
    def _generate_helpful_response(self, user_query: str) -> str:
        """
        Generate a helpful response when query is not prediction-related.
        """
        return f"""I'm your Prediction Markets assistant! I can help you explore prediction markets on Polymarket.

Try asking me about:
- 🔥 **Trending predictions**: "What are the trending prediction markets?"
- 🔍 **Search markets**: "Show me predictions about Bitcoin" or "Election predictions"
- 🏷️ **Categories**: "Crypto prediction markets" or "Sports betting markets"
- 📊 **General**: "What are people predicting about [topic]?"

Your query: "{user_query}" doesn't seem to be about prediction markets. Would you like to explore some trending markets instead?"""
    
    def _build_messages(
        self,
        system_prompt: str,
        user_message: str,
        history: List[Dict[str, str]] = None
    ) -> List[Dict[str, str]]:
        """
        Build messages array for LLM API call with conversation history.
        
        Args:
            system_prompt: System instructions
            user_message: Current user message
            history: Previous conversation (last 6 messages used)
        
        Returns:
            List of message dicts
        """
        
        messages = [{"role": "system", "content": system_prompt}]
        
        # Include recent conversation history for context
        if history:
            for msg in history[-6:]:  # Last 3 exchanges (6 messages)
                messages.append({
                    "role": msg["role"],
                    "content": msg["content"]
                })
        
        # Add current user message
        messages.append({"role": "user", "content": user_message})
        
        return messages


# This will be imported and used by prediction endpoints
# Note: db_session will be provided by the endpoint
