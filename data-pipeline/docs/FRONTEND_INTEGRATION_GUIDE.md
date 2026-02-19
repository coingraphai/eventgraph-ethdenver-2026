# Frontend Integration Guide - Predictions Data API

**Last Updated:** January 31, 2026  
**Database:** PostgreSQL on DigitalOcean  
**Schema:** `predictions_gold.*` (analytics), `predictions_silver.*` (raw data)

---

## 🚀 Quick Start

### Connection Details
```
Host: predictions-data-do-user-26438810-0.m.db.ondigitalocean.com
Port: 25060
Database: defaultdb
User: doadmin
SSL: Required
```

### Recommended Access Pattern
- **Real-time data:** Query `predictions_silver.*` tables directly
- **Analytics/Charts:** Query `predictions_gold.*` tables (pre-aggregated)
- **Update Frequency:** Gold tables refresh every 5-15 minutes

---

## 📊 Page-by-Page Component Mapping

### 1️⃣ HOME PAGE

| Component | Table | Key Columns | Update Freq |
|-----------|-------|-------------|-------------|
| **Market Metrics Cards** | `predictions_gold.market_metrics_summary` | `total_markets`, `combined_volume_24h`, `polymarket_*/kalshi_*/limitless_*` | 5 min |
| **Top Markets Table** | `predictions_gold.top_markets_snapshot` | `market_slug`, `question`, `volume_24h`, `yes_price`, `rank` (1-10) | 5 min |
| **Category Pie Chart** | `predictions_gold.category_distribution` | `category_name`, `market_count`, `total_volume`, `percentage` | 15 min |
| **Volume Line Chart** | `predictions_gold.volume_trends` | `period_start`, `period_end`, `source`, `total_volume` | 15 min |
| **Activity Feed** | `predictions_gold.high_volume_activity` | `market_slug`, `question`, `event_type`, `detected_at` | 5 min |
| **Platform Comparison** | `predictions_gold.platform_comparison` | `source`, `metric_name`, `metric_value`, `rank` | 15 min |
| **Trending Categories** | `predictions_gold.trending_categories` | `category_name`, `trend_score`, `rank` (1-8) | 15 min |

**Example Query:**
```sql
-- Get market metrics for dashboard header
SELECT 
    total_markets,
    combined_volume_24h,
    polymarket_volume_24h,
    kalshi_volume_24h,
    limitless_volume_24h
FROM predictions_gold.market_metrics_summary
ORDER BY snapshot_timestamp DESC
LIMIT 1;

-- Get top 10 markets
SELECT 
    market_slug,
    question,
    source,
    volume_24h,
    yes_price,
    price_change_24h
FROM predictions_gold.top_markets_snapshot
WHERE snapshot_timestamp = (SELECT MAX(snapshot_timestamp) FROM predictions_gold.top_markets_snapshot)
ORDER BY rank;
```

---

### 2️⃣ MARKET DETAILS PAGE

| Component | Table | Key Columns | Update Freq |
|-----------|-------|-------------|-------------|
| **Market Info Card** | `predictions_gold.market_detail_cache` | All market fields cached | 15 min |
| **Price Chart** | `predictions_gold.market_price_history` | `period_start`, `open_price`, `high_price`, `low_price`, `close_price` | Real-time |
| **Volume Chart** | `predictions_gold.market_trade_activity` | `hour_start`, `trade_count`, `total_volume` | Real-time |
| **Recent Trades** | `predictions_silver.trades` (direct) | `traded_at`, `quantity`, `price`, `taker_address` | Real-time |
| **Orderbook** | `predictions_gold.market_orderbook_depth` | `bids`, `asks`, `spread`, `total_bid_depth` | Real-time |
| **Similar Markets** | `predictions_gold.related_markets` | `related_market_id`, `related_title`, `similarity_score`, `rank` (1-10) | 15 min |
| **Market Stats** | `predictions_gold.market_statistics` | `total_trades`, `unique_traders`, `avg_trade_size`, `price_volatility` | 15 min |

**Example Query:**
```sql
-- Get full market details
SELECT *
FROM predictions_gold.market_detail_cache
WHERE market_id = 'YOUR_MARKET_ID'
  AND cached_at = (SELECT MAX(cached_at) FROM predictions_gold.market_detail_cache WHERE market_id = 'YOUR_MARKET_ID');

-- Get price history for chart (last 7 days, hourly)
SELECT 
    period_start,
    open_price,
    high_price,
    low_price,
    close_price,
    volume_period
FROM predictions_gold.market_price_history
WHERE source_market_id = 'YOUR_SOURCE_MARKET_ID'
  AND period_start >= NOW() - INTERVAL '7 days'
ORDER BY period_start;

-- Get recent trades (real-time)
SELECT 
    traded_at,
    quantity,
    price,
    total_value,
    taker_address
FROM predictions_silver.trades
WHERE source_market_id = 'YOUR_SOURCE_MARKET_ID'
ORDER BY traded_at DESC
LIMIT 50;
```

