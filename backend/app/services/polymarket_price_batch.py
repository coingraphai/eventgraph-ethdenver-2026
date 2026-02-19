"""
Optimized Polymarket Price Batch Fetcher
Uses multithreading and batch processing for efficient price updates
NOW USING DOME SDK FOR RELIABLE PRICE FETCHING!
"""
import asyncio
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import List, Dict, Tuple, Optional
from decimal import Decimal
import time

from dome_api_sdk import DomeClient
from dome_api_sdk.types import DomeSDKConfig, GetMarketPriceParams
from app.config import settings
from app.database.session import SessionLocal
from sqlalchemy import text

logger = logging.getLogger(__name__)

# OPTIMIZED SETTINGS FOR FASTER PROCESSING
BATCH_SIZE = 500  # Process 500 markets per batch (increased from 100)
MAX_WORKERS = 20  # 20 concurrent threads (increased from 10)
RATE_LIMIT_DELAY = 0.05  # Reduced delay between batches (from 0.1s)


class PolymarketPriceBatchFetcher:
    """Batch fetch and update Polymarket prices with multithreading using Dome SDK"""
    
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or settings.DOME_API_KEY
        if not self.api_key:
            raise ValueError("DOME_API_KEY not configured")
        
        # Initialize Dome SDK client
        config = DomeSDKConfig(api_key=self.api_key)
        self.dome_client = DomeClient(config=config)
        
        self.success_count = 0
        self.error_count = 0
        self.start_time = None
    
    async def get_markets_needing_prices(self, limit: int = 1000) -> List[Dict[str, str]]:
        """
        Fetch markets from database that need price updates.
        Extracts token IDs from bronze layer raw data.
        Returns list of dicts with source_market_id and token_ids
        """
        from app.database.session import engine
        from sqlalchemy.orm import Session
        
        # Use a fresh session with autocommit for read-only queries
        with Session(engine, autocommit=False, autoflush=False) as session:
            try:
                # First, try to get markets with token IDs already in extra_data
                # ONLY ACTIVE MARKETS (end_date in future or NULL)
                result = session.execute(text("""
                    SELECT 
                        m.source_market_id,
                        m.extra_data->>'token_id_yes' as token_id_yes,
                        m.extra_data->>'token_id_no' as token_id_no,
                        m.volume_total
                    FROM predictions_silver.markets m
                    WHERE m.source = 'polymarket'
                      AND m.yes_price IS NULL
                      AND m.extra_data->>'token_id_yes' IS NOT NULL
                      AND (m.end_date IS NULL OR m.end_date > NOW())
                    ORDER BY m.volume_total DESC NULLS LAST
                    LIMIT :limit
                """), {"limit": limit})
                
                markets_with_tokens = []
                for row in result:
                    markets_with_tokens.append({
                        "source_market_id": row[0],
                        "token_id_yes": row[1],
                        "token_id_no": row[2],
                        "volume_total": row[3]
                    })
                
                if markets_with_tokens:
                    logger.info(f"Found {len(markets_with_tokens)} markets with token IDs in extra_data")
                    return markets_with_tokens
                    
            except Exception as e:
                logger.debug(f"Could not query extra_data token IDs: {e}")
                session.rollback()
            
            # If no markets have token IDs in extra_data, check if bronze layer exists
            try:
                # Try to extract token IDs from bronze polymarket_markets table
                # ONLY ACTIVE MARKETS
                result = session.execute(text("""
                    SELECT 
                        m.source_market_id,
                        b.raw_data->'side_a'->>'id' as token_id_yes,
                        b.raw_data->'side_b'->>'id' as token_id_no,
                        m.volume_total
                    FROM predictions_silver.markets m
                    LEFT JOIN predictions_bronze.polymarket_markets b 
                        ON b.raw_data->>'condition_id' = m.source_market_id
                    WHERE m.source = 'polymarket'
                      AND m.yes_price IS NULL
                      AND b.raw_data->'side_a'->>'id' IS NOT NULL
                      AND (m.end_date IS NULL OR m.end_date > NOW())
                    ORDER BY m.volume_total DESC NULLS LAST
                    LIMIT :limit
                """), {"limit": limit})
                
                markets_from_bronze = []
                for row in result:
                    markets_from_bronze.append({
                        "source_market_id": row[0],
                        "token_id_yes": row[1],
                        "token_id_no": row[2],
                        "volume_total": row[3]
                    })
                
                if markets_from_bronze:
                    logger.info(f"Found {len(markets_from_bronze)} markets with token IDs from bronze layer")
                    return markets_from_bronze
                        
            except Exception as e:
                logger.warning(f"Could not access bronze layer: {e}")
                session.rollback()
            
            # Fallback: Use Dome API to fetch market details and extract token IDs
            logger.info("Token IDs not in database, will need to fetch from API")
            try:
                # ONLY ACTIVE MARKETS
                result = session.execute(text("""
                    SELECT 
                        m.source_market_id,
                        m.volume_total
                    FROM predictions_silver.markets m
                    WHERE m.source = 'polymarket'
                      AND m.yes_price IS NULL
                      AND (m.end_date IS NULL OR m.end_date > NOW())
                    ORDER BY m.volume_total DESC NULLS LAST
                    LIMIT :limit
                """), {"limit": limit})
                
                markets = []
                for row in result:
                    markets.append({
                        "source_market_id": row[0],
                        "token_id_yes": None,  # Will need to fetch
                        "token_id_no": None,
                        "volume_total": row[1]
                    })
                
                logger.warning(f"Found {len(markets)} markets but token IDs need to be fetched from API")
                return markets
                
            except Exception as e:
                logger.error(f"Failed to query markets: {e}")
                session.rollback()
                return []
    
    def fetch_price_sync(self, token_id: str) -> Optional[Decimal]:
        """
        Synchronous price fetch using Dome SDK (to be called in thread)
        Returns Decimal price or None if failed/market closed
        """
        try:
            params = GetMarketPriceParams(token_id=token_id)
            price_response = self.dome_client.polymarket.markets.get_market_price(params=params)
            
            if price_response and hasattr(price_response, 'price'):
                price = price_response.price
                if price is not None:
                    return Decimal(str(price))
                    
        except ValueError as e:
            # 404 errors mean market is closed/expired - this is expected
            error_msg = str(e)
            if "404" in error_msg or "not found" in error_msg.lower():
                logger.debug(f"Market closed/not found for token {token_id[:20]}...")
            else:
                logger.debug(f"Error fetching price for {token_id[:20]}...: {e}")
        except Exception as e:
            logger.debug(f"Unexpected error for {token_id[:20]}...: {e}")
        
        return None
    
    def fetch_market_details_sync(self, condition_id: str) -> Optional[Dict[str, str]]:
        """
        Fetch market details from Dome SDK to extract token IDs.
        Returns dict with token_id_yes and token_id_no
        """
        try:
            from dome_api_sdk.types import GetMarketsParams
            
            params = GetMarketsParams(condition_id=condition_id, limit=1)
            markets_response = self.dome_client.polymarket.markets.get_markets(params=params)
            
            if markets_response and markets_response.markets:
                market = markets_response.markets[0]
                
                return {
                    "token_id_yes": market.side_a.id if market.side_a else None,
                    "token_id_no": market.side_b.id if market.side_b else None
                }
                        
        except Exception as e:
            logger.debug(f"Error fetching market details for {condition_id}: {e}")
        
        return None
    
    def fetch_market_prices_batch(
        self, 
        markets: List[Dict[str, str]]
    ) -> List[Tuple[str, Optional[Decimal], Optional[Decimal]]]:
        """
        Fetch prices for a batch of markets using multithreading.
        Returns list of (source_market_id, yes_price, no_price) tuples
        """
        results = []
        
        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
            # Submit all price fetch tasks
            future_to_market = {}
            
            for market in markets:
                # If token IDs are missing, fetch them first
                if not market.get("token_id_yes"):
                    logger.debug(f"Fetching token IDs for market {market['source_market_id']}")
                    token_ids = self.fetch_market_details_sync(market["source_market_id"])
                    if token_ids:
                        market["token_id_yes"] = token_ids.get("token_id_yes")
                        market["token_id_no"] = token_ids.get("token_id_no")
                    else:
                        logger.warning(f"Could not get token IDs for {market['source_market_id']}")
                        self.error_count += 1
                        continue
                
                # Fetch YES price
                future_yes = executor.submit(
                    self.fetch_price_sync,
                    market["token_id_yes"]
                )
                
                # Fetch NO price if available
                future_no = None
                if market.get("token_id_no"):
                    future_no = executor.submit(
                        self.fetch_price_sync,
                        market["token_id_no"]
                    )
                
                future_to_market[future_yes] = {
                    "market": market,
                    "is_yes": True,
                    "no_future": future_no
                }
            
            # Collect results as they complete
            for future in as_completed(future_to_market.keys()):
                market_info = future_to_market[future]
                market = market_info["market"]
                
                try:
                    yes_price = future.result()
                    no_price = None
                    
                    # Get NO price if we submitted that future
                    if market_info["no_future"]:
                        try:
                            no_price = market_info["no_future"].result(timeout=1.0)
                        except Exception as e:
                            logger.debug(f"Failed to get NO price: {e}")
                    
                    # Calculate NO price from YES if not available
                    if yes_price and not no_price:
                        no_price = Decimal("1.0") - yes_price
                    
                    if yes_price:
                        results.append((
                            market["source_market_id"],
                            yes_price,
                            no_price
                        ))
                        self.success_count += 1
                    else:
                        self.error_count += 1
                        
                except Exception as e:
                    logger.error(f"Error processing market {market['source_market_id']}: {e}")
                    self.error_count += 1
                
                # Small delay to respect rate limits
                time.sleep(RATE_LIMIT_DELAY)
        
        return results
    
    async def update_prices_in_db(
        self, 
        price_updates: List[Tuple[str, Optional[Decimal], Optional[Decimal]]]
    ) -> int:
        """
        Bulk update prices in database.
        Returns number of rows updated
        """
        if not price_updates:
            return 0
        
        from app.database.session import engine
        from sqlalchemy.orm import Session
        
        # Use a fresh session for updates
        with Session(engine, autocommit=False, autoflush=False) as session:
            try:
                updated_count = 0
                
                for source_market_id, yes_price, no_price in price_updates:
                    # Calculate mid_price
                    mid_price = None
                    if yes_price and no_price:
                        mid_price = (yes_price + no_price) / Decimal("2")
                    elif yes_price:
                        mid_price = yes_price
                    
                    result = session.execute(text("""
                        UPDATE predictions_silver.markets
                        SET 
                            yes_price = :yes_price,
                            no_price = :no_price,
                            mid_price = :mid_price,
                            last_trade_price = :mid_price,
                            last_updated_at = NOW()
                        WHERE source_market_id = :source_market_id
                          AND source = 'polymarket'
                    """), {
                        "source_market_id": source_market_id,
                        "yes_price": float(yes_price) if yes_price else None,
                        "no_price": float(no_price) if no_price else None,
                        "mid_price": float(mid_price) if mid_price else None
                    })
                    
                    if result.rowcount > 0:
                        updated_count += 1
                
                session.commit()
                logger.info(f"Updated {updated_count} markets in database")
                return updated_count
                
            except Exception as e:
                session.rollback()
                logger.error(f"Failed to update prices in database: {e}")
                raise
    
    async def run_batch_update(self, max_markets: int = 1000) -> Dict[str, int]:
        """
        Run full batch update process.
        Returns statistics dict with counts
        """
        self.start_time = time.time()
        self.success_count = 0
        self.error_count = 0
        
        logger.info(f"Starting batch price update for up to {max_markets} markets")
        
        # Get markets needing updates
        markets = await self.get_markets_needing_prices(limit=max_markets)
        
        if not markets:
            logger.info("No markets need price updates")
            return {
                "markets_checked": 0,
                "prices_fetched": 0,
                "prices_updated": 0,
                "errors": 0,
                "duration_seconds": 0
            }
        
        # Process in batches
        all_price_updates = []
        total_batches = (len(markets) + BATCH_SIZE - 1) // BATCH_SIZE
        
        logger.info(f"📊 Processing {len(markets)} markets in {total_batches} batches")
        logger.info(f"⚙️  Settings: {MAX_WORKERS} threads, {BATCH_SIZE} markets/batch")
        
        batch_times = []
        
        for batch_num in range(total_batches):
            batch_start = time.time()
            start_idx = batch_num * BATCH_SIZE
            end_idx = min(start_idx + BATCH_SIZE, len(markets))
            batch = markets[start_idx:end_idx]
            
            # Calculate progress and ETA
            progress_pct = (batch_num / total_batches) * 100
            if batch_times:
                avg_batch_time = sum(batch_times) / len(batch_times)
                remaining_batches = total_batches - batch_num
                eta_seconds = avg_batch_time * remaining_batches
                eta_mins = int(eta_seconds // 60)
                eta_secs = int(eta_seconds % 60)
                eta_str = f"ETA: {eta_mins}m {eta_secs}s"
            else:
                eta_str = "calculating..."
            
            logger.info(f"⏳ Batch {batch_num + 1}/{total_batches} ({progress_pct:.1f}%) - {len(batch)} markets - {eta_str}")
            
            # Fetch prices for this batch (multithreaded)
            batch_results = self.fetch_market_prices_batch(batch)
            all_price_updates.extend(batch_results)
            
            batch_elapsed = time.time() - batch_start
            batch_times.append(batch_elapsed)
            logger.info(f"   ✅ Batch completed in {batch_elapsed:.1f}s - Success: {len(batch_results)}/{len(batch)}")
            
            # Small delay between batches
            if batch_num < total_batches - 1:
                await asyncio.sleep(0.5)
        
        # Update all prices in database
        updated_count = await self.update_prices_in_db(all_price_updates)
        
        duration = time.time() - self.start_time
        
        stats = {
            "markets_checked": len(markets),
            "prices_fetched": self.success_count,
            "prices_updated": updated_count,
            "errors": self.error_count,
            "duration_seconds": round(duration, 2),
            "markets_per_second": round(len(markets) / duration, 2) if duration > 0 else 0
        }
        
        logger.info(f"Batch update complete: {stats}")
        return stats


async def run_polymarket_price_update(max_markets: int = 1000) -> Dict[str, int]:
    """
    Convenience function to run batch price update.
    Usage: await run_polymarket_price_update(max_markets=500)
    """
    fetcher = PolymarketPriceBatchFetcher()
    return await fetcher.run_batch_update(max_markets)


if __name__ == "__main__":
    # CLI usage: python -m app.services.polymarket_price_batch
    import sys
    
    max_markets = 1000
    if len(sys.argv) > 1:
        try:
            max_markets = int(sys.argv[1])
        except ValueError:
            print(f"Invalid max_markets value: {sys.argv[1]}")
            sys.exit(1)
    
    async def main():
        stats = await run_polymarket_price_update(max_markets)
        print(f"\n✅ Batch Update Complete!")
        print(f"   Markets Checked: {stats['markets_checked']}")
        print(f"   Prices Fetched: {stats['prices_fetched']}")
        print(f"   Prices Updated: {stats['prices_updated']}")
        print(f"   Errors: {stats['errors']}")
        print(f"   Duration: {stats['duration_seconds']}s")
        print(f"   Speed: {stats['markets_per_second']} markets/sec")
    
    asyncio.run(main())
