"""
Legacy Chat API - redirects to v2 stream
"""
from fastapi import APIRouter
from typing import Optional
from datetime import datetime
import logging

from pydantic import BaseModel
from app.services.claude_service import claude_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["chat"])


class ChatRequest(BaseModel):
    message: str
    session_id: Optional[int] = None
    user_id: Optional[str] = None
    wallet_address: Optional[str] = None
    anonymous_session_id: Optional[str] = None
    chart_mode: bool = False
    deeper_research: Optional[bool] = False


class ChatResponse(BaseModel):
    message: str
    session_id: int
    timestamp: str


# In-memory session storage
_sessions = {}
_session_counter = 0


@router.post("/", response_model=ChatResponse)
async def send_message(request: ChatRequest):
    """Simple chat endpoint"""
    global _session_counter
    
    session_id = request.session_id
    if not session_id:
        _session_counter += 1
        session_id = _session_counter
        _sessions[session_id] = {"id": session_id, "messages": []}
    
    session = _sessions.get(session_id, {"messages": []})
    conversation_history = session.get("messages", [])[-10:]
    
    try:
        response = await claude_service.chat(
            user_message=request.message,
            chat_history=conversation_history,
            context_type="general"
        )
        
        ai_content = response.get("answer", "I'm sorry, I couldn't process your request.")
        
        if session_id in _sessions:
            _sessions[session_id]["messages"].append({"role": "user", "content": request.message})
            _sessions[session_id]["messages"].append({"role": "assistant", "content": ai_content})
        
        return ChatResponse(
            message=ai_content,
            session_id=session_id,
            timestamp=datetime.now().isoformat()
        )
        
    except Exception as e:
        logger.error(f"Chat error: {e}")
        return ChatResponse(
            message=f"Error: {str(e)}",
            session_id=session_id,
            timestamp=datetime.now().isoformat()
        )


@router.post("/session")
async def create_session():
    """Create a new chat session"""
    global _session_counter
    _session_counter += 1
    session_id = _session_counter
    _sessions[session_id] = {"id": session_id, "messages": [], "created_at": datetime.now().isoformat()}
    return {"id": session_id, "created_at": datetime.now().isoformat()}


@router.get("/history/{session_id}")
async def get_history(session_id: int):
    """Get chat history for a session"""
    session = _sessions.get(session_id)
    if not session:
        return {"session_id": session_id, "messages": [], "total_messages": 0}
    
    return {
        "session_id": session_id,
        "messages": session.get("messages", []),
        "total_messages": len(session.get("messages", []))
    }


@router.get("/sessions")
async def list_sessions():
    """List all chat sessions"""
    return {
        "sessions": [
            {"id": sid, "created_at": s.get("created_at", ""), "message_count": len(s.get("messages", []))}
            for sid, s in _sessions.items()
        ]
    }

