#!/bin/bash
# Start the pipeline scheduler (single instance only)
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"
export PYTHONPATH="$SCRIPT_DIR"

# Kill any existing scheduler processes first
pkill -f "predictions_ingest.cli schedule" 2>/dev/null || true
sleep 1

# MUST use venv Python — system Python won't have our code fixes
VENV_PYTHON="$SCRIPT_DIR/../.venv/bin/python3"
if [ ! -f "$VENV_PYTHON" ]; then
    echo "ERROR: venv Python not found at $VENV_PYTHON"
    echo "Run: python3 -m venv ../.venv && pip install -r requirements.txt"
    exit 1
fi

# Clear bytecode caches to ensure fresh code
find "$SCRIPT_DIR" -name "*.pyc" -delete 2>/dev/null
find "$SCRIPT_DIR" -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null

echo "Starting scheduler..."
echo "Python: $VENV_PYTHON"
echo "Press Ctrl+C to stop"
echo ""
exec "$VENV_PYTHON" -m predictions_ingest.cli schedule
