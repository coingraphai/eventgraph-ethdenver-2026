#!/usr/bin/env python3
"""
Backfill Market History - Populate Gold Layer History Tables

Processes Bronze layer snapshots to create:
1. market_price_history - OHLCV data for charts (1h, 4h, 1d granularities)
2. market_trade_activity - Aggregated trade statistics

Usage:
    python scripts/backfill_market_history.py --days 30 --batch-size 100
    python scripts/backfill_market_history.py --market-id "0x123..." --platform polymarket
    python scripts/backfill_market_history.py --backfill-all  # Process all markets
"""
import argparse
import asyncio
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from decimal import Decimal
import json

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

import asyncpg
import os
from dotenv import load_dotenv

# Load env from root directory
root_dir = Path(__file__).parent.parent.parent
env_path = root_dir / '.env'
load_dotenv(env_path)

# Simple logger
class Logger:
    def info(self, msg, **kwargs):
        print(f"[INFO] {msg}", kwargs if kwargs else "")
    
    def debug(self, msg, **kwargs):
        pass  # Skip debug in production
    
    def error(self, msg, **kwargs):
        print(f"[ERROR] {msg}", kwargs if kwargs else "")
    
    def warning(self, msg, **kwargs):
        print(f"[WARN] {msg}", kwargs if kwargs else "")

logger = Logger()

# Simple Database class
class Database:
    def __init__(self):
        self.conn = None
    
    async def connect(self):
        # Build connection string from env
        db_url = os.getenv('DATABASE_URL')
        if not db_url:
            # Build from individual params
            host = os.getenv('POSTGRES_HOST')
            port = os.getenv('POSTGRES_PORT', '5432')
            db = os.getenv('POSTGRES_DB', 'defaultdb')
            user = os.getenv('POSTGRES_USER')
            password = os.getenv('POSTGRES_PASSWORD')
            sslmode = os.getenv('POSTGRES_SSLMODE', 'require')
            
            db_url = f"postgresql://{user}:{password}@{host}:{port}/{db}?sslmode={sslmode}"
        
        self.conn = await asyncpg.connect(db_url)
    
    async def close(self):
        if self.conn:
            await self.conn.close()
    
    async def fetch(self, query, *args):
        return await self.conn.fetch(query, *args)
    
    async def fetch_one(self, query, *args):
        return await self.conn.fetchrow(query, *args)
    
    async def execute(self, query, *args):
        return await self.conn.execute(query, *args)