---

### 3️⃣ MARKETS/EXPLORE PAGE

| Component | Table | Key Columns | Update Freq |
|-----------|-------|-------------|-------------|
| **Market Search** | `predictions_gold.market_search_cache` | `question`, `description`, `search_vector`, `popularity_score` | 15 min |
| **Filter Sidebar** | `predictions_gold.filter_aggregates` | `filter_type`, `filter_value`, `total_count`, `active_count` | 5 min |
| **Category Matrix** | `predictions_gold.category_breakdown_by_platform` | `source`, `category_name`, `market_count`, `pct_of_platform_volume` | 15 min |
| **Popular Markets** | `predictions_gold.watchlist_popular_markets` | `question`, `popularity_rank`, `volume_24h`, `trade_count_24h` | 15 min |
| **Recently Resolved** | `predictions_gold.recently_resolved_markets` | `question`, `outcome`, `resolved_at`, `final_yes_price` | 15 min |
| **All Markets** | `predictions_silver.markets` (direct) | Real-time market list with filters | Real-time |

**Example Query:**
```sql
-- Full-text search across markets
SELECT 
    market_id,
    question,
    category_name,
    source,
    yes_price,
    volume_24h,
    popularity_score
FROM predictions_gold.market_search_cache
WHERE search_vector @@ to_tsquery('english', 'election & trump')
ORDER BY popularity_score DESC
LIMIT 20;

-- Get filter counts for sidebar
SELECT 
    filter_type,
    filter_value,
    total_count,
    active_count,
    display_name,
    icon
FROM predictions_gold.filter_aggregates
WHERE snapshot_at = (SELECT MAX(snapshot_at) FROM predictions_gold.filter_aggregates)
ORDER BY filter_type, sort_order;

-- Get popular markets
SELECT 
    market_id,
    question,
    source,
    yes_price,
    volume_24h,
    popularity_rank
FROM predictions_gold.watchlist_popular_markets
WHERE snapshot_at = (SELECT MAX(snapshot_at) FROM predictions_gold.watchlist_popular_markets)
ORDER BY popularity_rank
LIMIT 50;
```

---

### 4️⃣ ANALYTICS PAGE

| Component | Table | Key Columns | Update Freq |
|-----------|-------|-------------|-------------|
| **Volume Distribution** | `predictions_gold.volume_distribution_histogram` | `bin_label`, `market_count`, `polymarket_count`, `kalshi_count` | 15 min |
| **Lifecycle Funnel** | `predictions_gold.market_lifecycle_funnel` | `stage`, `stage_order`, `market_count`, `conversion_rate_to_next` | 15 min |
| **Top Traders** | `predictions_gold.top_traders_leaderboard` | `trader_address`, `trader_rank`, `total_volume`, `trades_24h` | 15 min |
| **Category Performance** | `predictions_gold.category_performance_metrics` | `category_name`, `total_volume_24h`, `popularity_rank`, `growth_rate_7d` | 15 min |
| **Platform Share** | `predictions_gold.platform_market_share_timeseries` | `date`, `source`, `market_share_by_volume`, `growth_rate_volume` | Daily |
| **Activity Heatmap** | `predictions_gold.hourly_activity_heatmap` | `hour_of_day`, `day_of_week`, `trade_count`, `activity_intensity` | Daily |
| **Resolution Accuracy** | `predictions_gold.resolution_accuracy_tracker` | `date`, `total_resolved_markets`, `accuracy_score`, `avg_final_price_yes_markets` | Daily |

