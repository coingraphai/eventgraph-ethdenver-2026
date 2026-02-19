"""
Ingestion orchestrator v2: Clean, optimized data pipeline.

Key optimizations:
- Fetch ONLY active markets from API (using server-side filters)
- Skip events (informational only, not needed for analytics)
- Skip trades (historical, not needed for price data)
- Batch price fetching with concurrency control
- Minimal orderbook/candlestick fetching

Pipeline Strategy:
==================
- STATIC: One-time bulk load of all active markets + prices
  - Run ONCE initially to bootstrap the database
  - Can be re-run weekly/monthly to ensure data consistency
  - Default schedule: Sunday 2am UTC (configurable)
  - Duration: ~5-10 minutes
  
- DELTA: Incremental update of active markets + prices
  - Run frequently to keep data fresh
  - Default interval: every 1 hour (configurable)
  - Duration: ~1-2 minutes

Configuration (via environment variables or .env file):
======================================================
# Scheduling
STATIC_SCHEDULE_ENABLED=true          # Enable weekly static load
STATIC_SCHEDULE_DAY=sun               # Day of week (sun, mon, tue, etc.)
STATIC_SCHEDULE_HOUR=2                # Hour (UTC) for static load

DELTA_SCHEDULE_ENABLED=true           # Enable delta loads
DELTA_SCHEDULE_INTERVAL_HOURS=1       # Run delta every N hours (1-24)
DELTA_SCHEDULE_INTERVAL_MINUTES=0     # Override: run every N minutes (for testing)
RUN_DELTA_ON_STARTUP=true             # Run delta immediately on startup

# Pipeline tuning
PRICE_FETCH_BATCH_SIZE=50             # Concurrent price API requests (10-100)
ORDERBOOK_FETCH_TOP_N=20              # Fetch orderbooks for top N markets (0=skip)
PRICE_HISTORY_HOURS=6                 # Hours of history in delta loads (1-168)

# Enable/disable sources
ENABLE_POLYMARKET=true
ENABLE_KALSHI=true
ENABLE_LIMITLESS=true
ENABLE_OPINIONTRADE=false
"""
import asyncio
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from enum import Enum
from typing import Any, Optional

import structlog

from predictions_ingest.clients import DomeClient, LimitlessClient, OpinionTradeClient, get_client
from predictions_ingest.config import get_settings
from predictions_ingest.database import get_db
from predictions_ingest.ingestion.bronze_layer import BronzeWriter
from predictions_ingest.ingestion.silver_layer import SilverReader, SilverWriter
from predictions_ingest.models import DataSource, RunResult

logger = structlog.get_logger()


class LoadType(str, Enum):
    STATIC = "static"  # Full load of active markets
    DELTA = "delta"    # Incremental update


@dataclass
class IngestionResult:
    """Result of an ingestion run."""
    source: DataSource
    load_type: LoadType
    run_id: str
    started_at: datetime
    finished_at: Optional[datetime] = None
    success: bool = False
    error: Optional[str] = None
    
    # Metrics
    markets_fetched: int = 0
    markets_upserted: int = 0
    prices_fetched: int = 0
    prices_updated: int = 0
    bronze_records: int = 0
    
    duration_seconds: float = 0.0
    
    def to_dict(self) -> dict[str, Any]:
        return {
            "source": self.source.value,
            "load_type": self.load_type.value,
            "run_id": self.run_id,
            "started_at": self.started_at.isoformat(),
            "finished_at": self.finished_at.isoformat() if self.finished_at else None,
            "success": self.success,
            "error": self.error,
            "metrics": {
                "markets_fetched": self.markets_fetched,
                "markets_upserted": self.markets_upserted,
                "prices_fetched": self.prices_fetched,
                "prices_updated": self.prices_updated,
                "bronze_records": self.bronze_records,
            },
            "duration_seconds": self.duration_seconds,
        }


# =============================================================================
# PRICE FETCHER - Shared optimized price fetching logic
# =============================================================================

