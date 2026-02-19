# 🏗️ Predictions Terminal - Multi-Source Data Architecture Plan

## 📋 Executive Summary

A scalable, reliable data pipeline to aggregate prediction market data from **Polymarket**, **Kalshi**, **Limitless**, and **OpinionTrade** into a unified data layer for analytics and terminal applications.

---

## 🎯 Requirements Summary

| Requirement | Specification |
|-------------|--------------|
| **Sources** | Polymarket, Kalshi, Limitless (Phase 1), OpinionTrade (Phase 2) |
| **Data Types** | Markets, Events, Trade History, Market Prices, Orderbook |
| **Static Load** | Weekly full refresh (Sunday 2 AM UTC) |
| **Delta Load** | Hourly incremental sync |
| **Goals** | Scalability, Reliability, Speed |
| **Storage** | PostgreSQL (DigitalOcean) |

---

## 📊 API Endpoint Mapping

### 1️⃣ **Dome API** (Polymarket + Kalshi via Unified Gateway)

Based on the Dome API documentation, here's the endpoint mapping:

#### Polymarket Endpoints
| Data Type | Endpoint | Frequency | Notes |
|-----------|----------|-----------|-------|
| **Markets** | `GET /polymarket/markets` | Weekly + Hourly | All market metadata |
| **Events** | `GET /polymarket/events` | Weekly + Hourly | Event groupings |
| **Trade History** | `GET /polymarket/trade-history` | Hourly | Recent trades |
| **Market Price** | `GET /polymarket/market-price` | Hourly (or 15min) | Current prices |
| **Orderbook History** | `GET /polymarket/orderbook-history` | Hourly | Historical orderbook |
| **Activity** | `GET /polymarket/activity` | Hourly | User activity |
| **Candlesticks** | `GET /polymarket/candlesticks` | Hourly | OHLCV data |
| **Positions** | `GET /polymarket/positions` | Hourly | Open positions |

#### Kalshi Endpoints
| Data Type | Endpoint | Frequency | Notes |
|-----------|----------|-----------|-------|
| **Markets** | `GET /kalshi/markets` | Weekly + Hourly | All market metadata |
| **Trade History** | `GET /kalshi/trade-history` | Hourly | Recent trades |
| **Market Price** | `GET /kalshi/market-price` | Hourly (or 15min) | Current prices |
| **Orderbook History** | `GET /kalshi/orderbook-history` | Hourly | Historical orderbook |

#### Matching Markets (Cross-Platform)
| Data Type | Endpoint | Frequency | Notes |
|-----------|----------|-----------|-------|
| **Sports** | `GET /matching/sports` | Weekly | Cross-platform matching |
| **Sport by Date** | `GET /matching/sport-by-date` | Daily | Daily sports events |

### 2️⃣ **Limitless Exchange API**

Based on API analysis at `https://api.limitless.exchange/api-v1`:

| Data Type | Endpoint | Frequency | Notes |
|-----------|----------|-----------|-------|
| **Active Markets** | `GET /markets/active` | Weekly + Hourly | Paginated (25/page) |
| **Market Details** | `GET /markets/{slug}` | Hourly (changed only) | Full market data + venue |
| **Market Slugs** | `GET /markets/active/slugs` | Hourly | Quick list for delta |
| **Categories** | `GET /categories` | Weekly | Market categories |
| **Category Count** | `GET /markets/categories/count` | Daily | Stats |
| **Historical Price** | `GET /markets/{slug}/historical-price` | Hourly | Price history |
| **Orderbook** | `GET /markets/{slug}/orderbook` | Hourly | Current orderbook |
| **Market Events** | `GET /markets/{slug}/events` | Hourly | Trade events |
| **Feed Events** | `GET /markets/{slug}/get-feed-events` | Hourly | Activity feed |
| **Search** | `GET /markets/search` | On-demand | Search capability |
| **Portfolio Trades** | `GET /portfolio/trades` | Hourly (auth) | Trade history |
| **Public Trades** | `GET /portfolio/{account}/traded-volume` | Hourly | Public volume |

---

## 🏛️ Data Architecture

