# Dome API Endpoints & Database Tables Map

## Overview
This document maps which Dome API endpoints we're using and which PostgreSQL tables store the data.

---

## 🔌 Dome API Endpoints Used

### Base URL: `https://api.domeapi.io/v1`
### Authentication: `X-API-Key: <your-key>`
### Rate Limit: 100 QPS (using 50 QPS for safety margin)

---

### 1. **Polymarket Markets** 
**Endpoint:** `GET /polymarket/markets`

**Parameters:**
```json
{
  "limit": 100,
  "pagination_key": "cursor_string",
  "status": "open",           // Filter: "open", "closed", "resolved"
  "closed": false            // Alternate filter for active markets
}
```

**What It Returns:**
```json
{
  "markets": [
    {
      "id": "condition_id_here",
      "condition_id": "0x12345...",
      "slug": "trump-wins-2024",
      "title": "Will Trump win 2024?",
      "description": "Resolves Yes if...",
      "question": "Will Trump win the 2024 election?",
      "category": "Politics",
      "tags": ["politics", "2024", "presidential"],
      "status": "open",
      "outcomes": [
        {"id": "0", "name": "Yes", "price": 0.45},
        {"id": "1", "name": "No", "price": 0.55}
      ],
      "yes_price": 0.45,
      "no_price": 0.55,
      "volume_24h": 1500000.50,
      "volume_total": 50000000.00,
      "liquidity": 250000.00,
      "created_at": "2024-01-15T10:00:00Z",
      "end_date": "2024-11-06T00:00:00Z",
      "image": "https://...",
      "event_slug": "presidential-election-2024"
    }
  ],
  "pagination": {
    "next_key": "cursor_for_next_page"
  }
}
```

**Frequency:** Every 15 minutes (prices), Daily (metadata)

---

### 2. **Polymarket Events**
**Endpoint:** `GET /polymarket/events`

**Parameters:**
```json
{
  "limit": 100,
  "pagination_key": "cursor_string",
  "active": true
}
```

**What It Returns:**
```json
{
  "events": [
    {
      "event_slug": "presidential-election-2024",
      "title": "2024 Presidential Election",
      "subtitle": "Who will win the 2024 US Presidential Election?",
      "category": "Politics",
      "tags": ["politics", "presidential"],
      "status": "open",
      "market_count": 7,
      "volume_fiat_amount": 10000000.50,
      "liquidity": 500000.00,
      "start_time": 1705306800,
      "end_time": 1730851200,
      "image": "https://..."
    }
  ],
  "pagination": {
    "next_key": "cursor_for_next_page"
  }
}
```

**Frequency:** Daily (events change slowly)

---

### 3. **Polymarket Orders (Trade History)**
**Endpoint:** `GET /polymarket/orders`

**Parameters:**
```json
{
  "market_id": "condition_id_optional",
  "limit": 100,
  "pagination_key": "cursor_string",
  "start_time": 1705306800        // Unix timestamp
}
```

**What It Returns:**
```json
{
  "orders": [
    {
      "id": "order_12345",
      "market_id": "0xabc123...",
      "side": "BUY",
      "outcome": "Yes",
      "price": 0.45,
      "size": 1000,
      "amount_usd": 450.00,
      "timestamp": 1705310400,
      "maker": "0x123...",
      "taker": "0x456..."
    }
  ],
  "pagination": {
    "next_key": "cursor_for_next_page"
  }
}
```

**Frequency:** Hourly (for top 100 markets)

---

### 4. **Kalshi Markets**
**Endpoint:** `GET /kalshi/markets`

**Parameters:**
```json
{
  "limit": 100,
  "pagination_key": "cursor_string",
  "status": "open"
}
```

**What It Returns:**
```json
{
  "markets": [
    {
      "market_ticker": "KXPOL-2024-TRUMP-YES",
      "ticker": "KXPOL-2024-TRUMP-YES",
      "title": "Trump to win 2024 election",
      "question": "Will Trump win?",
      "event_ticker": "KXPOL-2024",
      "category": "Politics",
      "status": "open",
      "yes_price": 0.48,
      "no_price": 0.52,
      "volume_24h": 50000.00,
      "volume": 2000000.00,
      "open_interest": 100000.00,
      "start_time": "2024-01-15T10:00:00Z",
      "close_time": "2024-11-06T00:00:00Z"
    }
  ],
  "pagination": {
    "pagination_key": "cursor_for_next_page"
  }
}
```

**Frequency:** Every 15 minutes (prices), Daily (metadata)

---

### 5. **Kalshi Trades**
**Endpoint:** `GET /kalshi/trades`

**Parameters:**
```json
{
  "market_id": "KXPOL-2024-TRUMP-YES",
  "limit": 100,
  "cursor": "cursor_string",
  "since": "2024-01-15T10:00:00Z"
}
```

