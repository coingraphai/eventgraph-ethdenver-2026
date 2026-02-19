"""
Ingestion orchestrator v2: Clean, optimized data pipeline.

Key optimizations:
- Fetch ONLY active markets from API (using server-side filters)
- Skip events (informational only, not needed for analytics)
- Skip trades (historical, not needed for price data)
- Batch price fetching with concurrency control
- Minimal orderbook/candlestick fetching

Pipeline strategy:
- STATIC: One-time bulk load of active markets + prices (~5-10 min)
- DELTA: Incremental update of active markets + prices (~1-2 min)
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
    2. Fetch prices with 50 concurrent API requests
    3. Batch update database (1 query)
    """
    
    BATCH_SIZE = 50  # Concurrent API requests
    
    def __init__(self, client: DomeClient, bronze_writer: BronzeWriter, source: DataSource):
        self.client = client
        self.bronze_writer = bronze_writer
        self.source = source
        self._db_connection = None
    
    async def get_db_connection(self):
        """Get a database connection."""
        if self._db_connection is None:
            db = await get_db()
            self._db_connection = await db.get_asyncpg_connection()
        return self._db_connection
    
    async def _get_token_ids_batch(self, markets: list) -> dict[str, str]:
        """
        Get YES token IDs for multiple markets in a single DB query.
        
        For Polymarket, prices require the YES token ID (side_a.id), not the condition_id.
        This batches the lookup into a single efficient query.
        """
        if self.source != DataSource.POLYMARKET:
            # Other sources use market_id directly for prices
            return {m.source_market_id: m.source_market_id for m in markets}
        
        try:
            condition_ids = [m.source_market_id for m in markets]
            if not condition_ids:
                return {}
            
            conn = await self.get_db_connection()
            
            # Efficient batch query using DISTINCT ON and ANY
            results = await conn.fetch("""
                WITH latest_markets AS (
                    SELECT DISTINCT ON (body_json->>'condition_id')
                        body_json->>'condition_id' as condition_id,
                        body_json->'side_a'->>'id' as yes_token_id
                    FROM predictions_bronze.api_responses_polymarket
                    WHERE endpoint_name = '/polymarket/markets'
                      AND body_json->>'condition_id' = ANY($1)
                    ORDER BY body_json->>'condition_id', fetched_at DESC
                )
                SELECT condition_id, yes_token_id
                FROM latest_markets
                WHERE yes_token_id IS NOT NULL
            """, condition_ids)
            
            return {row['condition_id']: row['yes_token_id'] for row in results}
            
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
        
        Returns:
            Tuple of (prices_fetched, prices_updated)
        """
        if not markets:
            return 0, 0
        
        logger.info("Fetching prices for active markets", count=len(markets), source=self.source.value)
        
        # Step 1: Batch fetch all token IDs (1 DB query)
        token_id_map = await self._get_token_ids_batch(markets)
        logger.info("Retrieved token IDs", count=len(token_id_map), total_markets=len(markets))
        
        # Step 2: Fetch prices with concurrency control
        prices_fetched = 0
        price_updates = []
        
        for i in range(0, len(markets), self.BATCH_SIZE):
            batch_markets = markets[i:i + self.BATCH_SIZE]
            tasks = []
            
            for market in batch_markets:
                token_id = token_id_map.get(market.source_market_id)
                if token_id:
                    tasks.append((market, token_id, self._fetch_single_price(token_id, market.source_market_id)))
            
            if not tasks:
                continue
            
            # Execute batch concurrently
            results = await asyncio.gather(*[task[2] for task in tasks], return_exceptions=True)
            
            # Process results
            for (market, token_id, _), raw_price in zip(tasks, results):
                if raw_price and not isinstance(raw_price, Exception):
                    try:
                        # Store in Bronze layer
                        await self.bronze_writer.write_batch(
                            records=[raw_price],
                            source=self.source,
                            endpoint=f"/{self.source.value}/market-price/{token_id}",
                            run_id=run_id,
                        )
                        
                        # Extract price data
                        yes_price = Decimal(str(raw_price.get("price", 0)))
                        no_price = Decimal("1.0") - yes_price
                        
                        price_updates.append({
                            'source_market_id': market.source_market_id,
                            'yes_price': yes_price,
                            'no_price': no_price,
                        })
                        prices_fetched += 1
                        
                    except Exception as e:
                        logger.debug("Failed to process price", market_id=market.source_market_id, error=str(e))
            
            batch_num = i // self.BATCH_SIZE + 1
            total_batches = (len(markets) + self.BATCH_SIZE - 1) // self.BATCH_SIZE
            logger.info(f"Processed price batch {batch_num}/{total_batches}", 
                       fetched=len([r for r in results if not isinstance(r, Exception)]))
        
        # Step 3: Batch update prices in database (1 query)
        prices_updated = 0
        if price_updates:
            try:
                conn = await self.get_db_connection()
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
        self._db_connection = None
    
    async def get_db_connection(self):
        """Get a database connection."""
        if self._db_connection is None:
            db = await get_db()
            self._db_connection = await db.get_asyncpg_connection()
        return self._db_connection
    
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
    
    async def run_static(self, run_id: str) -> IngestionResult:
        """
        Full load: Active markets + prices.
        
        Optimizations:
        - Uses active_only=True to fetch ~4,000 markets instead of 315,000+
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
            logger.info("Starting Polymarket static load (active markets only)", run_id=run_id)
            await self.client.connect()
            
            # =====================================================
            # STEP 1: Fetch ONLY active markets (server-side filter)
            # This reduces API calls from ~3,150 to ~40 pages
            # =====================================================
            logger.info("Fetching active markets only (using API filter)")
            raw_markets = await self.client.fetch_all_markets(active_only=True)
            result.markets_fetched = len(raw_markets)
            logger.info("Fetched active markets", count=result.markets_fetched)
            
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
            # STEP 2: Fetch prices for ALL active markets
            # Optimized: Batch token IDs + 50 concurrent API calls
            # =====================================================
            active_markets = [m for m in markets if m.is_active]
            logger.info("Starting price fetching", active_count=len(active_markets))
            
            prices_fetched, prices_updated = await self.price_fetcher.fetch_prices_batch(
                markets=active_markets,
                run_id=run_id,
            )
            result.prices_fetched = prices_fetched
            result.prices_updated = prices_updated
            
            # =====================================================
            # STEP 3: Orderbooks for top 20 markets by volume (optional)
            # Kept minimal to reduce API calls
            # =====================================================
            try:
                top_markets = sorted(
                    active_markets,
                    key=lambda m: m.volume_24h or 0,
                    reverse=True
                )[:20]
                
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
            
            # Fetch active markets only
            raw_markets = await self.client.fetch_all_markets(active_only=True)
            result.markets_fetched = len(raw_markets)
            
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
            
            # Fetch active markets only
            raw_markets = await self.client.fetch_all_markets(active_only=True)
            result.markets_fetched = len(raw_markets)
            
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
            
            # Fetch active markets
            raw_markets = await self.client.fetch_all_markets(active_only=True)
            result.markets_fetched = len(raw_markets)
            
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
    ) -> list[IngestionResult]:
        """Run ingestion for all enabled sources."""
        if sources is None:
            sources = self.settings.enabled_sources
        
        results = []
        
        for source in sources:
            try:
                result = await self.run_source(source, load_type)
                results.append(result)
            except Exception as e:
                logger.error("Source ingestion failed", source=source.value, error=str(e))
                results.append(IngestionResult(
                    source=source,
                    load_type=load_type,
                    run_id=str(uuid.uuid4()),
                    started_at=datetime.utcnow(),
                    finished_at=datetime.utcnow(),
                    success=False,
                    error=str(e),
                ))
        
        # Log summary
        successful = sum(1 for r in results if r.success)
        total_markets = sum(r.markets_upserted for r in results)
        total_prices = sum(r.prices_updated for r in results)
        
        logger.info(
            "Completed all source ingestion",
            load_type=load_type.value,
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