### Three-Layer Storage Model

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           DATA INGESTION LAYER                               │
├─────────────────────────────────────────────────────────────────────────────┤
│  Polymarket API    Kalshi API      Limitless API      OpinionTrade API      │
│       │                │                │                    │               │
│       ▼                ▼                ▼                    ▼               │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    UNIFIED API CLIENTS                               │    │
│  │   • Rate Limiting (Token Bucket)                                    │    │
│  │   • Retry Logic (Exponential Backoff)                               │    │
│  │   • Circuit Breaker                                                  │    │
│  │   • Request Deduplication                                           │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           BRONZE LAYER (Raw)                                 │
│                         predictions_bronze schema                            │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │ api_responses   │  │ api_responses   │  │ api_responses   │             │
│  │ (polymarket)    │  │ (kalshi)        │  │ (limitless)     │             │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘             │
│                                                                              │
│  • Append-only, immutable                                                   │
│  • Content-hash deduplication                                               │
│  • Full JSON preservation                                                   │
│  • Partitioned by source + date                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          SILVER LAYER (Normalized)                           │
│                         predictions_silver schema                            │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                    UNIFIED ENTITY TABLES                             │   │
│  ├──────────────────────────────────────────────────────────────────────┤   │
│  │  markets          │ Unified market data (all sources)               │   │
│  │  events           │ Event groupings (Polymarket, Limitless)         │   │
│  │  trades           │ All trade history (normalized)                  │   │
│  │  prices           │ Price snapshots (time-series)                   │   │
│  │  orderbooks       │ Orderbook snapshots                             │   │
│  │  categories       │ Market categories                               │   │
│  │  tokens           │ Collateral tokens                               │   │
│  │  market_mappings  │ Cross-platform market matching                  │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  • Type-safe schemas with proper indexing                                   │
│  • SCD2 for slowly changing dimensions                                      │
│  • Source-agnostic unified schema                                           │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           GOLD LAYER (Analytics)                             │
│                          predictions_gold schema                             │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                    MATERIALIZED VIEWS / MARTS                        │   │
│  ├──────────────────────────────────────────────────────────────────────┤   │
│  │  market_overview      │ Current state of all markets                │   │
│  │  volume_daily         │ Daily volume aggregates                     │   │
│  │  price_movements      │ Significant price changes                   │   │
│  │  cross_platform_arb   │ Arbitrage opportunities                     │   │
│  │  trader_activity      │ Top traders leaderboard                     │   │
│  │  trending_markets     │ Trending by volume/activity                 │   │
│  │  market_liquidity     │ Liquidity metrics                           │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 📦 Database Schema Design

### Bronze Layer Tables

```sql
-- predictions_bronze.api_responses (partitioned by source)
CREATE TABLE predictions_bronze.api_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source VARCHAR(50) NOT NULL,           -- 'polymarket', 'kalshi', 'limitless'
    endpoint_name VARCHAR(200) NOT NULL,   -- 'markets', 'trades', 'prices'
    url_path TEXT NOT NULL,
    query_params JSONB DEFAULT '{}',
    body_json JSONB NOT NULL,
    body_hash VARCHAR(64) NOT NULL,        -- SHA-256 for deduplication
    http_status INTEGER,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    run_id UUID,
    ingestion_type VARCHAR(20),            -- 'static', 'delta'
    CONSTRAINT unique_body_hash UNIQUE (body_hash)
) PARTITION BY LIST (source);

-- Create partitions for each source
CREATE TABLE predictions_bronze.api_responses_polymarket 
    PARTITION OF predictions_bronze.api_responses FOR VALUES IN ('polymarket');
CREATE TABLE predictions_bronze.api_responses_kalshi 
    PARTITION OF predictions_bronze.api_responses FOR VALUES IN ('kalshi');
CREATE TABLE predictions_bronze.api_responses_limitless 
    PARTITION OF predictions_bronze.api_responses FOR VALUES IN ('limitless');
```

### Silver Layer Tables