**What It Returns:**
```json
{
  "trades": [
    {
      "trade_id": "trade_12345",
      "market_ticker": "KXPOL-2024-TRUMP-YES",
      "side": "yes",
      "price": 0.48,
      "count": 100,
      "yes_price": 0.48,
      "no_price": 0.52,
      "created_time": "2024-01-15T10:30:00Z"
    }
  ]
}
```

**Frequency:** Hourly (for top 100 markets)

---

### 6. **Orderbook Snapshot** (Optional - Not Currently Used)
**Endpoint:** `GET /polymarket/orderbook` or `GET /kalshi/orderbook`

**Parameters:**
```json
{
  "market_id": "condition_id_or_ticker"
}
```

**Note:** Currently disabled (`orderbook_fetch_top_n=0`) because:
- Polymarket requires `token_id` not `condition_id` (API mismatch)
- High API cost for 500+ markets
- Not critical for arbitrage detection

---

## 📊 Database Tables (3-Layer Architecture)

### **Bronze Layer** (Raw API Responses)
Schema: `predictions_bronze`

#### Table: `api_responses`
**Purpose:** Store raw API responses for audit/replay
**Partitioned by:** Source (polymarket, kalshi, limitless, opiniontrade)

```sql
CREATE TABLE predictions_bronze.api_responses (
    id UUID,
    source VARCHAR(50),              -- 'polymarket', 'kalshi'
    endpoint_name VARCHAR(200),      -- '/polymarket/markets', '/kalshi/trades'
    url_path TEXT,
    query_params JSONB,
    body_json JSONB,                 -- Raw API response
    body_hash VARCHAR(64),           -- Deduplication
    http_status INTEGER,
    fetched_at TIMESTAMPTZ,
    PRIMARY KEY (source, fetched_at, id)
) PARTITION BY LIST (source);
```

**What Gets Stored:**
- Every API response (markets, events, trades)
- Used for: Debugging, data replay, audit trail
- Retention: 30-90 days

---

### **Silver Layer** (Normalized Entities)
Schema: `predictions_silver`

#### Table: `markets`
**Purpose:** Unified market data from all sources

```sql
CREATE TABLE predictions_silver.markets (
    id UUID PRIMARY KEY,
    source VARCHAR(50),              -- 'polymarket', 'kalshi'
    source_market_id VARCHAR(500),   -- condition_id or ticker
    slug VARCHAR(500),
    condition_id VARCHAR(255),
    
    title TEXT,
    description TEXT,
    question TEXT,
    
    category_name VARCHAR(255),
    tags TEXT[],
    
    status VARCHAR(50),              -- 'active', 'closed', 'resolved'
    is_active BOOLEAN,
    is_resolved BOOLEAN,
    
    outcomes JSONB,                  -- [{id, name, price}]
    outcome_count INTEGER,
    
    -- Current prices (updated every 15 min)
    yes_price DECIMAL(10,6),
    no_price DECIMAL(10,6),
    last_trade_price DECIMAL(10,6),
    mid_price DECIMAL(10,6),
    spread DECIMAL(10,6),
    
    -- Volume (updated hourly)
    volume_24h DECIMAL(24,6),
    volume_7d DECIMAL(24,6),
    volume_total DECIMAL(24,6),
    
    liquidity DECIMAL(24,6),
    open_interest DECIMAL(24,6),
    
    trade_count_24h INTEGER,
    
    end_date TIMESTAMPTZ,
    image_url TEXT,
    source_url TEXT,
    
    last_updated_at TIMESTAMPTZ,
    
    UNIQUE (source, source_market_id)
);

-- Key Indexes
CREATE INDEX idx_markets_volume_24h ON predictions_silver.markets(volume_24h DESC);
CREATE INDEX idx_markets_source_active ON predictions_silver.markets(source, is_active);
CREATE INDEX idx_markets_category ON predictions_silver.markets(category_name);
```

**Data Flow:** Dome API → Bronze → **Silver** (normalized)

---

#### Table: `events`
**Purpose:** Event groupings (Polymarket only)

```sql
CREATE TABLE predictions_silver.events (
    id UUID PRIMARY KEY,
    source VARCHAR(50),              -- 'polymarket'
    source_event_id VARCHAR(500),    -- event_slug
    
    title TEXT,
    description TEXT,
    slug VARCHAR(500),
    
    category_name VARCHAR(255),
    tags TEXT[],
    
    is_active BOOLEAN,
    market_count INTEGER,
    
    total_volume DECIMAL(24,6),
    total_liquidity DECIMAL(24,6),
    
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    image_url TEXT,
    
    UNIQUE (source, source_event_id)
);
```

---

#### Table: `trades`
**Purpose:** Historical trade data

