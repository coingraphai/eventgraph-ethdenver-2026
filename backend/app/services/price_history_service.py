"""
Price History Service - Fetch and cache price history using Medallion Architecture

Flow: Dome API -> Bronze (raw) -> Silver (parsed) -> Gold (aggregated)
"""
import logging
import hashlib
import json
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional
import httpx
from sqlalchemy import text
from app.database.session import get_db
from app.config import settings

logger = logging.getLogger(__name__)

DOME_API_BASE = "https://api.domeapi.io"


class PriceHistoryService:
    """Service to fetch and cache market price history following medallion architecture"""
    
    def __init__(self):
        self.api_key = settings.DOME_API_KEY
    
    def _compute_hash(self, data: dict) -> str:
        """Compute SHA-256 hash of JSON data for deduplication"""
        json_str = json.dumps(data, sort_keys=True)
        return hashlib.sha256(json_str.encode()).hexdigest()[:32]
    
    async def fetch_and_store_price_history(
        self,
        market_id: str,
        source: str,
        source_market_id: str,
        token_id: str,
        hours: int = 72,  # 3 days (faster initial load)
        force_refresh: bool = False
    ) -> int:
        """
        Fetch price history from Dome API and store in Bronze layer.
        
        Flow:
        1. Fetch raw responses from Dome API
        2. Store in predictions_bronze.api_responses (raw JSON)
        3. Trigger Silver parsing (in separate process/scheduler)
        
        Returns:
            Number of API responses stored in Bronze
        """
        # Check if we already have recent Bronze data (unless force_refresh)
        if not force_refresh:
            with next(get_db()) as db:
                existing = db.execute(text("""
                    SELECT MAX(fetched_at) as latest
                    FROM predictions_bronze.api_responses
                    WHERE source = :source
                      AND endpoint_name = 'price_history'
                      AND url_path LIKE :token_pattern
                """), {
                    "source": source,
                    "token_pattern": f"%{token_id}%"
                }).fetchone()
                
                if existing and existing.latest:
                    age_hours = (datetime.now(timezone.utc) - existing.latest.replace(tzinfo=timezone.utc)).total_seconds() / 3600
                    if age_hours < 1:  # Data is fresh (< 1 hour old)
                        logger.debug(f"Bronze price history for {token_id} is fresh ({age_hours:.1f}h old), skipping fetch")
                        return 0
        
        # Fetch from Dome API
        now = datetime.utcnow()
        start_time = now - timedelta(hours=hours)
        
        # Calculate time points (6-hour intervals for faster loading)
        points = []
        current = start_time
        while current <= now:
            points.append(int(current.timestamp()))
            current += timedelta(hours=6)  # Every 6 hours instead of hourly
        
        # Limit to 50 points max (3 days * 4 points/day = 12 points)
        if len(points) > 50:
            step = len(points) // 50
            points = points[::step]
        
        logger.info(f"Fetching {len(points)} price points for {source}:{token_id}")
        
        # Fetch and store in Bronze
        stored_count = 0
        async with httpx.AsyncClient() as client:
            for ts in points:
                try:
                    url_path = f"/polymarket/market-price/{token_id}"
                    query_params = {"at_time": ts}
                    
                    resp = await client.get(
                        f"{DOME_API_BASE}{url_path}",
                        headers={"Authorization": f"Bearer {self.api_key}"},
                        params=query_params,
                        timeout=10.0,
                    )
                    
                    if resp.status_code == 200:
                        body_json = resp.json()
                        body_hash = self._compute_hash(body_json)
                        
                        # Store in Bronze (raw API response)
                        with next(get_db()) as db:
                            try:
                                db.execute(text("""
                                    INSERT INTO predictions_bronze.api_responses (
                                        source,
                                        endpoint_name,
                                        url_path,
                                        query_params,
                                        body_json,
                                        body_hash,
                                        http_status,
                                        response_size_bytes,
                                        ingestion_type,
                                        fetched_at
                                    ) VALUES (
                                        :source,
                                        'price_history',
                                        :url_path,
                                        :query_params,
                                        :body_json,
                                        :body_hash,
                                        :http_status,
                                        :response_size_bytes,
                                        'delta',
                                        :fetched_at
                                    )
                                    ON CONFLICT (body_hash, source) DO NOTHING
                                """), {
                                    "source": source,
                                    "url_path": url_path,
                                    "query_params": json.dumps(query_params),
                                    "body_json": json.dumps(body_json),
                                    "body_hash": body_hash,
                                    "http_status": resp.status_code,
                                    "response_size_bytes": len(resp.text),
                                    "fetched_at": datetime.fromtimestamp(ts, tz=timezone.utc)
                                })
                                db.commit()
                                stored_count += 1
                                
                                # Also parse to Silver immediately (for fast access)
                                await self._parse_to_silver(
                                    db=db,
                                    market_id=market_id,
                                    source=source,
                                    source_market_id=source_market_id,
                                    token_id=token_id,
                                    timestamp=ts,
                                    price_data=body_json
                                )
                                
                            except Exception as e:
                                logger.debug(f"Failed to store Bronze response (might be duplicate): {e}")
                        
                except Exception as e:
                    logger.debug(f"Failed to fetch price at {ts}: {e}")
        
        logger.info(f"Stored {stored_count} raw API responses in Bronze for {token_id}")
        return stored_count
    
    async def _parse_to_silver(
        self,
        db,
        market_id: str,
        source: str,
        source_market_id: str,
        token_id: str,
        timestamp: int,
        price_data: dict
    ):
        """
        Parse Bronze data to Silver prices, then aggregate to Gold.
        
        Proper medallion architecture:
        Bronze (raw API) → Silver (normalized snapshots) → Gold (aggregated OHLCV)
        """
        
        price = price_data.get("price")
        if price is None:
            return
        
        snapshot_at = datetime.fromtimestamp(timestamp, tz=timezone.utc)
        period_start = snapshot_at.replace(minute=0, second=0, microsecond=0)
        period_end = period_start + timedelta(hours=1)
        
        try:
            # STEP 1: Insert into Silver (normalized price snapshot)
            db.execute(text("""
                INSERT INTO predictions_silver.prices (
                    source, source_market_id,
                    yes_price, no_price, mid_price,
                    snapshot_at
                ) VALUES (
                    :source, :source_market_id,
                    :price, :price_inverse, :price,
                    :snapshot_at
                )
                ON CONFLICT (source, source_market_id, snapshot_at) 
                DO UPDATE SET
                    yes_price = EXCLUDED.yes_price,
                    no_price = EXCLUDED.no_price,
                    mid_price = EXCLUDED.mid_price
            """), {
                "source": source,
                "source_market_id": source_market_id,
                "price": float(price),
                "price_inverse": float(1.0 - price) if price <= 1.0 else None,
                "snapshot_at": snapshot_at
            })
            
            # STEP 2: Aggregate into Gold (1-hour OHLCV candles)
            db.execute(text("""
                INSERT INTO predictions_gold.market_price_history (
                    market_id, source, source_market_id, granularity,
                    period_start, period_end,
                    open_price, high_price, low_price, close_price, volume
                ) VALUES (
                    :market_id, :source, :source_market_id, '1h',
                    :period_start, :period_end,
                    :price, :price, :price, :price, 0
                )
                ON CONFLICT (source_market_id, period_start, granularity) 
                DO UPDATE SET
                    close_price = EXCLUDED.close_price,
                    high_price = GREATEST(predictions_gold.market_price_history.high_price, EXCLUDED.high_price),
                    low_price = LEAST(predictions_gold.market_price_history.low_price, EXCLUDED.low_price)
            """), {
                "market_id": market_id,
                "source": source,
                "source_market_id": source_market_id,
                "period_start": period_start,
                "period_end": period_end,
                "price": float(price)
            })
            db.commit()
        except Exception as e:
            logger.error(f"Failed to parse to Silver/Gold: {e}")
    
    def get_price_history_from_gold(
        self,
        market_id: str,
        source: str,
        source_market_id: str,
        hours: int = 168
    ) -> List[Dict]:
        """
        Get price history from Gold layer (aggregated/parsed data).
        
        Returns:
            List of price points [{timestamp, price, date}, ...]
        """
        cutoff_time = datetime.now(timezone.utc) - timedelta(hours=hours)
        
        with next(get_db()) as db:
            result = db.execute(text("""
                SELECT 
                    EXTRACT(EPOCH FROM period_start)::bigint as timestamp,
                    close_price as price,
                    period_start
                FROM predictions_gold.market_price_history
                WHERE source_market_id = :source_market_id
                  AND source = :source
                  AND granularity = '1h'
                  AND period_start >= :cutoff_time
                ORDER BY period_start ASC
            """), {
                "source_market_id": source_market_id,
                "source": source,
                "cutoff_time": cutoff_time
            }).fetchall()
            
            return [
                {
                    "timestamp": int(row.timestamp),
                    "price": float(row.price) if row.price else None,
                    "date": row.period_start.isoformat()
                }
                for row in result
                if row.price is not None
            ]
    
    async def ensure_price_history_cached(
        self,
        markets: List[Dict],
        max_markets: int = 10
    ) -> Dict[str, List[Dict]]:
        """
        Ensure price history is cached for markets.
        
        Flow:
        1. Check Gold for existing data
        2. If missing/stale, fetch from API -> Bronze -> Silver -> Gold
        3. Return from Gold
        
        Args:
            markets: List of market dicts with market_id, source, source_market_id, token_id_yes
            max_markets: Maximum number of markets to fetch
        
        Returns:
            Dict mapping market_id -> price history points
        """
        result = {}
        markets_to_process = markets[:max_markets]
        
        for market in markets_to_process:
            market_id = market.get("market_id") or market.get("condition_id")
            source = market.get("source", "polymarket")
            source_market_id = market.get("source_market_id") or market_id
            token_id_yes = market.get("token_id_yes")
            token_id_no = market.get("token_id_no")
            token_id = token_id_yes or token_id_no
            
            # DEBUG: Log token ID extraction
            logger.info(f"Market {market_id}: token_id_yes={token_id_yes[:20] if token_id_yes else None}, token_id_no={token_id_no[:20] if token_id_no else None}")
            
            if not (market_id and source_market_id and token_id):
                logger.warning(f"Skipping market {market_id} - missing token_id (yes={token_id_yes is not None}, no={token_id_no is not None})")
                continue
            
            # Try to get from Gold first
            cached_data = self.get_price_history_from_gold(
                market_id=market_id,
                source=source,
                source_market_id=source_market_id,
                hours=168  # 7 days
            )
            
            if cached_data and len(cached_data) > 5:
                # Have good cached data in Gold
                result[market_id] = cached_data
                logger.debug(f"Using Gold price history for {market_id} ({len(cached_data)} points)")
            else:
                # Need to fetch from API -> Bronze -> Gold
                logger.info(f"Fetching fresh price history for {market_id} (Bronze->Gold)")
                try:
                    stored_count = await self.fetch_and_store_price_history(
                        market_id=market_id,
                        source=source,
                        source_market_id=source_market_id,
                        token_id=token_id,
                        hours=72  # 3 days
                    )
                    
                    if stored_count > 0:
                        # Now get from Gold
                        fresh_data = self.get_price_history_from_gold(
                            market_id=market_id,
                            source=source,
                            source_market_id=source_market_id,
                            hours=168
                        )
                        result[market_id] = fresh_data
                        logger.debug(f"Fetched and cached {len(fresh_data)} points for {market_id}")
                
                except Exception as e:
                    logger.error(f"Failed to fetch price history for {market_id}: {e}")
        
        return result


# Singleton instance
price_history_service = PriceHistoryService()
