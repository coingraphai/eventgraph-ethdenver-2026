"""
Simplified Predictions API with Claude + MCP
Uses streaming with real-time tool call events
"""
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from typing import Optional
from datetime import datetime
import logging
import json
import asyncio

from pydantic import BaseModel
from app.services.claude_service import claude_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/predictions", tags=["predictions"])


class PredictionRequest(BaseModel):
    """Prediction request - simplified"""
    message: str
    session_id: Optional[int] = None
    wallet_address: Optional[str] = None
    anonymous_session_id: Optional[str] = None


# In-memory session storage for predictions
_prediction_sessions = {}
_session_counter = [0]


def get_next_session_id():
    """Get next session ID"""
    _session_counter[0] += 1
    return _session_counter[0]


@router.post("/chat/stream")
async def prediction_stream(request: PredictionRequest):
    """
    Stream prediction market response using Claude + MCP tools
    Now streams tool calls in real-time for UI indicators
    """
    
    async def generate_stream():
        try:
            session_id = request.session_id
            if not session_id:
                session_id = get_next_session_id()
                _prediction_sessions[session_id] = {
                    "id": session_id, 
                    "messages": [], 
                    "created_at": datetime.now().isoformat()
                }
            
            yield f"data: {json.dumps({'type': 'session_id', 'session_id': session_id})}\n\n"
            
            session = _prediction_sessions.get(session_id, {"messages": []})
            conversation_history = session.get("messages", [])[-10:]
            
            logger.info(f"Prediction query: {request.message[:100]}...")
            
            try:
                # Use streaming MCP for real-time tool call events
                full_content = ""
                async for event in claude_service.stream_chat_with_mcp(
                    user_message=request.message,
                    chat_history=conversation_history,
                    context_type="predictions"
                ):
                    event_type = event.get("type")
                    
                    if event_type == "thinking":
                        yield f"data: {json.dumps({'type': 'thinking', 'content': event.get('content', '')})}\n\n"
                    
                    elif event_type == "tool_call":
                        yield f"data: {json.dumps({'type': 'tool_call', 'tool': event.get('tool'), 'input': event.get('input', {}), 'source': event.get('source', 'api')})}\n\n"
                    
                    elif event_type == "tool_result":
                        yield f"data: {json.dumps({'type': 'tool_result', 'tool': event.get('tool'), 'source': event.get('source', 'api')})}\n\n"
                    
                    elif event_type == "token":
                        content = event.get("content", "")
                        full_content += content
                        yield f"data: {json.dumps({'type': 'token', 'content': content})}\n\n"
                        await asyncio.sleep(0.01)  # Slight delay for smooth streaming
                    
                    elif event_type == "done":
                        full_content = event.get("content", full_content)
                    
                    elif event_type == "error":
                        yield f"data: {json.dumps({'type': 'error', 'message': event.get('content', 'Unknown error')})}\n\n"
                
                # Save to session
                if session_id in _prediction_sessions:
                    _prediction_sessions[session_id]["messages"].append({
                        "role": "user", 
                        "content": request.message
                    })
                    _prediction_sessions[session_id]["messages"].append({
                        "role": "assistant", 
                        "content": full_content
                    })
                    # Auto-title from first user message
                    if not _prediction_sessions[session_id].get("title"):
                        title = request.message[:60]
                        if len(request.message) > 60:
                            title += "..."
                        _prediction_sessions[session_id]["title"] = title
                    _prediction_sessions[session_id]["updated_at"] = datetime.now().isoformat()
                
                yield f"data: {json.dumps({'type': 'done', 'session_id': session_id})}\n\n"
                
            except Exception as e:
                logger.error(f"Prediction error: {e}")
                yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
                
        except Exception as e:
            logger.error(f"Stream error: {e}")
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
    
    return StreamingResponse(
        generate_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache", 
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


@router.post("/chat")
async def prediction_simple(request: PredictionRequest):
    """Simple non-streaming prediction endpoint"""
    
    session_id = request.session_id
    if not session_id:
        session_id = get_next_session_id()
        _prediction_sessions[session_id] = {
            "id": session_id, 
            "messages": [], 
            "created_at": datetime.now().isoformat()
        }
    
    session = _prediction_sessions.get(session_id, {"messages": []})
    conversation_history = session.get("messages", [])[-10:]
    
    try:
        response = await claude_service.chat_with_mcp(
            user_message=request.message,
            chat_history=conversation_history,
            context_type="predictions"
        )
        
        ai_content = response.get("answer", "I couldn't find prediction market data.")
        tool_calls = response.get("tool_calls", [])
        
        if session_id in _prediction_sessions:
            _prediction_sessions[session_id]["messages"].append({
                "role": "user", 
                "content": request.message
            })
            _prediction_sessions[session_id]["messages"].append({
                "role": "assistant", 
                "content": ai_content
            })
        
        return {
            "message": ai_content,
            "session_id": session_id,
            "timestamp": datetime.now().isoformat(),
            "tool_calls": tool_calls
        }
        
    except Exception as e:
        logger.error(f"Prediction error: {e}")
        return {
            "message": f"Error: {str(e)}", 
            "session_id": session_id, 
            "timestamp": datetime.now().isoformat()
        }


@router.get("/markets")
async def get_markets(
    limit: int = 20, 
    platform: str = "polymarket",
):
    """Get prediction markets from database (migrated from Dome API)"""
    try:
        from sqlalchemy import text
        from app.database.session import get_db
        
        # Get a DB session
        db_gen = get_db()
        db = next(db_gen)
        
        try:
            result = db.execute(text("""
                SELECT 
                    id, source, source_market_id, question, category_name,
                    yes_price, volume_24h, liquidity, status, end_date, created_at_source
                FROM predictions_silver.markets
                WHERE source = :platform AND status = 'active'
                ORDER BY volume_24h DESC NULLS LAST
                LIMIT :limit
            """), {"platform": platform, "limit": limit})
            
            markets = [
                {
                    "id": str(m.id),
                    "platform": m.source,
                    "source_market_id": m.source_market_id,
                    "question": m.question,
                    "category": m.category_name,
                    "yes_price": float(m.yes_price or 0),
                    "volume_24h": float(m.volume_24h or 0),
                    "liquidity": float(m.liquidity or 0),
                    "status": m.status,
                    "end_date": m.end_date.isoformat() if m.end_date else None,
                    "created_at": m.created_at_source.isoformat() if m.created_at_source else None,
                }
                for m in result.fetchall()
            ]
            
            return {"markets": markets, "platform": platform, "count": len(markets)}
        finally:
            db.close()
        
    except Exception as e:
        logger.error(f"Error getting markets from database: {e}")
        return {"markets": [], "platform": platform, "error": str(e)}