```sql
-- Unified Markets Table
CREATE TABLE predictions_silver.markets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source VARCHAR(50) NOT NULL,
    source_market_id VARCHAR(255) NOT NULL,
    slug VARCHAR(500),
    title TEXT NOT NULL,
    description TEXT,
    category_id VARCHAR(100),
    category_name VARCHAR(255),
    
    -- Status
    status VARCHAR(50),                    -- 'active', 'resolved', 'closed'
    is_active BOOLEAN DEFAULT true,
    
    -- Outcomes
    outcomes JSONB,                        -- [{name, token_id, price}]
    outcome_count INTEGER,
    
    -- Pricing
    yes_price DECIMAL(10, 6),
    no_price DECIMAL(10, 6),
    last_trade_price DECIMAL(10, 6),
    
    -- Volume & Liquidity
    volume_24h DECIMAL(20, 6),
    volume_total DECIMAL(20, 6),
    liquidity DECIMAL(20, 6),
    open_interest DECIMAL(20, 6),
    
    -- Timing
    created_at TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    resolution_date TIMESTAMPTZ,
    
    -- Metadata
    image_url TEXT,
    source_url TEXT,
    tags JSONB,
    extra_data JSONB,                      -- Source-specific fields
    
    -- Tracking
    body_hash VARCHAR(64),
    first_seen_at TIMESTAMPTZ DEFAULT NOW(),
    last_updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE (source, source_market_id)
);

-- Unified Trades Table
CREATE TABLE predictions_silver.trades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source VARCHAR(50) NOT NULL,
    source_trade_id VARCHAR(255),
    market_id UUID REFERENCES predictions_silver.markets(id),
    source_market_id VARCHAR(255) NOT NULL,
    
    -- Trade details
    side VARCHAR(10),                      -- 'buy', 'sell'
    outcome VARCHAR(100),                  -- 'yes', 'no', outcome name
    price DECIMAL(10, 6),
    quantity DECIMAL(20, 6),
    total_value DECIMAL(20, 6),
    
    -- Parties
    maker_address VARCHAR(255),
    taker_address VARCHAR(255),
    
    -- Timing
    traded_at TIMESTAMPTZ NOT NULL,
    block_number BIGINT,
    transaction_hash VARCHAR(255),
    
    -- Tracking
    ingested_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE (source, source_trade_id)
);

-- Price Snapshots (Time-Series)
CREATE TABLE predictions_silver.prices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source VARCHAR(50) NOT NULL,
    market_id UUID REFERENCES predictions_silver.markets(id),
    source_market_id VARCHAR(255) NOT NULL,
    
    -- Prices
    yes_price DECIMAL(10, 6),
    no_price DECIMAL(10, 6),
    mid_price DECIMAL(10, 6),
    spread DECIMAL(10, 6),
    
    -- Volume
    volume_1h DECIMAL(20, 6),
    trade_count_1h INTEGER,
    
    -- Timestamp
    snapshot_at TIMESTAMPTZ NOT NULL,
    
    -- Enable time-series optimizations
    UNIQUE (source, source_market_id, snapshot_at)
);

-- Enable TimescaleDB hypertable for prices (if available)
-- SELECT create_hypertable('predictions_silver.prices', 'snapshot_at');

-- Orderbook Snapshots
CREATE TABLE predictions_silver.orderbooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source VARCHAR(50) NOT NULL,
    market_id UUID REFERENCES predictions_silver.markets(id),
    source_market_id VARCHAR(255) NOT NULL,
    
    -- Orderbook data
    bids JSONB,                            -- [{price, size}]
    asks JSONB,                            -- [{price, size}]
    best_bid DECIMAL(10, 6),
    best_ask DECIMAL(10, 6),
    spread DECIMAL(10, 6),
    depth_bid_10pct DECIMAL(20, 6),
    depth_ask_10pct DECIMAL(20, 6),
    
    snapshot_at TIMESTAMPTZ NOT NULL,
    
    UNIQUE (source, source_market_id, snapshot_at)
);

-- Cross-Platform Market Mappings
CREATE TABLE predictions_silver.market_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Market references
    polymarket_id VARCHAR(255),
    kalshi_id VARCHAR(255),
    limitless_id VARCHAR(255),
    
    -- Matching metadata
    match_score DECIMAL(5, 4),             -- 0.0 to 1.0 confidence
    match_type VARCHAR(50),                -- 'exact', 'fuzzy', 'manual'
    canonical_title TEXT,
    
    -- Status
    is_verified BOOLEAN DEFAULT false,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## ⚙️ Ingestion Strategy

### Static Load (Weekly - Sunday 2 AM UTC)

```
┌────────────────────────────────────────────────────────────────┐
│                    WEEKLY STATIC LOAD                          │
├────────────────────────────────────────────────────────────────┤
│  1. Full market snapshot from all sources                      │
│  2. All categories and metadata                                │
│  3. Historical trades (last 7 days backfill)                   │
│  4. Rebuild market mappings                                    │
│  5. Refresh all materialized views                             │
│  6. Vacuum and analyze tables                                  │
└────────────────────────────────────────────────────────────────┘

Execution Order:
  1. Polymarket: markets → events → trades → prices
  2. Kalshi: markets → trades → prices  
  3. Limitless: categories → markets → trades → prices
  4. Run market matching algorithm
  5. Refresh gold layer views
```

### Delta Load (Hourly)

```
┌────────────────────────────────────────────────────────────────┐
│                    HOURLY DELTA LOAD                           │
├────────────────────────────────────────────────────────────────┤
│  1. Fetch only changed/new markets (using timestamps/cursors)  │
│  2. Recent trades (last 2 hours for overlap safety)            │
│  3. Current prices for active markets                          │
│  4. Current orderbook snapshots                                │
│  5. Incremental silver layer updates                           │
│  6. Partial gold layer refresh (hot paths only)                │
└────────────────────────────────────────────────────────────────┘

