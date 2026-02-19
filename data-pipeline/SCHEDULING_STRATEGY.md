# Data Pipeline Scheduling Strategy

## Overview
Optimized update frequencies based on data volatility and API constraints.

## Update Frequencies

| Data Type | Frequency | Method | Reasoning |
|-----------|-----------|--------|-----------|
| **Prices** | Every 15 minutes | DELTA (polling) | Balance between freshness and API costs |
| **Markets** | Daily (2 AM UTC) | STATIC | Metadata changes slowly |
| **Trades** | Hourly | DELTA with `since` | New trades, incremental with timestamp |
| **Orderbooks** | Hourly | DELTA (top 100) | Liquidity snapshot for active markets |

## Configuration

### Current Settings (`.env`)
```bash
# STATIC LOAD - Daily market metadata refresh
STATIC_SCHEDULE_ENABLED=true
STATIC_SCHEDULE_DAY=sun          # Can change to daily if needed
STATIC_SCHEDULE_HOUR=2           # 2 AM UTC

# DELTA LOAD - Frequent updates
DELTA_SCHEDULE_ENABLED=true
DELTA_SCHEDULE_INTERVAL_HOURS=1  # Trades + Orderbooks every hour
DELTA_PRICE_INTERVAL_MINUTES=15  # Prices every 15 minutes

# Trades configuration
TRADES_TOP_N_MARKETS=100         # Fetch trades for top 100 markets
TRADES_SINCE_HOURS=1             # Fetch trades from last 1 hour (incremental)
TRADES_MIN_USD=1000              # Minimum trade value $1000

# Orderbooks configuration
ORDERBOOK_FETCH_TOP_N=100        # Fetch orderbooks for top 100 markets
```

## Implementation Details

### 1. **Prices (Every 15 Minutes)**

**Why 15 minutes?**
- Dome API doesn't support webhooks/WebSockets for prices
- Prices change frequently but 15 min is acceptable for most users
- Good balance between freshness and API costs
- 16,350 markets × 4 updates/hour = 1.57M API calls/day (vs 4.7M with 5 min)

**Current Implementation:**
- Run price-only delta every 15 minutes
- Updates all active market prices
- Duration: ~3 minutes for 16k markets

### 2. **Markets (Daily at 2 AM)**

**Why daily?**
- Market metadata changes slowly (title, description, end_date)
- New markets added ~10-20 per day
- Closed markets transition slowly

**Implementation:**
- Run `run_static()` once per day
- Full refresh of 16k+ markets
- Duration: ~25 minutes
- Updates: new markets, closed markets, metadata changes

### 3. **Trades (Hourly with Timestamp)**

**Why hourly with `since`?**
- ✅ Trades API supports `since` parameter (timestamp filtering)
- New trades accumulate constantly
- Fetching only last hour = much less data than full history
- **Changed from 24 hours to 1 hour** for true incremental updates

**Implementation (Already Done ✅):**
```python
# TradesFetcher automatically uses timestamp filtering
since_time = datetime.utcnow() - timedelta(hours=1)  # Only last hour
trades = await client.fetch_all_trades(
    market_id=market_id,
    since=since_time,  # Only fetch trades after this timestamp
)
```

**Configuration:**
- `TRADES_SINCE_HOURS=1` for hourly delta (only last hour)
- `TRADES_MIN_USD=1000` to filter small trades
- `TRADES_TOP_N_MARKETS=100` to reduce API calls

### 4. **Orderbooks (Hourly)**

**Why hourly?**
- Orderbook is snapshot data (no incremental API)
- Top 100 markets cover 90% of liquidity
- Updates show changing market depth

**Implementation:**
- Fetch current orderbook state for top 100 markets
- UPSERT into database (replaces old snapshot)
- Duration: ~2 minutes for 100 markets

## API Call Estimates

### Daily Totals (16,350 markets)
```
Prices:     16,350 × (4 updates/hour × 24 hours)  = 1,569,600 calls/day
Markets:    16,350 × 1 update/day                   = 16,350 calls/day
Trades:     100 markets × 24 updates/day            = 2,400 calls/day
Orderbooks: 100 markets × 24 updates/day            = 2,400 calls/day
────────────────────────────────────────────────────────────────────
TOTAL:                                               ~1.59M calls/day
```

**Cost Savings vs 5-minute updates:**
- 5 min updates: 4.73M calls/day
- 15 min updates: 1.59M calls/day
- **Savings: 3.14M calls/day (66% reduction)** ✅

## Recommended Schedule

```python
# Scheduler configuration in orchestrator.py

# Static Load: Daily at 2 AM UTC
#   - Fetches ALL active markets
#   - Updates metadata, new markets, closures
#   - Duration: ~25 minutes
schedule.every().day.at("02:00").do(run_static, source="polymarket")

# Delta Load: Hourly (Trades + Orderbooks)
#   - Updates trades (with since=last_hour)
#   - Updates orderbooks (top 100 snapshot)
#   - Duration: ~5 minutes
schedule.every(1).hours.do(run_delta, source="polymarket")

# Price Updates: Every 15 minutes
#   - Updates only prices for all active markets
#   - Duration: ~3 minutes
#   - Runs independently of hourly delta
schedule.every(15).minutes.do(run_price_only, source="polymarket")
```

## Webhook Alternative (Future Enhancement)

If Dome API adds WebSocket support in future:

```python
# WebSocket price streaming (hypothetical)
async def stream_prices():
    async with websocket.connect("wss://api.domeapi.io/v1/stream/prices") as ws:
        await ws.send(json.dumps({
            "subscribe": "prices",
            "markets": ["polymarket"],
            "api_key": settings.dome_api_key
        }))
        
        async for message in ws:
            price_update = json.loads(message)
            await update_price_in_db(price_update)
```

Benefits:
- Real-time price updates (sub-second)
- Zero polling overhead
- Reduced API costs (one connection vs millions of calls)

## Monitoring & Alerts

### Metrics to Track
1. **Pipeline Duration**: Alert if static load > 30 min
2. **Price Staleness**: Alert if prices not updated in 10 min
3. **API Errors**: Alert if error rate > 5%
4. **Data Gaps**: Alert if trades missing for > 2 hours

### Health Checks
```sql
-- Check last price update time
SELECT 
    MAX(last_updated_at) as last_price_update,
    COUNT(*) as total_markets
FROM predictions_silver.markets
WHERE is_active = true;

-- Check trades data freshness
SELECT 
    MAX(traded_at) as last_trade,
    COUNT(*) as trades_last_hour
FROM predictions_silver.trades
WHERE traded_at >= NOW() - INTERVAL '1 hour';
```

## Implementation Status

✅ **Completed:**
- Static load with 16,350 markets
- Price fetching (50 concurrent API calls)
- Trades fetcher with `since` timestamp ✅
- Orderbooks configuration (ORDERBOOK_FETCH_TOP_N=100)
- Medallion architecture (Bronze → Silver → Gold)

⏳ **In Progress:**
- Populate token IDs for 16k markets
- Test Chart/Analytics/Whales tabs

❌ **Future:**
- Separate price-only delta schedule (every 5 min)
- WebSocket streaming (if API supports)
- Smart caching based on market volume
- UI-driven lazy price loading
