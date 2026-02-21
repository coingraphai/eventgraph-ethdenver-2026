"""
Silver layer: Normalized and unified entity storage.
Transforms raw bronze data into structured tables.
"""
import json
from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import Any, Optional

import structlog

from predictions_ingest.database import get_db
from predictions_ingest.models import (
    Category,
    DataSource,
    Market,
    OrderbookSnapshot,
    PriceSnapshot,
    Trade,
)

logger = structlog.get_logger()


def _enum_value(v: Any) -> Any:
    """Get string value from enum or return as-is if already a string.
    
    Handles Pydantic models with use_enum_values=True which auto-convert enums to strings.
    """
    if v is None:
        return None
    if isinstance(v, Enum):
        return v.value
    return v


class SilverWriter:
    """
    Writes normalized entities to silver layer tables.
    Handles upserts and deduplication.
    """
    
    # =========================================================================
    # CATEGORIES
    # =========================================================================
    
    async def upsert_category(self, category: Category) -> int:
        """Upsert a category record."""
        db = await get_db()
        
        query = """
            INSERT INTO predictions_silver.categories (
                source, source_category_id, name, slug, description,
                market_count, active_market_count, icon_url
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (source, source_category_id) DO UPDATE SET
                name = EXCLUDED.name,
                slug = EXCLUDED.slug,
                description = EXCLUDED.description,
                market_count = EXCLUDED.market_count,
                active_market_count = EXCLUDED.active_market_count,
                icon_url = EXCLUDED.icon_url,
                updated_at = NOW()
            RETURNING id
        """
        
        async with db.asyncpg_connection() as conn:
            return await conn.fetchval(
                query,
                _enum_value(category.source),
                category.source_category_id,
                category.name,
                category.slug,
                category.description,
                category.market_count,
                category.active_market_count,
                category.icon_url,
            )
    
    async def upsert_categories(self, categories: list[Category]) -> int:
        """Batch upsert categories."""
        if not categories:
            return 0
        
        count = 0
        for category in categories:
            await self.upsert_category(category)
            count += 1
        
        logger.info("Upserted categories", count=count)
        return count
    
    # =========================================================================
    # EVENTS
    # =========================================================================
    
    async def upsert_event(self, event: Any) -> int:  # Using Any for now since Event model may not be fully used
        """Upsert an event record."""
        db = await get_db()
        
        query = """
            INSERT INTO predictions_silver.events (
                source, source_event_id, title, description, slug,
                category_id, category_name, tags, status, is_active,
                market_count, total_volume, total_liquidity,
                start_date, end_date, image_url, icon_url, extra_data
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
            ON CONFLICT (source, source_event_id) DO UPDATE SET
                title = EXCLUDED.title,
                description = EXCLUDED.description,
                slug = EXCLUDED.slug,
                category_id = EXCLUDED.category_id,
                category_name = EXCLUDED.category_name,
                tags = EXCLUDED.tags,
                status = EXCLUDED.status,
                is_active = EXCLUDED.is_active,
                market_count = EXCLUDED.market_count,
                total_volume = EXCLUDED.total_volume,
                total_liquidity = EXCLUDED.total_liquidity,
                start_date = EXCLUDED.start_date,
                end_date = EXCLUDED.end_date,
                image_url = EXCLUDED.image_url,
                icon_url = EXCLUDED.icon_url,
                extra_data = EXCLUDED.extra_data,
                last_updated_at = NOW()
            RETURNING id
        """
        
        # Handle both Event model and dict
        if hasattr(event, '__dict__'):
            # It's a Pydantic model
            extra_data = json.dumps(event.extra_data) if hasattr(event, 'extra_data') and event.extra_data else "{}"
            source = event.source
            source_event_id = event.source_event_id or event.slug
            title = event.title
            description = event.description
            slug = event.slug
            category_id = event.category_id
            category_name = event.category_name
            tags = event.tags
            status = event.status or 'active'
            is_active = event.is_active
            market_count = event.market_count or 0
            total_volume = float(event.total_volume) if event.total_volume else 0
            total_liquidity = float(event.total_liquidity) if event.total_liquidity else 0
            start_date = event.start_date
            end_date = event.end_date
            image_url = event.image_url
            icon_url = event.icon_url
        else:
            # It's a dict
            extra_data = json.dumps(event.get('extra_data', {}))
            source = event.get('source')
            source_event_id = event.get('source_event_id', event.get('id', event.get('slug')))
            title = event.get('title')
            description = event.get('description')
            slug = event.get('slug')
            category_id = event.get('category_id')
            category_name = event.get('category_name')
            tags = event.get('tags')
            status = event.get('status', 'active')
            is_active = event.get('is_active', True)
            market_count = event.get('market_count', 0)
            total_volume = float(event.get('total_volume', 0)) if event.get('total_volume') else 0
            total_liquidity = float(event.get('total_liquidity', 0)) if event.get('total_liquidity') else 0
            start_date = event.get('start_date')
            end_date = event.get('end_date')
            image_url = event.get('image_url')
            icon_url = event.get('icon_url')
        
        async with db.asyncpg_connection() as conn:
            return await conn.fetchval(
                query,
                _enum_value(source),
                source_event_id,
                title,
                description,
                slug,
                category_id,
                category_name,
                tags,
                status,
                is_active,
                market_count,
                total_volume,
                total_liquidity,
                start_date,
                end_date,
                image_url,
                icon_url,
                extra_data,
            )
    
    async def upsert_events(self, events: list) -> int:
        """Batch upsert events."""
        if not events:
            return 0
        
        count = 0
        for event in events:
            try:
                await self.upsert_event(event)
                count += 1
            except Exception as e:
                # Get event ID safely
                if hasattr(event, '__dict__'):
                    event_id = event.source_event_id or event.slug or '?'
                else:
                    event_id = event.get('source_event_id', event.get('slug', '?'))
                
                logger.error(
                    "Failed to upsert event",
                    event_id=event_id,
                    error=str(e),
                )
        
        logger.info("Upserted events", count=count)
        return count
    
    # =========================================================================
    # MARKETS
    # =========================================================================
    
    async def upsert_market(self, market: Market) -> int:
        """Upsert a market record."""
        db = await get_db()
        
        query = """
            INSERT INTO predictions_silver.markets (
                source, source_market_id, slug,
                title, description, question,
                category_id, category_name, tags,
                status, is_active, is_resolved, resolution_value,
                outcome_count, outcomes,
                yes_price, no_price, last_trade_price, mid_price,
                volume_24h, volume_7d, volume_30d, volume_total, liquidity,
                trade_count_24h, unique_traders,
                created_at_source, end_date, resolution_date, last_trade_at,
                image_url, icon_url, source_url,
                extra_data
            )
            VALUES (
                $1, $2, $3,
                $4, $5, $6,
                $7, $8, $9,
                $10, $11, $12, $13,
                $14, $15::jsonb,
                $16, $17, $18, $19,
                $20, $21, $22, $23, $24,
                $25, $26,
                $27, $28, $29, $30,
                $31, $32, $33,
                $34::jsonb
            )
            ON CONFLICT (source, source_market_id) DO UPDATE SET
                slug = EXCLUDED.slug,
                title = EXCLUDED.title,
                description = EXCLUDED.description,
                question = EXCLUDED.question,
                category_id = EXCLUDED.category_id,
                category_name = EXCLUDED.category_name,
                tags = EXCLUDED.tags,
                status = EXCLUDED.status,
                is_active = EXCLUDED.is_active,
                is_resolved = EXCLUDED.is_resolved,
                resolution_value = COALESCE(EXCLUDED.resolution_value, predictions_silver.markets.resolution_value),
                outcome_count = EXCLUDED.outcome_count,
                outcomes = EXCLUDED.outcomes,
                -- Price fields intentionally EXCLUDED from update.
                -- Prices are set only on INSERT (new markets) and updated
                -- exclusively by update_market_price() which uses the
                -- authoritative per-market price endpoint.
                volume_24h = EXCLUDED.volume_24h,
                volume_7d = EXCLUDED.volume_7d,
                volume_30d = EXCLUDED.volume_30d,
                volume_total = EXCLUDED.volume_total,
                liquidity = EXCLUDED.liquidity,
                trade_count_24h = EXCLUDED.trade_count_24h,
                unique_traders = EXCLUDED.unique_traders,
                end_date = EXCLUDED.end_date,
                resolution_date = COALESCE(EXCLUDED.resolution_date, predictions_silver.markets.resolution_date),
                last_trade_at = EXCLUDED.last_trade_at,
                image_url = EXCLUDED.image_url,
                icon_url = EXCLUDED.icon_url,
                source_url = EXCLUDED.source_url,
                extra_data = COALESCE(predictions_silver.markets.extra_data, '{}'::jsonb) || EXCLUDED.extra_data,
                last_updated_at = NOW(),
                update_count = COALESCE(predictions_silver.markets.update_count, 0) + 1
            RETURNING id
        """
        
        # Serialize outcomes to JSON
        outcomes_json = json.dumps([
            {
                "id": o.id,
                "name": o.name,
                "token_id": o.token_id,
                "price": str(o.price) if o.price else None,
            }
            for o in (market.outcomes or [])
        ])
        
        async with db.asyncpg_connection() as conn:
            return await conn.fetchval(
                query,
                _enum_value(market.source),
                market.source_market_id,
                market.slug,
                market.title,
                market.description,
                market.question,
                market.category_id,
                market.category_name,
                market.tags,
                _enum_value(market.status),
                market.is_active,
                market.is_resolved,
                market.resolution_value,
                market.outcome_count,
                outcomes_json,
                float(market.yes_price) if market.yes_price else None,
                float(market.no_price) if market.no_price else None,
                float(market.last_trade_price) if market.last_trade_price else None,
                float(market.mid_price) if market.mid_price else None,
                float(market.volume_24h) if market.volume_24h else None,
                float(market.volume_7d) if market.volume_7d else None,
                float(market.volume_30d) if market.volume_30d else None,
                float(market.volume_total) if market.volume_total else None,
                float(market.liquidity) if market.liquidity else None,
                market.trade_count_24h,
                market.unique_traders,
                market.created_at_source,
                market.end_date,
                market.resolution_date,
                market.last_trade_at,
                market.image_url,
                market.icon_url,
                market.source_url,
                json.dumps(market.extra_data) if market.extra_data else "{}",
            )
    
    async def upsert_markets(self, markets: list[Market]) -> tuple[int, int]:
        """
        Batch upsert markets using efficient bulk insert.
        
        Uses PostgreSQL's executemany for much better performance than
        individual queries (~1 second vs 10+ minutes for 5000 records).
        
        Returns:
            Tuple of (upserted_count, error_count)
        """
        if not markets:
            return 0, 0
        
        # Use bulk upsert for efficiency
        return await self._bulk_upsert_markets(markets)
    
    async def _bulk_upsert_markets(self, markets: list[Market], batch_size: int = 500) -> tuple[int, int]:
        """
        Bulk upsert markets using executemany for optimal performance.
        
        Processes in batches of batch_size to avoid memory issues.
        """
        db = await get_db()
        pool = await db.get_asyncpg_pool()
        
        query = """
            INSERT INTO predictions_silver.markets (
                source, source_market_id, slug,
                title, description, question,
                category_id, category_name, tags,
                status, is_active, is_resolved, resolution_value,
                outcome_count, outcomes,
                yes_price, no_price, last_trade_price, mid_price,
                volume_24h, volume_7d, volume_30d, volume_total, liquidity,
                trade_count_24h, unique_traders,
                created_at_source, end_date, resolution_date, last_trade_at,
                image_url, icon_url, source_url,
                extra_data
            )
            VALUES (
                $1, $2, $3,
                $4, $5, $6,
                $7, $8, $9,
                $10, $11, $12, $13,
                $14, $15::jsonb,
                $16, $17, $18, $19,
                $20, $21, $22, $23, $24,
                $25, $26,
                $27, $28, $29, $30,
                $31, $32, $33,
                $34::jsonb
            )
            ON CONFLICT (source, source_market_id) DO UPDATE SET
                slug = EXCLUDED.slug,
                title = EXCLUDED.title,
                description = EXCLUDED.description,
                question = EXCLUDED.question,
                category_id = EXCLUDED.category_id,
                category_name = EXCLUDED.category_name,
                tags = EXCLUDED.tags,
                status = EXCLUDED.status,
                is_active = EXCLUDED.is_active,
                is_resolved = EXCLUDED.is_resolved,
                resolution_value = COALESCE(EXCLUDED.resolution_value, predictions_silver.markets.resolution_value),
                outcome_count = EXCLUDED.outcome_count,
                outcomes = EXCLUDED.outcomes,
                -- Price fields intentionally EXCLUDED from update.
                -- Prices are set only on INSERT (new markets) and updated
                -- exclusively by update_market_price() which uses the
                -- authoritative per-market price endpoint.
                volume_24h = EXCLUDED.volume_24h,
                volume_7d = EXCLUDED.volume_7d,
                volume_30d = EXCLUDED.volume_30d,
                volume_total = EXCLUDED.volume_total,
                liquidity = EXCLUDED.liquidity,
                trade_count_24h = EXCLUDED.trade_count_24h,
                unique_traders = EXCLUDED.unique_traders,
                end_date = EXCLUDED.end_date,
                resolution_date = COALESCE(EXCLUDED.resolution_date, predictions_silver.markets.resolution_date),
                last_trade_at = EXCLUDED.last_trade_at,
                image_url = EXCLUDED.image_url,
                icon_url = EXCLUDED.icon_url,
                source_url = EXCLUDED.source_url,
                extra_data = COALESCE(predictions_silver.markets.extra_data, '{}'::jsonb) || EXCLUDED.extra_data,
                last_updated_at = NOW(),
                update_count = COALESCE(predictions_silver.markets.update_count, 0) + 1
        """
        
        upserted = 0
        errors = 0
        
        # Prepare all records as tuples
        records = []
        for market in markets:
            try:
                # Serialize outcomes to JSON
                outcomes_json = json.dumps([
                    {
                        "id": o.id,
                        "name": o.name,
                        "token_id": o.token_id,
                        "price": str(o.price) if o.price else None,
                    }
                    for o in (market.outcomes or [])
                ])
                
                record = (
                    _enum_value(market.source),
                    market.source_market_id,
                    market.slug,
                    market.title,
                    market.description,
                    market.question,
                    market.category_id,
                    market.category_name,
                    market.tags,
                    _enum_value(market.status),
                    market.is_active,
                    market.is_resolved,
                    market.resolution_value,
                    market.outcome_count,
                    outcomes_json,
                    float(market.yes_price) if market.yes_price else None,
                    float(market.no_price) if market.no_price else None,
                    float(market.last_trade_price) if market.last_trade_price else None,
                    float(market.mid_price) if market.mid_price else None,
                    float(market.volume_24h) if market.volume_24h else None,
                    float(market.volume_7d) if market.volume_7d else None,
                    float(market.volume_30d) if market.volume_30d else None,
                    float(market.volume_total) if market.volume_total else None,
                    float(market.liquidity) if market.liquidity else None,
                    market.trade_count_24h,
                    market.unique_traders,
                    market.created_at_source,
                    market.end_date,
                    market.resolution_date,
                    market.last_trade_at,
                    market.image_url,
                    market.icon_url,
                    market.source_url,
                    json.dumps(market.extra_data) if market.extra_data else "{}",
                )
                records.append(record)
            except Exception as e:
                logger.error(
                    "Failed to prepare market record",
                    source=_enum_value(market.source) if market else "unknown",
                    market_id=market.source_market_id if market else "unknown",
                    error=str(e),
                )
                errors += 1
        
        # Process in batches using executemany
        async with pool.acquire() as conn:
            for i in range(0, len(records), batch_size):
                batch = records[i:i + batch_size]
                try:
                    await conn.executemany(query, batch)
                    upserted += len(batch)
                    batch_num = i // batch_size + 1
                    total_batches = (len(records) + batch_size - 1) // batch_size
                    logger.debug(
                        "Upserted market batch",
                        batch=batch_num,
                        total_batches=total_batches,
                        batch_size=len(batch),
                    )
                except Exception as e:
                    logger.error(
                        "Failed to upsert market batch",
                        batch_start=i,
                        batch_size=len(batch),
                        error=str(e),
                    )
                    # Fall back to individual inserts for this batch
                    for record in batch:
                        try:
                            await conn.execute(query, *record)
                            upserted += 1
                        except Exception as inner_e:
                            logger.error(
                                "Failed to upsert market",
                                market_id=record[1],  # source_market_id
                                error=str(inner_e),
                            )
                            errors += 1
        
        logger.info("Upserted markets", upserted=upserted, errors=errors)
        return upserted, errors
    
    async def update_market_price(
        self,
        source_market_id: str,
        yes_price: Optional[Any] = None,
        no_price: Optional[Any] = None,
    ) -> int:
        """
        Update market prices only (lightweight update).
        
        Used when fetching current prices from price endpoints
        without updating the full market record.
        
        Args:
            source_market_id: Market ID to update
            yes_price: Current YES price (0.0-1.0)
            no_price: Current NO price (0.0-1.0)
            
        Returns:
            1 if updated, 0 if not found
        """
        db = await get_db()
        pool = await db.get_asyncpg_pool()
        
        # Calculate mid_price if both prices available
        mid_price = None
        if yes_price is not None and no_price is not None:
            from decimal import Decimal
            mid_price = (Decimal(str(yes_price)) + Decimal(str(no_price))) / Decimal("2.0")
        
        query = """
            UPDATE predictions_silver.markets
            SET 
                yes_price = COALESCE($2, yes_price),
                no_price = COALESCE($3, no_price),
                mid_price = COALESCE($4, mid_price),
                last_updated_at = NOW(),
                update_count = COALESCE(update_count, 0) + 1
            WHERE source_market_id = $1
            RETURNING id
        """
        
        async with pool.acquire() as conn:
            result = await conn.fetchrow(
                query,
                source_market_id,
                yes_price,
                no_price,
                mid_price,
            )
        
        if result:
            logger.debug(
                "update_market_price OK",
                market_id=source_market_id,
                yes_price=yes_price,
                no_price=no_price,
            )
        else:
            logger.warning(
                "update_market_price: no row found",
                market_id=source_market_id,
            )
        
        return 1 if result else 0
    
    # =========================================================================
    # TRADES
    # =========================================================================
    
    async def insert_trade(self, trade: Trade) -> Optional[int]:
        """Insert a trade record (no upsert - trades are immutable)."""
        db = await get_db()
        
        query = """
            INSERT INTO predictions_silver.trades (
                source, source_trade_id, source_market_id,
                side, outcome, price, quantity, total_value,
                maker_address, taker_address,
                block_number, transaction_hash,
                traded_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            ON CONFLICT (source, source_trade_id, traded_at) DO NOTHING
            RETURNING id
        """
        
        async with db.asyncpg_connection() as conn:
            return await conn.fetchval(
                query,
                _enum_value(trade.source),
                trade.source_trade_id,
                trade.source_market_id,
                _enum_value(trade.side),
                trade.outcome,
                float(trade.price) if trade.price else None,
                float(trade.quantity) if trade.quantity else None,
                float(trade.total_value) if trade.total_value else None,
                trade.maker_address,
                trade.taker_address,
                trade.block_number,
                trade.transaction_hash,
                trade.traded_at,
            )
    
    async def insert_trades(self, trades: list[Trade]) -> tuple[int, int]:
        """
        Batch insert trades.
        
        Returns:
            Tuple of (inserted_count, duplicate_count)
        """
        if not trades:
            return 0, 0
        
        db = await get_db()
        
        records = [
            (
                _enum_value(t.source),
                t.source_trade_id,
                t.source_market_id,
                _enum_value(t.side),
                t.outcome,
                float(t.price) if t.price else None,
                float(t.quantity) if t.quantity else None,
                float(t.total_value) if t.total_value else None,
                t.maker_address,
                t.taker_address,
                t.block_number,
                t.transaction_hash,
                t.traded_at,
            )
            for t in trades
        ]
        
        async with db.asyncpg_connection() as conn:
            temp_table = f"_temp_trades_{id(records)}"
            
            try:
                # Use explicit transaction so temp table persists until we're done
                async with conn.transaction():
                    await conn.execute(f"""
                        CREATE TEMP TABLE {temp_table} (
                            source TEXT,
                            source_trade_id TEXT,
                            source_market_id TEXT,
                            side TEXT,
                            outcome TEXT,
                            price NUMERIC,
                            quantity NUMERIC,
                            total_value NUMERIC,
                            maker_address TEXT,
                            taker_address TEXT,
                            block_number BIGINT,
                            transaction_hash TEXT,
                            traded_at TIMESTAMPTZ
                        ) ON COMMIT DROP
                    """)
                    
                    await conn.copy_records_to_table(
                        temp_table,
                        records=records,
                        columns=[
                            "source", "source_trade_id", "source_market_id",
                            "side", "outcome", "price", "quantity", "total_value",
                            "maker_address", "taker_address", "block_number",
                            "transaction_hash", "traded_at",
                        ],
                    )
                    
                    result = await conn.execute(f"""
                        INSERT INTO predictions_silver.trades (
                            source, source_trade_id, source_market_id,
                            side, outcome, price, quantity, total_value,
                            maker_address, taker_address, block_number,
                            transaction_hash, traded_at
                        )
                        SELECT source, source_trade_id, source_market_id,
                               side, outcome, price, quantity, total_value,
                               maker_address, taker_address, block_number,
                               transaction_hash, traded_at
                        FROM {temp_table}
                        ON CONFLICT (source, source_trade_id, traded_at) DO NOTHING
                    """)
                    
                    # Parse INSERT count from result
                    inserted = int(result.split()[-1]) if result else 0
                    duplicates = len(trades) - inserted
                    
                    logger.info(
                        "Inserted trades",
                        total=len(trades),
                        inserted=inserted,
                        duplicates=duplicates,
                    )
                    
                    return inserted, duplicates
                
            except Exception as e:
                logger.error("Trade batch insert failed", error=str(e))
                raise
    
    # =========================================================================
    # PRICES
    # =========================================================================
    
    async def insert_price(self, price: PriceSnapshot) -> Optional[int]:
        """Insert a price snapshot."""
        db = await get_db()
        
        query = """
            INSERT INTO predictions_silver.prices (
                source, source_market_id,
                yes_price, no_price, mid_price,
                open_price, high_price, low_price, close_price,
                volume_1h, trade_count_1h,
                snapshot_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            ON CONFLICT (source, source_market_id, snapshot_at) DO UPDATE SET
                yes_price = EXCLUDED.yes_price,
                no_price = EXCLUDED.no_price,
                mid_price = EXCLUDED.mid_price,
                volume_1h = EXCLUDED.volume_1h,
                trade_count_1h = EXCLUDED.trade_count_1h
            RETURNING id
        """
        
        async with db.asyncpg_connection() as conn:
            return await conn.fetchval(
                query,
                _enum_value(price.source),
                price.source_market_id,
                float(price.yes_price) if price.yes_price else None,
                float(price.no_price) if price.no_price else None,
                float(price.mid_price) if price.mid_price else None,
                float(price.open_price) if price.open_price else None,
                float(price.high_price) if price.high_price else None,
                float(price.low_price) if price.low_price else None,
                float(price.close_price) if price.close_price else None,
                float(price.volume_1h) if price.volume_1h else None,
                price.trade_count_1h,
                price.snapshot_at,
            )
    
    async def insert_prices(self, prices: list[PriceSnapshot]) -> int:
        """Batch insert price snapshots."""
        if not prices:
            return 0
        
        count = 0
        for price in prices:
            try:
                await self.insert_price(price)
                count += 1
            except Exception as e:
                logger.error(
                    "Failed to insert price",
                    source=_enum_value(price.source),
                    market_id=price.source_market_id,
                    error=str(e),
                )
        
        return count
    
    # =========================================================================
    # ORDERBOOKS
    # =========================================================================
    
    async def insert_orderbook(self, orderbook: OrderbookSnapshot) -> Optional[int]:
        """Insert an orderbook snapshot."""
        db = await get_db()
        
        bids_json = json.dumps([
            {"price": str(b.price), "size": str(b.size), "orders": b.orders}
            for b in (orderbook.bids or [])
        ])
        asks_json = json.dumps([
            {"price": str(a.price), "size": str(a.size), "orders": a.orders}
            for a in (orderbook.asks or [])
        ])
        
        query = """
            INSERT INTO predictions_silver.orderbooks (
                source, source_market_id,
                best_bid, best_ask, spread, mid_price,
                total_bid_depth, total_ask_depth,
                bids, asks,
                snapshot_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING id
        """
        
        async with db.asyncpg_connection() as conn:
            return await conn.fetchval(
                query,
                _enum_value(orderbook.source),
                orderbook.source_market_id,
                float(orderbook.best_bid) if orderbook.best_bid else None,
                float(orderbook.best_ask) if orderbook.best_ask else None,
                float(orderbook.spread) if orderbook.spread else None,
                float(orderbook.mid_price) if orderbook.mid_price else None,
                float(orderbook.total_bid_depth) if orderbook.total_bid_depth else None,
                float(orderbook.total_ask_depth) if orderbook.total_ask_depth else None,
                bids_json,
                asks_json,
                orderbook.snapshot_at,
            )


