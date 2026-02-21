# EventGraph — Prediction Market Intelligence Terminal 🚀

> **Unified analytics across Polymarket, Kalshi & Limitless**

[![ETH Denver 2026](https://img.shields.io/badge/ETH%20Denver-2026-purple)](https://ethdenver.com)
[![Live Demo](https://img.shields.io/badge/Live-Demo-green)](https://eventgraph-denver-guk26.ondigitalocean.app)

## What is EventGraph?

Prediction markets are fragmented — prices, volume, and opportunities are scattered across Polymarket, Kalshi, and Limitless. EventGraph brings it all together into one terminal.

**Live:** [eventgraph-denver-guk26.ondigitalocean.app](https://eventgraph-denver-guk26.ondigitalocean.app)

---

## Features

### 📊 Market Intelligence Dashboard
- Unified view of markets across 3 platforms
- Real-time volume trends, category breakdown, and market movers
- Cross-platform price comparison in one place

### 🔍 Screener
- Filter and search markets across all platforms
- Sort by volume, price, category
- Click through to detailed event analytics

### 📈 Event Analytics
- Deep dive into any event with price history and market data
- Volume tracking and liquidity analysis
- Direct links to trade on source platforms

### ⚖️ Arbitrage Detection
- Cross-venue price comparison to find mispricings
- Spread calculation with fee awareness
- Opportunity scanner across all platforms

### 🤖 AI Copilot
- Natural language interface powered by Claude
- Ask questions like "What are the best arbitrage opportunities?"
- Market analysis and recommendations

### ⚡ Execution *(Coming Soon)*
- Smart contract vault for automated arbitrage
- Keeper bot for 24/7 opportunity execution

---

## Architecture

```
┌──────────────────────────────────────────────┐
│         FRONTEND (React + TypeScript)         │
│  Dashboard │ Screener │ Arbitrage │ AI Chat   │
└──────────────────────────────────────────────┘
                       ↕
┌──────────────────────────────────────────────┐
│         BACKEND (FastAPI + PostgreSQL)         │
│  • Cross-venue event matching                 │
│  • Arbitrage detection                        │
│  • Claude AI integration                      │
│  • Top markets by volume                      │
└──────────────────────────────────────────────┘
                       ↕
┌──────────────────────────────────────────────┐
│           DATA PIPELINE (Python)              │
│  • Dome API (Polymarket + Kalshi)             │
│  • Limitless Exchange API                     │
│  • Scheduled ingestion & price tracking       │
└──────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React, TypeScript, Vite, Material-UI, Recharts |
| Backend | FastAPI, PostgreSQL, SQLAlchemy, Redis |
| AI | Anthropic Claude |
| Data | Dome API, Limitless API |
| Infra | DigitalOcean App Platform |
| Contracts | Solidity (Base) |

---

## Quick Start

### Backend
```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # Add your API keys
python main.py        # Runs on :8001
```

### Frontend
```bash
cd frontend
npm install
cp .env.example .env  # Set VITE_API_URL
npm run dev           # Runs on :5173
```

### Data Pipeline
```bash
cd data-pipeline
pip install -r requirements.txt
python -m scripts.run_ingestion
```

---

## Project Structure

```
├── frontend/          React + TypeScript SPA
├── backend/           FastAPI server + PostgreSQL
├── data-pipeline/     Market data ingestion
├── contracts/         Solidity smart contracts
├── keeper-bot/        Automated execution bot
└── docs/              Documentation
```

---

## Key Metrics

- **Platforms:** 3 (Polymarket, Kalshi, Limitless)
- **Data Coverage:** Top markets by volume across all platforms
- **Query Speed:** <100ms
- **Deployment:** DigitalOcean App Platform with auto-deploy from `main`

---

**Built at ETH Denver 2026** 🦬
