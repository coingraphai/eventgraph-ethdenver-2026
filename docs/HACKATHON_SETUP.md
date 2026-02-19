# Hackathon Setup Guide - Event Graph ETH Denver 2026

## 🚀 Quick Start (10 Minutes)

This guide will get you up and running for the hackathon demo.

---

## Prerequisites

- ✅ Node.js 18+ and npm
- ✅ Python 3.12+
- ✅ PostgreSQL 15+ (or use Docker)
- ✅ Git

---

## Step 1: Clone & Setup

```bash
# Clone the repo
git clone https://github.com/yourusername/event-graph-ethdenver-2026.git
cd event-graph-ethdenver-2026
```

---

## Step 2: Backend Setup (5 minutes)

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Setup environment
cp .env.example .env

# Edit .env with your keys:
nano .env  # or use your favorite editor

# Required keys:
# - DOME_API_KEY (get from https://domeapi.io)
# - ANTHROPIC_API_KEY (get from https://console.anthropic.com)
# - DATABASE_URL (your PostgreSQL connection)

# Run migrations (if using database)
# alembic upgrade head

# Start backend
python main.py
```

Backend will run at: **http://localhost:8001**

Test it: http://localhost:8001/docs

---

## Step 3: Frontend Setup (3 minutes)

```bash
# Open new terminal
cd frontend

# Install dependencies
npm install

# Setup environment
cp .env.example .env

# Edit .env
nano .env

# Set:
# VITE_API_URL=http://localhost:8001

# Start frontend
npm run dev
```

Frontend will run at: **http://localhost:5173**

---

## Step 4: Verify Everything Works

### Check Backend
```bash
curl http://localhost:8001/health
# Should return: {"status": "healthy"}

# Test arbitrage API
curl http://localhost:8001/api/arbitrage?limit=10
# Should return opportunities
```

### Check Frontend
1. Open http://localhost:5173
2. You should see the dashboard
3. Navigate to "Arbitrage" tab
4. Should see opportunities loading

---

## Step 5: Optional - Smart Contracts (If Building Execution Features)

```bash
cd contracts

# Install dependencies
npm install

# Setup environment
cp .env.example .env

# Add your deployer private key
nano .env

# Compile contracts
npx hardhat compile

# Deploy to Base Sepolia (testnet)
npx hardhat run scripts/deploy.ts --network base-sepolia

# Save the deployed contract addresses to backend/.env:
# ARBITRAGE_VAULT_ADDRESS=0x...
# COPY_TRADING_CONTRACT_ADDRESS=0x...
```

---

## Step 6: Optional - Keeper Bot (If Building Automated Execution)

```bash
cd keeper-bot

# Install dependencies
pip install -r requirements.txt

# Setup environment
cp .env.example .env

# Edit with:
# - API_URL=http://localhost:8001
# - CONTRACT_ADDRESS=<your deployed vault>
# - KEEPER_PRIVATE_KEY=<keeper wallet key>

# Run keeper
python keeper.py
```

---

## 🎯 Features Available

After setup, you'll have access to:

### ✅ Core Features (Working Now)
- **Dashboard** - Overview of all platforms
- **Events** - Browse 500+ top markets
- **Arbitrage** - Cross-venue opportunities
- **Leaderboard** - Top traders
- **AI Chat** - Ask questions about markets
- **Event Analytics** - Deep dive into specific events

### 🆕 Features to Build (Hackathon)
- **Smart Contract Vault** - Automated execution
- **Copy Trading** - Follow top traders
- **Enhanced AI** - Execute via natural language
- **Portfolio Tracker** - Track positions

---

## 📊 Demo Mode

For presentations, enable demo mode for faster performance:

```bash
# In backend/.env
DEMO_MODE_ENABLED=true
DEMO_MODE_TOP_N=100
```

This limits to top 100 markets for instant loading during demos.

---

## 🐛 Troubleshooting

### Backend won't start
```bash
# Check Python version
python --version  # Should be 3.12+

# Check all dependencies installed
pip list

# Check .env file exists and has keys
cat .env
```

### Frontend won't start
```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install

# Check .env.example exists
ls -la | grep env
```

### Database connection errors
```bash
# If using local PostgreSQL, ensure it's running
pg_isready

# Or use Docker
docker run --name postgres -e POSTGRES_PASSWORD=password -p 5432:5432 -d postgres:15
```

### API returns no data
```bash
# Check your API keys are valid
curl -H "Authorization: Bearer $DOME_API_KEY" https://api.domeapi.io/v1/health

# Check backend logs
# You should see data loading messages
```

---

## 🎬 Ready to Demo!

Once everything is running:

1. Open http://localhost:5173
2. Navigate through tabs to show features
3. Use arbitrage page to show opportunities
4. Use AI chat to ask questions
5. Show leaderboard of top traders

---

## 📞 Need Help?

- Check the main [README.md](../README.md)
- Review [TOP_500_STRATEGY.md](TOP_500_STRATEGY.md) for performance details
- Check GitHub issues
- Ask in ETH Denver Discord

---

**Happy Hacking! 🦬**
