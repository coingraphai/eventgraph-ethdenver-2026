# CoinGraph AI Chatbot - Quick Start

## Setup (5 minutes)

### 1. Get Grok API Key
Visit [https://console.x.ai/](https://console.x.ai/) and get your API key.

### 2. Run Setup Script
```bash
cd backend
./setup.sh
```

This will:
- Create virtual environment
- Install dependencies
- Create PostgreSQL database
- Create `.env` file

### 3. Add API Key
Edit `.env` file:
```bash
GROK_API_KEY=xai-your-actual-api-key-here
```

### 4. Start Server
```bash
python main.py
```

Server will run at: `http://localhost:8000`

### 5. Test API
```bash
# In another terminal
./test_chat.sh
```

## Quick Test with curl

```bash
# Send a message (creates session automatically)
curl -X POST http://localhost:8000/api/chat/ \
  -H "Content-Type: application/json" \
  -d '{"message": "What is Bitcoin?"}'

# Response:
# {
#   "message": "Bitcoin is a decentralized digital currency...",
#   "session_id": 1,
#   "timestamp": "2025-10-17T10:00:00Z"
# }
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/chat/` | Send message & get response |
| POST | `/api/chat/session` | Create new session |
| GET | `/api/chat/history/{id}` | Get chat history |
| GET | `/api/chat/sessions` | List all sessions |
| DELETE | `/api/chat/session/{id}` | Delete session |

## Interactive Docs

Once server is running:
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

## Features

✅ **Grok LLM Integration** - Powered by xAI's Grok  
✅ **Context Management** - Maintains last 5 conversations  
✅ **Session Management** - Multiple chat sessions per user  
✅ **Full History** - All messages stored in PostgreSQL  
✅ **RESTful API** - Clean, documented endpoints  
✅ **Error Handling** - Comprehensive error messages  
✅ **Logging** - Detailed logs for debugging  

## Project Structure

```
backend/
├── app/
│   ├── api/
│   │   └── chat.py           # Chat endpoints
│   ├── models/
│   │   └── chat.py           # Database models
│   ├── schemas/
│   │   └── chat.py           # Pydantic schemas
│   ├── services/
│   │   └── grok_service.py   # Grok LLM service
│   ├── database/
│   │   └── session.py        # Database session
│   └── config.py             # Configuration
├── main.py                   # FastAPI app
├── requirements.txt          # Dependencies
├── setup.sh                  # Setup script
├── test_chat.sh             # Test script
└── CHATBOT_IMPLEMENTATION.md # Full documentation
```

## Troubleshooting

**"ModuleNotFoundError: No module named 'app'"**
```bash
# Make sure you're in the backend directory
cd backend
python main.py
```

**"Failed to connect to database"**
```bash
# Check PostgreSQL is running
brew services start postgresql@15

# Create database
psql -U postgres -c "CREATE DATABASE coingraph;"
```

**"Failed to get response from Grok"**
- Check `GROK_API_KEY` is set in `.env`
- Verify API key is valid at https://console.x.ai/

## Next Steps

1. ✅ Add your Grok API key to `.env`
2. ✅ Start the server with `python main.py`
3. ✅ Test with `./test_chat.sh` or curl
4. 🔄 Integrate with frontend React app
5. 🔄 Add authentication (JWT)
6. 🔄 Deploy to production

For detailed documentation, see [CHATBOT_IMPLEMENTATION.md](./CHATBOT_IMPLEMENTATION.md)
