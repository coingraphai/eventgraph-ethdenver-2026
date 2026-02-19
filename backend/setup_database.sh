#!/bin/bash

# Database Integration Setup Script
# Run from backend directory: bash setup_database.sh

echo "🚀 CoinGraph AI - Database Integration Setup"
echo "=============================================="
echo ""

# Check if we're in the backend directory
if [ ! -f "main.py" ]; then
    echo "❌ Error: Please run this script from the backend directory"
    echo "   cd backend && bash setup_database.sh"
    exit 1
fi

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "📦 Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
echo "🔧 Activating virtual environment..."
source venv/bin/activate

# Install dependencies
echo "📥 Installing database dependencies..."
pip install sqlalchemy psycopg2-binary alembic --quiet

# Install all requirements
echo "📥 Installing all requirements..."
pip install -r requirements.txt --quiet

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "📝 Creating .env file from .env.example..."
    cp .env.example .env
    echo ""
    echo "⚠️  IMPORTANT: Please update .env with your DATABASE_URL password!"
    echo "   Edit: backend/.env"
    echo "   Replace: YOUR_PASSWORD with actual DigitalOcean password"
    echo ""
fi

# Test imports
echo "🧪 Testing imports..."
python3 << EOF
try:
    import sqlalchemy
    print("✅ SQLAlchemy imported successfully")
except ImportError as e:
    print(f"❌ SQLAlchemy import failed: {e}")
    exit(1)

try:
    import psycopg2
    print("✅ psycopg2 imported successfully")
except ImportError as e:
    print(f"❌ psycopg2 import failed: {e}")
    exit(1)

try:
    from app.database.session import init_db, test_connection
    print("✅ Database session module loaded")
except ImportError as e:
    print(f"❌ Database session import failed: {e}")
    exit(1)

try:
    from app.models.gold_layer import MarketMetricsSummary
    print("✅ Database models loaded")
except ImportError as e:
    print(f"❌ Database models import failed: {e}")
    exit(1)

print("✅ All imports successful!")
EOF

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Setup complete!"
    echo ""
    echo "📋 Next steps:"
    echo "   1. Update .env with DATABASE_URL password"
    echo "   2. Start the server: uvicorn main:app --reload"
    echo "   3. Test endpoints: curl http://localhost:8001/api/dashboard/market-metrics"
    echo ""
    echo "📚 Read DATABASE_INTEGRATION_GUIDE.md for more details"
else
    echo ""
    echo "❌ Setup failed - check errors above"
    exit 1
fi
