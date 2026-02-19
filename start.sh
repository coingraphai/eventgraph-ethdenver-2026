#!/bin/bash
# EventGraph - Start All Services
# Usage: ./start.sh

set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

echo "🚀 Starting EventGraph Application..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if PostgreSQL is running (using cloud database, so skip local check)
echo -e "${BLUE}📊 Database:${NC} Using DigitalOcean PostgreSQL"

# Start Backend
echo ""
echo -e "${BLUE}1️⃣  Starting Backend API...${NC}"
cd "$ROOT_DIR/backend"
source "$ROOT_DIR/.venv/bin/activate"
nohup python main.py > ../logs/backend.log 2>&1 &
BACKEND_PID=$!
echo $BACKEND_PID > ../logs/backend.pid
echo -e "${GREEN}   ✓ Backend started (PID: $BACKEND_PID)${NC}"
echo -e "   📝 Logs: logs/backend.log"
echo -e "   🌐 URL: http://localhost:8001"

# Wait for backend to start
echo -e "${YELLOW}   ⏳ Waiting for backend to be ready...${NC}"
sleep 5

# Start Frontend
echo ""
echo -e "${BLUE}2️⃣  Starting Frontend...${NC}"
cd "$ROOT_DIR/frontend"
nohup npm run dev > ../logs/frontend.log 2>&1 &
FRONTEND_PID=$!
echo $FRONTEND_PID > ../logs/frontend.pid
echo -e "${GREEN}   ✓ Frontend started (PID: $FRONTEND_PID)${NC}"
echo -e "   📝 Logs: logs/frontend.log"
echo -e "   🌐 URL: http://localhost:5173"

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✨ All services started successfully!${NC}"
echo ""
echo -e "📱 ${BLUE}Frontend:${NC} http://localhost:5173"
echo -e "🔌 ${BLUE}Backend API:${NC} http://localhost:8001"
echo -e "📚 ${BLUE}API Docs:${NC} http://localhost:8001/docs"
echo ""
echo -e "📝 View logs:"
echo -e "   Backend:  tail -f logs/backend.log"
echo -e "   Frontend: tail -f logs/frontend.log"
echo ""
echo -e "🛑 Stop services: ./stop.sh"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
