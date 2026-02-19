"""
Gold Layer Aggregator - Production-ready aggregation pipeline.

Transforms Silver layer data into Gold analytics tables with:
- Comprehensive error handling and logging
- Detailed record tracking (inserted, upserted, deleted, errors)
- Async concurrent processing for optimal performance
- Structured logging with run summaries
"""

import asyncio
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Optional, Any
from uuid import UUID, uuid4

import structlog

from predictions_ingest.database import DatabaseManager

logger = structlog.get_logger(__name__)


@dataclass
class AggregationResult:
    """Result of a single table aggregation operation."""
    table_name: str
    status: str = "pending"  # pending, success, partial, failed
    inserted: int = 0
    upserted: int = 0
    deleted: int = 0
    error_count: int = 0
    error_records: list = field(default_factory=list)
    duration_seconds: float = 0.0
    snapshot_id: Optional[UUID] = None
    message: str = ""
    
    def to_dict(self) -> dict:
        """Convert to dictionary for logging."""
        return {
            "table": self.table_name,
            "status": self.status,
            "inserted": self.inserted,
            "upserted": self.upserted,
            "deleted": self.deleted,
            "errors": self.error_count,
            "duration_s": round(self.duration_seconds, 3),
            "message": self.message,
        }


@dataclass
class RunSummary:
    """Summary of an aggregation run across all tables."""
    run_id: UUID = field(default_factory=uuid4)
    run_type: str = "unknown"  # hot, warm, cleanup
    started_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    completed_at: Optional[datetime] = None
    results: list[AggregationResult] = field(default_factory=list)
    
    @property
    def total_inserted(self) -> int:
        return sum(r.inserted for r in self.results)
    
    @property
    def total_upserted(self) -> int:
        return sum(r.upserted for r in self.results)
    
    @property
    def total_deleted(self) -> int:
        return sum(r.deleted for r in self.results)
    
    @property
    def total_errors(self) -> int:
        return sum(r.error_count for r in self.results)
    
    @property
    def success_count(self) -> int:
        return sum(1 for r in self.results if r.status == "success")
    
    @property
    def failed_count(self) -> int:
        return sum(1 for r in self.results if r.status == "failed")
    
    @property
    def duration_seconds(self) -> float:
        if self.completed_at:
            return (self.completed_at - self.started_at).total_seconds()
        return 0.0
    
    def to_dict(self) -> dict:
        """Convert to dictionary for logging."""
        return {
            "run_id": str(self.run_id),
            "run_type": self.run_type,
            "duration_s": round(self.duration_seconds, 3),
            "tables_processed": len(self.results),
            "success": self.success_count,
            "failed": self.failed_count,
            "total_inserted": self.total_inserted,
            "total_upserted": self.total_upserted,
            "total_deleted": self.total_deleted,
            "total_errors": self.total_errors,
        }