class PriceFetcher:
    """
    Optimized price fetching with batching and concurrency.
    
    Strategy:
    1. Batch fetch token IDs from DB (1 query for all markets)
    2. Fetch prices with N concurrent API requests (configurable)
    3. Batch update database (1 query)
    
    Configuration (via settings):
    - price_fetch_batch_size: Number of concurrent API requests (default: 50)
    """
    
    def __init__(self, client: DomeClient, bronze_writer: BronzeWriter, source: DataSource):
        self.client = client
        self.bronze_writer = bronze_writer
        self.source = source
        self.settings = get_settings()
        self.batch_size = self.settings.price_fetch_batch_size  # Configurable
    
    async def _get_token_ids_batch(self, markets: list) -> dict[str, str]:
        """
        Get YES token IDs for multiple markets.
        
        For Polymarket, prices require the YES token ID (side_a.id), not the condition_id.
        The token IDs are stored in the extra_data column of silver_markets.
        """
        if self.source != DataSource.POLYMARKET:
            # Other sources use market_id directly for prices
            return {m.source_market_id: m.source_market_id for m in markets}
        
        try:
            # Get token IDs from extra_data in silver_markets
            market_ids = [m.source_market_id for m in markets]
            if not market_ids:
                return {}
            
            db = await get_db()
            async with db.asyncpg_connection() as conn:
                # Query extra_data->side_a->id for each market
                results = await conn.fetch("""
                    SELECT source_market_id,
                           extra_data->'side_a'->>'id' as yes_token_id
                    FROM predictions_silver.markets
                    WHERE source = $1
                      AND source_market_id = ANY($2)
                      AND extra_data->'side_a'->>'id' IS NOT NULL
                """, self.source.value, market_ids)
                
                token_map = {row['source_market_id']: row['yes_token_id'] for row in results}
                logger.debug("Fetched token IDs from silver", found=len(token_map), requested=len(market_ids))
                return token_map
            
        except Exception as e:
            logger.warning("Failed to batch fetch token IDs", error=str(e))
            return {}
    
    async def _fetch_single_price(self, token_id: str, market_id: str) -> Optional[dict]:
        """Fetch a single price with error handling."""
        try:
            return await self.client.fetch_market_price(token_id)
        except Exception as e:
            logger.debug("Failed to fetch price", market_id=market_id, token_id=token_id, error=str(e))
            return None
    
    async def fetch_prices_batch(
        self,
        markets: list,
        run_id: str,
    ) -> tuple[int, int]:
        """
        Fetch and update prices for all markets with optimized batching.
        
        OPTIMIZED: 
        - Filter markets WITH token IDs upfront (skips ~5% without IDs)
        - 50 concurrent API calls per batch
        - Batch bronze writes (all prices in batch written together)
        - Single bulk update to silver at end
        
        Returns:
            Tuple of (prices_fetched, prices_updated)
        """
        if not markets:
            return 0, 0
        
        logger.info("Fetching prices for active markets", count=len(markets), source=self.source.value)
        
        # Step 1: Batch fetch all token IDs (1 DB query) - ONLY get markets WITH token IDs
        token_id_map = await self._get_token_ids_batch(markets)
        logger.info("Retrieved token IDs", count=len(token_id_map), total_markets=len(markets), 
                   skipped_without_token_id=len(markets) - len(token_id_map))
        
        # OPTIMIZATION: Only process markets that have token IDs
        markets_with_tokens = [m for m in markets if m.source_market_id in token_id_map]
        if not markets_with_tokens:
            logger.warning("No markets with token IDs found")
            return 0, 0
        
        logger.info("Processing markets with token IDs", count=len(markets_with_tokens))
        
        # Step 2: Fetch prices with concurrency control
        prices_fetched = 0
        price_updates = []
        
        for i in range(0, len(markets_with_tokens), self.batch_size):
            batch_markets = markets_with_tokens[i:i + self.batch_size]
            tasks = []
            
            for market in batch_markets:
                token_id = token_id_map.get(market.source_market_id)
                # No need to check if token_id exists - we pre-filtered markets
                tasks.append((market, token_id, self._fetch_single_price(token_id, market.source_market_id)))
            
            if not tasks:
                continue
            
            # Execute batch concurrently (50 parallel API calls)
            results = await asyncio.gather(*[task[2] for task in tasks], return_exceptions=True)
            
            # Collect bronze records and price updates for this batch
            bronze_records = []
            batch_price_updates = []
            
            for (market, token_id, _), raw_price in zip(tasks, results):
                if raw_price and not isinstance(raw_price, Exception):
                    try:
                        # Collect for batch bronze write
                        bronze_records.append({
                            'raw_price': raw_price,
                            'token_id': token_id,
                        })
                        
                        # Extract price data
                        yes_price = Decimal(str(raw_price.get("price", 0)))
                        no_price = Decimal("1.0") - yes_price
                        
                        batch_price_updates.append({
                            'source_market_id': market.source_market_id,
                            'yes_price': yes_price,
                            'no_price': no_price,
                        })
                        prices_fetched += 1
                        
                    except Exception as e:
                        logger.debug("Failed to process price", market_id=market.source_market_id, error=str(e))
            
            # BATCH write to bronze (all prices in this batch at once)
            if bronze_records:
                try:
                    # Add all records to batch without flushing
                    for record in bronze_records:
                        self.bronze_writer.add_to_batch(
                            source=self.source,
                            endpoint=f"/{self.source.value}/market-price/{record['token_id']}",
                            body=record['raw_price'],
                            run_id=run_id,
                        )
                    # Flush once for the entire batch (single DB write for 50 prices)
                    await self.bronze_writer.flush_batch()
                except Exception as e:
                    logger.warning("Bronze batch write failed, continuing", error=str(e))
            
            price_updates.extend(batch_price_updates)
            
            batch_num = i // self.batch_size + 1
            total_batches = (len(markets) + self.batch_size - 1) // self.batch_size
            logger.info(f"Processed price batch {batch_num}/{total_batches}", 
                       fetched=len(batch_price_updates))
        
        # Step 3: Batch update prices in database (1 query)
        prices_updated = 0
        if price_updates:
            try:
                db = await get_db()
                async with db.asyncpg_connection() as conn:
                    await conn.executemany("""
                        UPDATE predictions_silver.markets
                        SET yes_price = $2,
                            no_price = $3,
                            last_updated_at = NOW()
                        WHERE source_market_id = $1 AND source = $4
                    """, [(p['source_market_id'], p['yes_price'], p['no_price'], self.source.value) for p in price_updates])
                    prices_updated = len(price_updates)
                    logger.info("Batch updated market prices", count=prices_updated)
            except Exception as e:
                logger.error("Failed to batch update prices", error=str(e))
        
        return prices_fetched, prices_updated


# =============================================================================
# TRADES FETCHER - Optimized trades fetching with filters
# =============================================================================

