#!/bin/bash
# EventGraph - Check Service Status
# Usage: ./status.sh

set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}   EventGraph - Service Status${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Check Backend
echo -e "${BLUE}Backend API (Port 8001):${NC}"
if [ -f "logs/backend.pid" ]; then
    BACKEND_PID=$(cat logs/backend.pid)
    if ps -p $BACKEND_PID > /dev/null 2>&1; then
        echo -e "  ${GREEN}✓ Running${NC} (PID: $BACKEND_PID)"
        if curl -s http://localhost:8001/health > /dev/null 2>&1; then
            echo -e "  ${GREEN}✓ Health check passed${NC}"
        else
            echo -e "  ${YELLOW}⚠ Process running but health check failed${NC}"
        fi
    else
        echo -e "  ${RED}✗ Not running${NC} (stale PID file)"
    fi
else
    if lsof -ti:8001 > /dev/null 2>&1; then
        echo -e "  ${YELLOW}⚠ Port in use but no PID file${NC}"
    else
        echo -e "  ${RED}✗ Not running${NC}"
    fi
fi

echo ""

# Check Frontend
echo -e "${BLUE}Frontend (Port 5173/5174):${NC}"
if [ -f "logs/frontend.pid" ]; then
    FRONTEND_PID=$(cat logs/frontend.pid)
    if ps -p $FRONTEND_PID > /dev/null 2>&1; then
        echo -e "  ${GREEN}✓ Running${NC} (PID: $FRONTEND_PID)"
        # Check both ports
        if curl -s http://localhost:5173 > /dev/null 2>&1; then
            echo -e "  ${GREEN}✓ Responding on port 5173${NC}"
        elif curl -s http://localhost:5174 > /dev/null 2>&1; then
            echo -e "  ${GREEN}✓ Responding on port 5174${NC}"
        else
            echo -e "  ${YELLOW}⚠ Process running but not responding${NC}"
        fi
    else
        echo -e "  ${RED}✗ Not running${NC} (stale PID file)"
    fi
else
    if lsof -ti:5173 > /dev/null 2>&1; then
        echo -e "  ${YELLOW}⚠ Port 5173 in use but no PID file${NC}"
    elif lsof -ti:5174 > /dev/null 2>&1; then
        echo -e "  ${YELLOW}⚠ Port 5174 in use but no PID file${NC}"
    else
        echo -e "  ${RED}✗ Not running${NC}"
    fi
fi

echo ""

# Check Database
echo -e "${BLUE}Database:${NC}"
echo -e "  ${GREEN}✓ Using DigitalOcean PostgreSQL${NC}"
echo -e "  Host: ***REDACTED_DB_HOST***"

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${BLUE}Quick Actions:${NC}"
echo -e "  Start:  ./start.sh"
echo -e "  Stop:   ./stop.sh"
echo -e "  Logs:   tail -f logs/backend.log"
echo -e "          tail -f logs/frontend.log"
echo ""