class GoldLayerAggregator:
    """
    Aggregates Silver layer data into Gold analytics tables.
    
    Silver Schema (predictions_silver.markets):
    - source (not platform)
    - volume_24h, volume_7d, volume_30d, volume_total (no _usd suffix)
    - category_name (not category)
    - yes_price, no_price (not current_price)
    - is_active (not status='active')
    
    Provides production-ready features:
    - Concurrent processing with asyncio
    - Comprehensive error handling per record
    - Detailed logging with metrics
    - Run summaries with all CRUD counts
    """
    
    def __init__(self, db: DatabaseManager):
        self.db = db
        self.logger = logger.bind(component="gold_aggregator")
    
    async def _safe_execute(
        self,
        conn,
        query: str,
        params: tuple = (),
        table_name: str = "unknown",
        operation: str = "execute"
    ) -> tuple[Any, Optional[str]]:
        """
        Safely execute a query with error handling.
        
        Returns:
            tuple: (result, error_message) - error_message is None on success
        """
        try:
            if operation == "fetch":
                result = await conn.fetch(query, *params)
            elif operation == "fetchval":
                result = await conn.fetchval(query, *params)
            elif operation == "fetchrow":
                result = await conn.fetchrow(query, *params)
            else:
                result = await conn.execute(query, *params)
            return result, None
        except Exception as e:
            error_msg = f"{type(e).__name__}: {str(e)}"
            self.logger.error(
                "Query execution failed",
                table=table_name,
                operation=operation,
                error=error_msg
            )
            return None, error_msg
    
    # ========================================================================
    # HOT AGGREGATIONS (Real-time, 5-minute intervals)
    # ========================================================================
    
    async def run_hot_aggregations(self) -> RunSummary:
        """Run all hot aggregations concurrently."""
        summary = RunSummary(run_type="hot")
        self.logger.info("Starting HOT aggregations", run_id=str(summary.run_id))
        
        tasks = [
            self.aggregate_market_metrics(),
            self.aggregate_top_markets(),
            self.aggregate_high_volume_activity(),
        ]
        
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                table_names = ["market_metrics_summary", "top_markets_snapshot", "high_volume_activity"]
                error_result = AggregationResult(
                    table_name=table_names[i],
                    status="failed",
                    error_count=1,
                    message=f"Exception: {str(result)}"
                )
                summary.results.append(error_result)
                self.logger.error("Hot aggregation task failed", table=table_names[i], error=str(result))
            else:
                summary.results.append(result)
        
        summary.completed_at = datetime.now(timezone.utc)
        self._log_run_summary(summary)
        return summary
    
    async def aggregate_market_metrics(self) -> AggregationResult:
        """Aggregate overall market metrics summary."""
        result = AggregationResult(table_name="market_metrics_summary")
        start_time = datetime.now(timezone.utc)
        
        try:
            async with self.db.asyncpg_connection() as conn:
                snapshot_id = uuid4()
                result.snapshot_id = snapshot_id
                
                # Silver uses: source, volume_24h, volume_7d, is_active
                query = """
                    INSERT INTO predictions_gold.market_metrics_summary (
                        snapshot_timestamp, snapshot_id,
                        total_markets, total_open_markets,
                        combined_volume_24h, combined_volume_7d, avg_volume_per_market,
                        polymarket_open_markets, polymarket_volume_24h, polymarket_growth_24h_pct, polymarket_market_share_pct,
                        kalshi_open_markets, kalshi_volume_24h, kalshi_growth_24h_pct, kalshi_market_share_pct,
                        limitless_open_markets, limitless_volume_24h, limitless_growth_24h_pct, limitless_market_share_pct,
                        trend_direction, change_pct_24h, change_pct_7d
                    )
                    WITH platform_stats AS (
                        SELECT
                            source,
                            COUNT(*) as market_count,
                            COUNT(*) FILTER (WHERE is_active = true) as open_markets,
                            COALESCE(SUM(volume_24h), 0) as volume_24h,
                            COALESCE(SUM(volume_7d), 0) as volume_7d
                        FROM predictions_silver.markets
                        GROUP BY source
                    ),
                    totals AS (
                        SELECT
                            SUM(market_count) as total_markets,
                            SUM(open_markets) as total_open_markets,
                            SUM(volume_24h) as combined_volume_24h,
                            SUM(volume_7d) as combined_volume_7d
                        FROM platform_stats
                    )
                    SELECT
                        NOW() as snapshot_timestamp,
                        $1::uuid as snapshot_id,
                        COALESCE(t.total_markets, 0)::int as total_markets,
                        COALESCE(t.total_open_markets, 0)::int as total_open_markets,
                        COALESCE(t.combined_volume_24h, 0) as combined_volume_24h,
                        COALESCE(t.combined_volume_7d, 0) as combined_volume_7d,
                        CASE WHEN t.total_open_markets > 0 THEN t.combined_volume_24h / t.total_open_markets ELSE 0 END as avg_volume_per_market,
                        COALESCE((SELECT open_markets FROM platform_stats WHERE source = 'polymarket'), 0)::int,
                        COALESCE((SELECT volume_24h FROM platform_stats WHERE source = 'polymarket'), 0),
                        0.0 as polymarket_growth_24h_pct,
                        CASE WHEN t.combined_volume_24h > 0 THEN COALESCE((SELECT volume_24h FROM platform_stats WHERE source = 'polymarket'), 0) / t.combined_volume_24h * 100 ELSE 0 END as polymarket_market_share_pct,
                        COALESCE((SELECT open_markets FROM platform_stats WHERE source = 'kalshi'), 0)::int,
                        COALESCE((SELECT volume_24h FROM platform_stats WHERE source = 'kalshi'), 0),
                        0.0 as kalshi_growth_24h_pct,
                        CASE WHEN t.combined_volume_24h > 0 THEN COALESCE((SELECT volume_24h FROM platform_stats WHERE source = 'kalshi'), 0) / t.combined_volume_24h * 100 ELSE 0 END as kalshi_market_share_pct,
                        COALESCE((SELECT open_markets FROM platform_stats WHERE source = 'limitless'), 0)::int,
                        COALESCE((SELECT volume_24h FROM platform_stats WHERE source = 'limitless'), 0),
                        0.0 as limitless_growth_24h_pct,
                        CASE WHEN t.combined_volume_24h > 0 THEN COALESCE((SELECT volume_24h FROM platform_stats WHERE source = 'limitless'), 0) / t.combined_volume_24h * 100 ELSE 0 END as limitless_market_share_pct,
                        'stable' as trend_direction,
                        0.0 as change_pct_24h,
                        0.0 as change_pct_7d
                    FROM totals t
                    RETURNING snapshot_id
                """
                
                returned_id, error = await self._safe_execute(conn, query, (snapshot_id,), table_name="market_metrics_summary", operation="fetchval")
                
                if error:
                    result.status = "failed"
                    result.error_count = 1
                    result.message = error
                else:
                    result.inserted = 1
                    result.status = "success"
                    result.message = "Market metrics aggregated successfully"
                
        except Exception as e:
            result.status = "failed"
            result.error_count = 1
            result.message = f"Exception: {str(e)}"
            self.logger.exception("Failed to aggregate market metrics", error=str(e))
        
        result.duration_seconds = (datetime.now(timezone.utc) - start_time).total_seconds()
        self._log_aggregation_result(result)
        return result
    
    async def aggregate_top_markets(self) -> AggregationResult:
        """Aggregate top markets by volume for snapshot."""
        result = AggregationResult(table_name="top_markets_snapshot")
        start_time = datetime.now(timezone.utc)
        
        try:
            async with self.db.asyncpg_connection() as conn:
                snapshot_id = uuid4()
                result.snapshot_id = snapshot_id
                
                # Delete old snapshots
                delete_query = """
                    DELETE FROM predictions_gold.top_markets_snapshot
                    WHERE snapshot_timestamp < NOW() - INTERVAL '24 hours'
                """
                delete_result, error = await self._safe_execute(conn, delete_query, (), table_name="top_markets_snapshot", operation="execute")
                
                if delete_result and not error:
                    try:
                        result.deleted = int(delete_result.split()[-1])
                    except (ValueError, IndexError):
                        pass
                
                # Insert top 10 markets - Silver uses: source, volume_24h, volume_total, category_name, yes_price
                # Constraint: rank must be BETWEEN 1 AND 10
                insert_query = """
                    INSERT INTO predictions_gold.top_markets_snapshot (
                        snapshot_timestamp, snapshot_id, market_id, rank,
                        title, title_short, platform, volume_total_usd, volume_24h_usd,
                        volume_millions, category, tags, image_url
                    )
                    SELECT
                        NOW() as snapshot_timestamp,
                        $1::uuid as snapshot_id,
                        id as market_id,
                        ROW_NUMBER() OVER (ORDER BY COALESCE(volume_24h, 0) DESC)::int as rank,
                        title,
                        LEFT(title, 50) as title_short,
                        source as platform,
                        COALESCE(volume_total, 0) as volume_total_usd,
                        COALESCE(volume_24h, 0) as volume_24h_usd,
                        COALESCE(volume_total, 0) / 1000000.0 as volume_millions,
                        COALESCE(category_name, 'Uncategorized') as category,
                        COALESCE(tags, ARRAY[]::text[]) as tags,
                        image_url
                    FROM predictions_silver.markets
                    WHERE is_active = true
                    ORDER BY COALESCE(volume_24h, 0) DESC
                    LIMIT 10
                """
                
                insert_result, error = await self._safe_execute(conn, insert_query, (snapshot_id,), table_name="top_markets_snapshot", operation="execute")
                
                if error:
                    result.status = "partial" if result.deleted > 0 else "failed"
                    result.error_count += 1
                    result.message = error
                else:
                    try:
                        result.inserted = int(insert_result.split()[-1])
                    except (ValueError, IndexError):
                        result.inserted = 100
                    result.status = "success"
                    result.message = f"Top {result.inserted} markets snapshot created"
                
        except Exception as e:
            result.status = "failed"
            result.error_count += 1
            result.message = f"Exception: {str(e)}"
            self.logger.exception("Failed to aggregate top markets", error=str(e))
        
        result.duration_seconds = (datetime.now(timezone.utc) - start_time).total_seconds()
        self._log_aggregation_result(result)
        return result
    
    async def aggregate_high_volume_activity(self) -> AggregationResult:
        """Aggregate high volume activity feed."""
        result = AggregationResult(table_name="high_volume_activity")
        start_time = datetime.now(timezone.utc)
        
        try:
            async with self.db.asyncpg_connection() as conn:
                # Delete old activity
                delete_query = """
                    DELETE FROM predictions_gold.high_volume_activity
                    WHERE detected_at < NOW() - INTERVAL '24 hours'
                """
                delete_result, error = await self._safe_execute(conn, delete_query, (), table_name="high_volume_activity", operation="execute")
                
                if delete_result and not error:
                    try:
                        result.deleted = int(delete_result.split()[-1])
                    except (ValueError, IndexError):
                        pass
                
                # Insert high volume activity - Silver uses: source, volume_24h, yes_price, category_name
                insert_query = """
                    INSERT INTO predictions_gold.high_volume_activity (
                        activity_id, detected_at, market_id, title, title_short,
                        platform, activity_type, activity_description,
                        volume_24h, volume_change_pct, price_change_pct,
                        current_price, importance_score, category, image_url, time_to_close
                    )
                    SELECT
                        gen_random_uuid() as activity_id,
                        NOW() as detected_at,
                        id as market_id,
                        title,
                        LEFT(title, 50) as title_short,
                        source as platform,
                        'high_volume' as activity_type,
                        'Market with significant 24h trading volume' as activity_description,
                        COALESCE(volume_24h, 0) as volume_24h,
                        0.0 as volume_change_pct,
                        0.0 as price_change_pct,
                        COALESCE(yes_price, 0.5) as current_price,
                        CASE 
                            WHEN volume_24h > 100000 THEN 5
                            WHEN volume_24h > 50000 THEN 4
                            WHEN volume_24h > 25000 THEN 3
                            WHEN volume_24h > 10000 THEN 2
                            ELSE 1 
                        END as importance_score,
                        COALESCE(category_name, 'Uncategorized') as category,
                        image_url,
                        CASE WHEN end_date IS NOT NULL THEN end_date - NOW() ELSE NULL END as time_to_close
                    FROM predictions_silver.markets
                    WHERE is_active = true
                      AND COALESCE(volume_24h, 0) > 10000
                    ORDER BY COALESCE(volume_24h, 0) DESC
                    LIMIT 50
                """
                
                insert_result, error = await self._safe_execute(conn, insert_query, (), table_name="high_volume_activity", operation="execute")
                
                if error:
                    result.status = "partial" if result.deleted > 0 else "failed"
                    result.error_count += 1
                    result.message = error
                else:
                    try:
                        result.inserted = int(insert_result.split()[-1])
                    except (ValueError, IndexError):
                        result.inserted = 50
                    result.status = "success"
                    result.message = f"High volume activity: {result.inserted} events"
                
        except Exception as e:
            result.status = "failed"
            result.error_count += 1
            result.message = f"Exception: {str(e)}"
            self.logger.exception("Failed to aggregate high volume activity", error=str(e))
        
        result.duration_seconds = (datetime.now(timezone.utc) - start_time).total_seconds()
        self._log_aggregation_result(result)
        return result
    
    # ========================================================================
    # WARM AGGREGATIONS (Less frequent, 15-minute intervals)
    # ========================================================================
    
    async def run_warm_aggregations(self) -> RunSummary:
        """Run all warm aggregations concurrently."""
        summary = RunSummary(run_type="warm")
        self.logger.info("Starting WARM aggregations", run_id=str(summary.run_id))
        
        tasks = [
            self.aggregate_category_distribution(),
            self.aggregate_volume_trends(),
            self.aggregate_platform_comparison(),
            self.aggregate_trending_categories(),
        ]
        
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        table_names = ["category_distribution", "volume_trends", "platform_comparison", "trending_categories"]
        
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                error_result = AggregationResult(
                    table_name=table_names[i],
                    status="failed",
                    error_count=1,
                    message=f"Exception: {str(result)}"
                )
                summary.results.append(error_result)
                self.logger.error("Warm aggregation task failed", table=table_names[i], error=str(result))
            else:
                summary.results.append(result)
        
        summary.completed_at = datetime.now(timezone.utc)
        self._log_run_summary(summary)
        return summary
    
    async def aggregate_category_distribution(self) -> AggregationResult:
        """Aggregate market distribution by category."""
        result = AggregationResult(table_name="category_distribution")
        start_time = datetime.now(timezone.utc)
        
        try:
            async with self.db.asyncpg_connection() as conn:
                snapshot_id = uuid4()
                result.snapshot_id = snapshot_id
                
                # Delete old snapshots
                delete_query = """
                    DELETE FROM predictions_gold.category_distribution
                    WHERE snapshot_timestamp < NOW() - INTERVAL '7 days'
                """
                delete_result, error = await self._safe_execute(conn, delete_query, (), table_name="category_distribution", operation="execute")
                
                if delete_result and not error:
                    try:
                        result.deleted = int(delete_result.split()[-1])
                    except (ValueError, IndexError):
                        pass
                
                # Silver uses: source, volume_24h, category_name
                insert_query = """
                    INSERT INTO predictions_gold.category_distribution (
                        snapshot_timestamp, snapshot_id, category, display_order,
                        market_count, percentage, polymarket_count, kalshi_count, limitless_count,
                        total_volume_24h, avg_volume_per_market
                    )
                    WITH totals AS (
                        SELECT COUNT(*) as total FROM predictions_silver.markets
                    ),
                    cat_stats AS (
                        SELECT
                            COALESCE(category_name, 'Uncategorized') as category,
                            COUNT(*) as market_count,
                            COUNT(*) FILTER (WHERE source = 'polymarket') as polymarket_count,
                            COUNT(*) FILTER (WHERE source = 'kalshi') as kalshi_count,
                            COUNT(*) FILTER (WHERE source = 'limitless') as limitless_count,
                            COALESCE(SUM(volume_24h), 0) as total_volume_24h,
                            COALESCE(AVG(volume_24h), 0) as avg_volume_per_market
                        FROM predictions_silver.markets
                        GROUP BY COALESCE(category_name, 'Uncategorized')
                    )
                    SELECT
                        NOW() as snapshot_timestamp,
                        $1::uuid as snapshot_id,
                        c.category,
                        ROW_NUMBER() OVER (ORDER BY c.market_count DESC)::int as display_order,
                        c.market_count::int,
                        ROUND((c.market_count::numeric / NULLIF(t.total, 0) * 100), 2) as percentage,
                        c.polymarket_count::int,
                        c.kalshi_count::int,
                        c.limitless_count::int,
                        c.total_volume_24h,
                        c.avg_volume_per_market
                    FROM cat_stats c
                    CROSS JOIN totals t
                    ORDER BY c.market_count DESC
                """
                
                insert_result, error = await self._safe_execute(conn, insert_query, (snapshot_id,), table_name="category_distribution", operation="execute")
                
                if error:
                    result.status = "failed"
                    result.error_count = 1
                    result.message = error
                else:
                    try:
                        result.inserted = int(insert_result.split()[-1])
                    except (ValueError, IndexError):
                        result.inserted = 1
                    result.status = "success"
                    result.message = f"Category distribution: {result.inserted} categories"
                
        except Exception as e:
            result.status = "failed"
            result.error_count = 1
            result.message = f"Exception: {str(e)}"
            self.logger.exception("Failed to aggregate category distribution", error=str(e))
        
        result.duration_seconds = (datetime.now(timezone.utc) - start_time).total_seconds()
        self._log_aggregation_result(result)
        return result
    
    async def aggregate_volume_trends(self) -> AggregationResult:
        """Aggregate volume trends."""
        result = AggregationResult(table_name="volume_trends")
        start_time = datetime.now(timezone.utc)
        
        try:
            async with self.db.asyncpg_connection() as conn:
                snapshot_id = uuid4()
                result.snapshot_id = snapshot_id
                
                # Delete old trends
                delete_query = """
                    DELETE FROM predictions_gold.volume_trends
                    WHERE snapshot_timestamp < NOW() - INTERVAL '30 days'
                """
                delete_result, error = await self._safe_execute(conn, delete_query, (), table_name="volume_trends", operation="execute")
                
                if delete_result and not error:
                    try:
                        result.deleted = int(delete_result.split()[-1])
                    except (ValueError, IndexError):
                        pass
                
                # Silver uses: source, volume_24h, volume_7d, volume_30d
                insert_query = """
                    INSERT INTO predictions_gold.volume_trends (
                        snapshot_timestamp, snapshot_id, market_id, title, title_short,
                        platform, volume_24h, volume_7d, volume_weekly_avg, volume_monthly_avg,
                        trend_direction, trend_strength, volume_change_24h_pct, volume_change_7d_pct,
                        rank_by_volume, rank_by_trend
                    )
                    SELECT
                        NOW() as snapshot_timestamp,
                        $1::uuid as snapshot_id,
                        id as market_id,
                        title,
                        LEFT(title, 50) as title_short,
                        source as platform,
                        COALESCE(volume_24h, 0) as volume_24h,
                        COALESCE(volume_7d, 0) as volume_7d,
                        COALESCE(volume_7d, 0) / 7.0 as volume_weekly_avg,
                        COALESCE(volume_30d, 0) / 30.0 as volume_monthly_avg,
                        CASE 
                            WHEN volume_7d > 0 AND volume_24h > (volume_7d / 7.0) THEN 'up'
                            WHEN volume_7d > 0 AND volume_24h < (volume_7d / 7.0) THEN 'down'
                            ELSE 'stable'
                        END as trend_direction,
                        CASE WHEN volume_7d > 0 
                             THEN ABS(volume_24h - (volume_7d / 7.0)) / (volume_7d / 7.0) * 100
                             ELSE 0 
                        END as trend_strength,
                        0.0 as volume_change_24h_pct,
                        0.0 as volume_change_7d_pct,
                        ROW_NUMBER() OVER (ORDER BY COALESCE(volume_24h, 0) DESC)::int as rank_by_volume,
                        ROW_NUMBER() OVER (ORDER BY COALESCE(volume_24h, 0) DESC)::int as rank_by_trend
                    FROM predictions_silver.markets
                    WHERE is_active = true
                    ORDER BY COALESCE(volume_24h, 0) DESC
                    LIMIT 100
                """
                
                insert_result, error = await self._safe_execute(conn, insert_query, (snapshot_id,), table_name="volume_trends", operation="execute")
                
                if error:
                    result.status = "failed"
                    result.error_count = 1
                    result.message = error
                else:
                    try:
                        result.inserted = int(insert_result.split()[-1])
                    except (ValueError, IndexError):
                        result.inserted = 100
                    result.status = "success"
                    result.message = f"Volume trends: {result.inserted} markets"
                
        except Exception as e:
            result.status = "failed"
            result.error_count = 1
            result.message = f"Exception: {str(e)}"
            self.logger.exception("Failed to aggregate volume trends", error=str(e))
        
        result.duration_seconds = (datetime.now(timezone.utc) - start_time).total_seconds()
        self._log_aggregation_result(result)
        return result
    
    async def aggregate_platform_comparison(self) -> AggregationResult:
        """Aggregate platform comparison metrics."""
        result = AggregationResult(table_name="platform_comparison")
        start_time = datetime.now(timezone.utc)
        
        try:
            async with self.db.asyncpg_connection() as conn:
                snapshot_id = uuid4()
                result.snapshot_id = snapshot_id
                
                # Clear old platform comparison
                delete_query = """
                    DELETE FROM predictions_gold.platform_comparison
                    WHERE snapshot_timestamp < NOW() - INTERVAL '1 day'
                """
                delete_result, error = await self._safe_execute(conn, delete_query, (), table_name="platform_comparison", operation="execute")
                
                if delete_result and not error:
                    try:
                        result.deleted = int(delete_result.split()[-1])
                    except (ValueError, IndexError):
                        pass
                
                # Silver uses: source, volume_24h, volume_7d, volume_total, is_active
                insert_query = """
                    INSERT INTO predictions_gold.platform_comparison (
                        snapshot_timestamp, snapshot_id, platform, display_order,
                        total_markets, active_markets, resolved_markets_24h,
                        volume_24h, volume_7d, volume_millions, avg_volume_thousands,
                        growth_24h_pct, growth_7d_pct, market_share_pct,
                        trade_count_24h, unique_traders_24h, avg_trade_size
                    )
                    WITH totals AS (
                        SELECT 
                            COALESCE(SUM(volume_24h), 0) as total_volume_24h,
                            COUNT(*) as total_markets
                        FROM predictions_silver.markets
                    )
                    SELECT
                        NOW() as snapshot_timestamp,
                        $1::uuid as snapshot_id,
                        m.source as platform,
                        ROW_NUMBER() OVER (ORDER BY COUNT(*) DESC)::int as display_order,
                        COUNT(*)::int as total_markets,
                        COUNT(*) FILTER (WHERE m.is_active = true)::int as active_markets,
                        0::int as resolved_markets_24h,
                        COALESCE(SUM(m.volume_24h), 0) as volume_24h,
                        COALESCE(SUM(m.volume_7d), 0) as volume_7d,
                        COALESCE(SUM(m.volume_total), 0) / 1000000.0 as volume_millions,
                        COALESCE(AVG(m.volume_24h), 0) / 1000.0 as avg_volume_thousands,
                        0.0 as growth_24h_pct,
                        0.0 as growth_7d_pct,
                        ROUND(COALESCE(SUM(m.volume_24h), 0)::numeric / NULLIF(t.total_volume_24h, 0) * 100, 2) as market_share_pct,
                        0::int as trade_count_24h,
                        0::int as unique_traders_24h,
                        0.0 as avg_trade_size
                    FROM predictions_silver.markets m
                    CROSS JOIN totals t
                    GROUP BY m.source, t.total_volume_24h, t.total_markets
                    ORDER BY COUNT(*) DESC
                """
                
                insert_result, error = await self._safe_execute(conn, insert_query, (snapshot_id,), table_name="platform_comparison", operation="execute")
                
                if error:
                    result.status = "failed"
                    result.error_count = 1
                    result.message = error
                else:
                    try:
                        result.inserted = int(insert_result.split()[-1])
                    except (ValueError, IndexError):
                        result.inserted = 1
                    result.status = "success"
                    result.message = f"Platform comparison: {result.inserted} platforms"
                
        except Exception as e:
            result.status = "failed"
            result.error_count = 1
            result.message = f"Exception: {str(e)}"
            self.logger.exception("Failed to aggregate platform comparison", error=str(e))
        
        result.duration_seconds = (datetime.now(timezone.utc) - start_time).total_seconds()
        self._log_aggregation_result(result)
        return result
    
    async def aggregate_trending_categories(self) -> AggregationResult:
        """Aggregate trending categories."""
        result = AggregationResult(table_name="trending_categories")
        start_time = datetime.now(timezone.utc)
        
        try:
            async with self.db.asyncpg_connection() as conn:
                snapshot_id = uuid4()
                result.snapshot_id = snapshot_id
                
                # Delete old trending data
                delete_query = """
                    DELETE FROM predictions_gold.trending_categories
                    WHERE snapshot_timestamp < NOW() - INTERVAL '1 day'
                """
                delete_result, error = await self._safe_execute(conn, delete_query, (), table_name="trending_categories", operation="execute")
                
                if delete_result and not error:
                    try:
                        result.deleted = int(delete_result.split()[-1])
                    except (ValueError, IndexError):
                        pass
                
                # Silver uses: source, volume_24h, category_name
                # Constraint: rank must be BETWEEN 1 AND 8
                insert_query = """
                    INSERT INTO predictions_gold.trending_categories (
                        snapshot_timestamp, snapshot_id, category, rank,
                        market_count, volume_24h, volume_change_24h_pct,
                        trend_direction, trend_score, percentage_of_total, rank_change,
                        polymarket_count, kalshi_count, limitless_count
                    )
                    WITH totals AS (
                        SELECT 
                            COUNT(*) as total_markets,
                            COALESCE(SUM(volume_24h), 0) as total_volume
                        FROM predictions_silver.markets
                    )
                    SELECT
                        NOW() as snapshot_timestamp,
                        $1::uuid as snapshot_id,
                        COALESCE(category_name, 'Uncategorized') as category,
                        ROW_NUMBER() OVER (ORDER BY COALESCE(SUM(volume_24h), 0) DESC)::int as rank,
                        COUNT(*)::int as market_count,
                        COALESCE(SUM(volume_24h), 0) as volume_24h,
                        0.0 as volume_change_24h_pct,
                        'stable' as trend_direction,
                        CASE 
                            WHEN SUM(volume_24h) > 100000 THEN 5
                            WHEN SUM(volume_24h) > 50000 THEN 4
                            WHEN SUM(volume_24h) > 10000 THEN 3
                            WHEN SUM(volume_24h) > 1000 THEN 2
                            ELSE 1 
                        END::int as trend_score,
                        ROUND(COUNT(*)::numeric / NULLIF(t.total_markets, 0) * 100, 2) as percentage_of_total,
                        0::int as rank_change,
                        COUNT(*) FILTER (WHERE source = 'polymarket')::int as polymarket_count,
                        COUNT(*) FILTER (WHERE source = 'kalshi')::int as kalshi_count,
                        COUNT(*) FILTER (WHERE source = 'limitless')::int as limitless_count
                    FROM predictions_silver.markets
                    CROSS JOIN totals t
                    GROUP BY COALESCE(category_name, 'Uncategorized'), t.total_markets
                    ORDER BY COALESCE(SUM(volume_24h), 0) DESC
                    LIMIT 8
                """
                
                insert_result, error = await self._safe_execute(conn, insert_query, (snapshot_id,), table_name="trending_categories", operation="execute")
                
                if error:
                    result.status = "failed"
                    result.error_count = 1
                    result.message = error
                else:
                    try:
                        result.inserted = int(insert_result.split()[-1])
                    except (ValueError, IndexError):
                        result.inserted = 1
                    result.status = "success"
                    result.message = f"Trending categories: {result.inserted} categories"
                
        except Exception as e:
            result.status = "failed"
            result.error_count = 1
            result.message = f"Exception: {str(e)}"
            self.logger.exception("Failed to aggregate trending categories", error=str(e))
        
        result.duration_seconds = (datetime.now(timezone.utc) - start_time).total_seconds()
        self._log_aggregation_result(result)
        return result
    
    # ========================================================================
    # MARKET DETAIL AGGREGATIONS (Phase 2 - Market Details Page)
    # ========================================================================
    
    async def run_market_detail_aggregations(self) -> RunSummary:
        """Run market detail aggregations concurrently."""
        summary = RunSummary(run_type="market_detail")
        self.logger.info("Starting MARKET DETAIL aggregations", run_id=str(summary.run_id))
        
        tasks = [
            self.aggregate_market_detail_cache(),
            self.aggregate_market_price_history(),
            self.aggregate_market_trade_activity(),
            self.aggregate_market_orderbook_depth(),
            self.aggregate_related_markets(),
            self.aggregate_market_statistics(),
        ]
        
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        table_names = [
            "market_detail_cache", "market_price_history", "market_trade_activity",
            "market_orderbook_depth", "related_markets", "market_statistics"
        ]
        
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                error_result = AggregationResult(
                    table_name=table_names[i],
                    status="failed",
                    error_count=1,
                    message=f"Exception: {str(result)}"
                )
                summary.results.append(error_result)
                self.logger.error("Market detail aggregation failed", table=table_names[i], error=str(result))
            else:
                summary.results.append(result)
        
        summary.completed_at = datetime.now(timezone.utc)
        self._log_run_summary(summary)
        return summary
    
    async def aggregate_market_detail_cache(self) -> AggregationResult:
        """Cache full market details for fast frontend loading."""
        result = AggregationResult(table_name="market_detail_cache")
        start_time = datetime.now(timezone.utc)
        
        try:
            async with self.db.asyncpg_connection() as conn:
                # Upsert all markets with full details
                # Silver columns: created_at_source (not created_at), first_seen_at, last_updated_at
                
                query = """
                    INSERT INTO predictions_gold.market_detail_cache (
                        market_id, source, source_market_id, slug,
                        title, description, question, category, tags, image_url,
                        status, is_active, is_resolved, resolution_value,
                        outcomes, outcome_count,
                        yes_price, no_price, last_price, mid_price,
                        volume_24h, volume_7d, volume_30d, volume_total,
                        liquidity, spread,
                        created_at, end_date,
                        cached_at
                    )
                    SELECT
                        m.id as market_id,
                        m.source,
                        m.source_market_id,
                        m.slug,
                        m.title,
                        m.description,
                        m.question,
                        COALESCE(m.category_name, 'Uncategorized') as category,
                        COALESCE(m.tags, ARRAY[]::text[]) as tags,
                        m.image_url,
                        m.status,
                        m.is_active,
                        m.is_resolved,
                        m.resolution_value,
                        COALESCE(m.outcomes, '[]'::jsonb) as outcomes,
                        COALESCE(m.outcome_count, 2) as outcome_count,
                        COALESCE(m.yes_price, 0.5) as yes_price,
                        COALESCE(m.no_price, 0.5) as no_price,
                        COALESCE(m.last_trade_price, m.yes_price, 0.5) as last_price,
                        COALESCE(m.mid_price, (COALESCE(m.yes_price, 0.5) + COALESCE(m.no_price, 0.5)) / 2) as mid_price,
                        COALESCE(m.volume_24h, 0) as volume_24h,
                        COALESCE(m.volume_7d, 0) as volume_7d,
                        COALESCE(m.volume_30d, 0) as volume_30d,
                        COALESCE(m.volume_total, 0) as volume_total,
                        COALESCE(m.liquidity, 0) as liquidity,
                        COALESCE(m.spread, ABS(COALESCE(m.yes_price, 0.5) - COALESCE(m.no_price, 0.5))) as spread,
                        COALESCE(m.created_at_source, m.first_seen_at) as created_at,
                        m.end_date,
                        NOW() as cached_at
                    FROM predictions_silver.markets m
                    ON CONFLICT (market_id) DO UPDATE SET
                        slug = EXCLUDED.slug,
                        title = EXCLUDED.title,
                        description = EXCLUDED.description,
                        question = EXCLUDED.question,
                        category = EXCLUDED.category,
                        tags = EXCLUDED.tags,
                        image_url = EXCLUDED.image_url,
                        status = EXCLUDED.status,
                        is_active = EXCLUDED.is_active,
                        is_resolved = EXCLUDED.is_resolved,
                        resolution_value = EXCLUDED.resolution_value,
                        outcomes = EXCLUDED.outcomes,
                        outcome_count = EXCLUDED.outcome_count,
                        yes_price = EXCLUDED.yes_price,
                        no_price = EXCLUDED.no_price,
                        last_price = EXCLUDED.last_price,
                        mid_price = EXCLUDED.mid_price,
                        volume_24h = EXCLUDED.volume_24h,
                        volume_7d = EXCLUDED.volume_7d,
                        volume_30d = EXCLUDED.volume_30d,
                        volume_total = EXCLUDED.volume_total,
                        liquidity = EXCLUDED.liquidity,
                        spread = EXCLUDED.spread,
                        end_date = EXCLUDED.end_date,
                        cached_at = EXCLUDED.cached_at,
                        cache_version = predictions_gold.market_detail_cache.cache_version + 1
                """
                
                upsert_result, error = await self._safe_execute(conn, query, (), table_name="market_detail_cache", operation="execute")
                
                if error:
                    result.status = "failed"
                    result.error_count = 1
                    result.message = error
                else:
                    try:
                        result.upserted = int(upsert_result.split()[-1])
                    except (ValueError, IndexError):
                        # Count actual records
                        count = await conn.fetchval("SELECT COUNT(*) FROM predictions_gold.market_detail_cache")
                        result.upserted = count or 0
                    result.status = "success"
                    result.message = f"Market detail cache: {result.upserted} markets cached"
                
        except Exception as e:
            result.status = "failed"
            result.error_count = 1
            result.message = f"Exception: {str(e)}"
            self.logger.exception("Failed to aggregate market detail cache", error=str(e))
        
        result.duration_seconds = (datetime.now(timezone.utc) - start_time).total_seconds()
        self._log_aggregation_result(result)
        return result
    
    async def aggregate_market_price_history(self) -> AggregationResult:
        """Aggregate hourly price history from Silver prices table."""
        result = AggregationResult(table_name="market_price_history")
        start_time = datetime.now(timezone.utc)
        
        try:
            async with self.db.asyncpg_connection() as conn:
                # Aggregate prices into hourly OHLCV buckets
                # Silver prices columns: snapshot_at, yes_price, open_price, high_price, low_price, close_price, volume_1h
                query = """
                    INSERT INTO predictions_gold.market_price_history (
                        market_id, source, source_market_id,
                        period_start, period_end, granularity,
                        open_price, high_price, low_price, close_price,
                        volume, trade_count
                    )
                    SELECT
                        m.id as market_id,
                        p.source,
                        p.source_market_id,
                        date_trunc('hour', p.snapshot_at) as period_start,
                        date_trunc('hour', p.snapshot_at) + INTERVAL '1 hour' as period_end,
                        '1h' as granularity,
                        COALESCE((array_agg(p.yes_price ORDER BY p.snapshot_at))[1], 0.5) as open_price,
                        COALESCE(MAX(p.yes_price), 0.5) as high_price,
                        COALESCE(MIN(p.yes_price), 0.5) as low_price,
                        COALESCE((array_agg(p.yes_price ORDER BY p.snapshot_at DESC))[1], 0.5) as close_price,
                        COALESCE(SUM(p.volume_1h), 0) as volume,
                        COUNT(*)::int as trade_count
                    FROM predictions_silver.prices p
                    JOIN predictions_silver.markets m 
                        ON p.source = m.source AND p.source_market_id = m.source_market_id
                    WHERE p.snapshot_at > NOW() - INTERVAL '24 hours'
                    GROUP BY m.id, p.source, p.source_market_id, date_trunc('hour', p.snapshot_at)
                    ON CONFLICT (source_market_id, period_start, granularity) DO UPDATE SET
                        high_price = GREATEST(predictions_gold.market_price_history.high_price, EXCLUDED.high_price),
                        low_price = LEAST(predictions_gold.market_price_history.low_price, EXCLUDED.low_price),
                        close_price = EXCLUDED.close_price,
                        volume = EXCLUDED.volume,
                        trade_count = EXCLUDED.trade_count
                """
                
                insert_result, error = await self._safe_execute(conn, query, (), table_name="market_price_history", operation="execute")
                
                if error:
                    result.status = "failed"
                    result.error_count = 1
                    result.message = error
                else:
                    try:
                        result.upserted = int(insert_result.split()[-1])
                    except (ValueError, IndexError):
                        result.upserted = 0
                    result.status = "success"
                    result.message = f"Price history: {result.upserted} hourly records"
                
        except Exception as e:
            result.status = "failed"
            result.error_count = 1
            result.message = f"Exception: {str(e)}"
            self.logger.exception("Failed to aggregate market price history", error=str(e))
        
        result.duration_seconds = (datetime.now(timezone.utc) - start_time).total_seconds()
        self._log_aggregation_result(result)
        return result
    
    async def aggregate_market_trade_activity(self) -> AggregationResult:
        """Aggregate trade activity per market for different time windows."""
        result = AggregationResult(table_name="market_trade_activity")
        start_time = datetime.now(timezone.utc)
        
        try:
            async with self.db.asyncpg_connection() as conn:
                snapshot_timestamp = datetime.now(timezone.utc)
                
                # Delete old snapshots (keep last 24 hours)
                await conn.execute("""
                    DELETE FROM predictions_gold.market_trade_activity
                    WHERE snapshot_timestamp < NOW() - INTERVAL '24 hours'
                """)
                
                # Aggregate 24-hour trade activity for top markets
                # Silver trades columns: quantity, total_value, taker_address, maker_address
                query = """
                    INSERT INTO predictions_gold.market_trade_activity (
                        snapshot_timestamp, market_id, source, source_market_id,
                        window_start, window_end, window_hours,
                        total_trades, buy_trades, sell_trades,
                        total_volume, buy_volume, sell_volume,
                        avg_trade_size, max_trade_size,
                        price_at_start, price_at_end, price_change, price_change_pct,
                        unique_traders, recent_trades
                    )
                    SELECT
                        $1::timestamptz as snapshot_timestamp,
                        m.id as market_id,
                        t.source,
                        t.source_market_id,
                        NOW() - INTERVAL '24 hours' as window_start,
                        NOW() as window_end,
                        24 as window_hours,
                        COUNT(*)::int as total_trades,
                        COUNT(*) FILTER (WHERE t.side = 'buy')::int as buy_trades,
                        COUNT(*) FILTER (WHERE t.side = 'sell')::int as sell_trades,
                        COALESCE(SUM(t.total_value), 0) as total_volume,
                        COALESCE(SUM(t.total_value) FILTER (WHERE t.side = 'buy'), 0) as buy_volume,
                        COALESCE(SUM(t.total_value) FILTER (WHERE t.side = 'sell'), 0) as sell_volume,
                        COALESCE(AVG(t.total_value), 0) as avg_trade_size,
                        COALESCE(MAX(t.total_value), 0) as max_trade_size,
                        (array_agg(t.price ORDER BY t.traded_at))[1] as price_at_start,
                        (array_agg(t.price ORDER BY t.traded_at DESC))[1] as price_at_end,
                        COALESCE((array_agg(t.price ORDER BY t.traded_at DESC))[1], 0) - 
                            COALESCE((array_agg(t.price ORDER BY t.traded_at))[1], 0) as price_change,
                        CASE 
                            WHEN COALESCE((array_agg(t.price ORDER BY t.traded_at))[1], 0) > 0 
                            THEN (COALESCE((array_agg(t.price ORDER BY t.traded_at DESC))[1], 0) - 
                                  COALESCE((array_agg(t.price ORDER BY t.traded_at))[1], 0)) / 
                                 COALESCE((array_agg(t.price ORDER BY t.traded_at))[1], 1) * 100
                            ELSE 0 
                        END as price_change_pct,
                        COUNT(DISTINCT COALESCE(t.taker_address, t.maker_address))::int as unique_traders,
                        (
                            SELECT jsonb_agg(trade_info ORDER BY traded_at DESC)
                            FROM (
                                SELECT jsonb_build_object(
                                    'id', t2.id,
                                    'price', t2.price,
                                    'quantity', t2.quantity,
                                    'total_value', t2.total_value,
                                    'side', t2.side,
                                    'traded_at', t2.traded_at
                                ) as trade_info, t2.traded_at
                                FROM predictions_silver.trades t2
                                WHERE t2.source_market_id = t.source_market_id
                                ORDER BY t2.traded_at DESC
                                LIMIT 10
                            ) recent
                        ) as recent_trades
                    FROM predictions_silver.trades t
                    JOIN predictions_silver.markets m 
                        ON t.source = m.source AND t.source_market_id = m.source_market_id
                    WHERE t.traded_at > NOW() - INTERVAL '24 hours'
                    GROUP BY m.id, t.source, t.source_market_id
                    HAVING COUNT(*) >= 5
                    ORDER BY COUNT(*) DESC
                    LIMIT 500
                """
                
                insert_result, error = await self._safe_execute(
                    conn, query, (snapshot_timestamp,), 
                    table_name="market_trade_activity", operation="execute"
                )
                
                if error:
                    result.status = "failed"
                    result.error_count = 1
                    result.message = error
                else:
                    try:
                        result.inserted = int(insert_result.split()[-1])
                    except (ValueError, IndexError):
                        result.inserted = 0
                    result.status = "success"
                    result.message = f"Trade activity: {result.inserted} markets"
                
        except Exception as e:
            result.status = "failed"
            result.error_count = 1
            result.message = f"Exception: {str(e)}"
            self.logger.exception("Failed to aggregate market trade activity", error=str(e))
        
        result.duration_seconds = (datetime.now(timezone.utc) - start_time).total_seconds()
        self._log_aggregation_result(result)
        return result
    
    async def aggregate_market_orderbook_depth(self) -> AggregationResult:
        """Aggregate orderbook depth from Silver orderbooks table."""
        result = AggregationResult(table_name="market_orderbook_depth")
        start_time = datetime.now(timezone.utc)
        
        try:
            async with self.db.asyncpg_connection() as conn:
                snapshot_timestamp = datetime.now(timezone.utc)
                
                # Get latest orderbook for each market and aggregate depth
                # Silver orderbooks columns: best_bid, best_ask, spread, mid_price, total_bid_depth, total_ask_depth, bids, asks, snapshot_at
                query = """
                    INSERT INTO predictions_gold.market_orderbook_depth (
                        snapshot_timestamp, market_id, source, source_market_id,
                        best_bid, best_ask, spread, spread_pct, mid_price,
                        total_bid_depth, total_ask_depth, imbalance_ratio,
                        bid_order_count, ask_order_count,
                        bid_levels, ask_levels
                    )
                    SELECT DISTINCT ON (o.source_market_id)
                        $1::timestamptz as snapshot_timestamp,
                        m.id as market_id,
                        o.source,
                        o.source_market_id,
                        COALESCE(o.best_bid, 0) as best_bid,
                        COALESCE(o.best_ask, 0) as best_ask,
                        COALESCE(o.spread, 0) as spread,
                        CASE 
                            WHEN COALESCE(o.best_bid, 0) > 0 
                            THEN COALESCE(o.spread, 0) / o.best_bid * 100
                            ELSE 0 
                        END as spread_pct,
                        COALESCE(o.mid_price, 0.5) as mid_price,
                        COALESCE(o.total_bid_depth, 0) as total_bid_depth,
                        COALESCE(o.total_ask_depth, 0) as total_ask_depth,
                        CASE 
                            WHEN COALESCE(o.total_bid_depth, 0) + COALESCE(o.total_ask_depth, 0) > 0 
                            THEN (COALESCE(o.total_bid_depth, 0) - COALESCE(o.total_ask_depth, 0)) / 
                                 (COALESCE(o.total_bid_depth, 0) + COALESCE(o.total_ask_depth, 0))
                            ELSE 0 
                        END as imbalance_ratio,
                        COALESCE(jsonb_array_length(o.bids), 0)::int as bid_order_count,
                        COALESCE(jsonb_array_length(o.asks), 0)::int as ask_order_count,
                        COALESCE(o.bids, '[]'::jsonb) as bid_levels,
                        COALESCE(o.asks, '[]'::jsonb) as ask_levels
                    FROM predictions_silver.orderbooks o
                    JOIN predictions_silver.markets m 
                        ON o.source = m.source AND o.source_market_id = m.source_market_id
                    WHERE o.snapshot_at > NOW() - INTERVAL '1 hour'
                    ORDER BY o.source_market_id, o.snapshot_at DESC
                    ON CONFLICT (source_market_id, snapshot_timestamp) DO NOTHING
                """
                
                insert_result, error = await self._safe_execute(
                    conn, query, (snapshot_timestamp,), 
                    table_name="market_orderbook_depth", operation="execute"
                )
                
                if error:
                    result.status = "failed"
                    result.error_count = 1
                    result.message = error
                else:
                    try:
                        result.inserted = int(insert_result.split()[-1])
                    except (ValueError, IndexError):
                        result.inserted = 0
                    result.status = "success"
                    result.message = f"Orderbook depth: {result.inserted} markets"
                
        except Exception as e:
            result.status = "failed"
            result.error_count = 1
            result.message = f"Exception: {str(e)}"
            self.logger.exception("Failed to aggregate market orderbook depth", error=str(e))
        
        result.duration_seconds = (datetime.now(timezone.utc) - start_time).total_seconds()
        self._log_aggregation_result(result)
        return result
    
    async def aggregate_related_markets(self) -> AggregationResult:
        """Find and aggregate related markets based on category and keywords."""
        result = AggregationResult(table_name="related_markets")
        start_time = datetime.now(timezone.utc)
        
        try:
            async with self.db.asyncpg_connection() as conn:
                # Clear old related markets data
                await conn.execute("DELETE FROM predictions_gold.related_markets")
                
                # Find related markets by same category (top 10 per market)
                # Use subquery to filter rank <= 10 before inserting
                query = """
                    INSERT INTO predictions_gold.related_markets (
                        market_id, source, source_market_id,
                        related_market_id, related_source, related_source_market_id,
                        related_title, related_category, related_yes_price, related_volume_24h,
                        relationship_type, similarity_score, rank, computed_at
                    )
                    SELECT 
                        market_id, source, source_market_id,
                        related_market_id, related_source, related_source_market_id,
                        related_title, related_category, related_yes_price, related_volume_24h,
                        relationship_type, similarity_score, rank, computed_at
                    FROM (
                        SELECT
                            m1.id as market_id,
                            m1.source,
                            m1.source_market_id,
                            m2.id as related_market_id,
                            m2.source as related_source,
                            m2.source_market_id as related_source_market_id,
                            m2.title as related_title,
                            COALESCE(m2.category_name, 'Uncategorized') as related_category,
                            COALESCE(m2.yes_price, 0.5) as related_yes_price,
                            COALESCE(m2.volume_24h, 0) as related_volume_24h,
                            'same_category' as relationship_type,
                            0.8 as similarity_score,
                            ROW_NUMBER() OVER (
                                PARTITION BY m1.id 
                                ORDER BY COALESCE(m2.volume_24h, 0) DESC
                            )::int as rank,
                            NOW() as computed_at
                        FROM predictions_silver.markets m1
                        JOIN predictions_silver.markets m2 
                            ON m1.category_name = m2.category_name 
                            AND m1.id != m2.id
                        WHERE m1.is_active = true 
                          AND m2.is_active = true
                          AND m1.category_name IS NOT NULL
                    ) ranked
                    WHERE rank <= 10
                    ON CONFLICT (source_market_id, related_source_market_id) DO UPDATE SET
                        related_yes_price = EXCLUDED.related_yes_price,
                        related_volume_24h = EXCLUDED.related_volume_24h,
                        computed_at = EXCLUDED.computed_at
                """
                
                insert_result, error = await self._safe_execute(conn, query, (), table_name="related_markets", operation="execute")
                
                if error:
                    result.status = "failed"
                    result.error_count = 1
                    result.message = error
                else:
                    count = await conn.fetchval("SELECT COUNT(*) FROM predictions_gold.related_markets")
                    result.upserted = count or 0
                    result.status = "success"
                    result.message = f"Related markets: {result.upserted} relationships"
                
        except Exception as e:
            result.status = "failed"
            result.error_count = 1
            result.message = f"Exception: {str(e)}"
            self.logger.exception("Failed to aggregate related markets", error=str(e))
        
        result.duration_seconds = (datetime.now(timezone.utc) - start_time).total_seconds()
        self._log_aggregation_result(result)
        return result
    
    async def aggregate_market_statistics(self) -> AggregationResult:
        """Aggregate lifetime statistics for each market."""
        result = AggregationResult(table_name="market_statistics")
        start_time = datetime.now(timezone.utc)
        
        try:
            async with self.db.asyncpg_connection() as conn:
                # Upsert market statistics with trade-based metrics
                # Silver trades columns: total_value (not amount), taker_address/maker_address (not trader_address)
                # Silver markets columns: created_at_source or first_seen_at (not created_at), resolution_date (not resolved_at)
                query = """
                    INSERT INTO predictions_gold.market_statistics (
                        market_id, source, source_market_id,
                        is_resolved, resolution_value, resolved_at, final_price,
                        initial_price, peak_price, trough_price,
                        total_trades, total_volume, unique_traders,
                        avg_spread, avg_liquidity, days_active,
                        first_trade_at, last_trade_at, computed_at
                    )
                    SELECT
                        m.id as market_id,
                        m.source,
                        m.source_market_id,
                        m.is_resolved,
                        m.resolution_value,
                        m.resolution_date as resolved_at,
                        CASE WHEN m.is_resolved THEN m.yes_price ELSE NULL END as final_price,
                        COALESCE(m.yes_price, 0.5) as initial_price,
                        COALESCE(ts.peak_price, m.yes_price, 0.5) as peak_price,
                        COALESCE(ts.trough_price, m.yes_price, 0.5) as trough_price,
                        COALESCE(ts.total_trades, 0)::int as total_trades,
                        COALESCE(ts.total_volume, 0) as total_volume,
                        COALESCE(ts.unique_traders, 0)::int as unique_traders,
                        COALESCE(m.spread, ABS(COALESCE(m.yes_price, 0.5) - COALESCE(m.no_price, 0.5))) as avg_spread,
                        COALESCE(m.liquidity, 0) as avg_liquidity,
                        GREATEST(1, EXTRACT(DAY FROM NOW() - COALESCE(m.created_at_source, m.first_seen_at, NOW())))::int as days_active,
                        ts.first_trade_at,
                        ts.last_trade_at,
                        NOW() as computed_at
                    FROM predictions_silver.markets m
                    LEFT JOIN (
                        SELECT
                            source_market_id,
                            COUNT(*) as total_trades,
                            SUM(total_value) as total_volume,
                            COUNT(DISTINCT COALESCE(taker_address, maker_address)) as unique_traders,
                            MAX(price) as peak_price,
                            MIN(price) as trough_price,
                            MIN(traded_at) as first_trade_at,
                            MAX(traded_at) as last_trade_at
                        FROM predictions_silver.trades
                        GROUP BY source_market_id
                    ) ts ON m.source_market_id = ts.source_market_id
                    ON CONFLICT (market_id) DO UPDATE SET
                        is_resolved = EXCLUDED.is_resolved,
                        resolution_value = EXCLUDED.resolution_value,
                        resolved_at = EXCLUDED.resolved_at,
                        final_price = EXCLUDED.final_price,
                        peak_price = GREATEST(predictions_gold.market_statistics.peak_price, EXCLUDED.peak_price),
                        trough_price = LEAST(predictions_gold.market_statistics.trough_price, EXCLUDED.trough_price),
                        total_trades = EXCLUDED.total_trades,
                        total_volume = EXCLUDED.total_volume,
                        unique_traders = EXCLUDED.unique_traders,
                        avg_spread = EXCLUDED.avg_spread,
                        avg_liquidity = EXCLUDED.avg_liquidity,
                        days_active = EXCLUDED.days_active,
                        last_trade_at = EXCLUDED.last_trade_at,
                        computed_at = EXCLUDED.computed_at
                """
                
                upsert_result, error = await self._safe_execute(conn, query, (), table_name="market_statistics", operation="execute")
                
                if error:
                    result.status = "failed"
                    result.error_count = 1
                    result.message = error
                else:
                    try:
                        result.upserted = int(upsert_result.split()[-1])
                    except (ValueError, IndexError):
                        count = await conn.fetchval("SELECT COUNT(*) FROM predictions_gold.market_statistics")
                        result.upserted = count or 0
                    result.status = "success"
                    result.message = f"Market statistics: {result.upserted} markets"
                
        except Exception as e:
            result.status = "failed"
            result.error_count = 1
            result.message = f"Exception: {str(e)}"
            self.logger.exception("Failed to aggregate market statistics", error=str(e))
        
        result.duration_seconds = (datetime.now(timezone.utc) - start_time).total_seconds()
        self._log_aggregation_result(result)
        return result
    
    # ========================================================================
    # MARKETS/EXPLORE PAGE AGGREGATIONS (Phase 3)
    # ========================================================================
    
    async def run_markets_page_aggregations(self) -> RunSummary:
        """Run markets/explore page aggregations concurrently."""
        summary = RunSummary(run_type="markets_page")
        self.logger.info("Starting MARKETS PAGE aggregations", run_id=str(summary.run_id))
        
        tasks = [
            self.aggregate_recently_resolved_markets(),
            self.aggregate_category_breakdown_by_platform(),
            self.aggregate_market_search_cache(),
            self.aggregate_filter_aggregates(),
            self.aggregate_watchlist_popular_markets(),
        ]
        
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        table_names = [
            "recently_resolved_markets", "category_breakdown_by_platform", 
            "market_search_cache", "filter_aggregates", "watchlist_popular_markets"
        ]
        
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                error_result = AggregationResult(
                    table_name=table_names[i],
                    status="failed",
                    error_count=1,
                    message=f"Exception: {str(result)}"
                )
                summary.results.append(error_result)
                self.logger.error("Markets page aggregation failed", table=table_names[i], error=str(result))
            else:
                summary.results.append(result)
        
        summary.completed_at = datetime.now(timezone.utc)
        self._log_run_summary(summary)
        return summary
    
    async def aggregate_recently_resolved_markets(self) -> AggregationResult:
        """Aggregate recently resolved markets with outcomes."""
        result = AggregationResult(table_name="recently_resolved_markets")
        start_time = datetime.now(timezone.utc)
        
        try:
            async with self.db.asyncpg_connection() as conn:
                # Keep only last 7 days of resolved markets
                await conn.execute("""
                    DELETE FROM predictions_gold.recently_resolved_markets 
                    WHERE snapshot_at < NOW() - INTERVAL '7 days'
                """)
                
                # Silver: resolution_date (when resolved), created_at_source (creation time)
                query = """
                    INSERT INTO predictions_gold.recently_resolved_markets (
                        market_id, market_slug, question, source, category_name,
                        outcome, resolution_details, resolved_at,
                        final_yes_price, final_no_price, total_volume, trade_count,
                        market_duration_days, snapshot_at
                    )
                    SELECT
                        m.id as market_id,
                        m.slug as market_slug,
                        COALESCE(m.question, m.title, 'Untitled Market') as question,  -- Handle NULL questions
                        m.source,
                        COALESCE(m.category_name, 'Uncategorized') as category_name,
                        m.resolution_value as outcome,
                        '{}'::jsonb as resolution_details,  -- No resolution_details in Silver
                        m.resolution_date as resolved_at,
                        COALESCE(m.yes_price, 0.5) as final_yes_price,
                        COALESCE(m.no_price, 0.5) as final_no_price,
                        COALESCE(m.volume_total, 0) as total_volume,
                        COALESCE((
                            SELECT COUNT(*) 
                            FROM predictions_silver.trades t 
                            WHERE t.source_market_id = m.source_market_id
                        ), 0)::int as trade_count,
                        CASE 
                            WHEN m.created_at_source IS NOT NULL AND m.resolution_date IS NOT NULL 
                            THEN EXTRACT(EPOCH FROM (m.resolution_date - m.created_at_source)) / 86400 
                            ELSE NULL 
                        END::int as market_duration_days,
                        NOW() as snapshot_at
                    FROM predictions_silver.markets m
                    WHERE m.is_resolved = true
                      AND m.resolution_date IS NOT NULL
                      AND m.resolution_date >= NOW() - INTERVAL '30 days'
                    ORDER BY m.resolution_date DESC
                    LIMIT 100
                    ON CONFLICT (market_id, resolved_at) DO NOTHING
                """
                
                insert_result, error = await self._safe_execute(
                    conn, query, (), 
                    table_name="recently_resolved_markets", operation="execute"
                )
                
                if error:
                    result.status = "failed"
                    result.error_count = 1
                    result.message = error
                else:
                    try:
                        result.inserted = int(insert_result.split()[-1])
                    except (ValueError, IndexError):
                        result.inserted = 0
                    result.status = "success"
                    result.message = f"Recently resolved: {result.inserted} markets"
                
        except Exception as e:
            result.status = "failed"
            result.error_count = 1
            result.message = f"Exception: {str(e)}"
            self.logger.exception("Failed to aggregate recently resolved markets", error=str(e))
        
        result.duration_seconds = (datetime.now(timezone.utc) - start_time).total_seconds()
        self._log_aggregation_result(result)
        return result
    
    async def aggregate_category_breakdown_by_platform(self) -> AggregationResult:
        """2D aggregation of categories by platform."""
        result = AggregationResult(table_name="category_breakdown_by_platform")
        start_time = datetime.now(timezone.utc)
        
        try:
            async with self.db.asyncpg_connection() as conn:
                snapshot_at = datetime.now(timezone.utc)
                
                # Keep only last 24 hours
                await conn.execute("""
                    DELETE FROM predictions_gold.category_breakdown_by_platform 
                    WHERE snapshot_at < NOW() - INTERVAL '24 hours'
                """)
                
                query = """
                    WITH platform_totals AS (
                        SELECT 
                            source,
                            COUNT(*) as total_markets,
                            SUM(COALESCE(volume_24h, 0)) as total_volume
                        FROM predictions_silver.markets
                        GROUP BY source
                    ),
                    category_totals AS (
                        SELECT 
                            category_name,
                            COUNT(*) as total_markets
                        FROM predictions_silver.markets
                        WHERE category_name IS NOT NULL
                        GROUP BY category_name
                    )
                    INSERT INTO predictions_gold.category_breakdown_by_platform (
                        source, category_name,
                        market_count, active_market_count, 
                        total_volume_24h, total_volume_all_time,
                        pct_of_platform_markets, pct_of_category_markets, pct_of_platform_volume,
                        volume_trend_7d, avg_market_volume, avg_yes_price,
                        snapshot_at
                    )
                    SELECT
                        m.source,
                        COALESCE(m.category_name, 'Uncategorized') as category_name,
                        COUNT(*)::int as market_count,
                        COUNT(*) FILTER (WHERE m.is_active = true)::int as active_market_count,
                        COALESCE(SUM(m.volume_24h), 0) as total_volume_24h,
                        COALESCE(SUM(m.volume_total), 0) as total_volume_all_time,
                        CASE WHEN pt.total_markets > 0 
                            THEN (COUNT(*) * 100.0 / pt.total_markets) 
                            ELSE 0 
                        END::decimal(5,2) as pct_of_platform_markets,
                        CASE WHEN ct.total_markets > 0 
                            THEN (COUNT(*) * 100.0 / ct.total_markets) 
                            ELSE 0 
                        END::decimal(5,2) as pct_of_category_markets,
                        CASE WHEN pt.total_volume > 0 
                            THEN (COALESCE(SUM(m.volume_24h), 0) * 100.0 / pt.total_volume) 
                            ELSE 0 
                        END::decimal(5,2) as pct_of_platform_volume,
                        '[]'::jsonb as volume_trend_7d,  -- TODO: Implement 7-day trend
                        CASE WHEN COUNT(*) > 0 
                            THEN COALESCE(SUM(m.volume_24h), 0) / COUNT(*) 
                            ELSE 0 
                        END as avg_market_volume,
                        COALESCE(AVG(m.yes_price), 0.5)::decimal(10,4) as avg_yes_price,
                        $1 as snapshot_at
                    FROM predictions_silver.markets m
                    LEFT JOIN platform_totals pt ON m.source = pt.source
                    LEFT JOIN category_totals ct ON m.category_name = ct.category_name
                    GROUP BY m.source, m.category_name, pt.total_markets, pt.total_volume, ct.total_markets
                    ON CONFLICT (source, category_name, snapshot_at) DO NOTHING
                """
                
                insert_result, error = await self._safe_execute(
                    conn, query, (snapshot_at,), 
                    table_name="category_breakdown_by_platform", operation="execute"
                )
                
                if error:
                    result.status = "failed"
                    result.error_count = 1
                    result.message = error
                else:
                    try:
                        result.inserted = int(insert_result.split()[-1])
                    except (ValueError, IndexError):
                        result.inserted = 0
                    result.status = "success"
                    result.message = f"Category breakdowns: {result.inserted} rows"
                
        except Exception as e:
            result.status = "failed"
            result.error_count = 1
            result.message = f"Exception: {str(e)}"
            self.logger.exception("Failed to aggregate category breakdown", error=str(e))
        
        result.duration_seconds = (datetime.now(timezone.utc) - start_time).total_seconds()
        self._log_aggregation_result(result)
        return result
    
    async def aggregate_market_search_cache(self) -> AggregationResult:
        """Build search cache with full-text indexes."""
        result = AggregationResult(table_name="market_search_cache")
        start_time = datetime.now(timezone.utc)
        
        try:
            async with self.db.asyncpg_connection() as conn:
                query = """
                    INSERT INTO predictions_gold.market_search_cache (
                        market_id, question, description, category_name,
                        search_vector, source, status, yes_price, volume_24h,
                        popularity_score, recency_score, activity_score,
                        end_date, created_at_source, updated_at
                    )
                    SELECT
                        m.id as market_id,
                        COALESCE(m.question, m.title, 'Untitled Market') as question,  -- Handle NULL questions
                        m.description,
                        COALESCE(m.category_name, 'Uncategorized') as category_name,
                        to_tsvector('english', 
                            COALESCE(m.question, '') || ' ' || 
                            COALESCE(m.description, '') || ' ' || 
                            COALESCE(m.category_name, '')
                        ) as search_vector,
                        m.source,
                        CASE 
                            WHEN m.is_resolved THEN 'resolved'
                            WHEN m.is_active THEN 'active'
                            ELSE 'closed'
                        END as status,
                        COALESCE(m.yes_price, 0.5)::decimal(10,4) as yes_price,
                        COALESCE(m.volume_24h, 0) as volume_24h,
                        -- Popularity: volume-based
                        (COALESCE(m.volume_24h, 0) / NULLIF((SELECT MAX(volume_24h) FROM predictions_silver.markets), 0))::decimal(10,4) as popularity_score,
                        -- Recency: days since creation
                        CASE 
                            WHEN m.created_at_source IS NOT NULL 
                            THEN GREATEST(0, 1 - (EXTRACT(EPOCH FROM (NOW() - m.created_at_source)) / 86400 / 30))::decimal(10,4)
                            ELSE 0.5
                        END as recency_score,
                        -- Activity: trades in last 24h
                        0.5::decimal(10,4) as activity_score,  -- TODO: Calculate from trades
                        m.end_date,
                        m.created_at_source,
                        NOW() as updated_at
                    FROM predictions_silver.markets m
                    WHERE m.is_active = true
                    ON CONFLICT (market_id) DO UPDATE SET
                        question = EXCLUDED.question,
                        description = EXCLUDED.description,
                        category_name = EXCLUDED.category_name,
                        search_vector = EXCLUDED.search_vector,
                        status = EXCLUDED.status,
                        yes_price = EXCLUDED.yes_price,
                        volume_24h = EXCLUDED.volume_24h,
                        popularity_score = EXCLUDED.popularity_score,
                        recency_score = EXCLUDED.recency_score,
                        activity_score = EXCLUDED.activity_score,
                        end_date = EXCLUDED.end_date,
                        updated_at = EXCLUDED.updated_at
                """
                
                insert_result, error = await self._safe_execute(
                    conn, query, (), 
                    table_name="market_search_cache", operation="execute"
                )
                
                if error:
                    result.status = "failed"
                    result.error_count = 1
                    result.message = error
                else:
                    try:
                        # ON CONFLICT DO UPDATE returns "INSERT 0 X" where X is upsert count
                        result.upserted = int(insert_result.split()[-1])
                    except (ValueError, IndexError):
                        count = await conn.fetchval("SELECT COUNT(*) FROM predictions_gold.market_search_cache")
                        result.upserted = count or 0
                    result.status = "success"
                    result.message = f"Search cache: {result.upserted} markets"
                
        except Exception as e:
            result.status = "failed"
            result.error_count = 1
            result.message = f"Exception: {str(e)}"
            self.logger.exception("Failed to aggregate market search cache", error=str(e))
        
        result.duration_seconds = (datetime.now(timezone.utc) - start_time).total_seconds()
        self._log_aggregation_result(result)
        return result
    
    async def aggregate_filter_aggregates(self) -> AggregationResult:
        """Pre-compute filter counts for sidebar UI."""
        result = AggregationResult(table_name="filter_aggregates")
        start_time = datetime.now(timezone.utc)
        
        try:
            async with self.db.asyncpg_connection() as conn:
                snapshot_at = datetime.now(timezone.utc)
                
                # Keep only last 1 hour
                await conn.execute("""
                    DELETE FROM predictions_gold.filter_aggregates 
                    WHERE snapshot_at < NOW() - INTERVAL '1 hour'
                """)
                
                # Aggregate by source
                query_source = """
                    INSERT INTO predictions_gold.filter_aggregates (
                        filter_type, filter_value, total_count, active_count,
                        display_name, icon, sort_order, snapshot_at
                    )
                    SELECT
                        'source' as filter_type,
                        source as filter_value,
                        COUNT(*)::int as total_count,
                        COUNT(*) FILTER (WHERE is_active = true)::int as active_count,
                        INITCAP(source) as display_name,
                        CASE source
                            WHEN 'polymarket' THEN '🎲'
                            WHEN 'kalshi' THEN '📊'
                            WHEN 'limitless' THEN '∞'
                            ELSE '📈'
                        END as icon,
                        CASE source
                            WHEN 'polymarket' THEN 1
                            WHEN 'kalshi' THEN 2
                            WHEN 'limitless' THEN 3
                            ELSE 99
                        END as sort_order,
                        $1 as snapshot_at
                    FROM predictions_silver.markets
                    GROUP BY source
                    ON CONFLICT (filter_type, filter_value, snapshot_at) DO NOTHING
                """
                
                result1, error = await self._safe_execute(
                    conn, query_source, (snapshot_at,), 
                    table_name="filter_aggregates", operation="execute"
                )
                
                # Aggregate by category
                query_category = """
                    INSERT INTO predictions_gold.filter_aggregates (
                        filter_type, filter_value, total_count, active_count,
                        display_name, icon, sort_order, snapshot_at
                    )
                    SELECT
                        'category' as filter_type,
                        COALESCE(category_name, 'Uncategorized') as filter_value,
                        COUNT(*)::int as total_count,
                        COUNT(*) FILTER (WHERE is_active = true)::int as active_count,
                        COALESCE(category_name, 'Uncategorized') as display_name,
                        '📁' as icon,
                        ROW_NUMBER() OVER (ORDER BY COUNT(*) DESC)::int as sort_order,
                        $1 as snapshot_at
                    FROM predictions_silver.markets
                    GROUP BY category_name
                    ON CONFLICT (filter_type, filter_value, snapshot_at) DO NOTHING
                """
                
                result2, error2 = await self._safe_execute(
                    conn, query_category, (snapshot_at,), 
                    table_name="filter_aggregates", operation="execute"
                )
                
                # Aggregate by status
                query_status = """
                    INSERT INTO predictions_gold.filter_aggregates (
                        filter_type, filter_value, total_count, active_count,
                        display_name, icon, sort_order, snapshot_at
                    )
                    SELECT
                        'status' as filter_type,
                        CASE 
                            WHEN is_resolved THEN 'resolved'
                            WHEN is_active THEN 'active'
                            ELSE 'closed'
                        END as filter_value,
                        COUNT(*)::int as total_count,
                        COUNT(*)::int as active_count,
                        CASE 
                            WHEN is_resolved THEN 'Resolved'
                            WHEN is_active THEN 'Active'
                            ELSE 'Closed'
                        END as display_name,
                        CASE 
                            WHEN is_resolved THEN '✓'
                            WHEN is_active THEN '🔴'
                            ELSE '⏸️'
                        END as icon,
                        CASE 
                            WHEN is_active THEN 1
                            WHEN is_resolved THEN 2
                            ELSE 3
                        END as sort_order,
                        $1 as snapshot_at
                    FROM predictions_silver.markets
                    GROUP BY is_resolved, is_active
                    ON CONFLICT (filter_type, filter_value, snapshot_at) DO NOTHING
                """
                
                result3, error3 = await self._safe_execute(
                    conn, query_status, (snapshot_at,), 
                    table_name="filter_aggregates", operation="execute"
                )
                
                if error or error2 or error3:
                    result.status = "partial"
                    result.error_count = sum(1 for e in [error, error2, error3] if e)
                    result.message = f"Some filter aggregations failed"
                else:
                    try:
                        count1 = int(result1.split()[-1]) if result1 else 0
                        count2 = int(result2.split()[-1]) if result2 else 0
                        count3 = int(result3.split()[-1]) if result3 else 0
                        result.inserted = count1 + count2 + count3
                    except (ValueError, IndexError):
                        result.inserted = 0
                    result.status = "success"
                    result.message = f"Filter aggregates: {result.inserted} rows"
                
        except Exception as e:
            result.status = "failed"
            result.error_count = 1
            result.message = f"Exception: {str(e)}"
            self.logger.exception("Failed to aggregate filter aggregates", error=str(e))
        
        result.duration_seconds = (datetime.now(timezone.utc) - start_time).total_seconds()
        self._log_aggregation_result(result)
        return result
    
    async def aggregate_watchlist_popular_markets(self) -> AggregationResult:
        """Aggregate most popular/watched markets."""
        result = AggregationResult(table_name="watchlist_popular_markets")
        start_time = datetime.now(timezone.utc)
        
        try:
            async with self.db.asyncpg_connection() as conn:
                snapshot_at = datetime.now(timezone.utc)
                
                # Keep only last 24 hours
                await conn.execute("""
                    DELETE FROM predictions_gold.watchlist_popular_markets 
                    WHERE snapshot_at < NOW() - INTERVAL '24 hours'
                """)
                
                query = """
                    WITH trade_counts AS (
                        SELECT 
                            source_market_id,
                            COUNT(*) as trade_count,
                            COUNT(DISTINCT taker_address) as unique_traders
                        FROM predictions_silver.trades
                        WHERE traded_at >= NOW() - INTERVAL '24 hours'
                        GROUP BY source_market_id
                    ),
                    maxes AS (
                        SELECT 
                            MAX(volume_24h) as max_volume,
                            (SELECT MAX(trade_count) FROM trade_counts) as max_trades
                        FROM predictions_silver.markets
                    )
                    INSERT INTO predictions_gold.watchlist_popular_markets (
                        market_id, question, source, category_name,
                        trade_count_24h, unique_traders_24h,
                        yes_price, volume_24h, price_change_24h,
                        popularity_rank, popularity_score,
                        end_date, snapshot_at
                    )
                    SELECT
                        m.id as market_id,
                        COALESCE(m.question, m.title, 'Untitled Market') as question,
                        m.source,
                        COALESCE(m.category_name, 'Uncategorized') as category_name,
                        COALESCE(tc.trade_count, 0)::int as trade_count_24h,
                        COALESCE(tc.unique_traders, 0)::int as unique_traders_24h,
                        COALESCE(m.yes_price, 0.5)::decimal(10,4) as yes_price,
                        COALESCE(m.volume_24h, 0) as volume_24h,
                        0.0::decimal(10,4) as price_change_24h,  -- TODO: Calculate from price history
                        ROW_NUMBER() OVER (
                            ORDER BY 
                                COALESCE(m.volume_24h, 0) DESC,
                                COALESCE(tc.trade_count, 0) DESC
                        )::int as popularity_rank,
                        (
                            COALESCE(m.volume_24h, 0) / NULLIF(mx.max_volume, 0) * 0.7 +
                            COALESCE(tc.trade_count, 0) / NULLIF(mx.max_trades, 0) * 0.3
                        )::decimal(10,4) as popularity_score,
                        m.end_date,
                        $1 as snapshot_at
                    FROM predictions_silver.markets m
                    CROSS JOIN maxes mx
                    LEFT JOIN trade_counts tc ON m.source_market_id = tc.source_market_id
                    WHERE m.is_active = true
                    ORDER BY popularity_rank
                    LIMIT 50
                    ON CONFLICT (market_id, snapshot_at) DO NOTHING
                """
                
                insert_result, error = await self._safe_execute(
                    conn, query, (snapshot_at,), 
                    table_name="watchlist_popular_markets", operation="execute"
                )
                
                if error:
                    result.status = "failed"
                    result.error_count = 1
                    result.message = error
                else:
                    try:
                        result.inserted = int(insert_result.split()[-1])
                    except (ValueError, IndexError):
                        result.inserted = 0
                    result.status = "success"
                    result.message = f"Popular markets: {result.inserted} markets"
                
        except Exception as e:
            result.status = "failed"
            result.error_count = 1
            result.message = f"Exception: {str(e)}"
            self.logger.exception("Failed to aggregate watchlist popular markets", error=str(e))
        
        result.duration_seconds = (datetime.now(timezone.utc) - start_time).total_seconds()
        self._log_aggregation_result(result)
        return result
    
    # ========================================================================
    # ANALYTICS PAGE AGGREGATIONS (Phase 4)
    # ========================================================================
    
    async def run_analytics_page_aggregations(self) -> RunSummary:
        """Run analytics page aggregations concurrently."""
        summary = RunSummary(run_type="analytics_page")
        self.logger.info("Starting ANALYTICS PAGE aggregations", run_id=str(summary.run_id))
        
        tasks = [
            self.aggregate_volume_distribution_histogram(),
            self.aggregate_market_lifecycle_funnel(),
            self.aggregate_top_traders_leaderboard(),
            self.aggregate_category_performance_metrics(),
        ]
        
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        table_names = [
            "volume_distribution_histogram", "market_lifecycle_funnel",
            "top_traders_leaderboard", "category_performance_metrics"
        ]
        
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                error_result = AggregationResult(
                    table_name=table_names[i],
                    status="failed",
                    error_count=1,
                    message=f"Exception: {str(result)}"
                )
                summary.results.append(error_result)
                self.logger.error("Analytics page aggregation failed", table=table_names[i], error=str(result))
            else:
                summary.results.append(result)
        
        summary.completed_at = datetime.now(timezone.utc)
        self._log_run_summary(summary)
        return summary
    
    async def aggregate_volume_distribution_histogram(self) -> AggregationResult:
        """Create histogram of markets by volume ranges."""
        result = AggregationResult(table_name="volume_distribution_histogram")
        start_time = datetime.now(timezone.utc)
        
        try:
            async with self.db.asyncpg_connection() as conn:
                snapshot_at = datetime.now(timezone.utc)
                
                # Keep only last 24 hours
                await conn.execute("""
                    DELETE FROM predictions_gold.volume_distribution_histogram 
                    WHERE snapshot_at < NOW() - INTERVAL '24 hours'
                """)
                
                # Define volume bins
                query = """
                    WITH volume_bins AS (
                        SELECT 
                            unnest(ARRAY[0, 1, 2, 3, 4, 5, 6, 7, 8, 9]) as bin_index,
                            unnest(ARRAY[0, 100, 1000, 5000, 10000, 50000, 100000, 500000, 1000000, 5000000]) as min_vol,
                            unnest(ARRAY[100, 1000, 5000, 10000, 50000, 100000, 500000, 1000000, 5000000, 999999999]) as max_vol,
                            unnest(ARRAY['$0-$100', '$100-$1K', '$1K-$5K', '$5K-$10K', '$10K-$50K', 
                                         '$50K-$100K', '$100K-$500K', '$500K-$1M', '$1M-$5M', '$5M+']) as label
                    ),
                    market_counts AS (
                        SELECT
                            CASE 
                                WHEN volume_24h < 100 THEN 0
                                WHEN volume_24h < 1000 THEN 1
                                WHEN volume_24h < 5000 THEN 2
                                WHEN volume_24h < 10000 THEN 3
                                WHEN volume_24h < 50000 THEN 4
                                WHEN volume_24h < 100000 THEN 5
                                WHEN volume_24h < 500000 THEN 6
                                WHEN volume_24h < 1000000 THEN 7
                                WHEN volume_24h < 5000000 THEN 8
                                ELSE 9
                            END as bin_index,
                            source,
                            volume_24h,
                            yes_price
                        FROM predictions_silver.markets
                        WHERE is_active = true
                    )
                    INSERT INTO predictions_gold.volume_distribution_histogram (
                        bin_index, volume_range_min, volume_range_max, bin_label,
                        market_count, polymarket_count, kalshi_count, limitless_count,
                        total_volume, avg_yes_price, percentile, snapshot_at
                    )
                    SELECT
                        vb.bin_index,
                        vb.min_vol,
                        vb.max_vol,
                        vb.label,
                        COUNT(mc.bin_index)::int as market_count,
                        COUNT(*) FILTER (WHERE mc.source = 'polymarket')::int as polymarket_count,
                        COUNT(*) FILTER (WHERE mc.source = 'kalshi')::int as kalshi_count,
                        COUNT(*) FILTER (WHERE mc.source = 'limitless')::int as limitless_count,
                        COALESCE(SUM(mc.volume_24h), 0) as total_volume,
                        COALESCE(AVG(mc.yes_price), 0.5)::decimal(10,4) as avg_yes_price,
                        0.0::decimal(5,2) as percentile,  -- TODO: Calculate percentile
                        $1 as snapshot_at
                    FROM volume_bins vb
                    LEFT JOIN market_counts mc ON vb.bin_index = mc.bin_index
                    GROUP BY vb.bin_index, vb.min_vol, vb.max_vol, vb.label
                    ORDER BY vb.bin_index
                    ON CONFLICT (bin_index, snapshot_at) DO NOTHING
                """
                
                insert_result, error = await self._safe_execute(
                    conn, query, (snapshot_at,), 
                    table_name="volume_distribution_histogram", operation="execute"
                )
                
                if error:
                    result.status = "failed"
                    result.error_count = 1
                    result.message = error
                else:
                    try:
                        result.inserted = int(insert_result.split()[-1])
                    except (ValueError, IndexError):
                        result.inserted = 0
                    result.status = "success"
                    result.message = f"Volume histogram: {result.inserted} bins"
                
        except Exception as e:
            result.status = "failed"
            result.error_count = 1
            result.message = f"Exception: {str(e)}"
            self.logger.exception("Failed to aggregate volume histogram", error=str(e))
        
        result.duration_seconds = (datetime.now(timezone.utc) - start_time).total_seconds()
        self._log_aggregation_result(result)
        return result
    
    async def aggregate_market_lifecycle_funnel(self) -> AggregationResult:
        """Analyze markets through lifecycle stages."""
        result = AggregationResult(table_name="market_lifecycle_funnel")
        start_time = datetime.now(timezone.utc)
        
        try:
            async with self.db.asyncpg_connection() as conn:
                snapshot_at = datetime.now(timezone.utc)
                
                # Keep only last 24 hours
                await conn.execute("""
                    DELETE FROM predictions_gold.market_lifecycle_funnel 
                    WHERE snapshot_at < NOW() - INTERVAL '24 hours'
                """)
                
                query = """
                    WITH lifecycle_stages AS (
                        SELECT 
                            unnest(ARRAY['created', 'active', 'volume_1k', 'volume_10k', 'volume_100k', 'resolved']) as stage,
                            unnest(ARRAY[1, 2, 3, 4, 5, 6]) as stage_order
                    ),
                    market_stages AS (
                        SELECT
                            CASE 
                                WHEN is_resolved THEN 'resolved'
                                WHEN volume_24h >= 100000 THEN 'volume_100k'
                                WHEN volume_24h >= 10000 THEN 'volume_10k'
                                WHEN volume_24h >= 1000 THEN 'volume_1k'
                                WHEN is_active THEN 'active'
                                ELSE 'created'
                            END as stage,
                            source
                        FROM predictions_silver.markets
                    )
                    INSERT INTO predictions_gold.market_lifecycle_funnel (
                        stage, stage_order, market_count,
                        polymarket_count, kalshi_count, limitless_count,
                        avg_time_in_stage_hours, conversion_rate_to_next,
                        snapshot_at
                    )
                    SELECT
                        ls.stage,
                        ls.stage_order,
                        COUNT(ms.stage)::int as market_count,
                        COUNT(*) FILTER (WHERE ms.source = 'polymarket')::int as polymarket_count,
                        COUNT(*) FILTER (WHERE ms.source = 'kalshi')::int as kalshi_count,
                        COUNT(*) FILTER (WHERE ms.source = 'limitless')::int as limitless_count,
                        0.0::decimal(10,2) as avg_time_in_stage_hours,  -- TODO: Calculate from timestamps
                        0.0::decimal(5,2) as conversion_rate_to_next,   -- TODO: Calculate conversion
                        $1 as snapshot_at
                    FROM lifecycle_stages ls
                    LEFT JOIN market_stages ms ON ls.stage = ms.stage
                    GROUP BY ls.stage, ls.stage_order
                    ORDER BY ls.stage_order
                    ON CONFLICT (stage, snapshot_at) DO NOTHING
                """
                
                insert_result, error = await self._safe_execute(
                    conn, query, (snapshot_at,), 
                    table_name="market_lifecycle_funnel", operation="execute"
                )
                
                if error:
                    result.status = "failed"
                    result.error_count = 1
                    result.message = error
                else:
                    try:
                        result.inserted = int(insert_result.split()[-1])
                    except (ValueError, IndexError):
                        result.inserted = 0
                    result.status = "success"
                    result.message = f"Lifecycle funnel: {result.inserted} stages"
                
        except Exception as e:
            result.status = "failed"
            result.error_count = 1
            result.message = f"Exception: {str(e)}"
            self.logger.exception("Failed to aggregate lifecycle funnel", error=str(e))
        
        result.duration_seconds = (datetime.now(timezone.utc) - start_time).total_seconds()
        self._log_aggregation_result(result)
        return result
    
    async def aggregate_top_traders_leaderboard(self) -> AggregationResult:
        """Create leaderboard of top traders."""
        result = AggregationResult(table_name="top_traders_leaderboard")
        start_time = datetime.now(timezone.utc)
        
        try:
            async with self.db.asyncpg_connection() as conn:
                snapshot_at = datetime.now(timezone.utc)
                
                # Keep only last 24 hours
                await conn.execute("""
                    DELETE FROM predictions_gold.top_traders_leaderboard 
                    WHERE snapshot_at < NOW() - INTERVAL '24 hours'
                """)
                
                query = """
                    WITH trader_stats AS (
                        SELECT
                            taker_address as trader_address,
                            COUNT(*) as total_trades,
                            SUM(total_value) as total_volume,
                            COUNT(*) FILTER (WHERE traded_at >= NOW() - INTERVAL '24 hours') as trades_24h,
                            SUM(total_value) FILTER (WHERE traded_at >= NOW() - INTERVAL '24 hours') as volume_24h,
                            AVG(total_value) as avg_trade_size,
                            COUNT(DISTINCT source_market_id) as markets_traded_count,
                            MODE() WITHIN GROUP (ORDER BY t.source) as favorite_source
                        FROM predictions_silver.trades t
                        WHERE taker_address IS NOT NULL  -- Filter out NULL addresses
                        GROUP BY taker_address
                        HAVING COUNT(*) >= 10  -- Minimum 10 trades to be on leaderboard
                    )
                    INSERT INTO predictions_gold.top_traders_leaderboard (
                        trader_address, trader_rank,
                        total_trades, total_volume,
                        trades_24h, volume_24h,
                        avg_trade_size, favorite_source,
                        markets_traded_count, snapshot_at
                    )
                    SELECT
                        trader_address,
                        ROW_NUMBER() OVER (ORDER BY total_volume DESC)::int as trader_rank,
                        total_trades::int,
                        total_volume,
                        trades_24h::int,
                        COALESCE(volume_24h, 0),
                        avg_trade_size,
                        favorite_source,
                        markets_traded_count::int,
                        $1 as snapshot_at
                    FROM trader_stats
                    ORDER BY trader_rank
                    LIMIT 100
                    ON CONFLICT (trader_address, snapshot_at) DO NOTHING
                """
                
                insert_result, error = await self._safe_execute(
                    conn, query, (snapshot_at,), 
                    table_name="top_traders_leaderboard", operation="execute"
                )
                
                if error:
                    result.status = "failed"
                    result.error_count = 1
                    result.message = error
                else:
                    try:
                        result.inserted = int(insert_result.split()[-1])
                    except (ValueError, IndexError):
                        result.inserted = 0
                    result.status = "success"
                    result.message = f"Top traders: {result.inserted} traders"
                
        except Exception as e:
            result.status = "failed"
            result.error_count = 1
            result.message = f"Exception: {str(e)}"
            self.logger.exception("Failed to aggregate top traders", error=str(e))
        
        result.duration_seconds = (datetime.now(timezone.utc) - start_time).total_seconds()
        self._log_aggregation_result(result)
        return result
    
    async def aggregate_category_performance_metrics(self) -> AggregationResult:
        """Aggregate performance metrics per category."""
        result = AggregationResult(table_name="category_performance_metrics")
        start_time = datetime.now(timezone.utc)
        
        try:
            async with self.db.asyncpg_connection() as conn:
                snapshot_at = datetime.now(timezone.utc)
                
                # Keep only last 24 hours
                await conn.execute("""
                    DELETE FROM predictions_gold.category_performance_metrics 
                    WHERE snapshot_at < NOW() - INTERVAL '24 hours'
                """)
                
                query = """
                    WITH category_stats AS (
                        SELECT
                            COALESCE(m.category_name, 'Uncategorized') as category_name,
                            COUNT(*) as total_markets,
                            COUNT(*) FILTER (WHERE m.is_active = true) as active_markets,
                            COUNT(*) FILTER (WHERE m.is_resolved = true) as resolved_markets,
                            COALESCE(SUM(m.volume_24h), 0) as total_volume_24h,
                            COALESCE(SUM(m.volume_7d), 0) as total_volume_7d,
                            COALESCE(SUM(m.volume_total), 0) as total_volume_all_time,
                            AVG(m.yes_price) as avg_yes_price
                        FROM predictions_silver.markets m
                        GROUP BY m.category_name
                    ),
                    trade_counts AS (
                        SELECT
                            COALESCE(m.category_name, 'Uncategorized') as category_name,
                            COUNT(*) as total_trades
                        FROM predictions_silver.trades t
                        JOIN predictions_silver.markets m ON t.source_market_id = m.source_market_id
                        WHERE t.traded_at >= NOW() - INTERVAL '24 hours'
                        GROUP BY m.category_name
                    )
                    INSERT INTO predictions_gold.category_performance_metrics (
                        category_name,
                        total_markets, active_markets, resolved_markets,
                        total_volume_24h, total_volume_7d, total_volume_all_time,
                        avg_market_volume, total_trades_24h, avg_trades_per_market,
                        avg_yes_price, resolution_rate,
                        popularity_rank, snapshot_at
                    )
                    SELECT
                        cs.category_name,
                        cs.total_markets::int,
                        cs.active_markets::int,
                        cs.resolved_markets::int,
                        cs.total_volume_24h,
                        cs.total_volume_7d,
                        cs.total_volume_all_time,
                        CASE WHEN cs.active_markets > 0 
                            THEN cs.total_volume_24h / cs.active_markets 
                            ELSE 0 
                        END as avg_market_volume,
                        COALESCE(tc.total_trades, 0)::int as total_trades_24h,
                        CASE WHEN cs.active_markets > 0 
                            THEN COALESCE(tc.total_trades, 0)::decimal / cs.active_markets 
                            ELSE 0 
                        END::decimal(10,2) as avg_trades_per_market,
                        COALESCE(cs.avg_yes_price, 0.5)::decimal(10,4) as avg_yes_price,
                        CASE WHEN cs.total_markets > 0 
                            THEN (cs.resolved_markets * 100.0 / cs.total_markets)::decimal(5,2)
                            ELSE 0 
                        END as resolution_rate,
                        ROW_NUMBER() OVER (ORDER BY cs.total_volume_24h DESC)::int as popularity_rank,
                        $1 as snapshot_at
                    FROM category_stats cs
                    LEFT JOIN trade_counts tc ON cs.category_name = tc.category_name
                    ON CONFLICT (category_name, snapshot_at) DO NOTHING
                """
                
                insert_result, error = await self._safe_execute(
                    conn, query, (snapshot_at,), 
                    table_name="category_performance_metrics", operation="execute"
                )
                
                if error:
                    result.status = "failed"
                    result.error_count = 1
                    result.message = error
                else:
                    try:
                        result.inserted = int(insert_result.split()[-1])
                    except (ValueError, IndexError):
                        result.inserted = 0
                    result.status = "success"
                    result.message = f"Category performance: {result.inserted} categories"
                
        except Exception as e:
            result.status = "failed"
            result.error_count = 1
            result.message = f"Exception: {str(e)}"
            self.logger.exception("Failed to aggregate category performance", error=str(e))
        
        result.duration_seconds = (datetime.now(timezone.utc) - start_time).total_seconds()
        self._log_aggregation_result(result)
        return result
    
    # ========================================================================
    # PHASE 5: EVENTS PAGE (Event groupings and statistics)
    # ========================================================================
    
    async def run_events_aggregations(self) -> RunSummary:
        """
        Run all events-related aggregations (Phase 5).
        Groups markets by events and calculates event-level metrics.
        """
        summary = RunSummary(run_type="events")
        self.logger.info("Starting EVENTS PAGE aggregations (Phase 5)", run_id=str(summary.run_id))
        
        try:
            # Run events aggregations
            results = await asyncio.gather(
                self.aggregate_events_snapshot(),
                self.aggregate_event_markets(),
                self.aggregate_events_aggregate_metrics(),
                return_exceptions=True
            )
            
            for r in results:
                if isinstance(r, Exception):
                    error_result = AggregationResult(
                        table_name="unknown",
                        status="failed",
                        error_count=1,
                        message=str(r)
                    )
                    summary.results.append(error_result)
                    self.logger.error("Events aggregation task failed", error=str(r))
                else:
                    summary.results.append(r)
        
        except Exception as e:
            self.logger.exception("Critical failure in events aggregations", error=str(e))
        
        summary.completed_at = datetime.now(timezone.utc)
        self._log_run_summary(summary)
        return summary
    
    async def aggregate_events_snapshot(self) -> AggregationResult:
        """
        Aggregate events_snapshot table: Event groupings with metadata.
        Groups markets by event_slug (Polymarket/Kalshi) or by title patterns (Limitless/OpinionTrade).
        """
        result = AggregationResult(table_name="events_snapshot")
        start_time = datetime.now(timezone.utc)
        snapshot_at = datetime.now(timezone.utc).replace(tzinfo=None)  # Remove timezone for TIMESTAMP column
        
        try:
            async with self.db.asyncpg_connection() as conn:
                # Build events from Silver markets
                query = """
                    WITH event_groups AS (
                        -- Polymarket events (grouped by event_slug)
                        -- Use title from events table (API title), fallback to slug-derived title
                        SELECT
                            m.extra_data->>'event_slug' AS event_id,
                            'polymarket' AS platform,
                            COALESCE(MAX(e.title), INITCAP(REPLACE(m.extra_data->>'event_slug', '-', ' '))) AS title,
                            (ARRAY_AGG(m.category_name ORDER BY m.volume_total DESC NULLS LAST))[1] AS category,
                            MAX(m.image_url) AS image_url,
                            CONCAT('https://polymarket.com/event/', m.extra_data->>'event_slug') AS source_url,
                            COUNT(*) AS market_count,
                            SUM(COALESCE(m.volume_total, 0)) AS volume_24h,
                            SUM(COALESCE(m.volume_total, 0)) AS total_volume,
                            SUM(m.liquidity) AS total_liquidity,
                            MAX(CASE WHEN m.is_resolved THEN NULL ELSE m.end_date END) AS end_time,
                            MIN(m.created_at_source) AS start_time,
                            CASE 
                                WHEN COUNT(*) FILTER (WHERE m.is_resolved) = COUNT(*) THEN 'resolved'
                                WHEN COUNT(*) FILTER (WHERE m.is_active) = 0 THEN 'closed'
                                ELSE 'open'
                            END AS status
                        FROM predictions_silver.markets m
                        LEFT JOIN predictions_silver.events e 
                            ON e.source = 'polymarket' 
                            AND e.slug = m.extra_data->>'event_slug'
                        WHERE m.source = 'polymarket'
                          AND m.extra_data ? 'event_slug'
                          AND m.extra_data->>'event_slug' IS NOT NULL
                          AND m.extra_data->>'event_slug' != ''
                        GROUP BY m.extra_data->>'event_slug'
                        
                        UNION ALL
                        
                        -- Kalshi events (grouped by event_ticker)
                        SELECT
                            extra_data->>'event_ticker' AS event_id,
                            'kalshi' AS platform,
                            COALESCE(MAX(extra_data->>'eventTitle'),
                                    MAX(extra_data->>'event_ticker')) AS title,
                            (ARRAY_AGG(category_name ORDER BY volume_total DESC NULLS LAST))[1] AS category,
                            MAX(image_url) AS image_url,
                            (ARRAY_AGG(source_url ORDER BY volume_total DESC NULLS LAST))[1] AS source_url,
                            COUNT(*) AS market_count,
                            SUM(COALESCE(volume_total, 0)) AS volume_24h,
                            SUM(COALESCE(volume_total, 0)) AS total_volume,
                            SUM(liquidity) AS total_liquidity,
                            MAX(CASE WHEN is_resolved THEN NULL ELSE end_date END) AS end_time,
                            MIN(created_at_source) AS start_time,
                            CASE 
                                WHEN COUNT(*) FILTER (WHERE is_resolved) = COUNT(*) THEN 'resolved'
                                WHEN COUNT(*) FILTER (WHERE is_active) = 0 THEN 'closed'
                                ELSE 'open'
                            END AS status
                        FROM predictions_silver.markets
                        WHERE source = 'kalshi'
                          AND extra_data ? 'event_ticker'
                          AND extra_data->>'event_ticker' IS NOT NULL
                          AND extra_data->>'event_ticker' != ''
                        GROUP BY extra_data->>'event_ticker'
                        
                        UNION ALL
                        
                        -- Limitless events (grouped by crypto symbol + date from title)
                        -- Extract patterns like "$BTC above X on Jan 28" → "BTC-Jan-28"
                        -- NOTE: volume_total is already in USD (converted in limitless.py client)
                        SELECT
                            CONCAT(
                                crypto_symbol,
                                '-',
                                date_str
                            ) AS event_id,
                            'limitless' AS platform,
                            CONCAT(
                                crypto_symbol,
                                ' Price Predictions - ',
                                date_str
                            ) AS title,
                            MAX(category_name) AS category,
                            MAX(image_url) AS image_url,
                            (ARRAY_AGG(source_url ORDER BY volume_total DESC NULLS LAST))[1] AS source_url,
                            COUNT(*) AS market_count,
                            SUM(COALESCE(volume_total, 0)) AS volume_24h,
                            SUM(COALESCE(volume_total, 0)) AS total_volume,
                            SUM(liquidity) AS total_liquidity,
                            MAX(CASE WHEN is_resolved THEN NULL ELSE end_date END) AS end_time,
                            MIN(created_at_source) AS start_time,
                            CASE 
                                WHEN COUNT(*) FILTER (WHERE is_resolved) = COUNT(*) THEN 'resolved'
                                WHEN COUNT(*) FILTER (WHERE is_active) = 0 THEN 'closed'
                                ELSE 'open'
                            END AS status
                        FROM (
                            SELECT *,
                                SUBSTRING(title FROM '\\$([A-Z]+)') AS crypto_symbol,
                                SUBSTRING(title FROM 'on ([A-Za-z]+ \\d+)') AS date_str
                            FROM predictions_silver.markets
                            WHERE source = 'limitless'
                              AND title ~ '\\$[A-Z]+'
                              AND title ~ 'on [A-Za-z]+ \\d+'
                        ) limitless_markets
                        WHERE crypto_symbol IS NOT NULL
                          AND date_str IS NOT NULL
                        GROUP BY crypto_symbol, date_str
                        
                        UNION ALL
                        
                        -- OpinionTrade events (grouped by asset + date pattern from title)
                        -- Extract patterns like "ETH Up or Down - Hourly (Jan 29)" → "ETH-Hourly-2026-01-29"
                        -- Uses volume_24h which has reasonable values
                        SELECT
                            CONCAT(
                                asset_name,
                                '-',
                                market_type,
                                '-',
                                date_str
                            ) AS event_id,
                            'opiniontrade' AS platform,
                            CONCAT(
                                asset_name,
                                ' ',
                                CASE market_type
                                    WHEN 'Hourly' THEN 'Hourly Markets'
                                    WHEN 'Daily' THEN 'Daily Markets'
                                    ELSE 'Markets'
                                END,
                                CASE 
                                    WHEN MAX(end_date) IS NOT NULL THEN CONCAT(' - ', TO_CHAR(MAX(end_date), 'Mon DD'))
                                    ELSE ''
                                END
                            ) AS title,
                            MAX(category_name) AS category,
                            MAX(image_url) AS image_url,
                            (ARRAY_AGG(source_url ORDER BY volume_24h DESC NULLS LAST))[1] AS source_url,
                            COUNT(*) AS market_count,
                            SUM(COALESCE(volume_24h, 0)) AS volume_24h,
                            SUM(COALESCE(volume_24h, 0)) AS total_volume,
                            SUM(liquidity) AS total_liquidity,
                            MAX(CASE WHEN is_resolved THEN NULL ELSE end_date END) AS end_time,
                            MIN(created_at_source) AS start_time,
                            CASE 
                                WHEN COUNT(*) FILTER (WHERE is_resolved) = COUNT(*) THEN 'resolved'
                                WHEN COUNT(*) FILTER (WHERE is_active) = 0 THEN 'closed'
                                ELSE 'open'
                            END AS status
                        FROM (
                            SELECT *,
                                COALESCE(
                                    SUBSTRING(title FROM '([A-Z]{2,10})\\s+(Up or Down|all time high)'),
                                    SUBSTRING(title FROM '^([A-Za-z]+)\\s'),
                                    'Unknown'
                                ) AS asset_name,
                                CASE 
                                    WHEN title ~* 'hourly' THEN 'Hourly'
                                    WHEN title ~* 'daily' THEN 'Daily'
                                    ELSE 'General'
                                END AS market_type,
                                COALESCE(TO_CHAR(end_date, 'YYYY-MM-DD'), 'ongoing') AS date_str
                            FROM predictions_silver.markets
                            WHERE source = 'opiniontrade'
                        ) opinion_markets
                        GROUP BY asset_name, market_type, date_str
                    )
                    INSERT INTO predictions_gold.events_snapshot (
                        snapshot_at, event_id, platform, title, category,
                        image_url, source_url, market_count, volume_24h, total_volume,
                        end_time, start_time, status
                    )
                    SELECT
                        $1,
                        event_id, platform, title, category,
                        image_url, source_url, market_count, volume_24h, total_volume,
                        end_time, start_time, status
                    FROM event_groups
                    WHERE market_count > 0
                """
                
                insert_result, error = await self._safe_execute(
                    conn, query, (snapshot_at,),
                    table_name="events_snapshot", operation="insert"
                )
                
                if error:
                    result.status = "failed"
                    result.error_count = 1
                    result.message = error
                else:
                    try:
                        result.inserted = int(insert_result.split()[-1])
                    except (ValueError, IndexError):
                        result.inserted = 0
                    result.status = "success"
                    result.message = f"Created snapshot with {result.inserted} events"
                
        except Exception as e:
            result.status = "failed"
            result.error_count = 1
            result.message = f"Exception: {str(e)}"
            self.logger.exception("Failed to aggregate events snapshot", error=str(e))
        
        result.duration_seconds = (datetime.now(timezone.utc) - start_time).total_seconds()
        self._log_aggregation_result(result)
        return result
    
    async def aggregate_event_markets(self) -> AggregationResult:
        """
        Aggregate event_markets table: Event-to-market mapping with ranks.
        Links each market to its parent event with volume-based ranking.
        """
        result = AggregationResult(table_name="event_markets")
        start_time = datetime.now(timezone.utc)
        snapshot_at = datetime.now(timezone.utc).replace(tzinfo=None)  # Remove timezone for TIMESTAMP column
        
        try:
            async with self.db.asyncpg_connection() as conn:
                query = """
                    WITH event_markets_ranked AS (
                        -- Polymarket event markets
                        -- Uses volume_7d for ranking (volume_24h and volume_total are NULL)
                        SELECT
                            extra_data->>'event_slug' AS event_id,
                            'polymarket' AS platform,
                            id AS market_id,
                            source_market_id,
                            title AS market_title,
                            slug AS market_slug,
                            source_url,
                            yes_price,
                            volume_7d AS volume_24h,
                            volume_7d AS volume_total,
                            ROW_NUMBER() OVER (
                                PARTITION BY extra_data->>'event_slug'
                                ORDER BY volume_7d DESC NULLS LAST
                            ) AS rank_in_event
                        FROM predictions_silver.markets
                        WHERE source = 'polymarket'
                          AND extra_data ? 'event_slug'
                          AND extra_data->>'event_slug' IS NOT NULL
                          AND extra_data->>'event_slug' != ''
                        
                        UNION ALL
                        
                        -- Kalshi event markets
                        -- Uses volume_7d for ranking (volume_24h and volume_total are NULL)
                        SELECT
                            extra_data->>'event_ticker' AS event_id,
                            'kalshi' AS platform,
                            id AS market_id,
                            source_market_id,
                            title AS market_title,
                            slug AS market_slug,
                            source_url,
                            yes_price,
                            volume_7d AS volume_24h,
                            volume_7d AS volume_total,
                            ROW_NUMBER() OVER (
                                PARTITION BY extra_data->>'event_ticker'
                                ORDER BY volume_7d DESC NULLS LAST
                            ) AS rank_in_event
                        FROM predictions_silver.markets
                        WHERE source = 'kalshi'
                          AND extra_data ? 'event_ticker'
                          AND extra_data->>'event_ticker' IS NOT NULL
                          AND extra_data->>'event_ticker' != ''
                        
                        UNION ALL
                        
                        -- Limitless event markets (grouped by crypto + date from title)
                        -- CRITICAL: Divide volume_total by 10^9 to convert from Gwei
                        SELECT
                            CONCAT(
                                SUBSTRING(title FROM '\\$([A-Z]+)'),
                                '-',
                                SUBSTRING(title FROM 'on ([A-Za-z]+ \\d+)')
                            ) AS event_id,
                            'limitless' AS platform,
                            id AS market_id,
                            source_market_id,
                            title AS market_title,
                            slug AS market_slug,
                            source_url,
                            yes_price,
                            volume_total / 1000000000.0 AS volume_24h,
                            volume_total / 1000000000.0 AS volume_total,
                            ROW_NUMBER() OVER (
                                PARTITION BY 
                                    SUBSTRING(title FROM '\\$([A-Z]+)'),
                                    SUBSTRING(title FROM 'on ([A-Za-z]+ \\d+)')
                                ORDER BY volume_total DESC NULLS LAST
                            ) AS rank_in_event
                        FROM predictions_silver.markets
                        WHERE source = 'limitless'
                          AND title ~ '\\$[A-Z]+'
                          AND title ~ 'on [A-Za-z]+ \\d+'
                        
                        UNION ALL
                        
                        -- OpinionTrade event markets (grouped by asset + date pattern)
                        -- Uses volume_24h which has reasonable values
                        SELECT
                            CONCAT(
                                COALESCE(
                                    SUBSTRING(title FROM '([A-Z]{2,10})\\s+(Up or Down|all time high)'),
                                    SUBSTRING(title FROM '^([A-Za-z]+)\\s')
                                ),
                                '-',
                                CASE 
                                    WHEN title ~* 'hourly' THEN 'Hourly'
                                    WHEN title ~* 'daily' THEN 'Daily'
                                    ELSE 'General'
                                END,
                                '-',
                                COALESCE(TO_CHAR(end_date, 'YYYY-MM-DD'), 'ongoing')
                            ) AS event_id,
                            'opiniontrade' AS platform,
                            id AS market_id,
                            source_market_id,
                            title AS market_title,
                            slug AS market_slug,
                            source_url,
                            yes_price,
                            volume_24h,
                            volume_24h AS volume_total,
                            ROW_NUMBER() OVER (
                                PARTITION BY 
                                    COALESCE(
                                        SUBSTRING(title FROM '([A-Z]{2,10})\\s+(Up or Down|all time high)'),
                                        SUBSTRING(title FROM '^([A-Za-z]+)\\s')
                                    ),
                                    CASE 
                                        WHEN title ~* 'hourly' THEN 'Hourly'
                                        WHEN title ~* 'daily' THEN 'Daily'
                                        ELSE 'General'
                                    END,
                                    COALESCE(TO_CHAR(end_date, 'YYYY-MM-DD'), 'ongoing')
                                ORDER BY volume_24h DESC NULLS LAST
                            ) AS rank_in_event
                        FROM predictions_silver.markets
                        WHERE source = 'opiniontrade'
                    )
                    INSERT INTO predictions_gold.event_markets (
                        snapshot_at, event_id, platform, market_id,
                        market_title, market_slug, source_url, yes_price,
                        volume_24h, volume_total, rank_in_event
                    )
                    SELECT
                        $1,
                        event_id, platform, market_id,
                        market_title, market_slug, source_url, yes_price, volume_24h,
                        volume_total, rank_in_event
                    FROM event_markets_ranked
                """
                
                insert_result, error = await self._safe_execute(
                    conn, query, (snapshot_at,),
                    table_name="event_markets", operation="insert"
                )
                
                if error:
                    result.status = "failed"
                    result.error_count = 1
                    result.message = error
                else:
                    try:
                        result.inserted = int(insert_result.split()[-1])
                    except (ValueError, IndexError):
                        result.inserted = 0
                    result.status = "success"
                    result.message = f"Created snapshot with {result.inserted} event-market mappings"
                
        except Exception as e:
            result.status = "failed"
            result.error_count = 1
            result.message = f"Exception: {str(e)}"
            self.logger.exception("Failed to aggregate event markets", error=str(e))
        
        result.duration_seconds = (datetime.now(timezone.utc) - start_time).total_seconds()
        self._log_aggregation_result(result)
        return result
    
    async def aggregate_events_aggregate_metrics(self) -> AggregationResult:
        """
        Aggregate events_aggregate_metrics table: Platform-level event statistics.
        Calculates high-level metrics across all events by platform.
        """
        result = AggregationResult(table_name="events_aggregate_metrics")
        start_time = datetime.now(timezone.utc)
        snapshot_at = datetime.now(timezone.utc).replace(tzinfo=None)  # Remove timezone for TIMESTAMP column
        
        try:
            async with self.db.asyncpg_connection() as conn:
                query = """
                    WITH event_stats AS (
                        -- Polymarket event stats (uses volume_7d)
                        SELECT
                            'polymarket' AS platform,
                            COUNT(DISTINCT extra_data->>'event_slug') AS total_events,
                            COUNT(*) AS total_markets,
                            SUM(COALESCE(volume_7d, 0)) AS volume_24h,
                            SUM(COALESCE(volume_7d, 0)) AS total_volume
                        FROM predictions_silver.markets
                        WHERE source = 'polymarket'
                          AND extra_data ? 'event_slug'
                          AND extra_data->>'event_slug' IS NOT NULL
                          AND extra_data->>'event_slug' != ''
                        
                        UNION ALL
                        
                        -- Kalshi event stats (uses volume_7d)
                        SELECT
                            'kalshi' AS platform,
                            COUNT(DISTINCT extra_data->>'event_ticker') AS total_events,
                            COUNT(*) AS total_markets,
                            SUM(COALESCE(volume_7d, 0)) AS volume_24h,
                            SUM(COALESCE(volume_7d, 0)) AS total_volume
                        FROM predictions_silver.markets
                        WHERE source = 'kalshi'
                          AND extra_data ? 'event_ticker'
                          AND extra_data->>'event_ticker' IS NOT NULL
                          AND extra_data->>'event_ticker' != ''
                        
                        UNION ALL
                        
                        -- Limitless event stats (divide by 10^9 for Gwei conversion)
                        SELECT
                            'limitless' AS platform,
                            COUNT(DISTINCT CONCAT(
                                SUBSTRING(title FROM '\\$([A-Z]+)'),
                                '-',
                                SUBSTRING(title FROM 'on ([A-Za-z]+ \\d+)')
                            )) AS total_events,
                            COUNT(*) AS total_markets,
                            SUM(COALESCE(volume_total, 0)) / 1000000000.0 AS volume_24h,
                            SUM(COALESCE(volume_total, 0)) / 1000000000.0 AS total_volume
                        FROM predictions_silver.markets
                        WHERE source = 'limitless'
                          AND title ~ '\\$[A-Z]+'
                          AND title ~ 'on [A-Za-z]+ \\d+'
                        
                        UNION ALL
                        
                        -- OpinionTrade event stats (uses volume_24h)
                        SELECT
                            'opiniontrade' AS platform,
                            COUNT(DISTINCT CONCAT(
                                COALESCE(
                                    SUBSTRING(title FROM '([A-Z]{2,10})\\s+(Up or Down|all time high)'),
                                    SUBSTRING(title FROM '^([A-Za-z]+)\\s')
                                ),
                                '-',
                                CASE 
                                    WHEN title ~* 'hourly' THEN 'Hourly'
                                    WHEN title ~* 'daily' THEN 'Daily'
                                    ELSE 'General'
                                END,
                                '-',
                                COALESCE(TO_CHAR(end_date, 'YYYY-MM-DD'), 'ongoing')
                            )) AS total_events,
                            COUNT(*) AS total_markets,
                            SUM(COALESCE(volume_24h, 0)) AS volume_24h,
                            SUM(COALESCE(volume_24h, 0)) AS total_volume
                        FROM predictions_silver.markets
                        WHERE source = 'opiniontrade'
                    ),
                    markets_per_event_calc AS (
                        -- Polymarket
                        SELECT
                            'polymarket' AS platform,
                            COUNT(*) AS markets_in_event
                        FROM predictions_silver.markets
                        WHERE source = 'polymarket'
                          AND extra_data ? 'event_slug'
                          AND extra_data->>'event_slug' IS NOT NULL
                        GROUP BY extra_data->>'event_slug'
                        
                        UNION ALL
                        
                        -- Kalshi
                        SELECT
                            'kalshi' AS platform,
                            COUNT(*) AS markets_in_event
                        FROM predictions_silver.markets
                        WHERE source = 'kalshi'
                          AND extra_data ? 'event_ticker'
                          AND extra_data->>'event_ticker' IS NOT NULL
                        GROUP BY extra_data->>'event_ticker'
                        
                        UNION ALL
                        
                        -- Limitless
                        SELECT
                            'limitless' AS platform,
                            COUNT(*) AS markets_in_event
                        FROM predictions_silver.markets
                        WHERE source = 'limitless'
                          AND title ~ '\\$[A-Z]+'
                          AND title ~ 'on [A-Za-z]+ \\d+'
                        GROUP BY 
                            SUBSTRING(title FROM '\\$([A-Z]+)'),
                            SUBSTRING(title FROM 'on ([A-Za-z]+ \\d+)')
                        
                        UNION ALL
                        
                        -- OpinionTrade
                        SELECT
                            'opiniontrade' AS platform,
                            COUNT(*) AS markets_in_event
                        FROM predictions_silver.markets
                        WHERE source = 'opiniontrade'
                        GROUP BY 
                            COALESCE(
                                SUBSTRING(title FROM '([A-Z]{2,10})\\s+(Up or Down|all time high)'),
                                SUBSTRING(title FROM '^([A-Za-z]+)\\s')
                            ),
                            CASE 
                                WHEN title ~* 'hourly' THEN 'Hourly'
                                WHEN title ~* 'daily' THEN 'Daily'
                                ELSE 'General'
                            END,
                            COALESCE(TO_CHAR(end_date, 'YYYY-MM-DD'), 'ongoing')
                    )
                    INSERT INTO predictions_gold.events_aggregate_metrics (
                        snapshot_at, platform, total_events, total_markets,
                        volume_24h, total_volume, avg_markets_per_event
                    )
                    SELECT
                        $1,
                        es.platform,
                        es.total_events,
                        es.total_markets,
                        es.volume_24h,
                        es.total_volume,
                        (SELECT AVG(markets_in_event) 
                         FROM markets_per_event_calc mpe 
                         WHERE mpe.platform = es.platform) AS avg_markets_per_event
                    FROM event_stats es
                """
                
                insert_result, error = await self._safe_execute(
                    conn, query, (snapshot_at,),
                    table_name="events_aggregate_metrics", operation="insert"
                )
                
                if error:
                    result.status = "failed"
                    result.error_count = 1
                    result.message = error
                else:
                    try:
                        result.inserted = int(insert_result.split()[-1])
                    except (ValueError, IndexError):
                        result.inserted = 0
                    result.status = "success"
                    result.message = f"Created snapshot with {result.inserted} platform metrics"
                
        except Exception as e:
            result.status = "failed"
            result.error_count = 1
            result.message = f"Exception: {str(e)}"
            self.logger.exception("Failed to aggregate events metrics", error=str(e))
        
        result.duration_seconds = (datetime.now(timezone.utc) - start_time).total_seconds()
        self._log_aggregation_result(result)
        return result
    
    # ========================================================================
    # CLEANUP OPERATIONS (Daily maintenance)
    # ========================================================================
    
    async def run_cleanup(self) -> RunSummary:
        """Run daily cleanup operations."""
        summary = RunSummary(run_type="cleanup")
        self.logger.info("Starting CLEANUP operations", run_id=str(summary.run_id))
        
        cleanup_tasks = [
            # Phase 1 tables
            ("market_metrics_summary", "7 days", "snapshot_timestamp"),
            ("top_markets_snapshot", "24 hours", "snapshot_timestamp"),
            ("category_distribution", "30 days", "snapshot_timestamp"),
            ("volume_trends", "90 days", "snapshot_timestamp"),
            ("high_volume_activity", "7 days", "detected_at"),
            ("platform_comparison", "30 days", "snapshot_timestamp"),
            ("trending_categories", "7 days", "snapshot_timestamp"),
            # Phase 2 tables
            ("market_price_history", "90 days", "period_start"),
            ("market_trade_activity", "7 days", "snapshot_timestamp"),
            ("market_orderbook_depth", "7 days", "snapshot_timestamp"),
            ("related_markets", "7 days", "computed_at"),
            # Phase 3 tables
            ("recently_resolved_markets", "30 days", "snapshot_at"),
            ("category_breakdown_by_platform", "7 days", "snapshot_at"),
            ("filter_aggregates", "24 hours", "snapshot_at"),
            ("watchlist_popular_markets", "7 days", "snapshot_at"),
            # Phase 4 tables
            ("volume_distribution_histogram", "7 days", "snapshot_at"),
            ("market_lifecycle_funnel", "7 days", "snapshot_at"),
            ("top_traders_leaderboard", "7 days", "snapshot_at"),
            ("category_performance_metrics", "7 days", "snapshot_at"),
            # Phase 5 tables
            ("events_snapshot", "7 days", "snapshot_at"),
            ("event_markets", "7 days", "snapshot_at"),
            ("events_aggregate_metrics", "7 days", "snapshot_at"),
        ]
        
        for table, retention, ts_col in cleanup_tasks:
            result = await self._cleanup_table(table, retention, ts_col)
            summary.results.append(result)
        
        summary.completed_at = datetime.now(timezone.utc)
        self._log_run_summary(summary)
        return summary
    
    async def _cleanup_table(self, table_name: str, retention: str, ts_col: str) -> AggregationResult:
        """Clean up old records from a Gold table."""
        result = AggregationResult(table_name=table_name)
        start_time = datetime.now(timezone.utc)
        
        try:
            async with self.db.asyncpg_connection() as conn:
                query = f"""
                    DELETE FROM predictions_gold.{table_name}
                    WHERE {ts_col} < NOW() - INTERVAL '{retention}'
                """
                
                delete_result, error = await self._safe_execute(conn, query, (), table_name=table_name, operation="execute")
                
                if error:
                    result.status = "failed"
                    result.error_count = 1
                    result.message = error
                else:
                    try:
                        result.deleted = int(delete_result.split()[-1])
                    except (ValueError, IndexError):
                        result.deleted = 0
                    result.status = "success"
                    result.message = f"Cleaned {result.deleted} records older than {retention}"
                
        except Exception as e:
            result.status = "failed"
            result.error_count = 1
            result.message = f"Exception: {str(e)}"
            self.logger.exception("Failed to cleanup table", table=table_name, error=str(e))
        
        result.duration_seconds = (datetime.now(timezone.utc) - start_time).total_seconds()
        self._log_aggregation_result(result)
        return result
    
    # ========================================================================
    # LOGGING HELPERS
    # ========================================================================
    
    def _log_aggregation_result(self, result: AggregationResult):
        """Log individual aggregation result."""
        log_method = self.logger.info if result.status == "success" else self.logger.warning
        log_method(
            "Aggregation completed",
            table=result.table_name,
            status=result.status,
            inserted=result.inserted,
            upserted=result.upserted,
            deleted=result.deleted,
            errors=result.error_count,
            duration_s=round(result.duration_seconds, 3),
            message=result.message
        )
    
    def _log_run_summary(self, summary: RunSummary):
        """Log run summary with all metrics."""
        status = "SUCCESS" if summary.failed_count == 0 else "PARTIAL" if summary.success_count > 0 else "FAILED"
        self.logger.info(
            f"=== {summary.run_type.upper()} Aggregation Run Complete ===",
            run_id=str(summary.run_id),
            status=status,
            duration_s=round(summary.duration_seconds, 3),
            tables_processed=len(summary.results),
            tables_success=summary.success_count,
            tables_failed=summary.failed_count,
            total_inserted=summary.total_inserted,
            total_upserted=summary.total_upserted,
            total_deleted=summary.total_deleted,
            total_errors=summary.total_errors
        )
        for r in summary.results:
            self.logger.debug(
                f"  [{r.status.upper():8}] {r.table_name}",
                inserted=r.inserted,
                upserted=r.upserted,
                deleted=r.deleted,
                errors=r.error_count
            )


async def run_gold_aggregations(db: DatabaseManager, aggregation_type: str = "all") -> dict:
    """Run Gold layer aggregations."""
    aggregator = GoldLayerAggregator(db)
    results = {}
    if aggregation_type in ("hot", "all"):
        results["hot"] = await aggregator.run_hot_aggregations()
    if aggregation_type in ("warm", "all"):
        results["warm"] = await aggregator.run_warm_aggregations()
    if aggregation_type in ("cleanup", "all"):
        results["cleanup"] = await aggregator.run_cleanup()
    return results
