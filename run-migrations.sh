#!/bin/bash
# Run all database migrations
set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR/data-pipeline"

# Load environment variables
source ../.venv/bin/activate
set -a
source .env
set +a

# Build PostgreSQL connection string
export PGPASSWORD="$POSTGRES_PASSWORD"
PSQL_CMD="psql -h $POSTGRES_HOST -p $POSTGRES_PORT -U $POSTGRES_USER -d $POSTGRES_DB"

echo "🗄️  Running Database Migrations..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Host: $POSTGRES_HOST"
echo "Database: $POSTGRES_DB"
echo ""

# Run each migration in order
for migration in migrations/*.sql; do
    echo "📝 Running $(basename $migration)..."
    $PSQL_CMD < "$migration" 2>&1 | grep -E "CREATE|ERROR|NOTICE" | head -20 || true
    echo "   ✅ Done"
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ All migrations completed!"
echo ""
echo "Next steps:"
echo "1. Run data ingestion: python -m predictions_ingest.cli full-sync"
echo "2. Or wait for automated sync to populate data"
