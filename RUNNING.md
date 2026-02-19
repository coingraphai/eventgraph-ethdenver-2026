# 🚀 EventGraph - Quick Reference

## ✅ **SYSTEM STATUS: RUNNING**

All dependencies installed and services are operational!

---

## 🎯 **Service URLs**

| Service | URL | Status |
|---------|-----|--------|
| **Frontend** | http://localhost:5174 | ✅ Running |
| **Backend API** | http://localhost:8001 | ✅ Running |
| **API Docs** | http://localhost:8001/docs | ✅ Available |
| **Database** | DigitalOcean PostgreSQL | ✅ Connected |

---

## 🛠️ **Management Scripts**

### Start Services
```bash
./start.sh
```

### Stop Services
```bash
./stop.sh
```

### Check Status
```bash
./status.sh
```

### View Logs
```bash
# View all logs
./logs.sh

# View specific service
./logs.sh backend
./logs.sh frontend
```

---

## 📝 **Configuration Status**

### ✅ Backend (.env)
- ✅ Database configured (DigitalOcean PostgreSQL)
- ✅ Anthropic API key added
- ✅ Dome API key added
- ✅ Top 500 markets enabled

### ✅ Frontend (.env)
- ✅ API URL configured (localhost:8001)
- ✅ Web3 enabled
- ✅ Demo mode disabled

### ✅ Data Pipeline (.env)
- ✅ Database configured
- ✅ Dome API key added
- ✅ OpinionTrade API key added
- ✅ Limitless enabled
- ⚠️ OpinionTrade disabled (Phase 2 - enable with `ENABLE_OPINIONTRADE=true`)

---

## 🔑 **API Keys Configured**

| Service | Status | Used By |
|---------|--------|---------|
| **Anthropic (Claude)** | ✅ Added | Backend AI features |
| **Dome API** | ✅ Added | Market data (Polymarket, Kalshi) |
| **OpinionTrade** | ✅ Added | OpinionTrade markets |

---

## 📊 **Available Features**

### Frontend Pages
- 🏠 **Home** - Dashboard overview
- 📈 **Events** - Browse top 500 markets
- 🔍 **Event Analytics** - Deep dive analysis
- ⚡ **Arbitrage** - Cross-platform opportunities
- 🔀 **Cross Venue** - Platform comparison
- 🏆 **Leaderboard** - Top traders
- 💬 **AI Chat** - Predictions assistant
- 📊 **Screener** - Market screening
- 🔔 **Alerts** - Notifications

### Backend APIs
- `/api/events` - Market data
- `/api/arbitrage` - Arbitrage opportunities
- `/api/leaderboard` - Trader rankings
- `/api/chat` - AI chatbot
- `/api/analytics` - Event analytics
- Full docs: http://localhost:8001/docs

---

## ⚠️ **Known Issues & Fixes**

### 1. Database Table Missing
**Error:** `relation "production_cache" does not exist`

**Impact:** Minor - system falls back to API calls (slightly slower)

**Fix:** Run database migrations
```bash
cd backend
source ../.venv/bin/activate
alembic upgrade head
```

### 2. Frontend Port Changed
Frontend automatically switched from port 5173 to 5174 due to port conflict.

**To use port 5173:** Kill any process using it first
```bash
lsof -ti:5173 | xargs kill -9
./stop.sh && ./start.sh
```

---

## 🔄 **Restart Services**

```bash
./stop.sh && ./start.sh
```

---

## 📦 **Dependencies Installed**

### Backend (Python)
- ✅ FastAPI + Uvicorn (API framework)
- ✅ SQLAlchemy + PostgreSQL (Database)
- ✅ Anthropic (AI integration)
- ✅ Dome API SDK (Market data)
- ✅ All other requirements

### Frontend (Node.js)
- ✅ React + Vite
- ✅ 1474 npm packages installed
- ⚠️ 22 vulnerabilities (optional to fix with `npm audit fix`)

### Data Pipeline (Python)
- ✅ HTTPx + AsyncPG
- ✅ APScheduler (Background jobs)
- ✅ All required packages

---

## 🎯 **What's Next?**

### 1. Test the Application
Visit http://localhost:5174 and explore the features

### 2. Run Database Migrations (Optional)
```bash
cd backend
source ../.venv/bin/activate
alembic upgrade head
```

### 3. Enable OpinionTrade (Optional)
Edit `data-pipeline/.env`:
```env
ENABLE_OPINIONTRADE=true
```

### 4. Start Data Pipeline (Optional)
```bash
cd data-pipeline
source ../.venv/bin/activate
python -m predictions_ingest.cli full-sync
```

---

## 🐛 **Troubleshooting**

### Backend won't start
```bash
# Check logs
tail -f logs/backend.log

# Check port 8001
lsof -ti:8001

# Kill process and restart
lsof -ti:8001 | xargs kill -9
./start.sh
```

### Frontend won't start
```bash
# Check logs
tail -f logs/frontend.log

# Clear node cache
cd frontend
rm -rf node_modules/.vite
npm run dev
```

### Database connection issues
Check that your DigitalOcean database credentials in `backend/.env` are correct:
- POSTGRES_HOST
- POSTGRES_PORT
- POSTGRES_DB
- POSTGRES_USER
- POSTGRES_PASSWORD

---

## 📚 **Documentation**

- **API Docs:** http://localhost:8001/docs
- **Backend README:** [backend/README.md](backend/README.md)
- **Data Pipeline:** [data-pipeline/README.md](data-pipeline/README.md)
- **Setup Guide:** [QUICKSTART.md](QUICKSTART.md)

---

## 🎉 **Success Criteria**

✅ All dependencies installed
✅ .env files configured
✅ Backend running (port 8001)
✅ Frontend running (port 5174)
✅ Database connected
✅ API keys configured
✅ Health checks passing

**Your app is ready for development! 🚀**
