"""
Simplified Chat API with Claude + MCP
No database, no payments, no rate limits - just AI chat with prediction market tools
"""
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from typing import Optional
from datetime import datetime
import logging
import json
import asyncio

from pydantic import BaseModel
from app.services.claude_service import claude_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat/v2-stream", tags=["chat"])


class ChatRequest(BaseModel):
    """Chat request - simplified"""
    message: str
    session_id: Optional[int] = None
    user_id: Optional[str] = None
    wallet_address: Optional[str] = None
    anonymous_session_id: Optional[str] = None
    chart_mode: bool = False
    deeper_research: Optional[bool] = False
    use_mcp: Optional[bool] = True  # Enable MCP tools by default


# In-memory session storage
_sessions = {}
_session_counter = 0


@router.post("/stream")
async def chat_stream(request: ChatRequest):
    """
    Stream chat response using Claude + MCP
    Uses prediction market tools via MCP for real-time data
    """
    global _session_counter
    
    async def generate_stream():
        try:
            # Create or get session
            session_id = request.session_id
            if not session_id:
                _session_counter += 1
                session_id = _session_counter
                _sessions[session_id] = {
                    "id": session_id,
                    "messages": [],
                    "created_at": datetime.now().isoformat()
                }
            
            # Send session ID
            yield f"data: {json.dumps({'type': 'session_id', 'session_id': session_id})}\n\n"
            
            # Get conversation history
            session = _sessions.get(session_id, {"messages": []})
            conversation_history = session.get("messages", [])[-10:]
            
            logger.info(f"Processing with MCP: {request.message[:100]}...")
            
            try:
                # Use MCP streaming for real-time tool calls and responses
                ai_content = ""
                async for event in claude_service.stream_chat_with_mcp(
                    user_message=request.message,
                    chat_history=conversation_history,
                    context_type="predictions"
                ):
                    event_type = event.get("type")
                    
                    if event_type == "thinking":
                        yield f"data: {json.dumps({'type': 'thinking', 'content': event.get('content')})}\n\n"
                    
                    elif event_type == "tool_call":
                        yield f"data: {json.dumps({'type': 'tool_call', 'tool': event.get('tool'), 'input': event.get('input')})}\n\n"
                    
                    elif event_type == "tool_result":
                        yield f"data: {json.dumps({'type': 'tool_result', 'tool': event.get('tool'), 'preview': event.get('result_preview')})}\n\n"
                    
                    elif event_type == "token":
                        yield f"data: {json.dumps({'type': 'token', 'content': event.get('content')})}\n\n"
                        await asyncio.sleep(0.01)  # Slight delay for smooth streaming
                    
                    elif event_type == "done":
                        ai_content = event.get("content", "")
                    
                    elif event_type == "error":
                        yield f"data: {json.dumps({'type': 'error', 'message': event.get('content')})}\n\n"
                        return
                
                # Save to session history
                if session_id in _sessions and ai_content:
                    _sessions[session_id]["messages"].append({"role": "user", "content": request.message})
                    _sessions[session_id]["messages"].append({"role": "assistant", "content": ai_content})
                
                # Send done
                yield f"data: {json.dumps({'type': 'done', 'session_id': session_id})}\n\n"
                
            except Exception as e:
                logger.error(f"Claude MCP error: {e}")
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


# Also provide non-streaming endpoint for backwards compatibility
@router.post("/")
async def chat_simple(request: ChatRequest):
    """Non-streaming chat endpoint with MCP tools"""
    global _session_counter
    
    session_id = request.session_id
    if not session_id:
        _session_counter += 1
        session_id = _session_counter
        _sessions[session_id] = {"id": session_id, "messages": [], "created_at": datetime.now().isoformat()}
    
    session = _sessions.get(session_id, {"messages": []})
    conversation_history = session.get("messages", [])[-10:]
    
    try:
        # Use MCP for prediction market queries
        response = await claude_service.chat_with_mcp(
            user_message=request.message,
            chat_history=conversation_history,
            show_reasoning=True,
            context_type="predictions"
        )
        
        ai_content = response.get("answer", "I'm sorry, I couldn't process your request.")
        tool_calls = response.get("tool_calls", [])
        
        # Save to session
        if session_id in _sessions:
            _sessions[session_id]["messages"].append({"role": "user", "content": request.message})
            _sessions[session_id]["messages"].append({"role": "assistant", "content": ai_content})
        
        return {
            "message": ai_content,
            "session_id": session_id,
            "timestamp": datetime.now().isoformat(),
            "tool_calls": tool_calls,
            "mcp_source": response.get("mcp_source")
        }
        
    except Exception as e:
        logger.error(f"Chat error: {e}")
        return {
            "message": f"Error: {str(e)}",
            "session_id": session_id,
            "timestamp": datetime.now().isoformat()
        }