**Example Query:**
```sql
-- Volume distribution histogram
SELECT 
    bin_label,
    market_count,
    polymarket_count,
    kalshi_count,
    limitless_count,
    total_volume
FROM predictions_gold.volume_distribution_histogram
WHERE snapshot_at = (SELECT MAX(snapshot_at) FROM predictions_gold.volume_distribution_histogram)
ORDER BY bin_index;

-- Top 100 traders leaderboard
SELECT 
    trader_rank,
    trader_address,
    total_trades,
    total_volume,
    volume_24h,
    favorite_source
FROM predictions_gold.top_traders_leaderboard
WHERE snapshot_at = (SELECT MAX(snapshot_at) FROM predictions_gold.top_traders_leaderboard)
ORDER BY trader_rank;

-- Category performance ranking
SELECT 
    category_name,
    popularity_rank,
    total_volume_24h,
    active_markets,
    growth_rate_7d,
    resolution_rate
FROM predictions_gold.category_performance_metrics
WHERE snapshot_at = (SELECT MAX(snapshot_at) FROM predictions_gold.category_performance_metrics)
ORDER BY popularity_rank;
```

---

### 5️⃣ EVENTS PAGE

| Component | Table | Key Columns | Update Freq |
|-----------|-------|-------------|-------------|
| **Events List** | `predictions_gold.events_snapshot` | `event_id`, `title`, `platform`, `market_count`, `total_volume` | 15 min |
| **Event Details** | `predictions_gold.events_snapshot` + `event_markets` | Event metadata + markets | 15 min |
| **Event Markets** | `predictions_gold.event_markets` | `market_id`, `market_title`, `yes_price`, `volume_24h`, `rank_in_event` | 15 min |
| **Event Statistics** | `predictions_gold.events_aggregate_metrics` | `total_events`, `total_markets`, `total_volume`, `avg_markets_per_event` | 15 min |

**Example Query:**
```sql
-- Get events list with filtering
SELECT 
    event_id,
    platform,
    title,
    category,
    market_count,
    total_volume,
    volume_24h,
    status
FROM predictions_gold.events_snapshot
WHERE snapshot_at = (SELECT MAX(snapshot_at) FROM predictions_gold.events_snapshot)
  AND platform = 'polymarket'  -- or 'kalshi', or omit for all
  AND status = 'open'
ORDER BY total_volume DESC
LIMIT 20;

-- Get event details with all markets
SELECT 
    es.event_id,
    es.title,
    es.category,
    es.market_count,
    es.total_volume,
    em.market_id,
    em.market_title,
    em.market_slug,
    em.yes_price,
    em.volume_24h,
    em.rank_in_event
FROM predictions_gold.events_snapshot es
JOIN predictions_gold.event_markets em 
    ON es.event_id = em.event_id 
    AND es.platform = em.platform
WHERE es.event_id = 'YOUR_EVENT_ID'
  AND es.platform = 'polymarket'
  AND es.snapshot_at = (SELECT MAX(snapshot_at) FROM predictions_gold.events_snapshot WHERE event_id = 'YOUR_EVENT_ID')
  AND em.snapshot_at = (SELECT MAX(snapshot_at) FROM predictions_gold.event_markets WHERE event_id = 'YOUR_EVENT_ID')
ORDER BY em.rank_in_event;

-- Get platform event statistics
SELECT 
    platform,
    total_events,
    total_markets,
    total_volume,
    volume_24h,
    avg_markets_per_event
FROM predictions_gold.events_aggregate_metrics
WHERE snapshot_at = (SELECT MAX(snapshot_at) FROM predictions_gold.events_aggregate_metrics)
ORDER BY platform;
```

---

## 🔄 Data Freshness & Update Schedule

| Table Group | Update Frequency | Latency |
|-------------|------------------|---------|
| **Hot Aggregations** (market_metrics_summary, top_markets_snapshot, high_volume_activity) | Every 5 minutes | < 5 min |
| **Warm Aggregations** (categories, trends, filters, search) | Every 15 minutes | < 15 min |
| **Market Detail** (price_history, trade_activity, orderbook) | Real-time + cached 15min | < 1 min |
| **Analytics** (leaderboards, performance, histograms) | Every 15 minutes | < 15 min |
| **Events** (events_snapshot, event_markets, events_aggregate_metrics) | Every 15 minutes | < 15 min |
| **Daily Aggregations** (heatmaps, timeseries, accuracy) | Daily at 2 AM UTC | 24 hours |
| **Silver Layer** (markets, trades, prices, orderbooks) | Real-time | < 1 min |

---

## 📐 Common Query Patterns

### Pattern 1: Get Latest Snapshot
```sql
-- Always get the most recent data
SELECT * FROM predictions_gold.{table_name}
WHERE snapshot_timestamp = (SELECT MAX(snapshot_timestamp) FROM predictions_gold.{table_name});

-- Or with snapshot_at
WHERE snapshot_at = (SELECT MAX(snapshot_at) FROM predictions_gold.{table_name});
```

