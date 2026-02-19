# Database Performance Optimization Guide

## Current Performance Issues

Your event detail pages are slow because they:
1. Query markets from database (with no indexes on JSONB fields)
2. Make external API calls to Polymarket/Dome API for real-time data
3. Fetch 26+ markets individually with sequential API calls

## Quick Wins (Do These First)

### 1. Add Database Indexes (~2 minutes)

Run this command to add critical indexes:

```bash
cd /Users/chethan/coingraph-prediction-terminal/backend
source venv/bin/activate
psql $DATABASE_URL -f optimize_db.sql
```

**Expected improvement:** 50-70% faster database queries

### 2. The Real Bottleneck: External API Calls

The main slowness is from calling Polymarket/Dome APIs. Your options:

#### **Option A: Use Cached Data (Fastest - No API calls)**

Modify the backend to use data already in your database instead of calling external APIs.

**Change in:** `backend/app/api/event_analytics.py`

Replace the external API fetch with database queries:

```python
# Instead of fetching from Polymarket API:
# markets_data = await fetch_from_polymarket_api(slugs)

# Use your database:
markets_data = db.execute(text("""
    SELECT 
        source_market_id,
        extra_data->>'market_slug' as market_slug,
        question,
        yes_price,
        no_price,
        volume_24h,
        volume_total,
        liquidity,
        trade_count_24h
    FROM predictions_silver.markets
    WHERE source = 'polymarket'
    AND extra_data->>'event_slug' = :event_id
    ORDER BY volume_24h DESC NULLS LAST
    LIMIT 100
"""), {"event_id": event_id}).fetchall()
```

**Result:** Page loads in <500ms instead of 3-5 seconds

#### **Option B: Background Cache Warming (Recommended)**

Keep using live API data but warm cache in background:

1. Run `optimize_db.sql` to create cache table
2. Set up a cron job to refresh cache every 5 minutes:

```bash
# Add to crontab (crontab -e)
*/5 * * * * cd /Users/chethan/coingraph-prediction-terminal/backend && source venv/bin/activate && python populate_cache.py
```

3. Modify the analytics endpoint to use cache first, API as fallback

**Result:** First load slow, subsequent loads instant

#### **Option C: Parallel API Calls (Medium improvement)**

The current code already does this (batch_size=10), but you could:
- Increase batch size to 20
- Use asyncio.gather with more concurrent requests
- Add connection pooling

**Expected improvement:** 30-40% faster (still 2-3 seconds)

## Recommended Approach

**For best performance:**

1. ✅ **Run `optimize_db.sql`** (adds indexes) - Do this now
2. ✅ **Use database data instead of API calls** - Fastest solution
3. ⏰ **Optional: Set up background cache refresh** - For keeping data fresh

## Why API Calls Are Slow

- Each market requires 1 API call to Polymarket/Dome
- 26 markets = 26 API calls (even batched in groups of 10)
- Network latency: ~100-200ms per request
- Total: 2-4 seconds just waiting for API responses

**Your database already has all this data!** You're re-fetching it unnecessarily.

## Implementation Priority

1. **High Priority:** Run `optimize_db.sql` (5 min)
2. **High Priority:** Modify analytics endpoint to use DB instead of API (30 min)
3. **Medium Priority:** Add cache refresh cron job (10 min)
4. **Low Priority:** Add computed fields to events table (optional)

## Files Created

- `backend/optimize_db.sql` - Database indexes and cache tables
- `backend/populate_cache.py` - Script to populate cache from existing data

## Next Steps

Would you like me to:
1. Modify the analytics endpoint to use database instead of API calls?
2. Just run the SQL optimizations?
3. Both?
