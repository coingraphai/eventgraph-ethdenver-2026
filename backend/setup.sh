#!/bin/bash

# CoinGraph AI Backend Setup Script
echo "🚀 CoinGraph AI Backend Setup"
echo "=============================="
echo ""

# Check if Python 3.12 is installed (Homebrew version preferred)
PYTHON_CMD=""
if command -v /opt/homebrew/bin/python3.12 &> /dev/null; then
    PYTHON_CMD="/opt/homebrew/bin/python3.12"
elif command -v python3.12 &> /dev/null; then
    PYTHON_CMD="python3.12"
elif command -v python3 &> /dev/null; then
    PYTHON_CMD="python3"
else
    echo "❌ Python 3.12 is not installed. Please install Python 3.12 first."
    echo "   Run: brew install python@3.12"
    exit 1
fi

PYTHON_VERSION=$($PYTHON_CMD --version)
echo "✅ Python found: $PYTHON_VERSION"
echo "   Using: $PYTHON_CMD"

# Verify Python version is 3.12 or compatible
PYTHON_MAJOR=$($PYTHON_CMD -c 'import sys; print(sys.version_info.major)')
PYTHON_MINOR=$($PYTHON_CMD -c 'import sys; print(sys.version_info.minor)')

if [ "$PYTHON_MAJOR" -eq 3 ] && [ "$PYTHON_MINOR" -lt 9 ]; then
    echo "❌ Python 3.9+ is required. Found: Python $PYTHON_MAJOR.$PYTHON_MINOR"
    echo "   Please install Python 3.12: brew install python@3.12"
    exit 1
elif [ "$PYTHON_MAJOR" -eq 3 ] && [ "$PYTHON_MINOR" -eq 14 ]; then
    echo "⚠️  Warning: Python 3.14 detected. This project is configured for Python 3.12"
    echo "   Recommended: brew install python@3.12"
fi
echo ""

# Check if PostgreSQL is installed
if ! command -v psql &> /dev/null; then
    echo "⚠️  PostgreSQL not found. Installing with Homebrew..."
    brew install postgresql@15
    brew services start postgresql@15
else
    echo "✅ PostgreSQL found: $(psql --version)"
fi
echo ""

# Create virtual environment if not exists
if [ ! -d "venv" ]; then
    echo "📦 Creating virtual environment with Python 3.12..."
    $PYTHON_CMD -m venv venv
    echo "✅ Virtual environment created"
else
    echo "✅ Virtual environment already exists"
    echo "   Checking Python version in venv..."
    VENV_PYTHON_VERSION=$(./venv/bin/python --version)
    echo "   venv Python: $VENV_PYTHON_VERSION"
fi
echo ""

# Activate virtual environment
echo "🔧 Activating virtual environment..."
source venv/bin/activate

# Install dependencies
echo "📥 Installing dependencies..."
pip install --upgrade pip
pip install -r requirements.txt
echo "✅ Dependencies installed"
echo ""

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "📝 Creating .env file from .env.example..."
    cp .env.example .env
    echo "✅ .env file created"
    echo ""
    echo "⚠️  IMPORTANT: Please update the following in .env file:"
    echo "   1. GROK_API_KEY - Get from https://console.x.ai/"
    echo "   2. DATABASE_URL - Update if using different PostgreSQL credentials"
    echo "   3. SECRET_KEY - Generate a secure key for production"
    echo ""
else
    echo "✅ .env file already exists"
fi
echo ""

# Create database
echo "🗄️  Setting up database..."
DB_NAME="coingraph"

# Check if database exists
if psql -U postgres -lqt | cut -d \| -f 1 | grep -qw $DB_NAME; then
    echo "✅ Database '$DB_NAME' already exists"
else
    echo "📝 Creating database '$DB_NAME'..."
    psql -U postgres -c "CREATE DATABASE $DB_NAME;"
    echo "✅ Database created"
fi
echo ""

# Check if Grok API key is set
if grep -q "xai-your-api-key-here" .env 2>/dev/null; then
    echo "⚠️  WARNING: Default GROK_API_KEY detected in .env"
    echo "   Please update GROK_API_KEY in .env file with your actual key"
    echo "   Get your key from: https://console.x.ai/"
    echo ""
fi

echo "✅ Setup complete!"
echo ""
echo "📚 Next steps:"
echo "   1. Update .env file with your GROK_API_KEY"
echo "   2. Run: python main.py"
echo "   3. Access API at: http://localhost:8001"
echo "   4. View docs at: http://localhost:8001/docs"
echo ""
echo "🔍 For more information, see CHATBOT_IMPLEMENTATION.md"