Delta Detection Strategies:
  • Polymarket: updatedAt field, cursor-based pagination
  • Kalshi: timestamp filters on API
  • Limitless: Compare slugs list, check body_hash changes
```

---

## 🔧 Technology Stack

### Core Infrastructure

| Component | Technology | Rationale |
|-----------|------------|-----------|
| **Language** | Python 3.11+ | Existing codebase, great async support |
| **Database** | PostgreSQL 15+ | Robust, JSONB support, partitioning |
| **Async HTTP** | httpx + aiohttp | Non-blocking I/O for parallel requests |
| **ORM** | SQLAlchemy 2.0 + asyncpg | Type-safe, async native |
| **Scheduling** | APScheduler or Celery Beat | Reliable job scheduling |
| **Queue** | Redis + Celery | For distributed task execution |
| **Monitoring** | Prometheus + Grafana | Metrics and alerting |
| **Logging** | structlog | Structured JSON logging |

### Recommended Additions

| Component | Technology | Rationale |
|-----------|------------|-----------|
| **Time-Series** | TimescaleDB extension | Optimized price/trade storage |
| **Caching** | Redis | API response caching, rate limiting |
| **Message Queue** | Redis Streams or Kafka | Event-driven processing |
| **Secret Management** | HashiCorp Vault or AWS Secrets | Secure API key storage |

---

## 📁 Proposed Project Structure

```
predictions-data/
├── pyproject.toml
├── requirements.txt
├── .env.example
├── alembic.ini
│
├── config/
│   ├── settings.py           # Pydantic settings
│   ├── sources.yaml          # API source configurations
│   └── endpoints.yaml        # Endpoint definitions
│
├── predictions_ingest/
│   ├── __init__.py
│   ├── cli.py                # CLI commands
│   ├── config.py             # Configuration loader
│   ├── database.py           # DB connection manager
│   │
│   ├── clients/              # API Clients (per source)
│   │   ├── __init__.py
│   │   ├── base.py           # Abstract base client
│   │   ├── dome.py           # Dome API (Polymarket + Kalshi)
│   │   ├── limitless.py      # Limitless API
│   │   └── opiniontrade.py   # OpinionTrade API (Phase 2)
│   │
│   ├── ingestion/            # Ingestion Logic
│   │   ├── __init__.py
│   │   ├── bronze.py         # Raw storage writer
│   │   ├── silver.py         # Normalization logic
│   │   ├── gold.py           # Analytics refresh
│   │   ├── static_load.py    # Weekly full load
│   │   └── delta_load.py     # Hourly incremental
│   │
│   ├── models/               # Pydantic Models
│   │   ├── __init__.py
│   │   ├── market.py         # Market schema
│   │   ├── trade.py          # Trade schema
│   │   ├── price.py          # Price schema
│   │   └── orderbook.py      # Orderbook schema
│   │
│   ├── schedulers/           # Job Scheduling
│   │   ├── __init__.py
│   │   ├── scheduler.py      # APScheduler config
│   │   └── jobs.py           # Job definitions
│   │
│   └── utils/
│       ├── __init__.py
│       ├── hashing.py        # Content hashing
│       ├── logging.py        # Structured logging
│       ├── rate_limiter.py   # Token bucket
│       └── retry.py          # Retry decorators
│
├── migrations/
│   ├── 001_bronze_schema.sql
│   ├── 002_silver_schema.sql
│   ├── 003_gold_views.sql
│   └── 004_indexes.sql
│
├── tests/
│   ├── conftest.py
│   ├── test_clients/
│   ├── test_ingestion/
│   └── test_models/
│
└── docs/
    ├── ARCHITECTURE_PLAN.md
    ├── API_MAPPING.md
    └── RUNBOOK.md