class MarketHistoryBackfill:
    """Backfills market price history and trade activity from Bronze snapshots."""
    
    def __init__(self, db: Database):
        self.db = db
        self.stats = {
            "markets_processed": 0,
            "price_history_inserted": 0,
            "trade_activity_inserted": 0,
            "errors": 0,
        }
    
    async def backfill_all_markets(
        self, 
        days: int = 30,
        batch_size: int = 100,
        platform: Optional[str] = None
    ):
        """
        Backfill history for all markets from Bronze snapshots.
        
        Args:
            days: Number of days of history to process
            batch_size: Markets to process in each batch
            platform: Filter by platform (polymarket, kalshi, limitless)
        """
        logger.info(
            "Starting backfill for all markets",
            days=days,
            batch_size=batch_size,
            platform=platform
        )
        
        # Get all markets from silver
        query = """
            SELECT DISTINCT 
                id as market_id,
                source,
                source_market_id,
                slug as market_slug,
                title as market_title
            FROM predictions_silver.markets
            WHERE 1=1
        """
        params = []
        
        if platform:
            query += " AND source = $1"
            params.append(platform)
        
        query += " ORDER BY source, market_id"
        
        markets = await self.db.fetch(query, *params)
        total_markets = len(markets)
        
        logger.info(f"Found {total_markets} markets to backfill")
        
        # Process in batches
        for i in range(0, total_markets, batch_size):
            batch = markets[i:i + batch_size]
            logger.info(
                f"Processing batch {i // batch_size + 1}/{(total_markets + batch_size - 1) // batch_size}",
                markets_in_batch=len(batch)
            )
            
            for market in batch:
                try:
                    await self.backfill_market(
                        market_id=market["market_id"],
                        source=market["source"],
                        source_market_id=market["source_market_id"],
                        days=days
                    )
                    self.stats["markets_processed"] += 1
                    
                    if self.stats["markets_processed"] % 50 == 0:
                        logger.info("Progress update", **self.stats)
                        
                except Exception as e:
                    logger.error(
                        "Failed to backfill market",
                        market_id=market["market_id"],
                        error=str(e)
                    )
                    self.stats["errors"] += 1
            
            # Small delay between batches
            await asyncio.sleep(0.1)
        
        logger.info("Backfill complete", **self.stats)
        return self.stats
    
    async def backfill_market(
        self,
        market_id: str,
        source: str,
        source_market_id: str,
        days: int = 30
    ):
        """
        Backfill history for a single market.
        
        Args:
            market_id: UUID from silver.markets
            source: Platform (polymarket, kalshi, limitless)
            source_market_id: Original market ID from platform
            days: Days of history to process
        """
        cutoff_date = datetime.now(timezone.utc) - timedelta(days=days)
        
        # Fetch Bronze snapshots for this market
        query = """
            SELECT 
                fetched_at,
                raw_data,
                content_hash
            FROM predictions_bronze.market_snapshots
            WHERE source = $1
              AND source_market_id = $2
              AND fetched_at >= $3
            ORDER BY fetched_at ASC
        """
        
        snapshots = await self.db.fetch(
            query,
            source,
            source_market_id,
            cutoff_date
        )
        
        if not snapshots:
            logger.debug(f"No snapshots found for {source}:{source_market_id}")
            return
        
        logger.debug(
            f"Processing {len(snapshots)} snapshots for {source}:{source_market_id}"
        )
        
        # Generate price history (OHLCV)
        await self._generate_price_history(
            market_id=market_id,
            source=source,
            source_market_id=source_market_id,
            snapshots=snapshots
        )
        
        # Generate trade activity
        await self._generate_trade_activity(
            market_id=market_id,
            source=source,
            source_market_id=source_market_id,
            snapshots=snapshots
        )
    
    async def _generate_price_history(
        self,
        market_id: str,
        source: str,
        source_market_id: str,
        snapshots: List[Dict]
    ):
        """Generate OHLCV data from snapshots."""
        
        # Parse snapshots into price/volume data points
        data_points = []
        for snap in snapshots:
            raw = snap["raw_data"]
            timestamp = snap["fetched_at"]
            
            # Extract price and volume based on platform
            price, volume = self._extract_price_volume(raw, source)
            
            if price is not None:
                data_points.append({
                    "timestamp": timestamp,
                    "price": price,
                    "volume": volume or 0
                })
        
        if not data_points:
            return
        
        # Generate OHLCV for multiple granularities
        for granularity in ["1h", "4h", "1d"]:
            ohlcv_data = self._compute_ohlcv(data_points, granularity)
            
            # Insert into market_price_history
            for candle in ohlcv_data:
                await self._insert_price_history(
                    market_id=market_id,
                    source=source,
                    source_market_id=source_market_id,
                    granularity=granularity,
                    **candle
                )
                self.stats["price_history_inserted"] += 1
    
    async def _generate_trade_activity(
        self,
        market_id: str,
        source: str,
        source_market_id: str,
        snapshots: List[Dict]
    ):
        """Generate trade activity aggregates from snapshots."""
        
        # Group snapshots by time windows (1h, 6h, 24h)
        for window_hours in [1, 6, 24]:
            window_duration = timedelta(hours=window_hours)
            
            # Group snapshots into windows
            windows = self._group_by_time_window(snapshots, window_duration)
            
            for window_start, window_snaps in windows:
                window_end = window_start + window_duration
                
                # Calculate aggregates for this window
                stats = self._calculate_window_stats(window_snaps, source)
                
                if stats["total_volume"] > 0:  # Only insert if there's activity
                    await self._insert_trade_activity(
                        market_id=market_id,
                        source=source,
                        source_market_id=source_market_id,
                        window_start=window_start,
                        window_end=window_end,
                        window_hours=window_hours,
                        **stats
                    )
                    self.stats["trade_activity_inserted"] += 1
    
    def _extract_price_volume(self, raw_data: Dict, source: str) -> Tuple[Optional[float], Optional[float]]:
        """Extract price and volume from raw JSON based on platform."""
        
        try:
            if source == "polymarket":
                # Polymarket: tokens array with yes/no outcomes
                tokens = raw_data.get("tokens", [])
                if tokens:
                    # Use first token (usually YES)
                    token = tokens[0]
                    price = token.get("price")
                    volume = raw_data.get("volume", 0) or raw_data.get("volume24hr", 0)
                    return (float(price), float(volume))
            
            elif source == "kalshi":
                # Kalshi: yes_bid, yes_ask
                yes_bid = raw_data.get("yes_bid")
                yes_ask = raw_data.get("yes_ask")
                if yes_bid and yes_ask:
                    price = (float(yes_bid) + float(yes_ask)) / 2 / 100  # Convert cents to decimal
                    volume = raw_data.get("volume", 0) or 0
                    return (price, float(volume))
            
            elif source == "limitless":
                # Limitless: outcome_prices array
                outcome_prices = raw_data.get("outcome_prices", [])
                if outcome_prices:
                    price = outcome_prices[0]  # First outcome
                    volume = raw_data.get("liquidityParameter", 0) or 0
                    return (float(price), float(volume))
            
            elif source == "opiniontrade":
                # OpinionTrade: marketValue
                market_value = raw_data.get("marketValue")
                if market_value is not None:
                    price = float(market_value)
                    return (price, 0)
        
        except (KeyError, TypeError, ValueError) as e:
            logger.debug(f"Failed to extract price/volume: {e}")
        
        return (None, None)
    
    def _compute_ohlcv(self, data_points: List[Dict], granularity: str) -> List[Dict]:
        """Compute OHLCV candles from data points."""
        
        # Determine time bucket size
        if granularity == "1h":
            bucket_size = timedelta(hours=1)
        elif granularity == "4h":
            bucket_size = timedelta(hours=4)
        elif granularity == "1d":
            bucket_size = timedelta(days=1)
        else:
            raise ValueError(f"Invalid granularity: {granularity}")
        
        # Group points into buckets
        buckets = {}
        for point in data_points:
            # Round down to bucket start
            timestamp = point["timestamp"]
            if granularity == "1d":
                bucket_start = timestamp.replace(hour=0, minute=0, second=0, microsecond=0)
            elif granularity == "4h":
                hour = (timestamp.hour // 4) * 4
                bucket_start = timestamp.replace(hour=hour, minute=0, second=0, microsecond=0)
            else:  # 1h
                bucket_start = timestamp.replace(minute=0, second=0, microsecond=0)
            
            if bucket_start not in buckets:
                buckets[bucket_start] = []
            buckets[bucket_start].append(point)
        
        # Compute OHLCV for each bucket
        ohlcv_data = []
        for bucket_start, points in sorted(buckets.items()):
            prices = [p["price"] for p in points]
            volumes = [p["volume"] for p in points]
            
            ohlcv_data.append({
                "period_start": bucket_start,
                "period_end": bucket_start + bucket_size,
                "open_price": prices[0],
                "high_price": max(prices),
                "low_price": min(prices),
                "close_price": prices[-1],
                "volume": sum(volumes),
                "trade_count": len(points),
                "vwap": sum(p["price"] * p["volume"] for p in points) / sum(volumes) if sum(volumes) > 0 else prices[-1]
            })
        
        return ohlcv_data
    
    def _group_by_time_window(
        self, 
        snapshots: List[Dict], 
        window_duration: timedelta
    ) -> List[Tuple[datetime, List[Dict]]]:
        """Group snapshots by time windows."""
        
        if not snapshots:
            return []
        
        # Get time range
        start_time = min(s["fetched_at"] for s in snapshots)
        end_time = max(s["fetched_at"] for s in snapshots)
        
        # Create windows
        windows = []
        current = start_time.replace(minute=0, second=0, microsecond=0)
        
        while current < end_time:
            window_end = current + window_duration
            window_snaps = [
                s for s in snapshots 
                if current <= s["fetched_at"] < window_end
            ]
            
            if window_snaps:
                windows.append((current, window_snaps))
            
            current = window_end
        
        return windows
    
    def _calculate_window_stats(self, snapshots: List[Dict], source: str) -> Dict:
        """Calculate trade statistics for a time window."""
        
        volumes = []
        prices_start = []
        prices_end = []
        
        for snap in snapshots:
            price, volume = self._extract_price_volume(snap["raw_data"], source)
            if price is not None:
                if not prices_start:
                    prices_start.append(price)
                prices_end = [price]  # Keep updating to last
                if volume:
                    volumes.append(volume)
        
        total_volume = sum(volumes)
        price_start = prices_start[0] if prices_start else None
        price_end = prices_end[0] if prices_end else None
        
        price_change = 0
        price_change_pct = 0
        if price_start and price_end:
            price_change = price_end - price_start
            price_change_pct = (price_change / price_start * 100) if price_start > 0 else 0
        
        return {
            "total_volume": total_volume,
            "buy_volume": total_volume * 0.6,  # Estimate
            "sell_volume": total_volume * 0.4,  # Estimate
            "total_trades": len(volumes),
            "buy_trades": int(len(volumes) * 0.6),
            "sell_trades": int(len(volumes) * 0.4),
            "avg_trade_size": total_volume / len(volumes) if volumes else 0,
            "max_trade_size": max(volumes) if volumes else 0,
            "price_at_start": price_start,
            "price_at_end": price_end,
            "price_change": price_change,
            "price_change_pct": price_change_pct,
            "unique_traders": 0,  # Not available from snapshots
            "new_traders": 0,
            "recent_trades": []  # Would need actual trade data
        }
    
    async def _insert_price_history(
        self,
        market_id: str,
        source: str,
        source_market_id: str,
        granularity: str,
        period_start: datetime,
        period_end: datetime,
        open_price: float,
        high_price: float,
        low_price: float,
        close_price: float,
        volume: float,
        trade_count: int,
        vwap: float
    ):
        """Insert price history record (with conflict handling)."""
        
        query = """
            INSERT INTO predictions_gold.market_price_history (
                market_id, source, source_market_id, granularity,
                period_start, period_end,
                open_price, high_price, low_price, close_price,
                volume, trade_count, vwap
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
            )
            ON CONFLICT (source_market_id, period_start, granularity) 
            DO UPDATE SET
                open_price = EXCLUDED.open_price,
                high_price = EXCLUDED.high_price,
                low_price = EXCLUDED.low_price,
                close_price = EXCLUDED.close_price,
                volume = EXCLUDED.volume,
                trade_count = EXCLUDED.trade_count,
                vwap = EXCLUDED.vwap
        """
        
        await self.db.execute(
            query,
            market_id,
            source,
            source_market_id,
            granularity,
            period_start,
            period_end,
            open_price,
            high_price,
            low_price,
            close_price,
            volume,
            trade_count,
            vwap
        )
    
    async def _insert_trade_activity(
        self,
        market_id: str,
        source: str,
        source_market_id: str,
        window_start: datetime,
        window_end: datetime,
        window_hours: int,
        total_volume: float,
        buy_volume: float,
        sell_volume: float,
        total_trades: int,
        buy_trades: int,
        sell_trades: int,
        avg_trade_size: float,
        max_trade_size: float,
        price_at_start: Optional[float],
        price_at_end: Optional[float],
        price_change: float,
        price_change_pct: float,
        unique_traders: int,
        new_traders: int,
        recent_trades: List[Dict]
    ):
        """Insert trade activity record."""
        
        query = """
            INSERT INTO predictions_gold.market_trade_activity (
                market_id, source, source_market_id,
                window_start, window_end, window_hours,
                total_volume, buy_volume, sell_volume,
                total_trades, buy_trades, sell_trades,
                avg_trade_size, max_trade_size,
                price_at_start, price_at_end, price_change, price_change_pct,
                unique_traders, new_traders, recent_trades
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
                $13, $14, $15, $16, $17, $18, $19, $20, $21::jsonb
            )
            ON CONFLICT (source_market_id, window_hours, snapshot_timestamp)
            DO NOTHING
        """
        
        await self.db.execute(
            query,
            market_id, source, source_market_id,
            window_start, window_end, window_hours,
            total_volume, buy_volume, sell_volume,
            total_trades, buy_trades, sell_trades,
            avg_trade_size, max_trade_size,
            price_at_start, price_at_end, price_change, price_change_pct,
            unique_traders, new_traders, json.dumps(recent_trades)
        )


async def main():
    parser = argparse.ArgumentParser(description="Backfill market history from Bronze snapshots")
    parser.add_argument("--days", type=int, default=30, help="Days of history to backfill")
    parser.add_argument("--batch-size", type=int, default=100, help="Markets per batch")
    parser.add_argument("--platform", choices=["polymarket", "kalshi", "limitless", "opiniontrade"], help="Filter by platform")
    parser.add_argument("--market-id", help="Backfill specific market ID")
    parser.add_argument("--backfill-all", action="store_true", help="Process all markets")
    
    args = parser.parse_args()
    
    # Setup logging (simple)
    logger.info("Starting backfill script")
    
    # Connect to database
    db = Database()
    await db.connect()
    
    try:
        backfiller = MarketHistoryBackfill(db)
        
        if args.market_id:
            # Backfill single market
            # Need to fetch market details first
            market = await db.fetch_one(
                "SELECT market_id, source, source_market_id FROM predictions_silver.markets WHERE market_id = $1",
                args.market_id
            )
            
            if not market:
                logger.error(f"Market not found: {args.market_id}")
                return 1
            
            await backfiller.backfill_market(
                market_id=market["market_id"],
                source=market["source"],
                source_market_id=market["source_market_id"],
                days=args.days
            )
        else:
            # Backfill all markets
            await backfiller.backfill_all_markets(
                days=args.days,
                batch_size=args.batch_size,
                platform=args.platform
            )
        
        logger.info("Backfill completed successfully", stats=backfiller.stats)
        return 0
        
    except Exception as e:
        logger.error(f"Backfill failed: {e}", exc_info=True)
        return 1
    
    finally:
        await db.close()


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
