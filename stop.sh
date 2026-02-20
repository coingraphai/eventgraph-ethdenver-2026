#!/bin/bash
# EventGraph - Stop All Services
# Usage: ./stop.sh

set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

echo "🛑 Stopping EventGraph Application..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Stop Data Pipeline Scheduler
if [ -f "logs/pipeline.pid" ]; then
    PIPELINE_PID=$(cat logs/pipeline.pid)
    if ps -p $PIPELINE_PID > /dev/null 2>&1; then
        echo -e "${YELLOW}Stopping Pipeline Scheduler (PID: $PIPELINE_PID)...${NC}"
        kill $PIPELINE_PID 2>/dev/null || true
        sleep 1
        kill -9 $PIPELINE_PID 2>/dev/null || true
        echo -e "${GREEN}✓ Pipeline stopped${NC}"
    else
        echo -e "${YELLOW}Pipeline not running${NC}"
    fi
    rm -f logs/pipeline.pid
fi
pkill -f "predictions_ingest.cli schedule" 2>/dev/null || true

# Stop Backend
if [ -f "logs/backend.pid" ]; then
    BACKEND_PID=$(cat logs/backend.pid)
    if ps -p $BACKEND_PID > /dev/null 2>&1; then
        echo -e "${YELLOW}Stopping Backend (PID: $BACKEND_PID)...${NC}"
        kill $BACKEND_PID 2>/dev/null || true
        sleep 2
        # Force kill if still running
        if ps -p $BACKEND_PID > /dev/null 2>&1; then
            kill -9 $BACKEND_PID 2>/dev/null || true
        fi
        echo -e "${GREEN}✓ Backend stopped${NC}"
    else
        echo -e "${YELLOW}Backend not running${NC}"
    fi
    rm -f logs/backend.pid
else
    echo -e "${YELLOW}No backend PID file found${NC}"
fi

# Stop Frontend
if [ -f "logs/frontend.pid" ]; then
    FRONTEND_PID=$(cat logs/frontend.pid)
    if ps -p $FRONTEND_PID > /dev/null 2>&1; then
        echo -e "${YELLOW}Stopping Frontend (PID: $FRONTEND_PID)...${NC}"
        kill $FRONTEND_PID 2>/dev/null || true
        sleep 2
        # Force kill if still running
        if ps -p $FRONTEND_PID > /dev/null 2>&1; then
            kill -9 $FRONTEND_PID 2>/dev/null || true
        fi
        echo -e "${GREEN}✓ Frontend stopped${NC}"
    else
        echo -e "${YELLOW}Frontend not running${NC}"
    fi
    rm -f logs/frontend.pid
else
    echo -e "${YELLOW}No frontend PID file found${NC}"
fi

# Kill any remaining processes on the ports
echo ""
echo -e "${YELLOW}Checking for processes on ports 8001 and 5173...${NC}"
lsof -ti:8001 | xargs kill -9 2>/dev/null || true
lsof -ti:5173 | xargs kill -9 2>/dev/null || true

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✨ All services stopped${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
