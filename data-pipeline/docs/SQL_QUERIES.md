# Predictions Data Platform - SQL Query Reference

This document contains all SQL queries for accessing data across Bronze, Silver, and Gold layers of the predictions data platform.

## Table of Contents

1. [Database Architecture Overview](#database-architecture-overview)
2. [Bronze Layer Queries](#bronze-layer-queries)
3. [Silver Layer Queries](#silver-layer-queries)
4. [Gold Layer Queries](#gold-layer-queries)
5. [Ingestion Tracking Queries](#ingestion-tracking-queries)
6. [Cross-Source Analysis Queries](#cross-source-analysis-queries)
7. [Maintenance Queries](#maintenance-queries)

---

## Database Architecture Overview

### Schemas

| Schema | Purpose | Description |
|--------|---------|-------------|
| `predictions_bronze` | Raw Data | Stores raw API responses exactly as received from sources |
| `predictions_silver` | Normalized Data | Cleaned, normalized, and deduplicated data with unified schema |
| `predictions_gold` | Aggregated Data | Pre-computed analytics, materialized views for fast querying |
| `predictions_ingestion` | System Tracking | Sync state, run history, and ingestion metadata |

### Data Sources

| Source | API | Description |
|--------|-----|-------------|
| `polymarket` | Dome API | Largest decentralized prediction market |
| `kalshi` | Dome API | Regulated US prediction exchange |
| `limitless` | Direct API | Crypto-native prediction market |
| `opiniontrade` | Direct API | Multi-asset prediction platform |

### Medallion Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   BRONZE    │ --> │   SILVER    │ --> │    GOLD     │
│  Raw JSON   │     │ Normalized  │     │ Aggregated  │
│ Immutable   │     │ Deduplicated│     │ Materialized│
└─────────────┘     └─────────────┘     └─────────────┘
```

---

## Bronze Layer Queries

The Bronze layer stores raw API responses exactly as received. This is your source of truth for debugging and reprocessing.

### Bronze Tables

| Table | Description |
|-------|-------------|
| `api_responses` | Parent table (partitioned by source) |
| `api_responses_polymarket` | Raw Polymarket API responses |
| `api_responses_kalshi` | Raw Kalshi API responses |
| `api_responses_limitless` | Raw Limitless API responses |
| `api_responses_opiniontrade` | Raw Opinion Trade API responses |

### Columns in Bronze Tables

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Unique record identifier |
| `source` | TEXT | Data source name |
| `endpoint_name` | TEXT | API endpoint path |
| `url_path` | TEXT | Full URL path called |
| `query_params` | JSONB | Query parameters used |
| `body_json` | JSONB | Response body (raw JSON) |
| `body_hash` | TEXT | Hash for deduplication |
| `http_status` | INTEGER | HTTP response status code |
| `response_size_bytes` | INTEGER | Response size in bytes |
| `ingestion_type` | TEXT | 'static' or 'delta' |
| `run_id` | UUID | Ingestion run identifier |
| `fetched_at` | TIMESTAMP | When data was fetched |
| `created_at` | TIMESTAMP | Record creation time |

---

### Polymarket Bronze Queries

```sql
-- View recent Polymarket API responses
-- Shows what endpoints were called and response metadata
SELECT 
    id,
    endpoint_name,
    url_path,
    http_status,
    response_size_bytes,
    ingestion_type,
    run_id,
    fetched_at
FROM predictions_bronze.api_responses_polymarket
ORDER BY fetched_at DESC
LIMIT 20;

-- Count records by endpoint for Polymarket
SELECT 
    endpoint_name,
    COUNT(*) as record_count,
    SUM(response_size_bytes) as total_bytes,
    MIN(fetched_at) as first_fetch,
    MAX(fetched_at) as last_fetch
FROM predictions_bronze.api_responses_polymarket
GROUP BY endpoint_name
ORDER BY record_count DESC;

-- View raw market data from a specific fetch
SELECT 
    body_json,
    fetched_at
FROM predictions_bronze.api_responses_polymarket
WHERE endpoint_name = '/polymarket/markets'
ORDER BY fetched_at DESC
LIMIT 1;
```

### Kalshi Bronze Queries

```sql
-- View recent Kalshi API responses
SELECT 
    id,
    endpoint_name,
    url_path,
    http_status,
    response_size_bytes,
    ingestion_type,
    run_id,
    fetched_at
FROM predictions_bronze.api_responses_kalshi
ORDER BY fetched_at DESC
LIMIT 20;

-- Count records by endpoint for Kalshi
SELECT 
    endpoint_name,
    COUNT(*) as record_count,
    SUM(response_size_bytes) as total_bytes,
    MIN(fetched_at) as first_fetch,
    MAX(fetched_at) as last_fetch
FROM predictions_bronze.api_responses_kalshi
GROUP BY endpoint_name
ORDER BY record_count DESC;
```

### Limitless Bronze Queries

```sql
-- View recent Limitless API responses
SELECT 
    id,
    endpoint_name,
    url_path,
    http_status,
    response_size_bytes,
    ingestion_type,
    run_id,
    fetched_at
FROM predictions_bronze.api_responses_limitless
ORDER BY fetched_at DESC
LIMIT 20;

-- Count records by endpoint for Limitless
SELECT 
    endpoint_name,
    COUNT(*) as record_count,
    SUM(response_size_bytes) as total_bytes,
    MIN(fetched_at) as first_fetch,
    MAX(fetched_at) as last_fetch
FROM predictions_bronze.api_responses_limitless
GROUP BY endpoint_name
ORDER BY record_count DESC;
```

### Opinion Trade Bronze Queries

```sql
-- View recent Opinion Trade API responses
SELECT 
    id,
    endpoint_name,
    url_path,
    http_status,
    response_size_bytes,
    ingestion_type,
    run_id,
    fetched_at
FROM predictions_bronze.api_responses_opiniontrade
ORDER BY fetched_at DESC
LIMIT 20;

-- Count records by endpoint for Opinion Trade
SELECT 
    endpoint_name,
    COUNT(*) as record_count,
    SUM(response_size_bytes) as total_bytes,
    MIN(fetched_at) as first_fetch,
    MAX(fetched_at) as last_fetch
FROM predictions_bronze.api_responses_opiniontrade
GROUP BY endpoint_name
ORDER BY record_count DESC;
```

### Combined Bronze Stats

```sql
-- Total records across all bronze tables
SELECT 
    source,
    COUNT(*) as total_records,
    SUM(response_size_bytes) as total_bytes,
    pg_size_pretty(SUM(response_size_bytes)) as size_pretty,
    MIN(fetched_at) as first_fetch,
    MAX(fetched_at) as last_fetch
FROM predictions_bronze.api_responses
GROUP BY source
ORDER BY total_records DESC;

-- Records by source and endpoint
SELECT 
    source,
    endpoint_name,
    COUNT(*) as record_count,
    MAX(fetched_at) as last_fetch
FROM predictions_bronze.api_responses
GROUP BY source, endpoint_name
ORDER BY source, record_count DESC;

-- Recent ingestion activity (last 24 hours)
SELECT 
    source,
    endpoint_name,
    COUNT(*) as fetches,
    MAX(fetched_at) as last_fetch
FROM predictions_bronze.api_responses
WHERE fetched_at > NOW() - INTERVAL '24 hours'
GROUP BY source, endpoint_name
ORDER BY last_fetch DESC;
```

---

## Silver Layer Queries

The Silver layer contains normalized, deduplicated data with a unified schema across all sources.

### Silver Tables

| Table | Description |
|-------|-------------|
| `markets` | Unified market data from all sources |
| `trades` | All trades (partitioned by month) |
| `prices` | Price snapshots (partitioned by week) |
| `events` | Market groupings/events |
| `categories` | Market categories |
| `orderbooks` | Order book snapshots (partitioned by week) |
| `market_mappings` | Cross-source market mappings |

### Markets Table Columns

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Internal unique ID |
| `source` | TEXT | Source platform |
| `source_market_id` | TEXT | ID on source platform |
| `slug` | TEXT | URL-friendly identifier |
| `title` | TEXT | Market question/title |
| `description` | TEXT | Full description |
| `question` | TEXT | Question being predicted |
| `category_name` | TEXT | Category name |
| `status` | TEXT | active/closed/resolved |
| `is_active` | BOOLEAN | Currently tradeable |
| `is_resolved` | BOOLEAN | Has final resolution |
| `resolution_value` | TEXT | Resolved outcome |
| `outcomes` | JSONB | Possible outcomes |
| `outcome_count` | INTEGER | Number of outcomes |
| `yes_price` | DECIMAL | Current YES price (0-1) |
| `no_price` | DECIMAL | Current NO price (0-1) |
| `last_trade_price` | DECIMAL | Most recent trade price |
| `mid_price` | DECIMAL | (yes + no) / 2 |
| `spread` | DECIMAL | Price spread |
| `volume_24h` | DECIMAL | 24-hour volume |
| `volume_7d` | DECIMAL | 7-day volume |
| `volume_30d` | DECIMAL | 30-day volume |
| `volume_total` | DECIMAL | All-time volume |
| `liquidity` | DECIMAL | Available liquidity |
| `open_interest` | DECIMAL | Open interest |
| `trade_count_24h` | INTEGER | Trades in 24 hours |
| `trade_count_total` | INTEGER | All-time trade count |
| `unique_traders` | INTEGER | Unique trader count |
| `created_at_source` | TIMESTAMP | Created on source |
| `start_date` | TIMESTAMP | Trading start |
| `end_date` | TIMESTAMP | Trading end |
| `resolution_date` | TIMESTAMP | Resolution date |
| `last_trade_at` | TIMESTAMP | Most recent trade |
| `first_seen_at` | TIMESTAMP | First ingested |
| `last_updated_at` | TIMESTAMP | Last updated |

---

### Polymarket Markets

```sql
-- Top Polymarket markets by 24h volume
-- Shows the most actively traded markets
SELECT 
    source_market_id,
    title,
    status,
    yes_price,
    no_price,
    volume_24h,
    volume_total,
    liquidity,
    trade_count_24h,
    created_at_source,
    last_updated_at
FROM predictions_silver.markets
WHERE source = 'polymarket'
ORDER BY volume_24h DESC NULLS LAST
LIMIT 20;

-- Active Polymarket markets with high liquidity
SELECT 
    source_market_id,
    title,
    yes_price,
    no_price,
    liquidity,
    volume_24h,
    trade_count_24h
FROM predictions_silver.markets
WHERE source = 'polymarket'
  AND is_active = true
  AND liquidity > 1000
ORDER BY liquidity DESC
LIMIT 20;

-- Recently created Polymarket markets
SELECT 
    source_market_id,
    title,
    yes_price,
    created_at_source,
    volume_24h
FROM predictions_silver.markets
WHERE source = 'polymarket'
  AND created_at_source > NOW() - INTERVAL '7 days'
ORDER BY created_at_source DESC
LIMIT 20;

-- Polymarket markets near 50/50 (uncertain outcomes)
SELECT 
    source_market_id,
    title,
    yes_price,
    ABS(yes_price - 0.5) as distance_from_50,
    volume_24h
FROM predictions_silver.markets
WHERE source = 'polymarket'
  AND is_active = true
  AND yes_price BETWEEN 0.4 AND 0.6
ORDER BY volume_24h DESC NULLS LAST
LIMIT 20;
```

### Kalshi Markets

```sql
-- Top Kalshi markets by 24h volume
SELECT 
    source_market_id,
    title,
    status,
    yes_price,
    no_price,
    volume_24h,
    volume_total,
    liquidity,
    trade_count_24h,
    created_at_source,
    last_updated_at
FROM predictions_silver.markets
WHERE source = 'kalshi'
ORDER BY volume_24h DESC NULLS LAST
LIMIT 20;

-- Kalshi markets by category
SELECT 
    category_name,
    COUNT(*) as market_count,
    SUM(volume_24h) as total_volume_24h,
    AVG(yes_price) as avg_yes_price
FROM predictions_silver.markets
WHERE source = 'kalshi'
GROUP BY category_name
ORDER BY total_volume_24h DESC NULLS LAST;

-- Kalshi resolved markets
SELECT 
    source_market_id,
    title,
    resolution_value,
    resolution_date,
    volume_total
FROM predictions_silver.markets
WHERE source = 'kalshi'
  AND is_resolved = true
ORDER BY resolution_date DESC NULLS LAST
LIMIT 20;
```

### Limitless Markets

```sql
-- Top Limitless markets by 24h volume
SELECT 
    source_market_id,
    title,
    status,
    yes_price,
    no_price,
    volume_24h,
    volume_total,
    liquidity,
    trade_count_24h,
    created_at_source,
    last_updated_at
FROM predictions_silver.markets
WHERE source = 'limitless'
ORDER BY volume_24h DESC NULLS LAST
LIMIT 20;

-- Limitless crypto price markets
SELECT 
    source_market_id,
    title,
    yes_price,
    volume_24h,
    end_date
FROM predictions_silver.markets
WHERE source = 'limitless'
  AND (title ILIKE '%BTC%' OR title ILIKE '%ETH%' OR title ILIKE '%SOL%')
ORDER BY volume_24h DESC NULLS LAST
LIMIT 20;
```

### Opinion Trade Markets

```sql
-- Top Opinion Trade markets by 24h volume
SELECT 
    source_market_id,
    title,
    status,
    yes_price,
    no_price,
    volume_24h,
    volume_total,
    liquidity,
    trade_count_24h,
    created_at_source,
    last_updated_at
FROM predictions_silver.markets
WHERE source = 'opiniontrade'
ORDER BY volume_24h DESC NULLS LAST
LIMIT 20;

-- Opinion Trade active markets
SELECT 
    source_market_id,
    title,
    yes_price,
    volume_24h,
    liquidity
FROM predictions_silver.markets
WHERE source = 'opiniontrade'
  AND is_active = true
ORDER BY volume_24h DESC NULLS LAST
LIMIT 20;
```

### Combined Markets Queries

```sql
-- Market counts by source
-- Shows overall market distribution
SELECT 
    source,
    COUNT(*) as total_markets,
    COUNT(*) FILTER (WHERE is_active) as active_markets,
    COUNT(*) FILTER (WHERE is_resolved) as resolved_markets,
    COUNT(*) FILTER (WHERE status = 'closed') as closed_markets,
    ROUND(SUM(volume_24h)::numeric, 2) as total_volume_24h,
    ROUND(AVG(yes_price)::numeric, 4) as avg_yes_price,
    MAX(last_updated_at) as last_update
FROM predictions_silver.markets
GROUP BY source
ORDER BY total_markets DESC;

-- Top 50 markets across all sources
SELECT 
    source,
    source_market_id,
    title,
    yes_price,
    volume_24h,
    liquidity,
    trade_count_24h
FROM predictions_silver.markets
WHERE is_active = true
ORDER BY volume_24h DESC NULLS LAST
LIMIT 50;

-- Markets by category across all sources
SELECT 
    source,
    category_name,
    COUNT(*) as market_count,
    SUM(volume_24h) as volume_24h
FROM predictions_silver.markets
WHERE category_name IS NOT NULL
GROUP BY source, category_name
ORDER BY source, market_count DESC;
```

---

### Trades Table Columns

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Internal unique ID |
| `source` | TEXT | Source platform |
| `source_trade_id` | TEXT | Trade ID on source |
| `source_market_id` | TEXT | Market ID on source |
| `side` | TEXT | BUY or SELL |
| `outcome` | TEXT | Outcome traded (yes/no) |
| `outcome_index` | INTEGER | Outcome index |
| `price` | DECIMAL | Trade price (0-1) |
| `quantity` | DECIMAL | Number of shares |
| `total_value` | DECIMAL | price × quantity |
| `fee` | DECIMAL | Transaction fee |
| `traded_at` | TIMESTAMP | When trade occurred |
| `created_at` | TIMESTAMP | Record creation time |

---

### Polymarket Trades

```sql
-- Recent Polymarket trades
SELECT 
    source_trade_id,
    source_market_id,
    side,
    outcome,
    price,
    quantity,
    total_value,
    traded_at
FROM predictions_silver.trades
WHERE source = 'polymarket'
ORDER BY traded_at DESC
LIMIT 50;

-- Polymarket trade volume by hour (last 24h)
SELECT 
    date_trunc('hour', traded_at) as hour,
    COUNT(*) as trade_count,
    SUM(total_value) as volume
FROM predictions_silver.trades
WHERE source = 'polymarket'
  AND traded_at > NOW() - INTERVAL '24 hours'
GROUP BY date_trunc('hour', traded_at)
ORDER BY hour DESC;

-- Top Polymarket markets by trade count today
SELECT 
    source_market_id,
    COUNT(*) as trade_count,
    SUM(total_value) as volume,
    AVG(price) as avg_price
FROM predictions_silver.trades
WHERE source = 'polymarket'
  AND traded_at > NOW() - INTERVAL '24 hours'
GROUP BY source_market_id
ORDER BY trade_count DESC
LIMIT 20;
```

### Kalshi Trades

```sql
-- Recent Kalshi trades
SELECT 
    source_trade_id,
    source_market_id,
    side,
    outcome,
    price,
    quantity,
    total_value,
    traded_at
FROM predictions_silver.trades
WHERE source = 'kalshi'
ORDER BY traded_at DESC
LIMIT 50;

-- Kalshi trade volume by day (last 7 days)
SELECT 
    date_trunc('day', traded_at) as day,
    COUNT(*) as trade_count,
    SUM(total_value) as volume
FROM predictions_silver.trades
WHERE source = 'kalshi'
  AND traded_at > NOW() - INTERVAL '7 days'
GROUP BY date_trunc('day', traded_at)
ORDER BY day DESC;
```

### Limitless Trades

```sql
-- Recent Limitless trades
SELECT 
    source_trade_id,
    source_market_id,
    side,
    outcome,
    price,
    quantity,
    total_value,
    traded_at
FROM predictions_silver.trades
WHERE source = 'limitless'
ORDER BY traded_at DESC
LIMIT 50;

-- Limitless trade activity summary
SELECT 
    date_trunc('day', traded_at) as day,
    COUNT(*) as trade_count,
    SUM(total_value) as volume,
    COUNT(DISTINCT source_market_id) as markets_traded
FROM predictions_silver.trades
WHERE source = 'limitless'
  AND traded_at > NOW() - INTERVAL '7 days'
GROUP BY date_trunc('day', traded_at)
ORDER BY day DESC;
```

### Opinion Trade Trades

```sql
-- Recent Opinion Trade trades
SELECT 
    source_trade_id,
    source_market_id,
    side,
    outcome,
    price,
    quantity,
    total_value,
    traded_at
FROM predictions_silver.trades
WHERE source = 'opiniontrade'
ORDER BY traded_at DESC
LIMIT 50;
```

### Combined Trades Queries

```sql
-- Trade summary by source
SELECT 
    source,
    COUNT(*) as total_trades,
    SUM(total_value) as total_volume,
    ROUND(AVG(price)::numeric, 4) as avg_price,
    COUNT(DISTINCT source_market_id) as markets_traded,
    MIN(traded_at) as first_trade,
    MAX(traded_at) as last_trade
FROM predictions_silver.trades
GROUP BY source
ORDER BY total_trades DESC;

-- Last 24 hours trade activity
SELECT 
    source,
    COUNT(*) as trades_24h,
    SUM(total_value) as volume_24h,
    COUNT(DISTINCT source_market_id) as markets_traded
FROM predictions_silver.trades
WHERE traded_at > NOW() - INTERVAL '24 hours'
GROUP BY source
ORDER BY trades_24h DESC;

-- Trades by hour across all sources
SELECT 
    source,
    date_trunc('hour', traded_at) as hour,
    COUNT(*) as trade_count,
    SUM(total_value) as volume
FROM predictions_silver.trades
WHERE traded_at > NOW() - INTERVAL '24 hours'
GROUP BY source, date_trunc('hour', traded_at)
ORDER BY hour DESC, source;

-- Large trades (whale activity)
SELECT 
    source,
    source_trade_id,
    source_market_id,
    side,
    price,
    quantity,
    total_value,
    traded_at
FROM predictions_silver.trades
WHERE total_value > 1000
ORDER BY traded_at DESC
LIMIT 50;
```

---

### Prices Table

```sql
-- Recent price snapshots
SELECT 
    source,
    source_market_id,
    yes_price,
    no_price,
    mid_price,
    spread,
    recorded_at
FROM predictions_silver.prices
ORDER BY recorded_at DESC
LIMIT 50;

-- Price history for a specific market
SELECT 
    yes_price,
    no_price,
    mid_price,
    spread,
    recorded_at
FROM predictions_silver.prices
WHERE source_market_id = 'YOUR_MARKET_ID'
ORDER BY recorded_at DESC
LIMIT 100;

-- Price snapshots by source
SELECT 
    source,
    COUNT(*) as price_snapshots,
    AVG(yes_price) as avg_yes_price,
    AVG(spread) as avg_spread,
    MAX(recorded_at) as last_snapshot
FROM predictions_silver.prices
GROUP BY source
ORDER BY price_snapshots DESC;
```

---

### Events Table

```sql
-- All events with market counts
SELECT 
    source,
    source_event_id,
    title,
    market_count,
    volume_total,
    first_seen_at,
    last_updated_at
FROM predictions_silver.events
ORDER BY last_updated_at DESC
LIMIT 20;

-- Events by source
SELECT 
    source,
    COUNT(*) as event_count,
    SUM(market_count) as total_markets,
    SUM(volume_total) as total_volume
FROM predictions_silver.events
GROUP BY source
ORDER BY event_count DESC;
```

---

### Orderbooks Table

```sql
-- Recent orderbook snapshots
SELECT 
    source,
    source_market_id,
    bids,
    asks,
    best_bid,
    best_ask,
    spread,
    recorded_at
FROM predictions_silver.orderbooks
ORDER BY recorded_at DESC
LIMIT 20;

-- Orderbook stats by source
SELECT 
    source,
    COUNT(*) as snapshots,
    AVG(spread) as avg_spread,
    MAX(recorded_at) as last_snapshot
FROM predictions_silver.orderbooks
GROUP BY source;
```

---

## Gold Layer Queries

The Gold layer contains pre-computed aggregations stored as materialized views for fast analytics.

### Materialized Views

| View | Description | Refresh Frequency |
|------|-------------|-------------------|
| `market_summary` | Aggregated market stats | Hourly |
| `trade_summary` | Trade aggregations by market | Hourly |
| `top_markets` | Top markets by volume | Hourly |
| `market_overview` | Overall platform statistics | Hourly |
| `source_stats` | Statistics by source | Hourly |
| `similar_markets` | Cross-source market matches | Hourly |
| `arbitrage_opportunities` | Price differences across sources | Hourly |
| `trending_markets` | Markets with momentum | Hourly |
| `volume_daily` | Daily volume aggregation | Hourly |
| `volume_hourly` | Hourly volume aggregation | Hourly |
| `price_summary_hourly` | Hourly price summaries | Hourly |

---

### Market Summary

```sql
-- Market summary - aggregated view of all markets
-- Includes computed metrics and rankings
SELECT * FROM predictions_gold.market_summary
ORDER BY volume_24h DESC NULLS LAST
LIMIT 20;

-- Market summary by source
SELECT * FROM predictions_gold.market_summary
WHERE source = 'polymarket'
ORDER BY volume_24h DESC NULLS LAST
LIMIT 20;

-- Active high-volume markets
SELECT * FROM predictions_gold.market_summary
WHERE is_active = true
  AND volume_24h > 1000
ORDER BY volume_24h DESC;
```

### Trade Summary

```sql
-- Trade aggregations by market
-- Shows trading activity metrics per market
SELECT * FROM predictions_gold.trade_summary
ORDER BY total_volume DESC
LIMIT 20;

-- Most actively traded markets
SELECT * FROM predictions_gold.trade_summary
WHERE trade_count > 100
ORDER BY trade_count DESC
LIMIT 20;
```

### Top Markets

```sql
-- Pre-computed top markets ranking
SELECT * FROM predictions_gold.top_markets
LIMIT 50;

-- Top markets filtered by source
SELECT * FROM predictions_gold.top_markets
WHERE source = 'kalshi'
LIMIT 20;
```

### Market Overview

```sql
-- Platform-wide statistics
-- Single row with aggregate metrics
SELECT * FROM predictions_gold.market_overview;
```

### Source Stats

```sql
-- Statistics broken down by source
-- Compare performance across platforms
SELECT * FROM predictions_gold.source_stats;
```

### Similar Markets

```sql
-- Markets that appear on multiple sources
-- Useful for cross-platform analysis
SELECT * FROM predictions_gold.similar_markets
LIMIT 30;

-- Find markets similar to a specific one
SELECT * FROM predictions_gold.similar_markets
WHERE source_market_id = 'YOUR_MARKET_ID'
   OR matched_market_id = 'YOUR_MARKET_ID';
```

### Arbitrage Opportunities

```sql
-- Price differences for same markets across sources
-- Identify potential arbitrage
SELECT * FROM predictions_gold.arbitrage_opportunities
ORDER BY price_difference DESC
LIMIT 20;

-- Significant arbitrage (>5% difference)
SELECT * FROM predictions_gold.arbitrage_opportunities
WHERE price_difference > 0.05
ORDER BY price_difference DESC;
```

### Trending Markets

```sql
-- Markets with recent momentum
SELECT * FROM predictions_gold.trending_markets
ORDER BY volume_24h DESC
LIMIT 30;

-- Trending by source
SELECT * FROM predictions_gold.trending_markets
WHERE source = 'polymarket'
ORDER BY volume_24h DESC
LIMIT 20;
```

### Volume Daily

```sql
-- Daily volume aggregation
SELECT * FROM predictions_gold.volume_daily
ORDER BY trade_date DESC
LIMIT 30;

-- Volume trend last 7 days
SELECT * FROM predictions_gold.volume_daily
WHERE trade_date > CURRENT_DATE - INTERVAL '7 days'
ORDER BY trade_date;
```

### Volume Hourly

```sql
-- Hourly volume aggregation
SELECT * FROM predictions_gold.volume_hourly
ORDER BY trade_hour DESC
LIMIT 48;

-- Today's hourly volume
SELECT * FROM predictions_gold.volume_hourly
WHERE trade_hour >= CURRENT_DATE
ORDER BY trade_hour;
```

### Price Summary Hourly

```sql
-- Hourly price aggregations
SELECT * FROM predictions_gold.price_summary_hourly
ORDER BY hour DESC
LIMIT 48;
```

---

## Ingestion Tracking Queries

Track the health and status of data ingestion.

### Sync State

```sql
-- Current sync status for all sources/endpoints
-- Shows last success, error counts, and issues
SELECT 
    source,
    endpoint_name,
    last_success_at,
    total_records_stored,
    consecutive_errors,
    last_error_at,
    last_error_message,
    updated_at
FROM predictions_ingestion.sync_state
ORDER BY source, endpoint_name;

-- Sources with errors
SELECT 
    source,
    endpoint_name,
    consecutive_errors,
    last_error_at,
    last_error_message
FROM predictions_ingestion.sync_state
WHERE consecutive_errors > 0
ORDER BY consecutive_errors DESC;

-- Stale sources (no updates in 2+ hours)
SELECT 
    source,
    endpoint_name,
    last_success_at,
    NOW() - last_success_at as time_since_update
FROM predictions_ingestion.sync_state
WHERE last_success_at < NOW() - INTERVAL '2 hours'
ORDER BY last_success_at;
```

### Run History

```sql
-- Recent ingestion runs
SELECT 
    run_id,
    source,
    load_type,
    started_at,
    finished_at,
    finished_at - started_at as duration,
    success,
    markets_upserted,
    trades_inserted,
    error_message
FROM predictions_ingestion.run_history
ORDER BY started_at DESC
LIMIT 50;

-- Failed runs
SELECT 
    run_id,
    source,
    load_type,
    started_at,
    error_message
FROM predictions_ingestion.run_history
WHERE success = false
ORDER BY started_at DESC
LIMIT 20;

-- Run statistics by source
SELECT 
    source,
    load_type,
    COUNT(*) as total_runs,
    COUNT(*) FILTER (WHERE success) as successful_runs,
    AVG(EXTRACT(EPOCH FROM (finished_at - started_at))) as avg_duration_seconds,
    SUM(markets_upserted) as total_markets_upserted,
    SUM(trades_inserted) as total_trades_inserted
FROM predictions_ingestion.run_history
WHERE started_at > NOW() - INTERVAL '24 hours'
GROUP BY source, load_type
ORDER BY source, load_type;
```

---

## Cross-Source Analysis Queries

Compare data across different prediction market sources.

### Market Comparison

```sql
-- Compare market counts across sources
SELECT 
    source,
    COUNT(*) as total_markets,
    COUNT(*) FILTER (WHERE is_active) as active,
    COUNT(*) FILTER (WHERE is_resolved) as resolved,
    ROUND(SUM(volume_24h)::numeric, 2) as volume_24h,
    ROUND(SUM(volume_total)::numeric, 2) as volume_total,
    ROUND(AVG(liquidity)::numeric, 2) as avg_liquidity
FROM predictions_silver.markets
GROUP BY source
ORDER BY total_markets DESC;

-- Category distribution by source
SELECT 
    source,
    category_name,
    COUNT(*) as market_count,
    SUM(volume_24h) as category_volume
FROM predictions_silver.markets
WHERE category_name IS NOT NULL
GROUP BY source, category_name
ORDER BY source, market_count DESC;
```

### Trade Comparison

```sql
-- Compare trading activity across sources
SELECT 
    source,
    COUNT(*) as trade_count,
    SUM(total_value) as total_volume,
    COUNT(DISTINCT source_market_id) as markets_with_trades,
    ROUND(AVG(total_value)::numeric, 4) as avg_trade_size,
    MAX(traded_at) as last_trade
FROM predictions_silver.trades
WHERE traded_at > NOW() - INTERVAL '24 hours'
GROUP BY source
ORDER BY trade_count DESC;

-- Hourly trade comparison
SELECT 
    date_trunc('hour', traded_at) as hour,
    source,
    COUNT(*) as trades,
    SUM(total_value) as volume
FROM predictions_silver.trades
WHERE traded_at > NOW() - INTERVAL '24 hours'
GROUP BY date_trunc('hour', traded_at), source
ORDER BY hour DESC, source;
```

### Price Comparison (Same Markets)

```sql
-- Compare prices for similar markets across sources
-- Uses the similar_markets gold view
SELECT 
    sm.title,
    m1.source as source_1,
    m1.yes_price as price_1,
    m2.source as source_2,
    m2.yes_price as price_2,
    ABS(m1.yes_price - m2.yes_price) as price_diff
FROM predictions_gold.similar_markets sm
JOIN predictions_silver.markets m1 ON sm.source_market_id = m1.source_market_id
JOIN predictions_silver.markets m2 ON sm.matched_market_id = m2.source_market_id
WHERE m1.is_active AND m2.is_active
ORDER BY price_diff DESC
LIMIT 20;
```

### Data Freshness

```sql
-- Check data freshness by source
SELECT 
    source,
    MAX(last_updated_at) as markets_last_update,
    (SELECT MAX(traded_at) FROM predictions_silver.trades t WHERE t.source = m.source) as last_trade,
    (SELECT MAX(fetched_at) FROM predictions_bronze.api_responses b WHERE b.source = m.source) as last_fetch
FROM predictions_silver.markets m
GROUP BY source
ORDER BY source;
```

---

## Maintenance Queries

### Refresh Gold Layer Views

```sql
-- Refresh all materialized views (via function)
SELECT * FROM predictions_gold.refresh_all_views();

-- Or refresh individually
REFRESH MATERIALIZED VIEW CONCURRENTLY predictions_gold.market_summary;
REFRESH MATERIALIZED VIEW CONCURRENTLY predictions_gold.trade_summary;
REFRESH MATERIALIZED VIEW CONCURRENTLY predictions_gold.top_markets;
REFRESH MATERIALIZED VIEW CONCURRENTLY predictions_gold.market_overview;
REFRESH MATERIALIZED VIEW CONCURRENTLY predictions_gold.source_stats;
REFRESH MATERIALIZED VIEW CONCURRENTLY predictions_gold.similar_markets;
REFRESH MATERIALIZED VIEW CONCURRENTLY predictions_gold.arbitrage_opportunities;
REFRESH MATERIALIZED VIEW CONCURRENTLY predictions_gold.trending_markets;
REFRESH MATERIALIZED VIEW CONCURRENTLY predictions_gold.volume_daily;
REFRESH MATERIALIZED VIEW CONCURRENTLY predictions_gold.volume_hourly;
REFRESH MATERIALIZED VIEW CONCURRENTLY predictions_gold.price_summary_hourly;
```

### Table Sizes

```sql
-- Check table sizes
SELECT * FROM predictions_gold.table_sizes
ORDER BY total_bytes DESC;

-- Alternative: Calculate sizes directly
SELECT 
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname || '.' || tablename)) as total_size,
    pg_size_pretty(pg_relation_size(schemaname || '.' || tablename)) as table_size,
    pg_size_pretty(pg_indexes_size(schemaname || '.' || tablename)) as index_size
FROM pg_tables
WHERE schemaname LIKE 'predictions%'
ORDER BY pg_total_relation_size(schemaname || '.' || tablename) DESC;
```

### Partition Info

```sql
-- View trade partitions
SELECT 
    child.relname as partition_name,
    pg_size_pretty(pg_relation_size(child.oid)) as size
FROM pg_inherits
JOIN pg_class parent ON pg_inherits.inhparent = parent.oid
JOIN pg_class child ON pg_inherits.inhrelid = child.oid
WHERE parent.relname = 'trades'
ORDER BY child.relname;

-- View price partitions
SELECT 
    child.relname as partition_name,
    pg_size_pretty(pg_relation_size(child.oid)) as size
FROM pg_inherits
JOIN pg_class parent ON pg_inherits.inhparent = parent.oid
JOIN pg_class child ON pg_inherits.inhrelid = child.oid
WHERE parent.relname = 'prices'
ORDER BY child.relname;
```

### Data Quality Checks

```sql
-- Markets with missing data
SELECT 
    source,
    COUNT(*) FILTER (WHERE title IS NULL) as missing_title,
    COUNT(*) FILTER (WHERE yes_price IS NULL) as missing_yes_price,
    COUNT(*) FILTER (WHERE volume_24h IS NULL) as missing_volume,
    COUNT(*) FILTER (WHERE source_market_id IS NULL) as missing_source_id
FROM predictions_silver.markets
GROUP BY source;

-- Duplicate check
SELECT 
    source,
    source_market_id,
    COUNT(*) as duplicates
FROM predictions_silver.markets
GROUP BY source, source_market_id
HAVING COUNT(*) > 1;

-- Trades with invalid data
SELECT 
    source,
    COUNT(*) FILTER (WHERE price < 0 OR price > 1) as invalid_price,
    COUNT(*) FILTER (WHERE quantity <= 0) as invalid_quantity,
    COUNT(*) FILTER (WHERE traded_at > NOW()) as future_trades
FROM predictions_silver.trades
GROUP BY source;
```

---

## Quick Reference

### Count Records

```sql
-- Quick counts for all layers
SELECT 'Bronze - Polymarket' as table_name, COUNT(*) as count FROM predictions_bronze.api_responses_polymarket
UNION ALL
SELECT 'Bronze - Kalshi', COUNT(*) FROM predictions_bronze.api_responses_kalshi
UNION ALL
SELECT 'Bronze - Limitless', COUNT(*) FROM predictions_bronze.api_responses_limitless
UNION ALL
SELECT 'Bronze - Opinion Trade', COUNT(*) FROM predictions_bronze.api_responses_opiniontrade
UNION ALL
SELECT 'Silver - Markets', COUNT(*) FROM predictions_silver.markets
UNION ALL
SELECT 'Silver - Trades', COUNT(*) FROM predictions_silver.trades
UNION ALL
SELECT 'Silver - Prices', COUNT(*) FROM predictions_silver.prices
UNION ALL
SELECT 'Silver - Events', COUNT(*) FROM predictions_silver.events
ORDER BY table_name;
```

### Health Check

```sql
-- Quick health check query
SELECT 
    'Markets' as metric,
    (SELECT COUNT(*) FROM predictions_silver.markets) as total,
    (SELECT COUNT(*) FROM predictions_silver.markets WHERE last_updated_at > NOW() - INTERVAL '1 hour') as updated_1h
UNION ALL
SELECT 
    'Trades',
    (SELECT COUNT(*) FROM predictions_silver.trades),
    (SELECT COUNT(*) FROM predictions_silver.trades WHERE traded_at > NOW() - INTERVAL '1 hour')
UNION ALL
SELECT 
    'Bronze Records',
    (SELECT COUNT(*) FROM predictions_bronze.api_responses),
    (SELECT COUNT(*) FROM predictions_bronze.api_responses WHERE fetched_at > NOW() - INTERVAL '1 hour');
```

---

## API Endpoints Covered

### Polymarket (via Dome API)
- `/polymarket/markets` - Market listings
- `/polymarket/events` - Event groupings
- `/polymarket/orders` - Recent trades
- `/polymarket/market-price/{id}` - Current prices
- `/polymarket/candlesticks/{id}` - OHLC data (returns 404)

### Kalshi (via Dome API)
- `/kalshi/markets` - Market listings
- `/kalshi/events` - Event groupings
- `/kalshi/trades` - Recent trades
- `/kalshi/market-price/{ticker}` - Current prices

### Limitless (Direct API)
- `/api/markets` - Market listings
- `/api/markets/{id}` - Market details
- `/markets/{slug}/events` - Trade events
- `/markets/{slug}/historical-price` - Price history

### Opinion Trade (Direct API)
- `/openapi/market` - Market listings
- `/openapi/token` - Token info
- `/openapi/token/price` - Current prices
- `/openapi/token/orderbook` - Order book
- `/openapi/token/trade` - Recent trades

---

*Last updated: January 29, 2026*