class TradesFetcher:
    """
    Optimized trades fetching with time and volume filters.
    
    Strategy:
    1. Filter top N markets by volume (reduce API calls)
    2. Fetch trades from last N hours with server-side timestamp filter
    3. Limit trades per market to avoid excessive pagination (max_per_market)
    4. Filter trades > minimum USD amount client-side (API has no value filter)
    5. Batch write to Bronze then insert to Silver
    
    Configuration:
    - trades_top_n_markets: Fetch trades only for top N markets by volume (default: 100)
    - trades_since_hours: Fetch trades from last N hours (default: 24) - SERVER-SIDE FILTER
    - trades_max_per_market: Max trades to fetch per market (default: 1000) - LIMITS API CALLS
    - trades_min_usd: Minimum trade value in USD to store (default: 1000) - CLIENT-SIDE FILTER
    
    Note: The Dome API does not support server-side filtering by trade value,
    so trades_min_usd is applied client-side after fetching. Use trades_max_per_market
    to limit API calls for high-volume markets.
    """
    
    def __init__(self, client: DomeClient, bronze_writer: BronzeWriter, silver_writer: SilverWriter, source: DataSource):
        self.client = client
        self.bronze_writer = bronze_writer
        self.silver_writer = silver_writer
        self.source = source
        self.settings = get_settings()
        # Use per-source top_n if available (Kalshi has separate limit)
        if source == DataSource.KALSHI:
            self.top_n_markets = getattr(self.settings, 'kalshi_trades_top_n_markets', 50)
        else:
            self.top_n_markets = getattr(self.settings, 'trades_top_n_markets', 100)
        self.since_hours = getattr(self.settings, 'trades_since_hours', 24)
        self.min_usd = getattr(self.settings, 'trades_min_usd', 1000)
        self.max_trades_per_market = getattr(self.settings, 'trades_max_per_market', 1000)
    
    async def fetch_trades_batch(
        self,
        markets: list,
        run_id: str,
    ) -> tuple[int, int]:
        """
        Fetch recent trades for top markets with volume/time filters.
        
        Returns:
            Tuple of (trades_fetched, trades_inserted)
        """
        if not markets:
            return 0, 0
        
        # Step 1: Filter to top N markets by 24h volume
        top_markets = await self._get_top_markets_by_volume(markets, self.top_n_markets)
        if not top_markets:
            logger.warning("No markets with volume found for trades")
            return 0, 0
        
        logger.info(
            "Fetching trades for top markets",
            top_n=len(top_markets),
            since_hours=self.since_hours,
            min_usd=self.min_usd,
            source=self.source.value
        )
        
        # Step 2: Calculate time cutoff
        since_time = datetime.utcnow() - timedelta(hours=self.since_hours)
        
        # Step 3: Fetch trades for each market
        trades_fetched = 0
        all_trades = []
        
        for i, market in enumerate(top_markets):
            try:
                # Fetch trades for this market with limit
                raw_trades = await self.client.fetch_all_trades(
                    market_id=market.source_market_id,
                    since=since_time,
                    max_records=self.max_trades_per_market,  # Configurable limit per market
                )
                
                if raw_trades:
                    # Write raw trades to Bronze
                    inserted, _ = await self.bronze_writer.write_batch(
                        records=raw_trades,
                        source=self.source,
                        endpoint=f"/{self.source.value}/trades/{market.source_market_id}",
                        run_id=run_id,
                    )
                    
                    # Normalize trades
                    for raw_trade in raw_trades:
                        try:
                            trade = self.client.normalize_trade(raw_trade, market.source_market_id)
                            
                            # Apply volume filter
                            if trade.total_value and float(trade.total_value) >= self.min_usd:
                                all_trades.append(trade)
                        except Exception as e:
                            logger.debug("Failed to normalize trade", error=str(e), market=market.source_market_id)
                    
                    trades_fetched += len(raw_trades)
                    
                    if (i + 1) % 10 == 0:
                        logger.info(
                            f"Processed trades for {i + 1}/{len(top_markets)} markets",
                            trades_fetched=trades_fetched,
                            trades_filtered=len(all_trades)
                        )
                        
            except Exception as e:
                logger.debug("Failed to fetch trades for market", market=market.source_market_id, error=str(e))
        
        # Step 4: Batch insert trades to Silver
        trades_inserted = 0
        if all_trades:
            try:
                trades_inserted = await self.silver_writer.insert_trades(all_trades)
                logger.info(
                    "Trades fetching completed",
                    fetched=trades_fetched,
                    filtered=len(all_trades),
                    inserted=trades_inserted,
                )
            except Exception as e:
                logger.error("Failed to insert trades", error=str(e))
        
        return trades_fetched, trades_inserted
    
    async def _get_top_markets_by_volume(self, markets: list, top_n: int) -> list:
        """
        Get top N markets by 24h volume from database.
        Fallback to all markets if volume data not available.
        """
        try:
            market_ids = [m.source_market_id for m in markets]
            if not market_ids:
                return []
            
            db = await get_db()
            async with db.asyncpg_connection() as conn:
                # Get markets with highest 24h volume
                results = await conn.fetch("""
                    SELECT source_market_id, volume_24h
                    FROM predictions_silver.markets
                    WHERE source = $1
                      AND source_market_id = ANY($2)
                      AND volume_24h > 0
                    ORDER BY volume_24h DESC
                    LIMIT $3
                """, self.source.value, market_ids, top_n)
                
                if not results:
                    logger.warning("No markets with volume found, using all markets")
                    return markets[:top_n]
                
                # Map back to market objects
                top_market_ids = {row['source_market_id'] for row in results}
                top_markets = [m for m in markets if m.source_market_id in top_market_ids]
                
                logger.info(
                    "Selected top markets by volume",
                    requested=top_n,
                    found=len(top_markets),
                    total=len(markets)
                )
                
                return top_markets
                
        except Exception as e:
            logger.warning("Failed to get top markets by volume", error=str(e))
            return markets[:top_n]


# =============================================================================
# SOURCE INGESTERS
# =============================================================================

class SourceIngester:
    """Base class for source-specific ingestion logic."""
    
    SOURCE: DataSource
    
    def __init__(self):
        self.bronze_writer = BronzeWriter()
        self.silver_writer = SilverWriter()
        self.silver_reader = SilverReader()
        self.settings = get_settings()
    
    async def run_static(self, run_id: str) -> IngestionResult:
        """Full data load - fetches all active markets."""
        raise NotImplementedError
    
    async def run_delta(self, run_id: str) -> IngestionResult:
        """Incremental load - updates active markets."""
        raise NotImplementedError
    
    async def _record_run(self, result: IngestionResult):
        """Record run metadata to database."""
        db = await get_db()
        
        async with db.asyncpg_connection() as conn:
            await conn.execute("""
                INSERT INTO predictions_ingestion.sync_state (
                    source, endpoint_name, last_success_at, last_success_run_id,
                    total_records_stored, consecutive_errors, last_error_at, last_error_message
                )
                VALUES ($1, 'all', $2, $3::uuid, $4, $5, $6, $7)
                ON CONFLICT (source, endpoint_name) DO UPDATE SET
                    last_success_at = CASE WHEN EXCLUDED.consecutive_errors = 0 THEN EXCLUDED.last_success_at ELSE predictions_ingestion.sync_state.last_success_at END,
                    last_success_run_id = CASE WHEN EXCLUDED.consecutive_errors = 0 THEN EXCLUDED.last_success_run_id ELSE predictions_ingestion.sync_state.last_success_run_id END,
                    total_records_stored = predictions_ingestion.sync_state.total_records_stored + EXCLUDED.total_records_stored,
                    consecutive_errors = CASE WHEN EXCLUDED.consecutive_errors = 0 THEN 0 ELSE predictions_ingestion.sync_state.consecutive_errors + 1 END,
                    last_error_at = EXCLUDED.last_error_at,
                    last_error_message = EXCLUDED.last_error_message,
                    updated_at = NOW()
            """,
                result.source.value,
                result.finished_at or datetime.utcnow() if result.success else None,
                result.run_id if result.success else None,
                result.markets_upserted + result.prices_updated,
                0 if result.success else 1,
                None if result.success else (result.finished_at or datetime.utcnow()),
                result.error,
            )


# =============================================================================
# POLYMARKET INGESTER (via Dome API)
# =============================================================================

