#!/bin/bash
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"; mkdir -p logs
GREEN='\033[0;32m'; BLUE='\033[0;34m'; YELLOW='\033[1;33m'; NC='\033[0m'
PYTHON="$ROOT_DIR/.venv/bin/python"
echo -e "${BLUE}Stopping any existing services...${NC}"
lsof -ti:8001 2>/dev/null | xargs kill -9 2>/dev/null || true
lsof -ti:5173 2>/dev/null | xargs kill -9 2>/dev/null || true
sleep 1
echo -e "${BLUE}Starting Backend (port 8001)...${NC}"
cd "$ROOT_DIR/backend"
nohup "$PYTHON" -m uvicorn main:app --host 0.0.0.0 --port 8001 > "$ROOT_DIR/logs/backend.log" 2>&1 &
echo $! > "$ROOT_DIR/logs/backend.pid"
sleep 5
echo -e "${GREEN}Backend started (PID: $(cat "$ROOT_DIR/logs/backend.pid"))${NC}"
echo -e "${BLUE}Starting Frontend (port 5173)...${NC}"
cd "$ROOT_DIR/frontend"
nohup node_modules/.bin/vite --host 0.0.0.0 --port 5173 > "$ROOT_DIR/logs/frontend.log" 2>&1 &
echo $! > "$ROOT_DIR/logs/frontend.pid"
sleep 4
echo -e "${GREEN}Frontend started (PID: $(cat "$ROOT_DIR/logs/frontend.pid"))${NC}"
echo ""
echo -e "${GREEN}EventGraph running:${NC}"
echo "  Frontend: http://localhost:5173"
echo "  Backend:  http://localhost:8001"
echo "  Stop:     ./stop.sh"