### Pattern 2: Time-Series Data
```sql
-- Get historical data for charts
SELECT 
    period_start,
    metric_value
FROM predictions_gold.volume_trends
WHERE source = 'polymarket'
  AND period_start >= NOW() - INTERVAL '30 days'
ORDER BY period_start;
```

### Pattern 3: Real-Time Market Data
```sql
-- Query Silver layer directly for freshest data
SELECT 
    id,
    question,
    source,
    yes_price,
    volume_24h,
    is_active
FROM predictions_silver.markets
WHERE is_active = true
  AND source = 'polymarket'
ORDER BY volume_24h DESC
LIMIT 20;
```

### Pattern 4: Filtered Lists with Pagination
```sql
-- Markets with filters and pagination
SELECT 
    id,
    question,
    category_name,
    source,
    yes_price,
    volume_24h
FROM predictions_silver.markets
WHERE is_active = true
  AND category_name = 'Politics'
  AND source = ANY(ARRAY['polymarket', 'kalshi'])
  AND volume_24h >= 1000
ORDER BY volume_24h DESC
LIMIT 20 OFFSET 0;
```

---

## 🎨 Data Type Reference

### Common Column Types

| Column Name | Type | Format | Example |
|-------------|------|--------|---------|
| `snapshot_timestamp` | `TIMESTAMPTZ` | ISO 8601 | `2026-01-31T15:30:00Z` |
| `snapshot_at` | `TIMESTAMPTZ` | ISO 8601 | `2026-01-31T15:30:00Z` |
| `volume_24h` | `DECIMAL(20,2)` | USD amount | `12345.67` |
| `yes_price` | `DECIMAL(10,4)` | 0-1 probability | `0.6523` |
| `market_id` | `UUID` | UUID v4 | `e4444e4f-c4f8-...` |
| `source` | `VARCHAR(50)` | lowercase | `polymarket`, `kalshi`, `limitless` |
| `rank` | `INTEGER` | 1-based | `1`, `2`, `3` |
| `percentage` | `DECIMAL(5,2)` | 0-100% | `23.45` |
| `search_vector` | `TSVECTOR` | PostgreSQL FTS | Use `@@` operator |

---

## ⚡ Performance Tips

### 1. Use Indexes
All Gold tables have indexes on:
- Timestamp columns (for latest snapshot queries)
- Filter columns (source, category, status)
- Rank columns (for ordered lists)

### 2. Cache on Frontend
- Gold table data changes every 5-15 minutes → Cache API responses for 5 min
- Silver table data is real-time → Cache for 30 seconds max

### 3. Pagination
Always use `LIMIT` and `OFFSET` for lists:
```sql
LIMIT 20 OFFSET 0  -- Page 1
LIMIT 20 OFFSET 20 -- Page 2
```

### 4. Use Pre-Aggregated Data
- ✅ DO: Query `predictions_gold.*` for charts/analytics
- ❌ DON'T: Aggregate `predictions_silver.*` tables on-the-fly (slow!)

---

## 🚨 Important Notes

### Market Identification
Markets have **two IDs**:
- `id` (UUID) - Internal database ID
- `source_market_id` (VARCHAR) - Source platform ID (e.g., Polymarket slug)

Use `id` for joins, `source_market_id` for API calls.

### NULL Handling
Some fields may be NULL:
- `question` - Use `COALESCE(question, title, 'Untitled Market')`
- `category_name` - Use `COALESCE(category_name, 'Uncategorized')`
- `taker_address` - Some trades have anonymous traders

### Price Format
- All prices are probabilities: `0.0` to `1.0`
- To display as percentage: Multiply by 100
- Example: `0.6523` → `65.23%`

### Volume Format
- All volumes in USD
- Stored as `DECIMAL(20,2)`
- Display with thousands separators: `$12,345.67`

---

## 📞 Support

**Questions about:**
- Table schemas → See `FRONTEND_DATABASE_TODO.md`
- Data availability → See `docs/DATA_PIPELINE_STATUS.md`
- API design → Contact backend team
- Missing data → Check update schedule (some tables update daily)

---

## 🔗 Related Documents

1. **FRONTEND_DATABASE_TODO.md** - Complete component mapping
2. **docs/DATA_PIPELINE_STATUS.md** - Pipeline status and data volumes
3. **ANALYTICS_INVENTORY.md** - Original frontend requirements
4. **migrations/00X_gold_*.sql** - Table schemas and indexes

---

**Last Updated:** January 31, 2026  
**Gold Layer Version:** Phase 1-4 Complete (25 tables, 45,654 records)