class DomePolymarketIngester(SourceIngester):
    """
    Optimized Polymarket ingester via Dome API.
    
    Static Load (~5-10 min):
    1. Fetch ONLY active markets using active=true filter
    2. Store in Bronze + Silver layers
    3. Batch fetch prices with 50 concurrent requests
    
    Delta Load (~1-2 min):
    1. Fetch active markets (they change frequently)
    2. Update prices for all active markets
    """
    
    SOURCE = DataSource.POLYMARKET
    
    def __init__(self):
        super().__init__()
        self.client = DomeClient(source=DataSource.POLYMARKET)
        self.price_fetcher = PriceFetcher(self.client, self.bronze_writer, self.SOURCE)
        self.trades_fetcher = TradesFetcher(self.client, self.bronze_writer, self.silver_writer, self.SOURCE)
    
    async def run_static(self, run_id: str) -> IngestionResult:
        """
        Full load: Active markets + prices.
        
        Optimizations:
        - Uses active_only=True to fetch markets with status='open' or 'active' (~16,000+ markets)
        - Excludes 'closed' markets to avoid fetching 315,000+ historical markets
        - Skips events (informational, not needed)
        - Skips trades (historical, not needed for analytics)
        - Batch price fetching with 50 concurrent requests
        """
        result = IngestionResult(
            source=self.SOURCE,
            load_type=LoadType.STATIC,
            run_id=run_id,
            started_at=datetime.utcnow(),
        )
        
        try:
            logger.info("Starting Polymarket static load (open + active markets)", run_id=run_id)
            await self.client.connect()
            
            # =====================================================
            # STEP 0: SKIP events for now (optional metadata)
            # Note: 1 event can have multiple markets (e.g., "2024 Election" event has 5+ markets)
            # Top 1000 events != top 500 markets by volume
            # We focus on markets first since they're the core data
            # =====================================================
            
            # =====================================================
            # STEP 1: Fetch all pages and filter for status='open'
            # API returns mixed open/closed markets across all pages
            # Will process all ~15k markets and keep ~8k open markets
            # 
            # OPTIMIZATION: Use min_volume and max_records to fetch only top markets
            # This reduces API calls from ~160 to ~5 per source
            # =====================================================
            logger.info("Fetching top markets by volume (server-side filtering)")
            raw_markets = await self.client.fetch_all_markets(
                active_only=True,
                min_volume=self.settings.polymarket_min_volume_usd,
                max_records=self.settings.polymarket_max_markets,
            )
            result.markets_fetched = len(raw_markets)
            logger.info(
                "Fetched high-volume markets",
                count=result.markets_fetched,
                min_volume_usd=self.settings.polymarket_min_volume_usd,
                max_markets=self.settings.polymarket_max_markets,
            )
            
            # Store in Bronze layer
            inserted, _ = await self.bronze_writer.write_batch(
                records=raw_markets,
                source=self.SOURCE,
                endpoint="/polymarket/markets",
                run_id=run_id,
            )
            result.bronze_records += inserted
            
            # Normalize and store in Silver layer
            markets = [self.client.normalize_market(m) for m in raw_markets]
            upserted, _ = await self.silver_writer.upsert_markets(markets)
            result.markets_upserted = upserted
            
            # =====================================================
            # STEP 2: Fetch prices for all active markets
            # NOTE: Dome API markets endpoint does NOT include prices!
            # We must call /market-price/{token_id} for each market.
            # Using concurrent batching (50 parallel requests) this takes ~2 mins.
            # =====================================================
            active_markets = [m for m in markets if m.is_active]
            logger.info("Fetching prices for active markets", count=len(active_markets))
            
            prices_fetched, prices_updated = await self.price_fetcher.fetch_prices_batch(
                markets=active_markets,
                run_id=run_id,
            )
            result.prices_fetched = prices_fetched
            result.prices_updated = prices_updated
            logger.info("Prices fetched and updated", fetched=prices_fetched, updated=prices_updated)
            
            # =====================================================
            # STEP 3: Orderbooks for top N markets by volume (configurable)
            # Set ORDERBOOK_FETCH_TOP_N=0 to skip entirely
            # =====================================================
            orderbook_limit = self.settings.orderbook_fetch_top_n
            if orderbook_limit > 0:
                try:
                    top_markets = sorted(
                        active_markets,
                        key=lambda m: m.volume_24h or 0,
                        reverse=True
                    )[:orderbook_limit]
                    
                    for market in top_markets:
                        try:
                            raw_orderbook = await self.client.fetch_orderbook(market.source_market_id)
                            if raw_orderbook:
                                orderbook = self.client.normalize_orderbook(raw_orderbook, market.source_market_id)
                                await self.silver_writer.insert_orderbook(orderbook)
                        except Exception as e:
                            logger.debug("Failed to fetch orderbook", market_id=market.source_market_id)
                            
                    logger.info("Fetched orderbooks for top markets", count=len(top_markets))
                except Exception as e:
                    logger.warning("Failed to fetch orderbooks", error=str(e))
            else:
                logger.info("Skipping orderbook fetching (ORDERBOOK_FETCH_TOP_N=0)")
            
            result.success = True
            logger.info(
                "Polymarket static load completed",
                markets_fetched=result.markets_fetched,
                markets_upserted=result.markets_upserted,
                prices_fetched=result.prices_fetched,
                prices_updated=result.prices_updated,
            )
            
        except Exception as e:
            logger.error("Polymarket static load failed", error=str(e))
            result.error = str(e)
            
        finally:
            result.finished_at = datetime.utcnow()
            result.duration_seconds = (result.finished_at - result.started_at).total_seconds()
            await self._record_run(result)
            await self.client.close()
        
        return result
    
    async def run_delta(self, run_id: str) -> IngestionResult:
        """
        Incremental load: Update active markets + prices.
        
        Optimizations:
        - Fetches only active markets
        - Updates prices for all active markets
        - Skips trades/events
        """
        result = IngestionResult(
            source=self.SOURCE,
            load_type=LoadType.DELTA,
            run_id=run_id,
            started_at=datetime.utcnow(),
        )
        
        try:
            logger.info("Starting Polymarket delta load", run_id=run_id)
            await self.client.connect()
            
            # Skip events for delta loads (optional metadata, 1 event = multiple markets)
            # Events don't have volume, so top N events != top N markets by volume
            # Focus on markets which are the core trading instruments
            
            # Fetch active markets only (with volume filtering)
            raw_markets = await self.client.fetch_all_markets(
                active_only=True,
                min_volume=self.settings.polymarket_min_volume_usd,
                max_records=self.settings.polymarket_max_markets,
            )
            result.markets_fetched = len(raw_markets)
            logger.info(
                "Delta: Fetched high-volume markets",
                count=result.markets_fetched,
                min_volume_usd=self.settings.polymarket_min_volume_usd,
            )
            
            # Store in Bronze
            inserted, _ = await self.bronze_writer.write_batch(
                records=raw_markets,
                source=self.SOURCE,
                endpoint="/polymarket/markets",
                run_id=run_id,
            )
            result.bronze_records += inserted
            
            # Normalize and upsert
            markets = [self.client.normalize_market(m) for m in raw_markets]
            upserted, _ = await self.silver_writer.upsert_markets(markets)
            result.markets_upserted = upserted
            
            # Update prices for all active markets
            active_markets = [m for m in markets if m.is_active]
            prices_fetched, prices_updated = await self.price_fetcher.fetch_prices_batch(
                markets=active_markets,
                run_id=run_id,
            )
            result.prices_fetched = prices_fetched
            result.prices_updated = prices_updated
            
            # Fetch recent trades for top markets (if configured)
            if self.settings.trades_top_n_markets > 0:
                trades_fetched, trades_inserted = await self.trades_fetcher.fetch_trades_batch(
                    markets=active_markets,
                    run_id=run_id,
                )
                # Add trades metrics to result (extend IngestionResult if needed)
                logger.info(
                    "Fetched trades",
                    trades_fetched=trades_fetched,
                    trades_inserted=trades_inserted,
                )
            
            result.success = True
            logger.info(
                "Polymarket delta load completed",
                markets=result.markets_upserted,
                prices=result.prices_updated,
                duration=result.duration_seconds,
            )
            
        except Exception as e:
            logger.error("Polymarket delta load failed", error=str(e))
            result.error = str(e)
            
        finally:
            result.finished_at = datetime.utcnow()
            result.duration_seconds = (result.finished_at - result.started_at).total_seconds()
            await self._record_run(result)
            await self.client.close()
        
        return result


