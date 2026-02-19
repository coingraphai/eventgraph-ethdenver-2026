#!/bin/bash
pkill -f "main.py" 2>/dev/null
pkill -f "uvicorn" 2>/dev/null
sleep 1
VENV="/Users/ajayprashanth/Desktop/ETH Denver/eventgraph-ethdenver-2026/.venv/bin/python"
BACKEND="/Users/ajayprashanth/Desktop/ETH Denver/eventgraph-ethdenver-2026/backend"
cd "$BACKEND"
"$VENV" main.py > /tmp/backend.log 2>&1 &
echo "Backend PID: $!"
sleep 4
curl -s http://localhost:8000/health && echo "" || echo "Not up yet, check /tmp/backend.log"