```sql
CREATE TABLE predictions_silver.trades (
    id UUID PRIMARY KEY,
    source VARCHAR(50),
    trade_id VARCHAR(500),
    
    market_id UUID REFERENCES predictions_silver.markets(id),
    
    side VARCHAR(10),                -- 'BUY', 'SELL', 'yes', 'no'
    outcome VARCHAR(100),
    
    price DECIMAL(10,6),
    size DECIMAL(24,6),
    amount_usd DECIMAL(24,6),
    
    maker_address VARCHAR(255),
    taker_address VARCHAR(255),
    
    traded_at TIMESTAMPTZ,
    
    UNIQUE (source, trade_id)
);

-- Partitioned by traded_at for efficient time-based queries
CREATE INDEX idx_trades_market_time ON predictions_silver.trades(market_id, traded_at DESC);
CREATE INDEX idx_trades_time ON predictions_silver.trades(traded_at DESC);
```

---

#### Table: `price_snapshots`
**Purpose:** Historical price tracking (every 15 minutes)

```sql
CREATE TABLE predictions_silver.price_snapshots (
    id BIGSERIAL PRIMARY KEY,
    market_id UUID REFERENCES predictions_silver.markets(id),
    
    yes_price DECIMAL(10,6),
    no_price DECIMAL(10,6),
    mid_price DECIMAL(10,6),
    spread DECIMAL(10,6),
    
    volume_24h DECIMAL(24,6),
    liquidity DECIMAL(24,6),
    
    snapshot_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE (market_id, snapshot_at)
);

CREATE INDEX idx_price_snapshots_market ON predictions_silver.price_snapshots(market_id, snapshot_at DESC);
```

---

### **Gold Layer** (Analytics Views)
Schema: `predictions_gold`

#### View: `top_markets_snapshot`
**Purpose:** Pre-computed top 500 markets by volume

```sql
CREATE MATERIALIZED VIEW predictions_gold.top_markets_snapshot AS
SELECT 
    m.id,
    m.source,
    m.source_market_id,
    m.title,
    m.category_name,
    m.yes_price,
    m.no_price,
    m.spread,
    m.volume_24h,
    m.volume_total,
    m.liquidity,
    m.end_date,
    m.image_url,
    NOW() as snapshot_at
FROM predictions_silver.markets m
WHERE m.is_active = true
ORDER BY m.volume_24h DESC NULLS LAST
LIMIT 500;

-- Refresh every 15 minutes
CREATE INDEX idx_top_markets_volume ON predictions_gold.top_markets_snapshot(volume_24h DESC);
```

---

#### View: `events_snapshot`
**Purpose:** Events with aggregated market data

```sql
CREATE TABLE predictions_gold.events_snapshot (
    id BIGSERIAL PRIMARY KEY,
    snapshot_at TIMESTAMPTZ DEFAULT NOW(),
    
    event_id VARCHAR(255),
    platform VARCHAR(20),
    
    title TEXT,
    category VARCHAR(50),
    
    market_count INTEGER,
    total_volume DECIMAL(20,2),
    volume_24h DECIMAL(20,2),
    
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    status VARCHAR(20),
    
    image_url VARCHAR(500),
    tags JSONB
);

CREATE INDEX idx_events_snapshot_platform ON predictions_gold.events_snapshot(platform, snapshot_at DESC);
```

---

#### View: `market_price_history`
**Purpose:** Time-series price data for charts

```sql
CREATE MATERIALIZED VIEW predictions_gold.market_price_history AS
SELECT 
    m.source,
    m.source_market_id,
    m.title,
    ps.yes_price,
    ps.no_price,
    ps.volume_24h,
    ps.snapshot_at,
    date_trunc('hour', ps.snapshot_at) as hour_bucket
FROM predictions_silver.price_snapshots ps
JOIN predictions_silver.markets m ON ps.market_id = m.id
WHERE ps.snapshot_at > NOW() - INTERVAL '7 days'
ORDER BY ps.snapshot_at DESC;
```

---

#### Table: `arbitrage_opportunities` (Optional)
**Purpose:** Pre-computed cross-platform arbitrage

```sql
CREATE TABLE predictions_gold.arbitrage_opportunities (
    id BIGSERIAL PRIMARY KEY,
    
    question TEXT,
    
    platform_1 VARCHAR(50),
    market_id_1 UUID,
    price_1 DECIMAL(10,6),
    
    platform_2 VARCHAR(50),
    market_id_2 UUID,
    price_2 DECIMAL(10,6),
    
    spread_percentage DECIMAL(10,4),
    potential_profit_pct DECIMAL(10,4),
    
    combined_volume_24h DECIMAL(24,6),
    
    detected_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_arbitrage_spread ON predictions_gold.arbitrage_opportunities(spread_percentage DESC);
```

