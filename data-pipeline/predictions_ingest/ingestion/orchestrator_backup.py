"""
Ingestion orchestrator: Coordinates data extraction and loading.
Provides unified interface for both static (full) and delta (incremental) loads.
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
    STATIC = "static"  # Full load
    DELTA = "delta"    # Incremental


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
    trades_fetched: int = 0
    trades_inserted: int = 0
    prices_fetched: int = 0
    prices_inserted: int = 0
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
                "trades_fetched": self.trades_fetched,
                "trades_inserted": self.trades_inserted,
                "prices_fetched": self.prices_fetched,
                "prices_inserted": self.prices_inserted,
                "bronze_records": self.bronze_records,
            },
            "duration_seconds": self.duration_seconds,
        }


class SourceIngester:
    """
    Base class for source-specific ingestion logic.
    Subclasses implement static and delta loading.
    """
    
    SOURCE: DataSource
    
    def __init__(self):
        self.bronze_writer = BronzeWriter()
        self.silver_writer = SilverWriter()
        self.silver_reader = SilverReader()
        self.settings = get_settings()
    
    async def run_static(self, run_id: str) -> IngestionResult:
        """Full data load - fetches all available data."""
        raise NotImplementedError
    
    async def run_delta(self, run_id: str) -> IngestionResult:
        """Incremental load - fetches only new/changed data."""
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
                result.markets_upserted + result.trades_inserted,
                0 if result.success else 1,
                None if result.success else (result.finished_at or datetime.utcnow()),
                result.error,
            )


class DomePolymarketIngester(SourceIngester):
    """Ingester for Polymarket via Dome API."""
    
    SOURCE = DataSource.POLYMARKET
    
    def __init__(self):
        super().__init__()
        self.client = DomeClient(source=DataSource.POLYMARKET)
    
    async def _get_yes_token_id(self, market_source_id: str) -> Optional[str]:
        """
        Get the YES token ID for a Polymarket market.
        
        Polymarket markets have a condition_id (stored as source_market_id) 
        and two token IDs: YES (side_a.id) and NO (side_b.id).
        The price endpoint requires the token ID, not the condition ID.
        
        Args:
            market_source_id: The market's condition ID (source_market_id)
            
        Returns:
            The YES token ID (side_a.id) or None if not found
        """
        try:
            # Query Bronze layer for the market data
            conn = await self.get_db_connection()
            
            result = await conn.fetchrow("""
                SELECT body_json
                FROM predictions_bronze.api_responses_polymarket
                WHERE endpoint_name = '/polymarket/markets'
                  AND body_json->>'condition_id' = $1
                ORDER BY fetched_at DESC
                LIMIT 1
            """, market_source_id)
            
            if result:
                import json
                data = json.loads(result['body_json']) if isinstance(result['body_json'], str) else result['body_json']
                
                # Extract YES token ID from side_a
                if 'side_a' in data and isinstance(data['side_a'], dict):
                    return data['side_a'].get('id')
            
            return None
            
        except Exception as e:
            logger.debug(
                "Failed to get YES token ID",
                market_id=market_source_id,
                error=str(e),
            )
            return None
    
    async def _get_token_ids_batch(self, markets: list) -> dict[str, str]:
        """
        Get YES token IDs for multiple markets in a single DB query.
        Much more efficient than calling _get_yes_token_id individually.
        
        Args:
            markets: List of Market objects
            
        Returns:
            Dict mapping condition_id -> YES token_id
        """
        try:
            condition_ids = [m.source_market_id for m in markets]
            if not condition_ids:
                return {}
            
            conn = await self.get_db_connection()
            
            # Batch query all token IDs at once
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
    
    async def _fetch_price_with_retry(self, yes_token_id: str, market_id: str) -> Optional[dict]:
        """Fetch a single price with error handling."""
        try:
            return await self.client.fetch_market_price(yes_token_id)
        except Exception as e:
            logger.debug("Failed to fetch price", market_id=market_id, token_id=yes_token_id, error=str(e))
            return None
    
    async def run_static(self, run_id: str) -> IngestionResult:
        """Full load of Polymarket data via Dome API."""
        result = IngestionResult(
            source=self.SOURCE,
            load_type=LoadType.STATIC,
            run_id=run_id,
            started_at=datetime.utcnow(),
        )
        
        try:
            logger.info("Starting Polymarket static load", run_id=run_id)
            
            # Connect client
            await self.client.connect()
            
            # Fetch all markets
            raw_markets = await self.client.fetch_all_markets()
            result.markets_fetched = len(raw_markets)
            
            # Store in bronze
            inserted, _ = await self.bronze_writer.write_batch(
                records=raw_markets,
                source=self.SOURCE,
                endpoint="/polymarket/markets",
                run_id=run_id,
            )
            result.bronze_records += inserted
            
            # Normalize and store in silver
            markets = [self.client.normalize_market(m) for m in raw_markets]
            upserted, _ = await self.silver_writer.upsert_markets(markets)
            result.markets_upserted = upserted
            
            # TEMPORARILY SKIP EVENTS - Focus on prices for data quality
            # Events can be fetched later via delta loads
            # Fetching all 37,000+ events takes too long (~7-8 minutes)
            logger.info("Skipping events for now - prioritizing prices")
            
            """
            # Fetch events (market groupings)
            try:
                raw_events = await self.client.fetch_all_events()
                if raw_events:
                    await self.bronze_writer.write_batch(
                        records=raw_events,
                        source=self.SOURCE,
                        endpoint="/polymarket/events",
                        run_id=run_id,
                    )
                    # Convert raw events to dict format for silver writer
                    events_dicts = [{
                        'source': self.SOURCE,
                        'source_event_id': e.get('id', e.get('event_id')),
                        'title': e.get('title', e.get('name')),
                        'description': e.get('description'),
                        'slug': e.get('slug'),
                        'market_count': e.get('market_count', e.get('marketCount', 0)),
                        'image_url': e.get('image', e.get('image_url')),
                        'is_active': e.get('active', True),
                        'extra_data': e,
                    } for e in raw_events]
                    await self.silver_writer.upsert_events(events_dicts)
                    logger.info("Ingested Polymarket events", count=len(raw_events))
            except Exception as e:
                logger.warning("Failed to fetch Polymarket events", error=str(e))
            """
            
            # TEMPORARILY SKIP TRADES - Focus on prices for data quality
            # Trades can be fetched later via delta loads
            # Fetching trades for all markets takes too long (100+ sequential API calls)
            active_markets = [m for m in markets if m.is_active]
            logger.info("Skipping trades for now - prioritizing prices", count=len(active_markets))
            
            # NOTE: Uncomment below to fetch trades in static load
            """
            for market in active_markets:  # ALL active markets
                try:
                    raw_trades = await self.client.fetch_all_trades(
                        market_id=market.source_market_id,
                        max_records=1000,
                    )
                    result.trades_fetched += len(raw_trades)
                    
                    if raw_trades:
                        await self.bronze_writer.write_batch(
                            records=raw_trades,
                            source=self.SOURCE,
                            endpoint=f"/polymarket/markets/{market.source_market_id}/trades",
                            run_id=run_id,
                        )
                        
                        trades = [
                            self.client.normalize_trade(t, market.source_market_id)
                            for t in raw_trades
                        ]
                        inserted, _ = await self.silver_writer.insert_trades(trades)
                        result.trades_inserted += inserted
                        
                except Exception as e:
                    logger.warning(
                        "Failed to fetch trades for market",
                        market_id=market.source_market_id,
                        error=str(e),
                    )
            """
            
            # Fetch market prices for ALL active markets (no limit)
            # Optimized: Batch fetch token IDs then fetch prices with concurrency control
            try:
                active_markets_for_prices = [m for m in active_markets]
                logger.info("Fetching prices for all active markets", count=len(active_markets_for_prices))
                
                # Step 1: Batch fetch all token IDs efficiently (single DB query)
                token_id_map = await self._get_token_ids_batch(active_markets_for_prices)
                logger.info("Retrieved token IDs", count=len(token_id_map), total_markets=len(active_markets_for_prices))
                
                # Step 2: Fetch prices with concurrency control (50 concurrent requests)
                import asyncio
                batch_size = 50
                price_updates = []
                
                for i in range(0, len(active_markets_for_prices), batch_size):
                    batch_markets = active_markets_for_prices[i:i + batch_size]
                    tasks = []
                    
                    for market in batch_markets:
                        yes_token_id = token_id_map.get(market.source_market_id)
                        if yes_token_id:
                            tasks.append((market, yes_token_id, self._fetch_price_with_retry(yes_token_id, market.source_market_id)))
                    
                    # Execute batch concurrently
                    if tasks:
                        results = await asyncio.gather(*[task[2] for task in tasks], return_exceptions=True)
                        
                        # Process results
                        for (market, yes_token_id, _), raw_price in zip(tasks, results):
                            if raw_price and not isinstance(raw_price, Exception):
                                try:
                                    # Store raw price response in Bronze
                                    await self.bronze_writer.write_batch(
                                        records=[raw_price],
                                        source=self.SOURCE,
                                        endpoint=f"/polymarket/market-price/{yes_token_id}",
                                        run_id=run_id,
                                    )
                                    
                                    # Update Silver layer market with price
                                    yes_price = Decimal(str(raw_price.get("price", 0)))
                                    no_price = Decimal("1.0") - yes_price
                                    
                                    price_updates.append({
                                        'source_market_id': market.source_market_id,
                                        'yes_price': yes_price,
                                        'no_price': no_price,
                                    })
                                    
                                    result.prices_fetched += 1
                                except Exception as e:
                                    logger.debug("Failed to process price", market_id=market.source_market_id, error=str(e))
                        
                        logger.info(f"Processed price batch {i//batch_size + 1}", fetched=len([r for r in results if not isinstance(r, Exception)]), total=len(tasks))
                
                # Step 3: Batch update prices in database
                if price_updates:
                    conn = await self.get_db_connection()
                    await conn.executemany("""
                        UPDATE predictions_silver.markets
                        SET yes_price = $2,
                            no_price = $3,
                            last_updated_at = NOW()
                        WHERE source_market_id = $1 AND source = 'polymarket'
                    """, [(p['source_market_id'], p['yes_price'], p['no_price']) for p in price_updates])
                    result.prices_inserted = len(price_updates)
                    logger.info("Batch updated market prices", count=len(price_updates))
                
                logger.info("Completed Polymarket price ingestion", fetched=result.prices_fetched, inserted=result.prices_inserted)
            except Exception as e:
                logger.warning("Failed to fetch Polymarket prices", error=str(e))
            
            # Fetch orderbooks for ALL active markets
            # Note: Orderbooks are expensive API calls, but we'll fetch for all active markets
            try:
                logger.info("Fetching orderbooks for all active markets", count=len(active_markets))
                for market in active_markets:  # ALL active markets
                    try:
                        raw_orderbook = await self.client.fetch_orderbook(market.source_market_id)
                        if raw_orderbook:
                            orderbook = self.client.normalize_orderbook(raw_orderbook, market.source_market_id)
                            await self.silver_writer.insert_orderbook(orderbook)
                    except Exception as e:
                        logger.debug("Failed to fetch orderbook", market_id=market.source_market_id, error=str(e))
                logger.info("Ingested Polymarket orderbooks for all active markets")
            except Exception as e:
                logger.warning("Failed to fetch Polymarket orderbooks", error=str(e))
            
            # Fetch candlesticks (OHLCV) for active markets - charting data
            # Fixed: Fetch for all active markets, not just top 20
            candlesticks_count = 0
            try:
                for market in active_markets:  # All active markets
                    try:
                        raw_candles = await self.client.fetch_candlesticks(
                            market_id=market.source_market_id,
                            interval="1h",
                            limit=168,  # 7 days of hourly data
                        )
                        if raw_candles:
                            await self.bronze_writer.write_batch(
                                records=raw_candles,
                                source=self.SOURCE,
                                endpoint=f"/polymarket/candlesticks/{market.source_market_id}",
                                run_id=run_id,
                            )
                            candlesticks_count += len(raw_candles)
                    except Exception as e:
                        logger.debug("Failed to fetch candlesticks", market_id=market.source_market_id, error=str(e))
                logger.info("Ingested Polymarket candlesticks", count=candlesticks_count)
            except Exception as e:
                logger.warning("Failed to fetch Polymarket candlesticks", error=str(e))
            
            result.success = True
            
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
        """Incremental load of Polymarket data."""
        result = IngestionResult(
            source=self.SOURCE,
            load_type=LoadType.DELTA,
            run_id=run_id,
            started_at=datetime.utcnow(),
        )
        
        try:
            logger.info("Starting Polymarket delta load", run_id=run_id)
            
            # Connect client
            await self.client.connect()
            
            # For delta loads, fetch limited markets (testing: 500 markets)
            # In production, should filter by last_updated timestamp
            raw_markets = await self.client.fetch_all_markets(max_records=500)
            result.markets_fetched = len(raw_markets)
            
            # Store in bronze
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
            
            # Check if trade fetching is supported
            if hasattr(self.client, 'supports_trades') and not self.client.supports_trades:
                logger.info("Skipping trade history - not supported by this source")
            else:
                # Get last trade time for incremental
                last_trade_time = await self.silver_reader.get_latest_trade_time(self.SOURCE)
                if not last_trade_time:
                    last_trade_time = datetime.now(timezone.utc) - timedelta(hours=2)
                
                # Fetch recent trades for active markets
                active_markets = [m for m in markets if m.is_active]
                for market in active_markets[:50]:  # Top 50 active
                    try:
                        raw_trades = await self.client.fetch_trade_history(
                            market_id=market.source_market_id,
                            limit=100,
                        )
                        result.trades_fetched += len(raw_trades)
                        
                        if raw_trades:
                            trades = [
                                self.client.normalize_trade(t, market.source_market_id)
                                for t in raw_trades
                            ]
                            # Filter to only new trades
                            new_trades = [t for t in trades if t.traded_at > last_trade_time]
                            
                            if new_trades:
                                inserted, _ = await self.silver_writer.insert_trades(new_trades)
                                result.trades_inserted += inserted
                                
                    except Exception as e:
                        logger.warning(
                            "Failed to fetch trades",
                            market_id=market.source_market_id,
                            error=str(e),
                        )
            
            # Market prices for ALL active markets (no limit)
            # Optimized: Batch fetch token IDs then fetch prices with concurrency control
            active_markets_for_prices = [m for m in markets if m.is_active]
            logger.info("Fetching prices for all active markets", count=len(active_markets_for_prices))
            
            try:
                # Step 1: Batch fetch all token IDs efficiently
                token_id_map = await self._get_token_ids_batch(active_markets_for_prices)
                logger.info("Retrieved token IDs for delta", count=len(token_id_map))
                
                # Step 2: Fetch prices with concurrency control
                import asyncio
                batch_size = 50
                price_updates = []
                
                for i in range(0, len(active_markets_for_prices), batch_size):
                    batch_markets = active_markets_for_prices[i:i + batch_size]
                    tasks = []
                    
                    for market in batch_markets:
                        yes_token_id = token_id_map.get(market.source_market_id)
                        if yes_token_id:
                            tasks.append((market, yes_token_id, self._fetch_price_with_retry(yes_token_id, market.source_market_id)))
                    
                    if tasks:
                        results = await asyncio.gather(*[task[2] for task in tasks], return_exceptions=True)
                        
                        for (market, yes_token_id, _), raw_price in zip(tasks, results):
                            if raw_price and not isinstance(raw_price, Exception):
                                try:
                                    await self.bronze_writer.write_batch(
                                        records=[raw_price],
                                        source=self.SOURCE,
                                        endpoint=f"/polymarket/market-price/{yes_token_id}",
                                        run_id=run_id,
                                    )
                                    
                                    yes_price = Decimal(str(raw_price.get("price", 0)))
                                    no_price = Decimal("1.0") - yes_price
                                    
                                    price_updates.append({
                                        'source_market_id': market.source_market_id,
                                        'yes_price': yes_price,
                                        'no_price': no_price,
                                    })
                                    
                                    result.prices_fetched += 1
                                except Exception as e:
                                    logger.debug("Failed to process price", market_id=market.source_market_id, error=str(e))
                
                # Step 3: Batch update prices
                if price_updates:
                    conn = await self.get_db_connection()
                    await conn.executemany("""
                        UPDATE predictions_silver.markets
                        SET yes_price = $2,
                            no_price = $3,
                            last_updated_at = NOW()
                        WHERE source_market_id = $1 AND source = 'polymarket'
                    """, [(p['source_market_id'], p['yes_price'], p['no_price']) for p in price_updates])
                    result.prices_inserted = len(price_updates)
                    logger.info("Delta: batch updated market prices", count=len(price_updates))
                
            except Exception as e:
                logger.warning("Failed to fetch delta prices", error=str(e))
            
            logger.info("Ingested Polymarket prices (delta)", count=result.prices_fetched)
            
            # Fetch candlesticks (OHLCV) for active markets - recent data for delta
            # Fixed: Fetch for all active markets, not just top 10
            candlesticks_count = 0
            try:
                for market in active_markets_for_prices:  # All active markets
                    try:
                        raw_candles = await self.client.fetch_candlesticks(
                            market_id=market.source_market_id,
                            interval="1h",
                            limit=24,  # Last 24 hours
                        )
                        if raw_candles:
                            await self.bronze_writer.write_batch(
                                records=raw_candles,
                                source=self.SOURCE,
                                endpoint=f"/polymarket/candlesticks/{market.source_market_id}",
                                run_id=run_id,
                            )
                            candlesticks_count += len(raw_candles)
                    except Exception as e:
                        logger.debug("Failed to fetch candlesticks", market_id=market.source_market_id, error=str(e))
                logger.info("Ingested Polymarket candlesticks (delta)", count=candlesticks_count)
            except Exception as e:
                logger.warning("Failed to fetch Polymarket candlesticks in delta", error=str(e))
            
            result.success = True
            
        except Exception as e:
            logger.error("Polymarket delta load failed", error=str(e))
            result.error = str(e)
            
        finally:
            result.finished_at = datetime.utcnow()
            result.duration_seconds = (result.finished_at - result.started_at).total_seconds()
            await self._record_run(result)
            await self.client.close()
        
        return result


class DomeKalshiIngester(SourceIngester):
    """Ingester for Kalshi via Dome API."""
    
    SOURCE = DataSource.KALSHI
    
    def __init__(self):
        super().__init__()
        self.client = DomeClient(source=DataSource.KALSHI)
    
    async def run_static(self, run_id: str) -> IngestionResult:
        """Full load of Kalshi data via Dome API."""
        result = IngestionResult(
            source=self.SOURCE,
            load_type=LoadType.STATIC,
            run_id=run_id,
            started_at=datetime.utcnow(),
        )
        
        try:
            logger.info("Starting Kalshi static load", run_id=run_id)
            
            # Connect client
            await self.client.connect()
            
            # Fetch all events first (Kalshi is event-centric)
            raw_events = await self.client.fetch_all_events()
            
            # Store events in bronze
            await self.bronze_writer.write_batch(
                records=raw_events,
                source=self.SOURCE,
                endpoint="/kalshi/events",
                run_id=run_id,
            )
            
            # Fetch all markets
            raw_markets = await self.client.fetch_all_markets()
            result.markets_fetched = len(raw_markets)
            
            inserted, _ = await self.bronze_writer.write_batch(
                records=raw_markets,
                source=self.SOURCE,
                endpoint="/kalshi/markets",
                run_id=run_id,
            )
            result.bronze_records += inserted
            
            # Normalize and store markets
            markets = [self.client.normalize_market(m) for m in raw_markets]
            upserted, _ = await self.silver_writer.upsert_markets(markets)
            result.markets_upserted = upserted
            
            # Skip trade fetching - not supported for Kalshi via Dome API
            if hasattr(self.client, 'supports_trades') and not self.client.supports_trades:
                logger.info("Skipping trade history - not supported for Kalshi via Dome API")
            else:
                # Fetch trades for top markets
                active_markets = [m for m in markets if m.is_active]
                top_markets = sorted(
                    active_markets,
                    key=lambda m: m.volume_24h or 0,
                    reverse=True,
                )[:100]
                
                for market in top_markets:
                    try:
                        raw_trades = await self.client.fetch_all_trades(
                            market_id=market.source_market_id,
                            max_records=1000,
                        )
                        result.trades_fetched += len(raw_trades)
                        
                        if raw_trades:
                            await self.bronze_writer.write_batch(
                                records=raw_trades,
                                source=self.SOURCE,
                                endpoint=f"/kalshi/markets/{market.source_market_id}/trades",
                                run_id=run_id,
                            )
                            
                            trades = [
                                self.client.normalize_trade(t, market.source_market_id)
                                for t in raw_trades
                            ]
                            inserted, _ = await self.silver_writer.insert_trades(trades)
                            result.trades_inserted += inserted
                            
                    except Exception as e:
                        logger.warning(
                            "Failed to fetch trades",
                            market_id=market.source_market_id,
                            error=str(e),
                        )
            
            # Fetch market prices for active markets
            try:
                active_markets = [m for m in markets if m.is_active]
                top_markets = sorted(
                    active_markets,
                    key=lambda m: m.volume_24h or 0,
                    reverse=True,
                )[:20]  # Top 20 markets
                
                for market in top_markets:
                    try:
                        raw_price = await self.client.fetch_market_price(market.source_market_id)
                        if raw_price:
                            price = self.client.normalize_price(raw_price, market.source_market_id)
                            await self.silver_writer.insert_price(price)
                            result.prices_fetched += 1
                            result.prices_inserted += 1
                    except Exception as e:
                        logger.debug("Failed to fetch price", market_id=market.source_market_id, error=str(e))
                logger.info("Ingested Kalshi prices", count=result.prices_fetched)
            except Exception as e:
                logger.warning("Failed to fetch Kalshi prices", error=str(e))
            
            # Fetch orderbooks for top markets
            try:
                for market in top_markets[:10]:  # Top 10 only
                    try:
                        raw_orderbook = await self.client.fetch_orderbook(market.source_market_id)
                        if raw_orderbook:
                            orderbook = self.client.normalize_orderbook(raw_orderbook, market.source_market_id)
                            await self.silver_writer.insert_orderbook(orderbook)
                    except Exception as e:
                        logger.debug("Failed to fetch orderbook", market_id=market.source_market_id, error=str(e))
                logger.info("Ingested Kalshi orderbooks for top markets")
            except Exception as e:
                logger.warning("Failed to fetch Kalshi orderbooks", error=str(e))
            
            result.success = True
            
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
        """Incremental load of Kalshi data."""
        result = IngestionResult(
            source=self.SOURCE,
            load_type=LoadType.DELTA,
            run_id=run_id,
            started_at=datetime.utcnow(),
        )
        
        try:
            logger.info("Starting Kalshi delta load", run_id=run_id)
            
            # Connect client
            await self.client.connect()
            
            # For delta loads, fetch limited markets (testing: 500 markets)
            raw_markets = await self.client.fetch_all_markets(max_records=500)
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
            
            # Check if trade fetching is supported
            if hasattr(self.client, 'supports_trades') and not self.client.supports_trades:
                logger.info("Skipping trade history - not supported by this source")
            else:
                # Incremental trades
                last_trade_time = await self.silver_reader.get_latest_trade_time(self.SOURCE)
                if not last_trade_time:
                    last_trade_time = datetime.now(timezone.utc) - timedelta(hours=2)
                
                active_markets = [m for m in markets if m.is_active]
                for market in active_markets[:50]:
                    try:
                        raw_trades = await self.client.fetch_trade_history(
                            market_id=market.source_market_id,
                            limit=100,
                        )
                        result.trades_fetched += len(raw_trades)
                        
                        if raw_trades:
                            trades = [
                                self.client.normalize_trade(t, market.source_market_id)
                                for t in raw_trades
                            ]
                            new_trades = [t for t in trades if t.traded_at > last_trade_time]
                            
                            if new_trades:
                                inserted, _ = await self.silver_writer.insert_trades(new_trades)
                                result.trades_inserted += inserted
                                
                    except Exception as e:
                        logger.warning(
                            "Failed to fetch trades",
                            market_id=market.source_market_id,
                            error=str(e),
                        )
            
            # Fetch market prices (delta - recent active markets)
            try:
                active_markets = [m for m in markets if m.is_active]
                for market in active_markets[:30]:  # Top 30 active
                    try:
                        raw_price = await self.client.fetch_market_price(market.source_market_id)
                        if raw_price:
                            price = self.client.normalize_price(raw_price, market.source_market_id)
                            await self.silver_writer.insert_price(price)
                            result.prices_fetched += 1
                            result.prices_inserted += 1
                    except Exception as e:
                        logger.debug("Failed to fetch price", market_id=market.source_market_id, error=str(e))
            except Exception as e:
                logger.warning("Failed to fetch Kalshi prices in delta", error=str(e))
            
            result.success = True
            
        except Exception as e:
            logger.error("Kalshi delta load failed", error=str(e))
            result.error = str(e)
            
        finally:
            result.finished_at = datetime.utcnow()
            result.duration_seconds = (result.finished_at - result.started_at).total_seconds()
            await self._record_run(result)
            await self.client.close()
        
        return result


class LimitlessIngester(SourceIngester):
    """Ingester for Limitless Exchange."""
    
    SOURCE = DataSource.LIMITLESS
    
    def __init__(self):
        super().__init__()
        self.client = LimitlessClient()
    
    async def run_static(self, run_id: str) -> IngestionResult:
        """Full load of Limitless data."""
        result = IngestionResult(
            source=self.SOURCE,
            load_type=LoadType.STATIC,
            run_id=run_id,
            started_at=datetime.utcnow(),
        )
        
        try:
            logger.info("Starting Limitless static load", run_id=run_id)
            
            # Connect client
            await self.client.connect()
            
            # Fetch categories
            raw_categories = await self.client.fetch_categories()
            if raw_categories:
                # Filter out None values
                raw_categories = [c for c in raw_categories if c is not None]
                await self.bronze_writer.write_batch(
                    records=raw_categories,
                    source=self.SOURCE,
                    endpoint="/categories",
                    run_id=run_id,
                )
                categories = [self.client.normalize_category(c) for c in raw_categories]
                await self.silver_writer.upsert_categories(categories)
            
            # Fetch all markets
            raw_markets = await self.client.fetch_all_markets()
            # Filter out None values
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
            
            # Fetch detailed market info for top markets (enriched data)
            details_fetched = 0
            for market in markets[:50]:  # Top 50 markets for details
                try:
                    slug = market.slug or market.source_market_id
                    detailed = await self.client.fetch_market_details(slug)
                    if detailed:
                        await self.bronze_writer.write_batch(
                            records=[detailed],
                            source=self.SOURCE,
                            endpoint=f"/markets/{slug}",
                            run_id=run_id,
                        )
                        details_fetched += 1
                except Exception as e:
                    logger.debug("Failed to fetch market details", slug=market.slug, error=str(e))
            logger.info("Fetched Limitless market details", count=details_fetched)
            
            # Fetch trades and prices for markets
            for market in markets[:100]:  # Top 100
                try:
                    # Historical prices
                    raw_prices = await self.client.fetch_historical_prices(
                        slug=market.slug or market.source_market_id,
                        interval="1h",
                        limit=168,  # 7 days
                    )
                    result.prices_fetched += len(raw_prices)
                    
                    if raw_prices:
                        prices = [
                            self.client.normalize_price(p, market.source_market_id)
                            for p in raw_prices
                        ]
                        result.prices_inserted += await self.silver_writer.insert_prices(prices)
                    
                    # Trade events
                    raw_trades = await self.client.fetch_all_market_events(
                        slug=market.slug or market.source_market_id,
                        max_records=500,
                    )
                    result.trades_fetched += len(raw_trades)
                    
                    if raw_trades:
                        await self.bronze_writer.write_batch(
                            records=raw_trades,
                            source=self.SOURCE,
                            endpoint=f"/markets/{market.slug}/events",
                            run_id=run_id,
                        )
                        
                        trades = [
                            self.client.normalize_trade(t, market.source_market_id)
                            for t in raw_trades
                        ]
                        inserted, _ = await self.silver_writer.insert_trades(trades)
                        result.trades_inserted += inserted
                        
                except Exception as e:
                    logger.warning(
                        "Failed to fetch market data",
                        slug=market.slug,
                        error=str(e),
                    )
            
            # Orderbooks for top 10 markets by volume (or first 10 if no volume data)
            top_markets = sorted(
                [m for m in markets if m.volume_24h], 
                key=lambda x: x.volume_24h or 0, 
                reverse=True
            )[:10]
            
            # Fallback to first 10 markets if volume data not available
            if not top_markets:
                top_markets = markets[:10]
            
            for market in top_markets:
                try:
                    raw_orderbook = await self.client.fetch_orderbook(
                        slug=market.slug or market.source_market_id
                    )
                    
                    if raw_orderbook:
                        orderbook = self.client.normalize_orderbook(
                            raw_orderbook, market.source_market_id
                        )
                        await self.silver_writer.insert_orderbook(orderbook)
                        result.bronze_records += 1
                        
                except Exception as e:
                    logger.warning(
                        "Failed to fetch orderbook",
                        slug=market.slug,
                        error=str(e),
                    )
            
            result.success = True
            
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
        """Incremental load of Limitless data."""
        result = IngestionResult(
            source=self.SOURCE,
            load_type=LoadType.DELTA,
            run_id=run_id,
            started_at=datetime.utcnow(),
        )
        
        try:
            logger.info("Starting Limitless delta load", run_id=run_id)
            
            # Connect client
            await self.client.connect()
            
            # Fetch current markets (Limitless has fewer markets, all should be fine)
            raw_markets = await self.client.fetch_all_markets()
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
            
            # Get last trade time
            last_trade_time = await self.silver_reader.get_latest_trade_time(self.SOURCE)
            if not last_trade_time:
                last_trade_time = datetime.now(timezone.utc) - timedelta(hours=2)
            
            # Recent trades for active markets
            for market in markets[:50]:
                try:
                    raw_trades = await self.client.fetch_market_events(
                        slug=market.slug or market.source_market_id,
                        limit=100,
                    )
                    events = raw_trades.get("data", []) if isinstance(raw_trades, dict) else raw_trades
                    result.trades_fetched += len(events)
                    
                    if events:
                        trades = [
                            self.client.normalize_trade(t, market.source_market_id)
                            for t in events
                        ]
                        new_trades = [t for t in trades if t.traded_at > last_trade_time]
                        
                        if new_trades:
                            inserted, _ = await self.silver_writer.insert_trades(new_trades)
                            result.trades_inserted += inserted
                            
                except Exception as e:
                    logger.warning(
                        "Failed to fetch trades",
                        slug=market.slug,
                        error=str(e),
                    )
            
            # Market prices for top 30 active markets (or first 30 if no volume data)
            top_markets = sorted(
                [m for m in markets if m.volume_24h], 
                key=lambda x: x.volume_24h or 0, 
                reverse=True
            )[:30]
            
            # Fallback to first 30 markets if volume data not available
            if not top_markets:
                top_markets = markets[:30]
            
            for market in top_markets:
                try:
                    raw_prices = await self.client.fetch_historical_prices(
                        slug=market.slug or market.source_market_id,
                        interval="1h",
                        limit=6,
                    )
                    
                    if raw_prices:
                        prices = [
                            self.client.normalize_price(p, market.source_market_id)
                            for p in raw_prices
                        ]
                        result.prices_inserted += await self.silver_writer.insert_prices(prices)
                        
                except Exception as e:
                    logger.warning(
                        "Failed to fetch prices",
                        slug=market.slug,
                        error=str(e),
                    )
            
            result.success = True
            
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
    """Ingester for Opinion Trade."""
    
    SOURCE = DataSource.OPINIONTRADE
    
    def __init__(self):
        super().__init__()
        self.client = OpinionTradeClient()
    
    async def run_static(self, run_id: str) -> IngestionResult:
        """Full load of Opinion Trade data."""
        result = IngestionResult(
            source=self.SOURCE,
            load_type=LoadType.STATIC,
            run_id=run_id,
            started_at=datetime.utcnow(),
        )
        
        try:
            logger.info("Starting Opinion Trade static load", run_id=run_id)
            
            # Connect client
            await self.client.connect()
            
            # Fetch all markets
            raw_markets = await self.client.fetch_all_markets()
            # Filter out None values
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
            
            # Fetch individual market details for binary markets (marketType == 0)
            binary_markets = [
                m for m in raw_markets 
                if not m.get("marketType") or m.get("marketType") == 0
            ]
            
            details_fetched = 0
            for raw_market in binary_markets[:30]:  # Top 30 binary markets
                try:
                    market_id = str(raw_market.get("marketId"))
                    detailed = await self.client.fetch_market_details(market_id)
                    
                    if detailed and detailed.get("result"):
                        await self.bronze_writer.write_batch(
                            records=[detailed["result"]],
                            source=self.SOURCE,
                            endpoint=f"/openapi/market/{market_id}",
                            run_id=run_id,
                        )
                        details_fetched += 1
                except Exception as e:
                    logger.debug("Failed to fetch market details", market_id=raw_market.get("marketId"), error=str(e))
            logger.info("Fetched Opinion Trade binary market details", count=details_fetched)
            
            # Fetch detailed info for categorical markets (marketType != 0)
            categorical_markets = [
                m for m in raw_markets 
                if m.get("marketType") and m.get("marketType") != 0
            ]
            
            for raw_market in categorical_markets[:20]:  # Top 20 categorical
                try:
                    market_id = str(raw_market.get("marketId"))
                    detailed = await self.client.fetch_categorical_market_details(market_id)
                    
                    if detailed and detailed.get("result"):
                        # Store detailed categorical market data in bronze
                        await self.bronze_writer.write_batch(
                            records=[detailed["result"]],
                            source=self.SOURCE,
                            endpoint=f"/openapi/market/categorical/{market_id}",
                            run_id=run_id,
                        )
                        result.bronze_records += 1
                        
                        # Process child markets if present
                        child_markets = detailed.get("result", {}).get("childMarkets", [])
                        if child_markets:
                            child_normalized = [
                                self.client.normalize_market(cm) 
                                for cm in child_markets if cm
                            ]
                            if child_normalized:
                                await self.silver_writer.upsert_markets(child_normalized)
                                result.markets_upserted += len(child_normalized)
                                
                except Exception as e:
                    logger.warning(
                        "Failed to fetch categorical market details",
                        market_id=raw_market.get("marketId"),
                        error=str(e),
                    )
            
            logger.info(
                "Fetched categorical market details",
                categorical_count=len(categorical_markets),
                fetched=min(len(categorical_markets), 20),
            )
            
            # Fetch prices and orderbooks for markets with token IDs
            for market in markets[:100]:  # Top 100 markets
                try:
                    # Get token IDs from extra_data
                    token_ids = []
                    if market.extra_data and market.extra_data.get("token_ids"):
                        token_ids = market.extra_data["token_ids"]
                    
                    for token_id in token_ids[:2]:  # Max 2 tokens per market (yes/no)
                        if not token_id:
                            continue
                        
                        # Price history
                        raw_prices = await self.client.fetch_price_history(
                            token_id=str(token_id),
                            fidelity=60,  # 1 hour intervals
                        )
                        result.prices_fetched += len(raw_prices)
                        
                        if raw_prices:
                            prices = [
                                self.client.normalize_price(p, market.source_market_id)
                                for p in raw_prices
                            ]
                            result.prices_inserted += await self.silver_writer.insert_prices(prices)
                        
                        # Latest price (current snapshot)
                        raw_latest = await self.client.fetch_latest_price(token_id=str(token_id))
                        if raw_latest:
                            latest_price = self.client.normalize_price(raw_latest, market.source_market_id)
                            await self.silver_writer.insert_prices([latest_price])
                            result.prices_fetched += 1
                        
                        # Orderbook
                        raw_orderbook = await self.client.fetch_orderbook(token_id=str(token_id))
                        
                        if raw_orderbook:
                            orderbook = self.client.normalize_orderbook(
                                raw_orderbook, market.source_market_id
                            )
                            await self.silver_writer.insert_orderbook(orderbook)
                            result.bronze_records += 1
                        
                except Exception as e:
                    logger.warning(
                        "Failed to fetch market data",
                        market_id=market.source_market_id,
                        error=str(e),
                    )
            
            result.success = True
            
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
        """Incremental load of Opinion Trade data."""
        result = IngestionResult(
            source=self.SOURCE,
            load_type=LoadType.DELTA,
            run_id=run_id,
            started_at=datetime.utcnow(),
        )
        
        try:
            logger.info("Starting Opinion Trade delta load", run_id=run_id)
            
            # Connect client
            await self.client.connect()
            
            # Fetch current markets
            raw_markets = await self.client.fetch_all_markets()
            # Filter out None values
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
            
            # Fetch detailed info for categorical markets (marketType != 0)
            categorical_markets = [
                m for m in raw_markets 
                if m.get("marketType") and m.get("marketType") != 0
            ]
            
            for raw_market in categorical_markets[:10]:  # Top 10 categorical for delta
                try:
                    market_id = str(raw_market.get("marketId"))
                    detailed = await self.client.fetch_categorical_market_details(market_id)
                    
                    if detailed and detailed.get("result"):
                        child_markets = detailed.get("result", {}).get("childMarkets", [])
                        if child_markets:
                            child_normalized = [
                                self.client.normalize_market(cm) 
                                for cm in child_markets if cm
                            ]
                            if child_normalized:
                                await self.silver_writer.upsert_markets(child_normalized)
                                result.markets_upserted += len(child_normalized)
                                
                except Exception as e:
                    logger.warning(
                        "Failed to fetch categorical market details",
                        market_id=raw_market.get("marketId"),
                        error=str(e),
                    )
            
            # Sort by volume for prioritized fetching
            top_markets = sorted(
                [m for m in markets if m.volume_24h], 
                key=lambda x: x.volume_24h or 0, 
                reverse=True
            )[:50]  # Top 50 by volume
            
            # Fallback to first 50 if no volume data
            if not top_markets:
                top_markets = markets[:50]
            
            # Fetch latest prices AND recent price history for top markets
            for market in top_markets:
                try:
                    # Get token IDs from extra_data
                    token_ids = []
                    if market.extra_data and market.extra_data.get("token_ids"):
                        token_ids = market.extra_data["token_ids"]
                    
                    for token_id in token_ids[:2]:  # Both yes and no tokens
                        if not token_id:
                            continue
                        
                        # Latest price
                        raw_price = await self.client.fetch_latest_price(token_id=str(token_id))
                        
                        if raw_price:
                            price = self.client.normalize_price(raw_price, market.source_market_id)
                            result.prices_inserted += await self.silver_writer.insert_prices([price])
                            result.prices_fetched += 1
                        
                        # Recent price history (last 6 hours)
                        raw_history = await self.client.fetch_price_history(
                            token_id=str(token_id),
                            fidelity=60,  # 1 hour intervals
                        )
                        if raw_history:
                            history_prices = [
                                self.client.normalize_price(p, market.source_market_id)
                                for p in raw_history[:6]  # Last 6 data points
                            ]
                            result.prices_inserted += await self.silver_writer.insert_prices(history_prices)
                            result.prices_fetched += len(history_prices)
                        
                except Exception as e:
                    logger.warning(
                        "Failed to fetch price",
                        market_id=market.source_market_id,
                        error=str(e),
                    )
            
            # Fetch orderbooks for top 10 markets by volume
            orderbook_markets = top_markets[:10]
            for market in orderbook_markets:
                try:
                    token_ids = []
                    if market.extra_data and market.extra_data.get("token_ids"):
                        token_ids = market.extra_data["token_ids"]
                    
                    for token_id in token_ids[:1]:  # Just yes token orderbook
                        if not token_id:
                            continue
                        
                        raw_orderbook = await self.client.fetch_orderbook(token_id=str(token_id))
                        
                        if raw_orderbook:
                            orderbook = self.client.normalize_orderbook(
                                raw_orderbook, market.source_market_id
                            )
                            await self.silver_writer.insert_orderbook(orderbook)
                            
                except Exception as e:
                    logger.warning(
                        "Failed to fetch orderbook",
                        market_id=market.source_market_id,
                        error=str(e),
                    )
            
            logger.info(
                "Opinion Trade delta prices and orderbooks fetched",
                prices=result.prices_fetched,
                orderbooks=len(orderbook_markets),
            )
            
            result.success = True
            
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
# INGESTION REGISTRY
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


# =============================================================================
# ORCHESTRATOR
# =============================================================================

class IngestionOrchestrator:
    """
    Coordinates ingestion across multiple sources.
    Supports running individual sources or all at once.
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
            duration=result.duration_seconds,
            markets=result.markets_upserted,
            trades=result.trades_inserted,
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
                logger.error(
                    "Source ingestion failed",
                    source=source.value,
                    error=str(e),
                )
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
        total_trades = sum(r.trades_inserted for r in results)
        
        logger.info(
            "Completed all source ingestion",
            load_type=load_type.value,
            sources_run=len(results),
            sources_successful=successful,
            total_markets=total_markets,
            total_trades=total_trades,
        )
        
        # Refresh gold layer views after all sources complete
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
                # Call the function that exists in the database
                result = await conn.fetch("SELECT * FROM predictions_gold.refresh_all_views()")
                for row in result:
                    logger.info(
                        "Refreshed view",
                        view=row["view_name"],
                        duration=str(row["refresh_duration"]),
                    )
                logger.info("Gold layer views refreshed", views_refreshed=len(result))
        except Exception as e:
            # If function doesn't exist, try refreshing views directly
            logger.warning("refresh_all_views failed, trying direct refresh", error=str(e))
            async with db.asyncpg_connection() as conn:
                await conn.execute("REFRESH MATERIALIZED VIEW CONCURRENTLY predictions_gold.market_summary")
                await conn.execute("REFRESH MATERIALIZED VIEW CONCURRENTLY predictions_gold.trade_summary")
                await conn.execute("REFRESH MATERIALIZED VIEW CONCURRENTLY predictions_gold.top_markets")
                logger.info("Gold layer views refreshed (direct)")
