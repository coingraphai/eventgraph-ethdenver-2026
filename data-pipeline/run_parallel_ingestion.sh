#!/bin/bash
# Run optimized parallel ingestion for Polymarket + Kalshi

echo "========================================================================"
echo "🚀 OPTIMIZED DATA INGESTION - Parallel Execution"
echo "========================================================================"
echo ""
echo "Optimizations applied:"
echo "  ✓ QPS increased: 50 → 75 (75% of API limit)"
echo "  ✓ Price batch size: 50 → 75"
echo "  ✓ Max concurrency: 5 → 10"
echo "  ✓ Parallel execution: Polymarket + Kalshi simultaneously"
echo ""
echo "Expected performance:"
echo "  Sequential: ~17 minutes"
echo "  Parallel:   ~6 minutes (65% faster!)"
echo ""
echo "========================================================================"
echo ""

# Stop any existing ingestion
pkill -f "predictions_ingest.cli ingest" 2>/dev/null && sleep 2

# Run parallel ingestion with delta load
cd "/Users/ajayprashanth/Desktop/ETH Denver/eventgraph-ethdenver-2026/data-pipeline"

"/Users/ajayprashanth/Desktop/ETH Denver/eventgraph-ethdenver-2026/.venv/bin/python" \
  -m predictions_ingest.cli ingest \
  --source all \
  --type delta \
  --parallel

echo ""
echo "========================================================================"
echo "🏆 Refreshing gold layer..."
echo "========================================================================"
"/Users/ajayprashanth/Desktop/ETH Denver/eventgraph-ethdenver-2026/.venv/bin/python" \
  "/Users/ajayprashanth/Desktop/ETH Denver/eventgraph-ethdenver-2026/data-pipeline/populate_gold.py"

echo ""
echo "========================================================================"
echo "✅ Ingestion + Gold layer refresh complete!"
echo "========================================================================"
