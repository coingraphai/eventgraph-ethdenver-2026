"""
Silver layer: Normalize raw JSON into structured tables.
"""
import json
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any
from uuid import uuid4

import structlog

from limitless_ingest.database import Database

logger = structlog.get_logger()


class SilverNormalizer:
    """Transforms bronze layer data into normalized silver layer tables."""
    
    def __init__(self, db: Database):
        self.db = db
    
    async def normalize_categories(self) -> dict[str, Any]:
        """
        Normalize categories from bronze to silver.
        Reads the latest categories response and upserts to silver.categories.
        """
        logger.info("Normalizing categories to silver layer")
        
        # Get the latest categories response
        query = """
            SELECT body_json, body_hash, fetched_at
            FROM limitless_bronze.api_responses
            WHERE endpoint_name = 'categories'
            ORDER BY fetched_at DESC
            LIMIT 1
        """
        row = await self.db.fetchrow(query)
        
        if not row:
            logger.warning("No categories data in bronze layer")
            return {"status": "skipped", "reason": "no_data"}
        
        categories = json.loads(row["body_json"])
        body_hash = row["body_hash"]
        
        inserted = 0
        updated = 0
        
        for cat in categories:
            upsert_query = """
                INSERT INTO limitless_silver.categories (id, slug, title, body_hash, updated_at)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (id) DO UPDATE SET
                    slug = EXCLUDED.slug,
                    title = EXCLUDED.title,
                    body_hash = EXCLUDED.body_hash,
                    updated_at = EXCLUDED.updated_at
                RETURNING (xmax = 0) AS is_insert
            """
            cat_id = str(cat["id"])
            result = await self.db.fetchval(
                upsert_query,
                cat_id,
                cat.get("slug", cat_id),
                cat.get("title", cat.get("name", "")),
                body_hash,
                datetime.now(timezone.utc),
            )
            
            if result:
                inserted += 1
            else:
                updated += 1
        
        logger.info(
            "Categories normalized",
            total=len(categories),
            inserted=inserted,
            updated=updated,
        )
        
        return {
            "status": "success",
            "total": len(categories),
            "inserted": inserted,
            "updated": updated,
        }
    
    async def normalize_tokens(self) -> dict[str, Any]:
        """Normalize tokens from bronze to silver."""
        logger.info("Normalizing tokens to silver layer")
        
        query = """
            SELECT body_json, body_hash, fetched_at
            FROM limitless_bronze.api_responses
            WHERE endpoint_name = 'tokens'
            ORDER BY fetched_at DESC
            LIMIT 1
        """
        row = await self.db.fetchrow(query)
        
        if not row:
            logger.warning("No tokens data in bronze layer")
            return {"status": "skipped", "reason": "no_data"}
        
        tokens = json.loads(row["body_json"])
        body_hash = row["body_hash"]
        
        inserted = 0
        updated = 0
        
        for token in tokens:
            upsert_query = """
                INSERT INTO limitless_silver.tokens (
                    id, symbol, title, image_url, address, decimals, 
                    chain_id, price_usd, body_hash, updated_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                ON CONFLICT (id) DO UPDATE SET
                    symbol = EXCLUDED.symbol,
                    title = EXCLUDED.title,
                    image_url = EXCLUDED.image_url,
                    address = EXCLUDED.address,
                    decimals = EXCLUDED.decimals,
                    chain_id = EXCLUDED.chain_id,
                    price_usd = EXCLUDED.price_usd,
                    body_hash = EXCLUDED.body_hash,
                    updated_at = EXCLUDED.updated_at
                RETURNING (xmax = 0) AS is_insert
            """
            
            # Handle price conversion
            price_usd = token.get("priceUsd") or token.get("price")
            if price_usd is not None:
                price_usd = Decimal(str(price_usd))
            
            result = await self.db.fetchval(
                upsert_query,
                str(token["id"]),
                token.get("symbol", ""),
                token.get("title", token.get("name", "")),
                token.get("logoUrl") or token.get("image") or token.get("imageUrl"),
                token.get("address"),
                token.get("decimals"),
                token.get("chainId"),
                price_usd,
                body_hash,
                datetime.now(timezone.utc),
            )
            
            if result:
                inserted += 1
            else:
                updated += 1
        
        logger.info(
            "Tokens normalized",
            total=len(tokens),
            inserted=inserted,
            updated=updated,
        )
        
        return {
            "status": "success",
            "total": len(tokens),
            "inserted": inserted,
            "updated": updated,
        }
    
    async def normalize_markets(self) -> dict[str, Any]:
        """Normalize markets from bronze to silver."""
        logger.info("Normalizing markets to silver layer")
        
        # Get all unique markets from bronze (deduplicated by slug)
        query = """
            WITH latest_pages AS (
                SELECT DISTINCT ON (query_params->>'page')
                    body_json,
                    body_hash,
                    fetched_at
                FROM limitless_bronze.api_responses
                WHERE endpoint_name = 'markets_active'
                ORDER BY query_params->>'page', fetched_at DESC
            )
            SELECT body_json, body_hash
            FROM latest_pages
        """
        rows = await self.db.fetch(query)
        
        if not rows:
            logger.warning("No markets data in bronze layer")
            return {"status": "skipped", "reason": "no_data"}
        
        # Collect all markets from all pages
        all_markets = {}
        for row in rows:
            page_data = json.loads(row["body_json"])
            markets = page_data.get("data", [])
            for market in markets:
                # Use slug as key to deduplicate
                slug = market.get("slug") or market.get("id")
                if slug:
                    all_markets[slug] = (market, row["body_hash"])
        
        inserted = 0
        updated = 0
        
        for slug, (market, body_hash) in all_markets.items():
            upsert_query = """
                INSERT INTO limitless_silver.markets (
                    id, slug, title, description, category_id, status,
                    collateral_token_id, liquidity, volume, created_at,
                    deadline, resolution_date, outcome_prices,
                    body_hash, updated_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
                ON CONFLICT (id) DO UPDATE SET
                    slug = EXCLUDED.slug,
                    title = EXCLUDED.title,
                    description = EXCLUDED.description,
                    category_id = EXCLUDED.category_id,
                    status = EXCLUDED.status,
                    collateral_token_id = EXCLUDED.collateral_token_id,
                    liquidity = EXCLUDED.liquidity,
                    volume = EXCLUDED.volume,
                    deadline = EXCLUDED.deadline,
                    resolution_date = EXCLUDED.resolution_date,
                    outcome_prices = EXCLUDED.outcome_prices,
                    body_hash = EXCLUDED.body_hash,
                    updated_at = EXCLUDED.updated_at
                RETURNING (xmax = 0) AS is_insert
            """
            
            # Parse dates
            created_at = None
            if market.get("createdAt"):
                try:
                    created_at = datetime.fromisoformat(
                        market["createdAt"].replace("Z", "+00:00")
                    )
                except (ValueError, TypeError):
                    pass
            
            deadline = None
            if market.get("deadline"):
                try:
                    deadline = datetime.fromisoformat(
                        market["deadline"].replace("Z", "+00:00")
                    )
                except (ValueError, TypeError):
                    pass
            
            resolution_date = None
            if market.get("resolutionDate"):
                try:
                    resolution_date = datetime.fromisoformat(
                        market["resolutionDate"].replace("Z", "+00:00")
                    )
                except (ValueError, TypeError):
                    pass
            
            # Parse numeric values
            liquidity = None
            if market.get("liquidity") is not None:
                try:
                    liquidity = Decimal(str(market["liquidity"]))
                except (ValueError, TypeError):
                    pass
            
            volume = None
            if market.get("volume") is not None:
                try:
                    volume = Decimal(str(market["volume"]))
                except (ValueError, TypeError):
                    pass
            
            # Get outcome prices as JSONB
            outcome_prices = None
            if market.get("prices") or market.get("outcomePrices"):
                outcome_prices = json.dumps(
                    market.get("prices") or market.get("outcomePrices")
                )
            
            # Get category and collateral token IDs as strings
            category_id = market.get("categoryId") or market.get("category")
            if category_id is not None:
                category_id = str(category_id)
            
            collateral_token_id = None
            if isinstance(market.get("collateralToken"), dict):
                collateral_token_id = str(market["collateralToken"].get("id", ""))
            elif market.get("collateralTokenId"):
                collateral_token_id = str(market["collateralTokenId"])
            
            result = await self.db.fetchval(
                upsert_query,
                str(market.get("id", slug)),
                slug,
                market.get("title", ""),
                market.get("description"),
                category_id,
                market.get("status", "active"),
                collateral_token_id,
                liquidity,
                volume,
                created_at or datetime.now(timezone.utc),
                deadline,
                resolution_date,
                outcome_prices,
                body_hash,
                datetime.now(timezone.utc),
            )
            
            if result:
                inserted += 1
            else:
                updated += 1
        
        logger.info(
            "Markets normalized",
            total=len(all_markets),
            inserted=inserted,
            updated=updated,
        )
        
        return {
            "status": "success",
            "total": len(all_markets),
            "inserted": inserted,
            "updated": updated,
        }
    
    async def normalize_trades(self) -> dict[str, Any]:
        """Normalize trades from bronze feed data to silver."""
        logger.info("Normalizing trades to silver layer")
        
        # Get all feed pages with trades not yet processed
        query = """
            SELECT id, body_json, body_hash, fetched_at
            FROM limitless_bronze.api_responses
            WHERE endpoint_name = 'feed'
            ORDER BY fetched_at ASC
        """
        rows = await self.db.fetch(query)
        
        if not rows:
            logger.warning("No feed data in bronze layer")
            return {"status": "skipped", "reason": "no_data"}
        
        logger.info(f"Found {len(rows)} feed pages to process")
        
        inserted = 0
        skipped = 0
        
        for idx, row in enumerate(rows, 1):
            page_data = json.loads(row["body_json"])
            trades = page_data.get("data", [])
            
            logger.info(f"Processing page {idx}/{len(rows)} with {len(trades)} trades...")
            
            for trade in trades:
                # Compute a unique hash for this trade event
                trade_hash = f"{trade.get('txHash', '')}_{trade.get('timestamp', '')}_{trade.get('trader', {}).get('account', '')}"
                import hashlib
                body_hash = hashlib.sha256(trade_hash.encode()).hexdigest()[:16]
                
                upsert_query = """
                    INSERT INTO limitless_silver.trades (
                        id, body_hash, trade_timestamp, market_id, market_slug,
                        trader_address, trader_name, trader_image_url,
                        trade_type, side, contracts, price, total_value,
                        tx_hash, created_at
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
                    ON CONFLICT (body_hash) DO NOTHING
                    RETURNING id
                """
                
                # Parse timestamp
                trade_ts = None
                if trade.get("timestamp"):
                    try:
                        trade_ts = datetime.fromisoformat(
                            trade["timestamp"].replace("Z", "+00:00")
                        )
                    except (ValueError, TypeError):
                        pass
                
                # Extract trader info
                trader = trade.get("trader", {})
                trader_address = trader.get("account") or trader.get("address")
                trader_name = trader.get("name") or trader.get("displayName")
                trader_image = trader.get("image") or trader.get("imageUrl")
                
                # Extract market info
                market = trade.get("market", {})
                market_id = str(market.get("id")) if market.get("id") else None
                market_slug = market.get("slug")
                
                # Extract trade details
                contracts = None
                if trade.get("contracts") is not None:
                    try:
                        contracts = Decimal(str(trade["contracts"]))
                    except (ValueError, TypeError):
                        pass
                
                price = None
                if trade.get("price") is not None:
                    try:
                        price = Decimal(str(trade["price"]))
                    except (ValueError, TypeError):
                        pass
                
                total_value = None
                if trade.get("totalValue") is not None:
                    try:
                        total_value = Decimal(str(trade["totalValue"]))
                    except (ValueError, TypeError):
                        pass
                
                result = await self.db.fetchval(
                    upsert_query,
                    str(uuid4()),
                    body_hash,
                    trade_ts,
                    market_id,
                    market_slug,
                    trader_address,
                    trader_name,
                    trader_image,
                    trade.get("type"),  # buy/sell/claim
                    trade.get("side"),  # yes/no
                    contracts,
                    price,
                    total_value,
                    trade.get("txHash"),
                    datetime.now(timezone.utc),
                )
                
                if result:
                    inserted += 1
                else:
                    skipped += 1
            
            # Log progress every page
            if idx % 5 == 0 or idx == len(rows):
                logger.info(
                    f"Progress: {idx}/{len(rows)} pages processed",
                    inserted=inserted,
                    skipped=skipped,
                )
        
        logger.info(
            "Trades normalized",
            inserted=inserted,
            skipped=skipped,
        )
        
        return {
            "status": "success",
            "inserted": inserted,
            "skipped_duplicates": skipped,
        }
    
    async def normalize_all(self) -> dict[str, Any]:
        """Run full normalization of all entities."""
        logger.info("Starting full silver normalization")
        
        results = {
            "started_at": datetime.now(timezone.utc).isoformat(),
            "entities": {},
        }
        
        results["entities"]["categories"] = await self.normalize_categories()
        results["entities"]["tokens"] = await self.normalize_tokens()
        results["entities"]["markets"] = await self.normalize_markets()
        results["entities"]["trades"] = await self.normalize_trades()
        
        results["completed_at"] = datetime.now(timezone.utc).isoformat()
        
        logger.info("Silver normalization completed", results=results)
        
        return results
    
    async def refresh_gold_views(self) -> dict[str, Any]:
        """Refresh all gold layer materialized views."""
        logger.info("Refreshing gold layer views")
        
        try:
            await self.db.execute("SELECT limitless_gold.refresh_all_views()")
            logger.info("Gold views refreshed successfully")
            return {"status": "success"}
        except Exception as e:
            logger.error("Failed to refresh gold views", error=str(e))
            return {"status": "error", "error": str(e)}