# =============================================================================
# KALSHI INGESTER (via Dome API)
# =============================================================================

class DomeKalshiIngester(SourceIngester):
    """
    Optimized Kalshi ingester via Dome API.
    
    Note: Kalshi has fewer markets (~100-200 active) so less optimization needed.
    """
    
    SOURCE = DataSource.KALSHI
    
    def __init__(self):
        super().__init__()
        self.client = DomeClient(source=DataSource.KALSHI)
        self.trades_fetcher = TradesFetcher(self.client, self.bronze_writer, self.silver_writer, self.SOURCE)
    
    async def run_static(self, run_id: str) -> IngestionResult:
        """Full load: Active markets + prices."""
        result = IngestionResult(
            source=self.SOURCE,
            load_type=LoadType.STATIC,
            run_id=run_id,
            started_at=datetime.utcnow(),
        )
        
        try:
            logger.info("Starting Kalshi static load", run_id=run_id)
            await self.client.connect()
            
            # Fetch active markets only (with volume filtering)
            raw_markets = await self.client.fetch_all_markets(
                active_only=True,
                min_volume=self.settings.kalshi_min_volume_usd,
                max_records=self.settings.kalshi_max_markets,
            )
            result.markets_fetched = len(raw_markets)
            logger.info(
                "Fetched high-volume Kalshi markets",
                count=result.markets_fetched,
                min_volume_usd=self.settings.kalshi_min_volume_usd,
                max_markets=self.settings.kalshi_max_markets,
            )
            
            # Store in Bronze + Silver
            inserted, _ = await self.bronze_writer.write_batch(
                records=raw_markets,
                source=self.SOURCE,
                endpoint="/kalshi/markets",
                run_id=run_id,
            )
            result.bronze_records += inserted
            
            markets = [self.client.normalize_market(m) for m in raw_markets]
            upserted, _ = await self.silver_writer.upsert_markets(markets)
            result.markets_upserted = upserted
            
            # Fetch prices for active markets
            active_markets = [m for m in markets if m.is_active]
            for market in active_markets:
                try:
                    raw_price = await self.client.fetch_market_price(market.source_market_id)
                    if raw_price:
                        price = self.client.normalize_price(raw_price, market.source_market_id)
                        await self.silver_writer.insert_price(price)
                        result.prices_fetched += 1
                        result.prices_updated += 1
                except Exception as e:
                    logger.debug("Failed to fetch Kalshi price", market_id=market.source_market_id)
            
            # Orderbooks for top markets
            top_markets = sorted(active_markets, key=lambda m: m.volume_24h or 0, reverse=True)[:10]
            for market in top_markets:
                try:
                    raw_orderbook = await self.client.fetch_orderbook(market.source_market_id)
                    if raw_orderbook:
                        orderbook = self.client.normalize_orderbook(raw_orderbook, market.source_market_id)
                        await self.silver_writer.insert_orderbook(orderbook)
                except Exception as e:
                    logger.debug("Failed to fetch orderbook", market_id=market.source_market_id)
            
            # Fetch recent trades for top Kalshi markets
            if self.settings.trades_top_n_markets > 0:
                trades_fetched, trades_inserted = await self.trades_fetcher.fetch_trades_batch(
                    markets=active_markets,
                    run_id=run_id,
                )
                logger.info(
                    "Fetched Kalshi trades (static)",
                    trades_fetched=trades_fetched,
                    trades_inserted=trades_inserted,
                )
            
            result.success = True
            logger.info("Kalshi static load completed", markets=result.markets_upserted, prices=result.prices_updated)
            
        except Exception as e:
            logger.error("Kalshi static load failed", error=str(e))
            result.error = str(e)
            
        finally:
            result.finished_at = datetime.utcnow()
            result.duration_seconds = (result.finished_at - result.started_at).total_seconds()
            await self._record_run(result)
            await self.client.close()
        
        return result
    
    async def run_delta(self, run_id: str) -> IngestionResult:
        """Incremental load: Update markets + prices."""
        result = IngestionResult(
            source=self.SOURCE,
            load_type=LoadType.DELTA,
            run_id=run_id,
            started_at=datetime.utcnow(),
        )
        
        try:
            logger.info("Starting Kalshi delta load", run_id=run_id)
            await self.client.connect()
            
            # Fetch active markets (with volume filtering)
            raw_markets = await self.client.fetch_all_markets(
                active_only=True,
                min_volume=self.settings.kalshi_min_volume_usd,
                max_records=self.settings.kalshi_max_markets,
            )
            result.markets_fetched = len(raw_markets)
            logger.info(
                "Delta: Fetched high-volume Kalshi markets",
                count=result.markets_fetched,
                min_volume_usd=self.settings.kalshi_min_volume_usd,
            )
            
            inserted, _ = await self.bronze_writer.write_batch(
                records=raw_markets,
                source=self.SOURCE,
                endpoint="/kalshi/markets",
                run_id=run_id,
            )
            result.bronze_records += inserted
            
            markets = [self.client.normalize_market(m) for m in raw_markets]
            upserted, _ = await self.silver_writer.upsert_markets(markets)
            result.markets_upserted = upserted
            
            # Update prices
            active_markets = [m for m in markets if m.is_active]
            for market in active_markets:
                try:
                    raw_price = await self.client.fetch_market_price(market.source_market_id)
                    if raw_price:
                        price = self.client.normalize_price(raw_price, market.source_market_id)
                        await self.silver_writer.insert_price(price)
                        result.prices_fetched += 1
                        result.prices_updated += 1
                except Exception as e:
                    logger.debug("Failed to fetch price", market_id=market.source_market_id)
            
            # Fetch recent trades for top Kalshi markets
            if self.settings.trades_top_n_markets > 0:
                trades_fetched, trades_inserted = await self.trades_fetcher.fetch_trades_batch(
                    markets=active_markets,
                    run_id=run_id,
                )
                logger.info(
                    "Fetched Kalshi trades (delta)",
                    trades_fetched=trades_fetched,
                    trades_inserted=trades_inserted,
                )
            
            result.success = True
            logger.info("Kalshi delta load completed", markets=result.markets_upserted, prices=result.prices_updated)
        
        except Exception as e:
            logger.error("Kalshi delta load failed", error=str(e))
            result.error = str(e)
            
        finally:
            result.finished_at = datetime.utcnow()
            result.duration_seconds = (result.finished_at - result.started_at).total_seconds()
            await self._record_run(result)
            await self.client.close()
        
        return result