class SilverReader:
    """
    Reads normalized data from silver layer.
    """
    
    async def get_market(
        self,
        source: DataSource,
        source_market_id: str,
    ) -> Optional[dict[str, Any]]:
        """Get a single market by source and ID."""
        db = await get_db()
        
        async with db.asyncpg_connection() as conn:
            row = await conn.fetchrow("""
                SELECT *
                FROM predictions_silver.markets
                WHERE source = $1 AND source_market_id = $2
            """, _enum_value(source), source_market_id)
            
            return dict(row) if row else None
    
    async def get_markets(
        self,
        source: Optional[DataSource] = None,
        is_active: Optional[bool] = None,
        category_id: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        """Query markets with filters."""
        db = await get_db()
        
        conditions = []
        params = []
        
        if source:
            params.append(source.value)
            conditions.append(f"source = ${len(params)}")
        
        if is_active is not None:
            params.append(is_active)
            conditions.append(f"is_active = ${len(params)}")
        
        if category_id:
            params.append(category_id)
            conditions.append(f"category_id = ${len(params)}")
        
        where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""
        
        params.extend([limit, offset])
        
        query = f"""
            SELECT *
            FROM predictions_silver.markets
            {where_clause}
            ORDER BY volume_24h DESC NULLS LAST
            LIMIT ${len(params) - 1} OFFSET ${len(params)}
        """
        
        async with db.asyncpg_connection() as conn:
            rows = await conn.fetch(query, *params)
            return [dict(row) for row in rows]
    
    async def get_market_count(
        self,
        source: Optional[DataSource] = None,
        is_active: Optional[bool] = None,
    ) -> int:
        """Get count of markets."""
        db = await get_db()
        
        conditions = []
        params = []
        
        if source:
            params.append(source.value)
            conditions.append(f"source = ${len(params)}")
        
        if is_active is not None:
            params.append(is_active)
            conditions.append(f"is_active = ${len(params)}")
        
        where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""
        
        async with db.asyncpg_connection() as conn:
            return await conn.fetchval(f"""
                SELECT COUNT(*) FROM predictions_silver.markets {where_clause}
            """, *params)
    
    async def get_latest_trade_time(
        self,
        source: DataSource,
        source_market_id: Optional[str] = None,
    ) -> Optional[datetime]:
        """Get the latest trade time for incremental fetching."""
        db = await get_db()
        
        if source_market_id:
            query = """
                SELECT MAX(traded_at)
                FROM predictions_silver.trades
                WHERE source = $1 AND source_market_id = $2
            """
            params = [source.value, source_market_id]
        else:
            query = """
                SELECT MAX(traded_at)
                FROM predictions_silver.trades
                WHERE source = $1
            """
            params = [source.value]
        
        async with db.asyncpg_connection() as conn:
            return await conn.fetchval(query, *params)
    
    async def get_trades(
        self,
        source: Optional[DataSource] = None,
        source_market_id: Optional[str] = None,
        since: Optional[datetime] = None,
        limit: int = 1000,
    ) -> list[dict[str, Any]]:
        """Query trades with filters."""
        db = await get_db()
        
        conditions = []
        params = []
        
        if source:
            params.append(source.value)
            conditions.append(f"source = ${len(params)}")
        
        if source_market_id:
            params.append(source_market_id)
            conditions.append(f"source_market_id = ${len(params)}")
        
        if since:
            params.append(since)
            conditions.append(f"traded_at > ${len(params)}")
        
        where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""
        
        params.append(limit)
        
        query = f"""
            SELECT *
            FROM predictions_silver.trades
            {where_clause}
            ORDER BY traded_at DESC
            LIMIT ${len(params)}
        """
        
        async with db.asyncpg_connection() as conn:
            rows = await conn.fetch(query, *params)
            return [dict(row) for row in rows]