---

## 📈 Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        DOME API                                  │
│  ┌──────────────────┐  ┌──────────────────┐                     │
│  │ /polymarket/     │  │ /kalshi/         │                     │
│  │ - markets        │  │ - markets        │                     │
│  │ - events         │  │ - trades         │                     │
│  │ - orders         │  │                  │                     │
│  └────────┬─────────┘  └────────┬─────────┘                     │
└───────────┼─────────────────────┼─────────────────────────────── ┘
            │                     │
            ▼                     ▼
┌─────────────────────────────────────────────────────────────────┐
│            BRONZE LAYER (predictions_bronze)                     │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ api_responses (partitioned by source)                    │   │
│  │ - Raw JSON responses                                     │   │
│  │ - Audit trail                                            │   │
│  └──────────────────────────────────────────────────────────┘   │
└────────────────────────────┬────────────────────────────────────┘
                             │ Transform & Normalize
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│            SILVER LAYER (predictions_silver)                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐         │
│  │  markets    │  │  events     │  │  trades         │         │
│  │  (unified)  │  │  (groups)   │  │  (history)      │         │
│  └─────────────┘  └─────────────┘  └─────────────────┘         │
│  ┌─────────────────────────────────────────────────────┐        │
│  │  price_snapshots (15-min intervals)                 │        │
│  └─────────────────────────────────────────────────────┘        │
└────────────────────────────┬────────────────────────────────────┘
                             │ Aggregate & Optimize
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│             GOLD LAYER (predictions_gold)                        │
│  ┌──────────────────┐  ┌──────────────────────┐                │
│  │ top_markets_     │  │ events_snapshot      │                │
│  │ snapshot (500)   │  │ (with aggregates)    │                │
│  └──────────────────┘  └──────────────────────┘                │
│  ┌──────────────────┐  ┌──────────────────────┐                │
│  │ market_price_    │  │ arbitrage_           │                │
│  │ history (charts) │  │ opportunities        │                │
│  └──────────────────┘  └──────────────────────┘                │
└────────────────────────────┬───────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    BACKEND API (FastAPI)                         │
│  All endpoints read from GOLD layer (fast, pre-computed)        │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔄 Refresh Schedule

| Data Type | Dome API Endpoints | Silver Tables | Gold Views | Frequency |
|-----------|-------------------|---------------|------------|-----------|
| **Market Prices** | `/polymarket/markets`<br>`/kalshi/markets` | `markets.yes_price`<br>`price_snapshots` | `top_markets_snapshot` | **Every 15 min** |
| **Market Metadata** | `/polymarket/markets`<br>`/kalshi/markets` | `markets.*` | All views | **Daily (2 AM)** |
| **Events** | `/polymarket/events` | `events` | `events_snapshot` | **Daily** |
| **Trades** | `/polymarket/orders`<br>`/kalshi/trades` | `trades` | Analytics | **Hourly (top 100)** |
| **Volumes** | Calculated from trades | `markets.volume_24h` | `top_markets_snapshot` | **Hourly** |

---

## 💾 Storage Estimates

### Top 500 Markets Each (1200 total)
| Table | Rows/Day | Row Size | Daily Storage | Annual Storage |
|-------|----------|----------|---------------|----------------|
| `api_responses` | ~4600 | 5 KB | 23 MB | 8.4 GB |
| `markets` | 1200 | 2 KB | 2.4 MB | 876 MB |
| `price_snapshots` | 115,200 | 200 B | 23 MB | 8.4 GB |
| `trades` | ~50,000 | 500 B | 25 MB | 9.1 GB |
| **Total** | - | - | **73 MB/day** | **26 GB/year** |

PostgreSQL can handle this easily! ✅

---

## 🎯 Summary

### Dome API Endpoints We Use:
1. ✅ `/polymarket/markets` - Top 500 markets
2. ✅ `/polymarket/events` - Event groupings
3. ✅ `/polymarket/orders` - Trade history (top 100)
4. ✅ `/kalshi/markets` - Top 500 markets
5. ✅ `/kalshi/trades` - Trade history (top 100)
6. ❌ `/polymarket/orderbook` - Not used (API mismatch)

### Database Tables We Store In:
**Bronze:** `api_responses` (raw)
**Silver:** `markets`, `events`, `trades`, `price_snapshots`
**Gold:** `top_markets_snapshot`, `events_snapshot`, `market_price_history`, `arbitrage_opportunities`

### Data Refresh:
- **Prices:** Every 15 minutes
- **Trades/Volumes:** Every hour
- **Metadata:** Daily at 2 AM UTC
- **Frontend:** Reads from Gold layer (instant!)

**Result:** 98% volume coverage, <300ms page loads, 26 GB/year storage! 🚀