# =============================================================================
# LIMITLESS INGESTER
# =============================================================================

class LimitlessIngester(SourceIngester):
    """
    Optimized Limitless ingester.
    
    Note: Limitless API already returns only active markets via /markets/active endpoint.
    """
    
    SOURCE = DataSource.LIMITLESS
    
    def __init__(self):
        super().__init__()
        self.client = LimitlessClient()
    
    async def run_static(self, run_id: str) -> IngestionResult:
        """Full load: Active markets + prices."""
        result = IngestionResult(
            source=self.SOURCE,
            load_type=LoadType.STATIC,
            run_id=run_id,
            started_at=datetime.utcnow(),
        )
        
        try:
            logger.info("Starting Limitless static load", run_id=run_id)
            await self.client.connect()
            
            # Fetch categories
            raw_categories = await self.client.fetch_categories()
            if raw_categories:
                raw_categories = [c for c in raw_categories if c is not None]
                await self.bronze_writer.write_batch(
                    records=raw_categories,
                    source=self.SOURCE,
                    endpoint="/categories",
                    run_id=run_id,
                )
                categories = [self.client.normalize_category(c) for c in raw_categories]
                await self.silver_writer.upsert_categories(categories)
            
            # Fetch active markets (Limitless API returns active only by default)
            raw_markets = await self.client.fetch_all_markets()
            raw_markets = [m for m in raw_markets if m is not None]
            result.markets_fetched = len(raw_markets)
            
            if not raw_markets:
                logger.warning("No markets returned from Limitless API")
                result.success = True
                return result
            
            inserted, _ = await self.bronze_writer.write_batch(
                records=raw_markets,
                source=self.SOURCE,
                endpoint="/markets/active",
                run_id=run_id,
            )
            result.bronze_records += inserted
            
            markets = [self.client.normalize_market(m) for m in raw_markets]
            upserted, _ = await self.silver_writer.upsert_markets(markets)
            result.markets_upserted = upserted
            
            # Fetch prices for active markets
            for market in markets:
                try:
                    raw_prices = await self.client.fetch_historical_prices(
                        slug=market.slug or market.source_market_id,
                        interval="1h",
                        limit=24,  # Last 24 hours
                    )
                    if raw_prices:
                        prices = [self.client.normalize_price(p, market.source_market_id) for p in raw_prices]
                        result.prices_updated += await self.silver_writer.insert_prices(prices)
                        result.prices_fetched += len(raw_prices)
                except Exception as e:
                    logger.debug("Failed to fetch Limitless prices", slug=market.slug)
            
            # Orderbooks for top 10 markets
            top_markets = sorted(
                [m for m in markets if m.volume_24h], 
                key=lambda x: x.volume_24h or 0, 
                reverse=True
            )[:10] or markets[:10]
            
            for market in top_markets:
                try:
                    raw_orderbook = await self.client.fetch_orderbook(slug=market.slug or market.source_market_id)
                    if raw_orderbook:
                        orderbook = self.client.normalize_orderbook(raw_orderbook, market.source_market_id)
                        await self.silver_writer.insert_orderbook(orderbook)
                except Exception as e:
                    logger.debug("Failed to fetch orderbook", slug=market.slug)
            
            result.success = True
            logger.info("Limitless static load completed", markets=result.markets_upserted, prices=result.prices_fetched)
            
        except Exception as e:
            logger.error("Limitless static load failed", error=str(e))
            result.error = str(e)
            
        finally:
            result.finished_at = datetime.utcnow()
            result.duration_seconds = (result.finished_at - result.started_at).total_seconds()
            await self._record_run(result)
            await self.client.close()
        
        return result
    
    async def run_delta(self, run_id: str) -> IngestionResult:
        """Incremental load: Update markets + prices."""
        result = IngestionResult(
            source=self.SOURCE,
            load_type=LoadType.DELTA,
            run_id=run_id,
            started_at=datetime.utcnow(),
        )
        
        try:
            logger.info("Starting Limitless delta load", run_id=run_id)
            await self.client.connect()
            
            # Fetch active markets
            raw_markets = await self.client.fetch_all_markets()
            raw_markets = [m for m in raw_markets if m is not None]
            result.markets_fetched = len(raw_markets)
            
            inserted, _ = await self.bronze_writer.write_batch(
                records=raw_markets,
                source=self.SOURCE,
                endpoint="/markets/active",
                run_id=run_id,
            )
            result.bronze_records += inserted
            
            markets = [self.client.normalize_market(m) for m in raw_markets]
            upserted, _ = await self.silver_writer.upsert_markets(markets)
            result.markets_upserted = upserted
            
            # Update prices for top markets by volume
            top_markets = sorted(
                [m for m in markets if m.volume_24h], 
                key=lambda x: x.volume_24h or 0, 
                reverse=True
            )[:50] or markets[:50]
            
            for market in top_markets:
                try:
                    raw_prices = await self.client.fetch_historical_prices(
                        slug=market.slug or market.source_market_id,
                        interval="1h",
                        limit=6,  # Last 6 hours
                    )
                    if raw_prices:
                        prices = [self.client.normalize_price(p, market.source_market_id) for p in raw_prices]
                        result.prices_updated += await self.silver_writer.insert_prices(prices)
                        result.prices_fetched += len(raw_prices)
                except Exception as e:
                    logger.debug("Failed to fetch prices", slug=market.slug)
            
            result.success = True
            logger.info("Limitless delta load completed", markets=result.markets_upserted, prices=result.prices_fetched)
            
        except Exception as e:
            logger.error("Limitless delta load failed", error=str(e))
            result.error = str(e)
            
        finally:
            result.finished_at = datetime.utcnow()
            result.duration_seconds = (result.finished_at - result.started_at).total_seconds()
            await self._record_run(result)
            await self.client.close()
        
        return result


