#!/bin/bash
# EventGraph - View Logs
# Usage: ./logs.sh [backend|frontend|all]

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

SERVICE=${1:-all}

case $SERVICE in
    backend)
        echo "📝 Viewing Backend logs (Ctrl+C to exit)..."
        tail -f logs/backend.log
        ;;
    frontend)
        echo "📝 Viewing Frontend logs (Ctrl+C to exit)..."
        tail -f logs/frontend.log
        ;;
    all|*)
        echo "📝 Viewing all logs (Ctrl+C to exit)..."
        tail -f logs/backend.log logs/frontend.log
        ;;
esac
