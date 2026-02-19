#!/bin/bash
# Start data pipeline ingestion (run once to populate database)
set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR/data-pipeline"

echo "🔄 Starting Data Pipeline Ingestion..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "This will fetch market data from all sources and populate the database."
echo "⏱️  Expected time: 5-10 minutes"
echo ""

source ../.venv/bin/activate

# Run full sync for all sources
python -m predictions_ingest.cli full-sync --source polymarket &
PID1=$!

python -m predictions_ingest.cli full-sync --source kalshi &
PID2=$!

python -m predictions_ingest.cli full-sync --source limitless &
PID3=$!

echo "Started ingestion for 3 sources (parallel)"
echo "  Polymarket: PID $PID1"
echo "  Kalshi: PID $PID2"
echo "  Limitless: PID $PID3"
echo ""
echo "📊 Monitor progress in logs/ directory"
echo "⏳ Wait for completion or check database for data..."

wait $PID1 $PID2 $PID3

echo ""
echo "✅ Data ingestion complete!"
echo "🔄 Restart backend to use new data: cd .. && ./stop.sh && ./start.sh"