# =============================================================================
# OPINION TRADE INGESTER
# =============================================================================

class OpinionTradeIngester(SourceIngester):
    """
    Optimized Opinion Trade ingester.
    
    Note: OpinionTrade API doesn't have active filter - we filter client-side.
    """
    
    SOURCE = DataSource.OPINIONTRADE
    
    def __init__(self):
        super().__init__()
        self.client = OpinionTradeClient()
    
    async def run_static(self, run_id: str) -> IngestionResult:
        """Full load: Markets + prices."""
        result = IngestionResult(
            source=self.SOURCE,
            load_type=LoadType.STATIC,
            run_id=run_id,
            started_at=datetime.utcnow(),
        )
        
        try:
            logger.info("Starting Opinion Trade static load", run_id=run_id)
            await self.client.connect()
            
            # Fetch all markets (API doesn't support active filter)
            raw_markets = await self.client.fetch_all_markets()
            raw_markets = [m for m in raw_markets if m is not None]
            result.markets_fetched = len(raw_markets)
            
            if not raw_markets:
                logger.warning("No markets returned from Opinion Trade API")
                result.success = True
                return result
            
            inserted, _ = await self.bronze_writer.write_batch(
                records=raw_markets,
                source=self.SOURCE,
                endpoint="/openapi/market",
                run_id=run_id,
            )
            result.bronze_records += inserted
            
            markets = [self.client.normalize_market(m) for m in raw_markets]
            upserted, _ = await self.silver_writer.upsert_markets(markets)
            result.markets_upserted = upserted
            
            # Filter to active markets for price fetching
            active_markets = [m for m in markets if m.is_active]
            logger.info("Fetching prices for active markets", total=len(markets), active=len(active_markets))
            
            # Fetch prices for active markets with token IDs
            for market in active_markets:
                try:
                    token_ids = []
                    if market.extra_data and market.extra_data.get("token_ids"):
                        token_ids = market.extra_data["token_ids"]
                    
                    for token_id in token_ids[:2]:  # Yes and No tokens
                        if not token_id:
                            continue
                        
                        raw_price = await self.client.fetch_latest_price(token_id=str(token_id))
                        if raw_price:
                            price = self.client.normalize_price(raw_price, market.source_market_id)
                            result.prices_updated += await self.silver_writer.insert_prices([price])
                            result.prices_fetched += 1
                            
                except Exception as e:
                    logger.debug("Failed to fetch price", market_id=market.source_market_id)
            
            # Orderbooks for top markets
            top_markets = sorted(
                [m for m in active_markets if m.volume_24h], 
                key=lambda x: x.volume_24h or 0, 
                reverse=True
            )[:10] or active_markets[:10]
            
            for market in top_markets:
                try:
                    token_ids = market.extra_data.get("token_ids", []) if market.extra_data else []
                    for token_id in token_ids[:1]:  # Just yes token
                        if token_id:
                            raw_orderbook = await self.client.fetch_orderbook(token_id=str(token_id))
                            if raw_orderbook:
                                orderbook = self.client.normalize_orderbook(raw_orderbook, market.source_market_id)
                                await self.silver_writer.insert_orderbook(orderbook)
                except Exception as e:
                    logger.debug("Failed to fetch orderbook", market_id=market.source_market_id)
            
            result.success = True
            logger.info("Opinion Trade static load completed", markets=result.markets_upserted, prices=result.prices_fetched)
            
        except Exception as e:
            logger.error("Opinion Trade static load failed", error=str(e))
            result.error = str(e)
            
        finally:
            result.finished_at = datetime.utcnow()
            result.duration_seconds = (result.finished_at - result.started_at).total_seconds()
            await self._record_run(result)
            await self.client.close()
        
        return result
    
    async def run_delta(self, run_id: str) -> IngestionResult:
        """Incremental load: Update markets + prices."""
        result = IngestionResult(
            source=self.SOURCE,
            load_type=LoadType.DELTA,
            run_id=run_id,
            started_at=datetime.utcnow(),
        )
        
        try:
            logger.info("Starting Opinion Trade delta load", run_id=run_id)
            await self.client.connect()
            
            # Fetch all markets
            raw_markets = await self.client.fetch_all_markets()
            raw_markets = [m for m in raw_markets if m is not None]
            result.markets_fetched = len(raw_markets)
            
            inserted, _ = await self.bronze_writer.write_batch(
                records=raw_markets,
                source=self.SOURCE,
                endpoint="/openapi/market",
                run_id=run_id,
            )
            result.bronze_records += inserted
            
            markets = [self.client.normalize_market(m) for m in raw_markets]
            upserted, _ = await self.silver_writer.upsert_markets(markets)
            result.markets_upserted = upserted
            
            # Update prices for active markets
            active_markets = [m for m in markets if m.is_active]
            top_markets = sorted(
                [m for m in active_markets if m.volume_24h], 
                key=lambda x: x.volume_24h or 0, 
                reverse=True
            )[:50] or active_markets[:50]
            
            for market in top_markets:
                try:
                    token_ids = market.extra_data.get("token_ids", []) if market.extra_data else []
                    for token_id in token_ids[:2]:
                        if not token_id:
                            continue
                        
                        raw_price = await self.client.fetch_latest_price(token_id=str(token_id))
                        if raw_price:
                            price = self.client.normalize_price(raw_price, market.source_market_id)
                            result.prices_updated += await self.silver_writer.insert_prices([price])
                            result.prices_fetched += 1
                            
                except Exception as e:
                    logger.debug("Failed to fetch price", market_id=market.source_market_id)
            
            result.success = True
            logger.info("Opinion Trade delta load completed", markets=result.markets_upserted, prices=result.prices_fetched)
            
        except Exception as e:
            logger.error("Opinion Trade delta load failed", error=str(e))
            result.error = str(e)
            
        finally:
            result.finished_at = datetime.utcnow()
            result.duration_seconds = (result.finished_at - result.started_at).total_seconds()
            await self._record_run(result)
            await self.client.close()
        
        return result


