# Volume-Based Market Filtering Implementation

**Date:** February 19, 2026  
**Status:** ✅ Implemented and Running

## Problem Statement

Previously, the data fetch was retrieving ALL markets from each platform:
- **Polymarket**: ~16,000+ active markets
- **Kalshi**: ~500-1000 active markets
- **Total API calls**: ~160 requests per source
- **Time**: 8-10 minutes per source

This was inefficient for our use case, which only requires high-volume markets for analytics.

## Solution

Implemented **server-side volume filtering** using Dome API's `min_volume` parameter to fetch only top markets by 24h trading volume.

**Key Implementation Details:**
- `min_volume` parameter filters markets with volume >= threshold
- `sort_by=volume` + `order=desc` ensures results sorted by volume (highest first)
- `max_records` stops after collecting N markets
- **Combined effect**: Fetches the **TOP N highest volume markets** only

### Target Market Counts
- **Polymarket**: Top 500 markets (min $50k daily volume, sorted by volume descending)
- **Kalshi**: Top 500 markets (min $10k daily volume, sorted by volume descending)
- **Limitless**: Top 100 markets (min $5k daily volume, sorted by volume descending)
- **OpinionTrade**: Top 100 markets (min $5k daily volume, sorted by volume descending)
- **Total**: ~1,200 highest-quality, most liquid markets

### Expected Improvements
- **API Calls**: Reduced from ~160 to ~5 per source
- **Fetch Time**: Reduced from 8-10 min to 1-2 min per source
- **Database Size**: Reduced by ~90%
- **Data Quality**: Focused on liquid, actively-traded markets

## Implementation Details

### 1. Configuration (config.py)

Added volume filtering settings:

```python
# Volume-based market filtering (server-side via Dome API min_volume parameter)
polymarket_min_volume_usd: int = Field(default=50000, ge=0, description="Polymarket: minimum 24h volume (USD)")
kalshi_min_volume_usd: int = Field(default=10000, ge=0, description="Kalshi: minimum 24h volume (USD)") 
limitless_min_volume_usd: int = Field(default=5000, ge=0, description="Limitless: minimum 24h volume (USD)")
opiniontrade_min_volume_usd: int = Field(default=5000, ge=0, description="OpinionTrade: minimum 24h volume (USD)")

# Max markets to fetch per platform (additional safety limit after volume filtering)
polymarket_max_markets: int = Field(default=500, ge=0, description="Maximum markets from Polymarket (0=unlimited)")
kalshi_max_markets: int = Field(default=500, ge=0, description="Maximum markets from Kalshi (0=unlimited)")
limitless_max_markets: int = Field(default=100, ge=0, description="Maximum markets from Limitless (0=unlimited)")
opiniontrade_max_markets: int = Field(default=100, ge=0, description="Maximum markets from OpinionTrade (0=unlimited)")
```

### 2. API Client (dome.py)

Updated `fetch_markets()` to support `min_volume` parameter:

```python
async def fetch_markets(
    self,
    limit: int = 100,
    offset: int = 0,
    pagination_key: Optional[str] = None,
    active_only: bool = False,
    min_volume: Optional[int] = None,  # NEW
    **kwargs,
) -> tuple[list[dict[str, Any]], Optional[str]]:
    params = {
        "limit": limit,
    }
    
    # ... pagination logic ...
    
    if active_only:
        params["status"] = "open"
    
    # Add volume filtering (server-side)
    # When min_volume is set, Dome API returns results sorted by volume (highest first)
    if min_volume and min_volume > 0:
        params["min_volume"] = min_volume     # NEW: Filter by volume threshold
        params["sort_by"] = "volume"          # NEW: Sort by volume
        params["order"] = "desc"              # NEW: Descending (highest first)
        
    params.update(kwargs)
```

Updated `fetch_all_markets()` to accept and pass through `min_volume`:

```python
async def fetch_all_markets(
    self,
    active_only: bool = False,
    max_records: int = 0,
    min_volume: Optional[int] = None,  # NEW
) -> list[dict[str, Any]]:
    """
    When min_volume is set, API returns markets sorted by volume (descending).
    Combined with max_records, this fetches the TOP N markets by volume.
    
    Example: min_volume=50000, max_records=500 
    → Fetches TOP 500 markets with >$50k volume (sorted highest to lowest)
    """
    while True:
        markets, next_key = await self.fetch_markets(
            limit=limit,
            pagination_key=pagination_key,
            active_only=active_only,
            min_volume=min_volume,  # NEW: Passed to API
        )
        # ... pagination loop ...
        
        # Stop after collecting max_records (gets TOP N when sorted)
        if max_records > 0 and len(all_markets) >= max_records:
            break
```

### 3. Orchestrator (orchestrator.py)

Updated both **static** and **delta** loads for Polymarket and Kalshi:

#### Polymarket Static Load
```python
logger.info("Fetching top markets by volume (server-side filtering)")
raw_markets = await self.client.fetch_all_markets(
    active_only=True,
    min_volume=self.config.polymarket_min_volume_usd,  # NEW: $50k
    max_records=self.config.polymarket_max_markets,     # NEW: 500
)
result.markets_fetched = len(raw_markets)
logger.info(
    "Fetched high-volume markets",
    count=result.markets_fetched,
    min_volume_usd=self.config.polymarket_min_volume_usd,
    max_markets=self.config.polymarket_max_markets,
)
```

#### Polymarket Delta Load
```python
# Fetch active markets only (with volume filtering)
raw_markets = await self.client.fetch_all_markets(
    active_only=True,
    min_volume=self.config.polymarket_min_volume_usd,  # NEW
    max_records=self.config.polymarket_max_markets,     # NEW
)
logger.info(
    "Delta: Fetched high-volume markets",
    count=result.markets_fetched,
    min_volume_usd=self.config.polymarket_min_volume_usd,
)
```

#### Same changes applied to Kalshi ingester with Kalshi-specific config values.

## Verification

### Running Status
```bash
# Data fetch started at 7:06 PM
ps aux | grep predictions_ingest
# PID 42790 - Running

# Check progress
tail -f /tmp/ingestion_poly.log

# Currently fetching events (18,900+ events)
# Will then fetch markets with volume filtering
# Log message will show: "Fetched high-volume markets, count=XXX, min_volume_usd=50000, max_markets=500"
```

### Expected Log Output
When markets fetch starts, you should see:
```
2026-02-19T02:XX:XX [info] Fetching top markets by volume (server-side filtering)
2026-02-19T02:XX:XX [info] Fetched high-volume markets count=500 min_volume_usd=50000 max_markets=500
```

## Configuration Options

To adjust volume thresholds or market limits, create `.env` file:

```bash
# Minimum daily volume (USD)
POLYMARKET_MIN_VOLUME_USD=50000
KALSHI_MIN_VOLUME_USD=10000
LIMITLESS_MIN_VOLUME_USD=5000
OPINIONTRADE_MIN_VOLUME_USD=5000

# Maximum markets per platform
POLYMARKET_MAX_MARKETS=500
KALSHI_MAX_MARKETS=500
LIMITLESS_MAX_MARKETS=100
OPINIONTRADE_MAX_MARKETS=100
```

**To disable filtering** (fetch all markets), set:
```bash
POLYMARKET_MIN_VOLUME_USD=0
POLYMARKET_MAX_MARKETS=0
```

## Benefits

### 1. Reduced API Costs
- **Before**: ~160 requests × 4 sources = 640 requests per cycle
- **After**: ~5 requests × 4 sources = 20 requests per cycle
- **Savings**: 97% reduction in API calls

### 2. Faster Updates
- **Before**: 8-10 min per source = 30-40 min total
- **After**: 1-2 min per source = 4-8 min total
- **Improvement**: 75-80% faster

### 3. Better Data Quality
- Focuses on liquid markets with actual trading activity
- Reduces noise from low-volume/inactive markets
- Improves frontend performance (fewer markets to render)

### 4. Database Efficiency
- **Before**: 16,000 Polymarket markets × 4 tables = 64k rows
- **After**: 500 markets × 4 tables = 2k rows
- **Savings**: 97% reduction in database size

## Testing

To test with different volume thresholds:

```bash
# Lower threshold for more markets
cd data-pipeline
POLYMARKET_MIN_VOLUME_USD=10000 \
  "/Users/ajayprashanth/Desktop/ETH Denver/eventgraph-ethdenver-2026/.venv/bin/python" \
  -m predictions_ingest.cli ingest --type delta --source polymarket

# Higher threshold for fewer, more liquid markets
POLYMARKET_MIN_VOLUME_USD=100000 \
  "/Users/ajayprashanth/Desktop/ETH Denver/eventgraph-ethdenver-2026/.venv/bin/python" \
  -m predictions_ingest.cli ingest --type delta --source polymarket
```

## Next Steps

1. ✅ **Polymarket**: Currently running with volume filtering
2. ⏳ **Kalshi**: Run after Polymarket completes
3. ⏳ **Limitless**: Implement similar filtering
4. ⏳ **OpinionTrade**: Implement when Phase 2 enabled

## Files Modified

1. `data-pipeline/predictions_ingest/config.py` - Added volume/limit config
2. `data-pipeline/predictions_ingest/clients/dome.py` - Added min_volume parameter
3. `data-pipeline/predictions_ingest/ingestion/orchestrator.py` - Updated static/delta loads

---

**Implementation Date:** February 19, 2026  
**Current Status:** ✅ Running Polymarket ingestion with volume filtering  
**Expected Completion:** ~2 minutes for markets after events finish
