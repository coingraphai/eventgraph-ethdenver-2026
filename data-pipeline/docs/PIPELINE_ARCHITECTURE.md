# Pipeline Architecture

## Overview

The prediction market data ingestion pipeline follows a **Bronze → Silver** medallion architecture with optimized batching and concurrency.

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              DATA FLOW DIAGRAM                                   │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│   ┌──────────┐      ┌──────────┐      ┌──────────┐      ┌──────────┐           │
│   │   API    │ ──►  │  Bronze  │ ──►  │  Silver  │ ──►  │  Prices  │           │
│   │  Fetch   │      │  Layer   │      │  Layer   │      │  Update  │           │
│   └──────────┘      └──────────┘      └──────────┘      └──────────┘           │
│        │                 │                 │                 │                  │
│   50 concurrent    Batch insert      Bulk upsert       Single query            │
│   requests         (COPY method)     (500/batch)       for all prices          │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## Layers

### Bronze Layer (Raw Data)
- **Purpose**: Immutable audit trail of all API responses
- **Table**: `predictions_bronze.api_responses_polymarket`
- **Content**: Raw JSON exactly as received from API
- **Deduplication**: Content hash prevents duplicate storage

### Silver Layer (Transformed Data)
- **Purpose**: Normalized, queryable market data
- **Table**: `predictions_silver.markets`
- **Content**: Structured fields (title, question, prices, dates, etc.)
- **Updates**: Upsert on `(source, source_market_id)`

## Load Types

### Static Load (Full Refresh)
```
1. Fetch ALL active markets via paginated API
2. Store raw responses in Bronze
3. Transform and upsert to Silver
4. Fetch prices for all active markets
5. Update Silver with prices
```

### Delta Load (Incremental)
```
1. Fetch markets updated since last run
2. Store new responses in Bronze
3. Transform and upsert changed markets to Silver
4. Fetch prices only for active markets
5. Update Silver with prices
```

## Batching & Concurrency

| Component | Batch Size | Concurrency | Method |
|-----------|------------|-------------|--------|
| **Market Fetch** | 100/page | Sequential | Cursor pagination |
| **Bronze Write (Markets)** | All at once | Single | PostgreSQL COPY |
| **Silver Upsert** | 500/batch | Sequential | Bulk INSERT ON CONFLICT |
| **Price API Calls** | 50/batch | ✅ 50 parallel | asyncio.gather |
| **Bronze Write (Prices)** | 50/batch | Single | PostgreSQL COPY |
| **Silver Price Update** | All at once | Single | Bulk UPDATE |

## API Endpoints Used

### Polymarket via Dome API

| Endpoint | Purpose | Batching |
|----------|---------|----------|
| `GET /polymarket/markets` | List markets | 100/page, cursor pagination |
| `GET /polymarket/market-price/{token_id}` | Get current price | 50 concurrent |
| `GET /polymarket/events` | List events | 100/page (not used in current flow) |

## Code Structure

```
predictions_ingest/
├── ingestion/
│   ├── orchestrator.py      # Main pipeline logic
│   │   ├── PriceFetcher     # Concurrent price fetching
│   │   ├── SourceIngester   # Base class for sources
│   │   └── PolymarketIngester
│   │       ├── run_static() # Full load
│   │       └── run_delta()  # Incremental load
│   │
│   ├── bronze_layer.py      # Raw data storage
│   │   ├── BronzeWriter     # Batch writes with COPY
│   │   └── BronzeReader     # Read for processing
│   │
│   └── silver_layer.py      # Transformed data
│       ├── SilverWriter     # Bulk upserts
│       └── SilverReader     # Read existing state
│
├── api/
│   └── client.py            # Dome API client
│       └── DomeClient
│           ├── fetch_markets()       # Paginated
│           └── fetch_market_price()  # Single price
│
└── cli.py                   # Command-line interface
    ├── ingest static polymarket
    └── ingest delta polymarket
```

## Performance Characteristics

### Static Load (~5,500 markets)
| Phase | Duration | Notes |
|-------|----------|-------|
| Market Fetch | ~90 seconds | 250 pages × 350ms/page |
| Bronze Write | ~10 seconds | Single COPY operation |
| Silver Upsert | ~5 seconds | 11 batches × 500 |
| Price Fetch | ~3 minutes | 110 batches × 50 concurrent |
| Price Update | ~1 second | Single query |
| **Total** | **~5 minutes** | With optimized bronze batch writes |

### Delta Load (typical ~100 markets)
| Phase | Duration | Notes |
|-------|----------|-------|
| Market Fetch | ~5 seconds | Usually 1-2 pages |
| Bronze + Silver | ~2 seconds | Minimal data |
| Price Fetch | ~10 seconds | 2 batches |
| **Total** | **~20 seconds** | |

## Key Optimizations

### 1. Client-Side Filtering
```python
# API returns ALL markets, we filter locally
active_markets = [m for m in raw_markets if m.get("active", False)]
```

### 2. Concurrent Price Fetching
```python
# 50 parallel API calls
results = await asyncio.gather(*[
    self._fetch_single_price(token_id, market_id)
    for market, token_id in batch
], return_exceptions=True)
```

### 3. Batch Bronze Writes
```python
# Add all to batch, flush once
for record in bronze_records:
    self.bronze_writer.add_to_batch(...)
await self.bronze_writer.flush_batch()  # Single DB write
```

### 4. Bulk Silver Upserts
```python
# PostgreSQL COPY + INSERT ON CONFLICT
await conn.copy_records_to_table(temp_table, records=batch)
await conn.execute("""
    INSERT INTO predictions_silver.markets 
    SELECT * FROM temp_table
    ON CONFLICT (source, source_market_id) DO UPDATE SET ...
""")
```

### 5. Token ID Caching
```python
# Single query to get all token IDs from silver
token_ids = await conn.fetch("""
    SELECT source_market_id, extra_data->'side_a'->>'id' as token_id
    FROM predictions_silver.markets
    WHERE source = 'polymarket' AND source_market_id = ANY($1)
""", market_ids)
```

## Configuration

Environment variables in `.env`:
```bash
# API
DOME_API_KEY=your_key
DOME_BASE_URL=https://api.dome.io

# Database
POSTGRES_HOST=your_host
POSTGRES_PORT=25060
POSTGRES_DB=defaultdb
POSTGRES_USER=your_user
POSTGRES_PASSWORD=your_password

# Performance tuning
PRICE_FETCH_BATCH_SIZE=50  # Concurrent price API calls
```

## Running the Pipeline

```bash
# Activate environment
source .venv/bin/activate

# Full static load
python -m predictions_ingest.cli ingest static polymarket

# Incremental delta load
python -m predictions_ingest.cli ingest delta polymarket

# With verbose logging
python -m predictions_ingest.cli ingest static polymarket -v
```

## Monitoring

Key log messages to watch:
```
[info] Fetched markets batch  active_count=42 page=65 total_active=2414
[info] Flushed bronze batch   duplicates=0 inserted=50 total=50
[info] Upserted markets       upserted=5444 errors=0
[info] Processed price batch  batch=50/109 fetched=50
[info] Batch updated market prices count=5400
```