# =============================================================================
# INGESTION REGISTRY & ORCHESTRATOR
# =============================================================================

INGESTER_REGISTRY: dict[DataSource, type[SourceIngester]] = {
    DataSource.POLYMARKET: DomePolymarketIngester,
    DataSource.KALSHI: DomeKalshiIngester,
    DataSource.LIMITLESS: LimitlessIngester,
    DataSource.OPINIONTRADE: OpinionTradeIngester,
}


def get_ingester(source: DataSource) -> SourceIngester:
    """Get ingester instance for a data source."""
    ingester_class = INGESTER_REGISTRY.get(source)
    if not ingester_class:
        raise ValueError(f"No ingester registered for source: {source}")
    return ingester_class()


class IngestionOrchestrator:
    """
    Coordinates ingestion across multiple sources.
    """
    
    def __init__(self):
        self.settings = get_settings()
    
    async def run_source(
        self,
        source: DataSource,
        load_type: LoadType,
    ) -> IngestionResult:
        """Run ingestion for a single source."""
        run_id = str(uuid.uuid4())
        
        logger.info(
            "Starting source ingestion",
            source=source.value,
            load_type=load_type.value,
            run_id=run_id,
        )
        
        ingester = get_ingester(source)
        
        if load_type == LoadType.STATIC:
            result = await ingester.run_static(run_id)
        else:
            result = await ingester.run_delta(run_id)
        
        logger.info(
            "Completed source ingestion",
            source=source.value,
            load_type=load_type.value,
            success=result.success,
            duration=f"{result.duration_seconds:.1f}s",
            markets=result.markets_upserted,
            prices=result.prices_updated,
        )
        
        return result
    
    async def run_all_sources(
        self,
        load_type: LoadType,
        sources: Optional[list[DataSource]] = None,
        parallel: bool = True,
    ) -> list[IngestionResult]:
        """
        Run ingestion for all enabled sources.
        
        Args:
            load_type: Static (full) or delta (incremental) load
            sources: List of sources to run (defaults to enabled_sources)
            parallel: If True, run sources concurrently (async). If False, run sequentially.
        
        Returns:
            List of IngestionResult for each source
        """
        if sources is None:
            sources = self.settings.enabled_sources
        
        if parallel:
            # Run all sources in parallel using asyncio.gather
            logger.info(
                "Starting parallel source ingestion",
                load_type=load_type.value,
                sources=[s.value for s in sources],
                count=len(sources),
            )
            
            tasks = []
            for source in sources:
                tasks.append(self._run_source_safe(source, load_type))
            
            # Run all sources concurrently
            results = await asyncio.gather(*tasks, return_exceptions=False)
        else:
            # Sequential execution (legacy behavior)
            logger.info(
                "Starting sequential source ingestion",
                load_type=load_type.value,
                sources=[s.value for s in sources],
                count=len(sources),
            )
            
            results = []
            for source in sources:
                result = await self._run_source_safe(source, load_type)
                results.append(result)
        
        # Log summary
        successful = sum(1 for r in results if r.success)
        total_markets = sum(r.markets_upserted for r in results)
        total_prices = sum(r.prices_updated for r in results)
        
        logger.info(
            "Completed all source ingestion",
            load_type=load_type.value,
            execution_mode="parallel" if parallel else "sequential",
            sources_run=len(results),
            sources_successful=successful,
            total_markets=total_markets,
            total_prices=total_prices,
        )
        
        # Refresh gold layer views
        if successful > 0:
            try:
                await self.refresh_materialized_views()
            except Exception as e:
                logger.warning("Failed to refresh gold views", error=str(e))
        
        return results
    
    async def _run_source_safe(
        self,
        source: DataSource,
        load_type: LoadType,
    ) -> IngestionResult:
        """
        Run a single source with error handling.
        Used internally by run_all_sources for both sequential and parallel execution.
        """
        try:
            result = await self.run_source(source, load_type)
            return result
        except Exception as e:
            logger.error("Source ingestion failed", source=source.value, error=str(e))
            return IngestionResult(
                source=source,
                load_type=load_type,
                run_id=str(uuid.uuid4()),
                started_at=datetime.utcnow(),
                finished_at=datetime.utcnow(),
                success=False,
                error=str(e),
            )
    
    async def refresh_materialized_views(self):
        """Refresh gold layer materialized views after ingestion."""
        db = await get_db()
        
        try:
            async with db.asyncpg_connection() as conn:
                logger.info("Refreshing gold layer materialized views")
                result = await conn.fetch("SELECT * FROM predictions_gold.refresh_all_views()")
                for row in result:
                    logger.info("Refreshed view", view=row["view_name"], duration=str(row["refresh_duration"]))
                logger.info("Gold layer views refreshed", views_refreshed=len(result))
        except Exception as e:
            logger.warning("refresh_all_views failed, trying direct refresh", error=str(e))
            async with db.asyncpg_connection() as conn:
                await conn.execute("REFRESH MATERIALIZED VIEW CONCURRENTLY predictions_gold.market_summary")
                await conn.execute("REFRESH MATERIALIZED VIEW CONCURRENTLY predictions_gold.trade_summary")
                await conn.execute("REFRESH MATERIALIZED VIEW CONCURRENTLY predictions_gold.top_markets")
                logger.info("Gold layer views refreshed (direct)")