```

---

## 🚀 Execution Plan

### Phase 1: Foundation (Week 1-2)

| Task | Description | Priority |
|------|-------------|----------|
| 1.1 | Set up project structure | P0 |
| 1.2 | Create bronze schema migration | P0 |
| 1.3 | Create silver schema migration | P0 |
| 1.4 | Implement base API client class | P0 |
| 1.5 | Implement Dome API client | P0 |
| 1.6 | Implement Limitless API client (extend existing) | P0 |

### Phase 2: Bronze Layer (Week 2-3)

| Task | Description | Priority |
|------|-------------|----------|
| 2.1 | Bronze writer for Polymarket | P0 |
| 2.2 | Bronze writer for Kalshi | P0 |
| 2.3 | Bronze writer for Limitless | P0 |
| 2.4 | Content-hash deduplication | P0 |
| 2.5 | Implement static load orchestrator | P0 |
| 2.6 | Implement delta load orchestrator | P0 |

### Phase 3: Silver Layer (Week 3-4)

| Task | Description | Priority |
|------|-------------|----------|
| 3.1 | Market normalization logic | P0 |
| 3.2 | Trade normalization logic | P0 |
| 3.3 | Price normalization logic | P0 |
| 3.4 | Orderbook normalization | P1 |
| 3.5 | Cross-platform market matching | P1 |

### Phase 4: Scheduling & Operations (Week 4-5)

| Task | Description | Priority |
|------|-------------|----------|
| 4.1 | APScheduler setup | P0 |
| 4.2 | Weekly static job | P0 |
| 4.3 | Hourly delta job | P0 |
| 4.4 | Monitoring & alerting | P1 |
| 4.5 | CLI commands for manual runs | P1 |

### Phase 5: Gold Layer & Analytics (Week 5-6)

| Task | Description | Priority |
|------|-------------|----------|
| 5.1 | Market overview view | P1 |
| 5.2 | Volume aggregations | P1 |
| 5.3 | Cross-platform arbitrage detection | P2 |
| 5.4 | Trending markets | P2 |

---

## 📊 Rate Limiting Strategy

### Dome API (Free Tier)
- **Limit**: 1 QPS, 10 queries per 10 seconds
- **Strategy**: Token bucket with 1 token/second, burst of 5

### Limitless API
- **Limit**: ~10 RPS (estimated, be conservative)
- **Strategy**: Token bucket with 5 tokens/second, burst of 10

### Implementation

```python
# Per-source rate limiters
RATE_LIMITS = {
    "dome": {"rate": 1.0, "burst": 5},      # Conservative for free tier
    "limitless": {"rate": 5.0, "burst": 10},
    "opiniontrade": {"rate": 2.0, "burst": 5},
}
```

---

## 🔒 Reliability Patterns

### 1. Retry with Exponential Backoff
```python
@retry(
    stop=stop_after_attempt(5),
    wait=wait_exponential(multiplier=1, min=1, max=60),
    retry=retry_if_exception_type((httpx.TransportError, httpx.HTTPStatusError)),
)
async def fetch_with_retry(url: str) -> dict:
    ...
```

### 2. Circuit Breaker
```python
# Open circuit after 5 failures in 60 seconds
# Half-open after 30 seconds recovery
circuit_breaker = CircuitBreaker(
    fail_max=5,
    reset_timeout=30,
)
```

### 3. Idempotent Writes
- Content-hash based deduplication in bronze layer
- `ON CONFLICT DO NOTHING` for inserts
- Upsert patterns for silver layer

### 4. Graceful Degradation
- Continue with available sources if one fails
- Store partial data with error flags
- Alert on degraded state

---

## 📈 Monitoring & Observability

### Key Metrics
- **Ingestion rate**: Records/second per source
- **Latency**: P50, P95, P99 API response times
- **Error rate**: Failed requests per source
- **Data freshness**: Time since last successful sync
- **Deduplication rate**: % of duplicate records skipped

### Alerting Rules
- Source unavailable > 5 minutes
- Error rate > 10% over 15 minutes
- No new data for > 2 hours
- Database connection failures

---

## 💰 Cost Considerations

### Dome API Tiers
| Tier | QPS | Cost | Recommendation |
|------|-----|------|----------------|
| Free | 1 | $0 | Development |
| Dev | 100 | $? | Staging |
| Pro | 300 | $? | Production |

### Database
- DigitalOcean Managed PostgreSQL
- Consider read replicas for analytics queries
- Enable connection pooling (PgBouncer)

---

## ✅ Next Steps

1. **Immediate**: Obtain Dome API key from https://domeapi.com
2. **Week 1**: Set up project structure, create migrations
3. **Week 2**: Implement API clients and bronze layer
4. **Week 3**: Build silver normalization
5. **Week 4**: Set up scheduling and monitoring
6. **Week 5**: Gold layer and analytics views

---

## 📚 References

- Dome API Docs: https://docs.domeapi.com
- Limitless API: https://api.limitless.exchange/api-v1
- Polymarket API: https://docs.polymarket.com
- Kalshi API: https://kalshi.com/docs

---

*Last Updated: January 28, 2026*
