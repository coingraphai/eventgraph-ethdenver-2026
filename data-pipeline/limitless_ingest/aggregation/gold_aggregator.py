"""
Gold Layer Aggregator - Transforms Silver data into analytics tables.

Aggregation Schedule:
- Hot (5 min): market_metrics_summary, top_markets_snapshot, high_volume_activity
- Warm (15 min): category_distribution, volume_trends, platform_comparison, trending_categories
"""
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

import structlog

from limitless_ingest.database import Database

logger = structlog.get_logger()


class GoldLayerAggregator:
    """Aggregates Silver layer data into Gold analytics tables."""
    
    def __init__(self, db: Database):
        self.db = db
    
    # =========================================================================
    # HOT AGGREGATIONS (Every 5 minutes)
    # =========================================================================
    
    async def run_hot_aggregations(self) -> dict[str, Any]:
        """
        Run high-frequency aggregations (every 5 minutes).
        
        Tables updated:
        - market_metrics_summary
        - top_markets_snapshot
        - high_volume_activity
        """
        logger.info("Running hot aggregations (5min)")
        
        results = {}
        
        try:
            results["market_metrics"] = await self.aggregate_market_metrics()
            results["top_markets"] = await self.aggregate_top_markets()
            results["activity_feed"] = await self.aggregate_activity_feed()
            
            logger.info("Hot aggregations completed", results=results)
            return {"status": "success", "results": results}
            
        except Exception as e:
            logger.error("Hot aggregations failed", error=str(e))
            return {"status": "error", "error": str(e), "results": results}
    
    async def aggregate_market_metrics(self) -> dict[str, Any]:
        """
        Aggregate market_metrics_summary table.
        
        Calculates:
        - Combined platform statistics
        - Growth percentages (24h comparison)
        - Market share percentages
        - Trend indicators
        """
        logger.info("Aggregating market_metrics_summary")
        
        snapshot_id = uuid.uuid4()
        snapshot_timestamp = datetime.now(timezone.utc)
        
        # Get current metrics by platform
        query_current = """
            WITH platform_metrics AS (
                SELECT 
                    source,
                    COUNT(*) FILTER (WHERE is_active = true) AS open_markets,
                    COALESCE(SUM(volume_24h) FILTER (WHERE is_active = true), 0) AS volume_24h
                FROM predictions_silver.markets
                GROUP BY source
            )
            SELECT 
                source,
                open_markets,
                volume_24h
            FROM platform_metrics
        """
        
        current_metrics = await self.db.fetch(query_current)
        
        # Get previous snapshot (24h ago) for growth calculation
        query_previous = """
            SELECT 
                polymarket_volume_24h,
                kalshi_volume_24h,
                limitless_volume_24h,
                combined_volume_24h
            FROM predictions_gold.market_metrics_summary
            WHERE snapshot_timestamp <= NOW() - INTERVAL '24 hours'
            ORDER BY snapshot_timestamp DESC
            LIMIT 1
        """
        
        previous_snapshot = await self.db.fetchrow(query_previous)
        
        # Organize current metrics by platform
        platform_data = {row["source"]: row for row in current_metrics}
        
        # Calculate totals
        total_markets = sum(row["open_markets"] for row in current_metrics)
        combined_volume_24h = sum(row["volume_24h"] for row in current_metrics)
        avg_volume_per_market = combined_volume_24h / total_markets if total_markets > 0 else 0
        
        # Calculate platform-specific metrics with growth
        def get_platform_metrics(platform: str) -> dict:
            data = platform_data.get(platform, {"open_markets": 0, "volume_24h": 0})
            volume_24h = data["volume_24h"]
            
            # Calculate growth percentage
            growth_pct = 0.0
            if previous_snapshot and combined_volume_24h > 0:
                prev_vol_field = f"{platform}_volume_24h"
                prev_volume = previous_snapshot.get(prev_vol_field, 0)
                if prev_volume > 0:
                    growth_pct = ((volume_24h - prev_volume) / prev_volume) * 100
            
            # Calculate market share
            market_share_pct = (volume_24h / combined_volume_24h * 100) if combined_volume_24h > 0 else 0
            
            return {
                "open_markets": data["open_markets"],
                "volume_24h": volume_24h,
                "growth_24h_pct": round(growth_pct, 2),
                "market_share_pct": round(market_share_pct, 2)
            }
        
        polymarket = get_platform_metrics("polymarket")
        kalshi = get_platform_metrics("kalshi")
        limitless = get_platform_metrics("limitless")
        
        # Calculate overall change percentage
        change_pct_24h = 0.0
        if previous_snapshot and previous_snapshot["combined_volume_24h"] > 0:
            prev_vol = previous_snapshot["combined_volume_24h"]
            change_pct_24h = ((combined_volume_24h - prev_vol) / prev_vol) * 100
        
        # Determine trend direction
        if change_pct_24h > 5:
            trend_direction = "up"
        elif change_pct_24h < -5:
            trend_direction = "down"
        else:
            trend_direction = "stable"
        
        # Get 7-day volume for context
        query_7d = """
            SELECT COALESCE(SUM(volume_7d), 0) AS combined_volume_7d
            FROM predictions_silver.markets
            WHERE is_active = true
        """
        volume_7d_result = await self.db.fetchrow(query_7d)
        combined_volume_7d = volume_7d_result["combined_volume_7d"]
        
        # Calculate 7-day change
        query_7d_prev = """
            SELECT combined_volume_7d
            FROM predictions_gold.market_metrics_summary
            WHERE snapshot_timestamp <= NOW() - INTERVAL '7 days'
            ORDER BY snapshot_timestamp DESC
            LIMIT 1
        """
        prev_7d = await self.db.fetchrow(query_7d_prev)
        
        change_pct_7d = 0.0
        if prev_7d and prev_7d["combined_volume_7d"] > 0:
            prev_vol_7d = prev_7d["combined_volume_7d"]
            change_pct_7d = ((combined_volume_7d - prev_vol_7d) / prev_vol_7d) * 100
        
        # Insert snapshot
        insert_query = """
            INSERT INTO predictions_gold.market_metrics_summary (
                snapshot_timestamp, snapshot_id,
                total_markets, total_open_markets,
                combined_volume_24h, combined_volume_7d, avg_volume_per_market,
                polymarket_open_markets, polymarket_volume_24h, 
                polymarket_growth_24h_pct, polymarket_market_share_pct,
                kalshi_open_markets, kalshi_volume_24h,
                kalshi_growth_24h_pct, kalshi_market_share_pct,
                limitless_open_markets, limitless_volume_24h,
                limitless_growth_24h_pct, limitless_market_share_pct,
                trend_direction, change_pct_24h, change_pct_7d
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
                $16, $17, $18, $19, $20, $21, $22
            )
        """
        
        await self.db.execute(
            insert_query,
            snapshot_timestamp, snapshot_id,
            total_markets, total_markets,
            combined_volume_24h, combined_volume_7d, avg_volume_per_market,
            polymarket["open_markets"], polymarket["volume_24h"],
            polymarket["growth_24h_pct"], polymarket["market_share_pct"],
            kalshi["open_markets"], kalshi["volume_24h"],
            kalshi["growth_24h_pct"], kalshi["market_share_pct"],
            limitless["open_markets"], limitless["volume_24h"],
            limitless["growth_24h_pct"], limitless["market_share_pct"],
            trend_direction, round(change_pct_24h, 2), round(change_pct_7d, 2)
        )
        
        logger.info(
            "Market metrics aggregated",
            total_markets=total_markets,
            combined_volume_24h=float(combined_volume_24h),
            trend=trend_direction
        )
        
        return {
            "status": "success",
            "snapshot_id": str(snapshot_id),
            "total_markets": total_markets,
            "combined_volume_24h": float(combined_volume_24h)
        }
    
    async def aggregate_top_markets(self) -> dict[str, Any]:
        """
        Aggregate top_markets_snapshot table.
        
        Selects top 10 markets by volume_24h and formats for display.
        """
        logger.info("Aggregating top_markets_snapshot")
        
        snapshot_id = uuid.uuid4()
        snapshot_timestamp = datetime.now(timezone.utc)
        
        # Get top 10 markets by 24h volume
        query = """
            SELECT 
                id AS market_id,
                title,
                source AS platform,
                volume_total,
                volume_24h,
                category_name,
                tags,
                image_url,
                ROW_NUMBER() OVER (ORDER BY volume_24h DESC NULLS LAST) AS rank
            FROM predictions_silver.markets
            WHERE is_active = true
            ORDER BY volume_24h DESC NULLS LAST
            LIMIT 10
        """
        
        top_markets = await self.db.fetch(query)
        
        if not top_markets:
            logger.warning("No active markets found for top markets")
            return {"status": "skipped", "reason": "no_active_markets"}
        
        # Insert each market into snapshot
        insert_query = """
            INSERT INTO predictions_gold.top_markets_snapshot (
                snapshot_timestamp, snapshot_id, market_id, rank,
                title, title_short, platform,
                volume_total_usd, volume_24h_usd, volume_millions,
                category, tags, image_url
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
            )
        """
        
        for market in top_markets:
            # Truncate title for display
            title = market["title"]
            title_short = title[:47] + "..." if len(title) > 50 else title
            
            # Format volume in millions
            volume_millions = round(float(market["volume_24h"]) / 1_000_000, 2)
            
            await self.db.execute(
                insert_query,
                snapshot_timestamp, snapshot_id,
                market["market_id"], market["rank"],
                title, title_short, market["platform"],
                market["volume_total"], market["volume_24h"], volume_millions,
                market["category_name"], market["tags"], market["image_url"]
            )
        
        logger.info(
            "Top markets aggregated",
            count=len(top_markets),
            top_volume=float(top_markets[0]["volume_24h"]) if top_markets else 0
        )
        
        return {
            "status": "success",
            "snapshot_id": str(snapshot_id),
            "market_count": len(top_markets)
        }
    
    async def aggregate_activity_feed(self) -> dict[str, Any]:
        """
        Aggregate high_volume_activity table.
        
        Detects significant events:
        - Volume spikes (>50% increase in 1 hour)
        - Large price movements (>10% in 1 hour)
        - New high-volume markets
        - Markets closing soon with high volume
        """
        logger.info("Aggregating high_volume_activity")
        
        detected_at = datetime.now(timezone.utc)
        activities_added = 0
        
        # 1. Detect volume spikes (compare with 1 hour ago)
        volume_spike_query = """
            WITH current_volume AS (
                SELECT 
                    id, title, source, volume_24h, category_name, image_url,
                    yes_price
                FROM predictions_silver.markets
                WHERE is_active = true AND volume_24h > 0
            ),
            previous_prices AS (
                SELECT DISTINCT ON (market_id)
                    market_id,
                    price AS prev_price
                FROM predictions_silver.prices
                WHERE fetched_at <= NOW() - INTERVAL '1 hour'
                ORDER BY market_id, fetched_at DESC
            )
            SELECT 
                cv.id, cv.title, cv.source, cv.volume_24h,
                cv.category_name, cv.image_url, cv.yes_price,
                pp.prev_price,
                CASE 
                    WHEN pp.prev_price > 0 THEN 
                        ((cv.yes_price - pp.prev_price) / pp.prev_price) * 100
                    ELSE 0
                END AS price_change_pct
            FROM current_volume cv
            LEFT JOIN previous_prices pp ON cv.id = pp.market_id
            WHERE cv.volume_24h > 10000  -- Min $10k volume threshold
            ORDER BY cv.volume_24h DESC
            LIMIT 20
        """
        
        activity_markets = await self.db.fetch(volume_spike_query)
        
        # Insert activity records
        insert_query = """
            INSERT INTO predictions_gold.high_volume_activity (
                detected_at, market_id, title, title_short, platform,
                activity_type, activity_description,
                volume_24h, volume_change_pct, price_change_pct, current_price,
                importance_score, category, image_url
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
            )
        """
        
        for market in activity_markets:
            title = market["title"]
            title_short = title[:47] + "..." if len(title) > 50 else title
            
            price_change_pct = float(market.get("price_change_pct", 0))
            
            # Determine activity type and importance
            if abs(price_change_pct) > 10:
                activity_type = "price_move"
                description = f"Price moved {abs(price_change_pct):.1f}% in the last hour"
                importance_score = min(100, int(abs(price_change_pct) * 5))
            else:
                activity_type = "volume_spike"
                description = f"High trading volume: ${float(market['volume_24h']):,.0f} in 24h"
                # Score based on volume (log scale)
                import math
                importance_score = min(100, int(math.log10(float(market['volume_24h']) + 1) * 10))
            
            await self.db.execute(
                insert_query,
                detected_at, market["id"], title, title_short, market["source"],
                activity_type, description,
                market["volume_24h"], 0.0, price_change_pct, market["yes_price"],
                importance_score, market["category_name"], market["image_url"]
            )
            
            activities_added += 1
        
        # 2. Detect markets closing soon (within 24 hours) with high volume
        closing_soon_query = """
            SELECT 
                id, title, source, volume_24h, yes_price,
                category_name, image_url, end_date,
                end_date - NOW() AS time_to_close
            FROM predictions_silver.markets
            WHERE is_active = true 
                AND end_date IS NOT NULL
                AND end_date > NOW()
                AND end_date <= NOW() + INTERVAL '24 hours'
                AND volume_24h > 5000  -- Min $5k volume
            ORDER BY volume_24h DESC
            LIMIT 10
        """
        
        closing_markets = await self.db.fetch(closing_soon_query)
        
        for market in closing_markets:
            title = market["title"]
            title_short = title[:47] + "..." if len(title) > 50 else title
            
            hours_left = market["time_to_close"].total_seconds() / 3600
            description = f"Closing in {hours_left:.1f} hours with ${float(market['volume_24h']):,.0f} volume"
            
            await self.db.execute(
                insert_query,
                detected_at, market["id"], title, title_short, market["source"],
                "closing_soon", description,
                market["volume_24h"], 0.0, 0.0, market["yes_price"],
                70,  # Fixed importance for closing soon
                market["category_name"], market["image_url"]
            )
            
            activities_added += 1
        
        logger.info("Activity feed aggregated", activities_added=activities_added)
        
        return {
            "status": "success",
            "activities_added": activities_added
        }
    
    # =========================================================================
    # WARM AGGREGATIONS (Every 15 minutes)
    # =========================================================================
    
    async def run_warm_aggregations(self) -> dict[str, Any]:
        """
        Run medium-frequency aggregations (every 15 minutes).
        
        Tables updated:
        - category_distribution
        - volume_trends
        - platform_comparison
        - trending_categories
        """
        logger.info("Running warm aggregations (15min)")
        
        results = {}
        
        try:
            results["category_distribution"] = await self.aggregate_category_distribution()
            results["volume_trends"] = await self.aggregate_volume_trends()
            results["platform_comparison"] = await self.aggregate_platform_comparison()
            results["trending_categories"] = await self.aggregate_trending_categories()
            
            logger.info("Warm aggregations completed", results=results)
            return {"status": "success", "results": results}
            
        except Exception as e:
            logger.error("Warm aggregations failed", error=str(e))
            return {"status": "error", "error": str(e), "results": results}
    
    async def aggregate_category_distribution(self) -> dict[str, Any]:
        """
        Aggregate category_distribution table.
        
        Calculates market count and percentage by category.
        """
        logger.info("Aggregating category_distribution")
        
        snapshot_id = uuid.uuid4()
        snapshot_timestamp = datetime.now(timezone.utc)
        
        # Get category distribution
        query = """
            WITH category_stats AS (
                SELECT 
                    COALESCE(category_name, 'Uncategorized') AS category,
                    COUNT(*) AS market_count,
                    SUM(volume_24h) AS total_volume_24h,
                    COUNT(*) FILTER (WHERE source = 'polymarket') AS polymarket_count,
                    COUNT(*) FILTER (WHERE source = 'kalshi') AS kalshi_count,
                    COUNT(*) FILTER (WHERE source = 'limitless') AS limitless_count
                FROM predictions_silver.markets
                WHERE is_active = true
                GROUP BY COALESCE(category_name, 'Uncategorized')
            ),
            totals AS (
                SELECT SUM(market_count) AS total_markets
                FROM category_stats
            )
            SELECT 
                cs.category,
                cs.market_count,
                ROUND((cs.market_count::DECIMAL / t.total_markets * 100), 2) AS percentage,
                cs.polymarket_count,
                cs.kalshi_count,
                cs.limitless_count,
                cs.total_volume_24h,
                CASE 
                    WHEN cs.market_count > 0 THEN cs.total_volume_24h / cs.market_count
                    ELSE 0
                END AS avg_volume_per_market,
                ROW_NUMBER() OVER (ORDER BY cs.market_count DESC) AS display_order
            FROM category_stats cs
            CROSS JOIN totals t
            ORDER BY cs.market_count DESC
        """
        
        categories = await self.db.fetch(query)
        
        if not categories:
            logger.warning("No categories found")
            return {"status": "skipped", "reason": "no_data"}
        
        # Insert snapshots
        insert_query = """
            INSERT INTO predictions_gold.category_distribution (
                snapshot_timestamp, snapshot_id, category, display_order,
                market_count, percentage,
                polymarket_count, kalshi_count, limitless_count,
                total_volume_24h, avg_volume_per_market
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
            )
        """
        
        for cat in categories:
            await self.db.execute(
                insert_query,
                snapshot_timestamp, snapshot_id,
                cat["category"], cat["display_order"],
                cat["market_count"], cat["percentage"],
                cat["polymarket_count"], cat["kalshi_count"], cat["limitless_count"],
                cat["total_volume_24h"], cat["avg_volume_per_market"]
            )
        
        logger.info(
            "Category distribution aggregated",
            categories_count=len(categories)
        )
        
        return {
            "status": "success",
            "snapshot_id": str(snapshot_id),
            "categories_count": len(categories)
        }
    
    async def aggregate_volume_trends(self) -> dict[str, Any]:
        """
        Aggregate volume_trends table.
        
        Analyzes volume trends for top markets.
        """
        logger.info("Aggregating volume_trends")
        
        snapshot_id = uuid.uuid4()
        snapshot_timestamp = datetime.now(timezone.utc)
        
        # Get top 20 markets with volume trends
        query = """
            WITH market_volumes AS (
                SELECT 
                    id, title, source,
                    volume_24h, volume_7d, volume_30d,
                    CASE 
                        WHEN volume_7d > 0 THEN volume_7d / 7
                        ELSE 0
                    END AS volume_weekly_avg,
                    CASE 
                        WHEN volume_30d > 0 THEN volume_30d / 30
                        ELSE 0
                    END AS volume_monthly_avg,
                    ROW_NUMBER() OVER (ORDER BY volume_24h DESC NULLS LAST) AS rank_by_volume
                FROM predictions_silver.markets
                WHERE is_active = true AND volume_24h > 0
            )
            SELECT 
                id, title, source,
                volume_24h, volume_7d,
                volume_weekly_avg, volume_monthly_avg,
                rank_by_volume,
                -- Simple trend: compare 24h to weekly avg
                CASE 
                    WHEN volume_weekly_avg > 0 THEN
                        ((volume_24h - volume_weekly_avg) / volume_weekly_avg) * 100
                    ELSE 0
                END AS volume_change_24h_pct,
                CASE 
                    WHEN volume_monthly_avg > 0 THEN
                        ((volume_weekly_avg - volume_monthly_avg) / volume_monthly_avg) * 100
                    ELSE 0
                END AS volume_change_7d_pct
            FROM market_volumes
            WHERE rank_by_volume <= 20
            ORDER BY rank_by_volume
        """
        
        trends = await self.db.fetch(query)
        
        if not trends:
            logger.warning("No volume trends found")
            return {"status": "skipped", "reason": "no_data"}
        
        # Insert trends
        insert_query = """
            INSERT INTO predictions_gold.volume_trends (
                snapshot_timestamp, snapshot_id, market_id,
                title, title_short, platform,
                volume_24h, volume_7d, volume_weekly_avg, volume_monthly_avg,
                trend_direction, trend_strength,
                volume_change_24h_pct, volume_change_7d_pct,
                rank_by_volume, rank_by_trend
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
            )
        """
        
        # Sort by trend strength for rank_by_trend
        sorted_trends = sorted(
            trends, 
            key=lambda x: abs(float(x["volume_change_24h_pct"])), 
            reverse=True
        )
        
        for idx, trend in enumerate(trends):
            title = trend["title"]
            title_short = title[:47] + "..." if len(title) > 50 else title
            
            change_pct = float(trend["volume_change_24h_pct"])
            
            # Determine trend direction
            if change_pct > 5:
                trend_direction = "up"
            elif change_pct < -5:
                trend_direction = "down"
            else:
                trend_direction = "stable"
            
            # Trend strength (0-100 based on change magnitude)
            trend_strength = min(100, abs(change_pct) * 2)
            
            # Find rank by trend
            rank_by_trend = next(
                i + 1 for i, t in enumerate(sorted_trends) if t["id"] == trend["id"]
            )
            
            await self.db.execute(
                insert_query,
                snapshot_timestamp, snapshot_id, trend["id"],
                title, title_short, trend["source"],
                trend["volume_24h"], trend["volume_7d"],
                trend["volume_weekly_avg"], trend["volume_monthly_avg"],
                trend_direction, round(trend_strength, 2),
                round(change_pct, 2), round(float(trend["volume_change_7d_pct"]), 2),
                trend["rank_by_volume"], rank_by_trend
            )
        
        logger.info("Volume trends aggregated", trends_count=len(trends))
        
        return {
            "status": "success",
            "snapshot_id": str(snapshot_id),
            "trends_count": len(trends)
        }
    
    async def aggregate_platform_comparison(self) -> dict[str, Any]:
        """
        Aggregate platform_comparison table.
        
        Compares platform statistics side-by-side.
        """
        logger.info("Aggregating platform_comparison")
        
        snapshot_id = uuid.uuid4()
        snapshot_timestamp = datetime.now(timezone.utc)
        
        # Get platform statistics
        query = """
            WITH platform_stats AS (
                SELECT 
                    source AS platform,
                    COUNT(*) AS total_markets,
                    COUNT(*) FILTER (WHERE is_active = true) AS active_markets,
                    COUNT(*) FILTER (
                        WHERE is_resolved = true 
                        AND resolution_date >= NOW() - INTERVAL '24 hours'
                    ) AS resolved_markets_24h,
                    COALESCE(SUM(volume_24h) FILTER (WHERE is_active = true), 0) AS volume_24h,
                    COALESCE(SUM(volume_7d) FILTER (WHERE is_active = true), 0) AS volume_7d,
                    COALESCE(SUM(trade_count_24h) FILTER (WHERE is_active = true), 0) AS trade_count_24h
                FROM predictions_silver.markets
                GROUP BY source
            ),
            totals AS (
                SELECT SUM(volume_24h) AS total_volume FROM platform_stats
            )
            SELECT 
                ps.platform,
                ps.total_markets,
                ps.active_markets,
                ps.resolved_markets_24h,
                ps.volume_24h,
                ps.volume_7d,
                ps.trade_count_24h,
                CASE 
                    WHEN ps.active_markets > 0 THEN ps.volume_24h / ps.active_markets
                    ELSE 0
                END AS avg_trade_size,
                CASE 
                    WHEN t.total_volume > 0 THEN
                        ROUND((ps.volume_24h / t.total_volume * 100), 2)
                    ELSE 0
                END AS market_share_pct
            FROM platform_stats ps
            CROSS JOIN totals t
        """
        
        platforms = await self.db.fetch(query)
        
        if not platforms:
            logger.warning("No platform data found")
            return {"status": "skipped", "reason": "no_data"}
        
        # Get previous snapshot for growth calculation
        prev_query = """
            SELECT platform, volume_24h, volume_7d
            FROM predictions_gold.platform_comparison
            WHERE snapshot_timestamp <= NOW() - INTERVAL '24 hours'
            ORDER BY snapshot_timestamp DESC
            LIMIT 10
        """
        prev_data = {row["platform"]: row for row in await self.db.fetch(prev_query)}
        
        # Assign display order
        display_order_map = {"polymarket": 1, "kalshi": 2, "limitless": 3}
        
        # Insert platform comparisons
        insert_query = """
            INSERT INTO predictions_gold.platform_comparison (
                snapshot_timestamp, snapshot_id, platform, display_order,
                total_markets, active_markets, resolved_markets_24h,
                volume_24h, volume_7d, volume_millions, avg_volume_thousands,
                growth_24h_pct, growth_7d_pct, market_share_pct,
                trade_count_24h, avg_trade_size
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
            )
        """
        
        for platform in platforms:
            platform_name = platform["platform"]
            
            # Calculate growth
            growth_24h_pct = 0.0
            growth_7d_pct = 0.0
            
            if platform_name in prev_data:
                prev = prev_data[platform_name]
                if prev["volume_24h"] > 0:
                    growth_24h_pct = (
                        (platform["volume_24h"] - prev["volume_24h"]) / prev["volume_24h"] * 100
                    )
                if prev["volume_7d"] > 0:
                    growth_7d_pct = (
                        (platform["volume_7d"] - prev["volume_7d"]) / prev["volume_7d"] * 100
                    )
            
            # Format volumes
            volume_millions = round(float(platform["volume_24h"]) / 1_000_000, 2)
            avg_volume_thousands = round(float(platform["avg_trade_size"]) / 1_000, 2)
            
            await self.db.execute(
                insert_query,
                snapshot_timestamp, snapshot_id,
                platform_name, display_order_map.get(platform_name, 99),
                platform["total_markets"], platform["active_markets"],
                platform["resolved_markets_24h"],
                platform["volume_24h"], platform["volume_7d"],
                volume_millions, avg_volume_thousands,
                round(growth_24h_pct, 2), round(growth_7d_pct, 2),
                platform["market_share_pct"],
                platform["trade_count_24h"], platform["avg_trade_size"]
            )
        
        logger.info("Platform comparison aggregated", platforms_count=len(platforms))
        
        return {
            "status": "success",
            "snapshot_id": str(snapshot_id),
            "platforms_count": len(platforms)
        }
    
    async def aggregate_trending_categories(self) -> dict[str, Any]:
        """
        Aggregate trending_categories table.
        
        Identifies top 8 trending categories based on volume growth.
        """
        logger.info("Aggregating trending_categories")
        
        snapshot_id = uuid.uuid4()
        snapshot_timestamp = datetime.now(timezone.utc)
        
        # Get category trends
        query = """
            WITH current_categories AS (
                SELECT 
                    COALESCE(category_name, 'Uncategorized') AS category,
                    COUNT(*) AS market_count,
                    SUM(volume_24h) AS volume_24h,
                    COUNT(*) FILTER (WHERE source = 'polymarket') AS polymarket_count,
                    COUNT(*) FILTER (WHERE source = 'kalshi') AS kalshi_count,
                    COUNT(*) FILTER (WHERE source = 'limitless') AS limitless_count
                FROM predictions_silver.markets
                WHERE is_active = true
                GROUP BY COALESCE(category_name, 'Uncategorized')
            ),
            totals AS (
                SELECT SUM(volume_24h) AS total_volume FROM current_categories
            )
            SELECT 
                cc.category,
                cc.market_count,
                cc.volume_24h,
                ROUND((cc.volume_24h / t.total_volume * 100), 2) AS percentage_of_total,
                cc.polymarket_count,
                cc.kalshi_count,
                cc.limitless_count,
                ROW_NUMBER() OVER (ORDER BY cc.volume_24h DESC) AS rank
            FROM current_categories cc
            CROSS JOIN totals t
            WHERE cc.volume_24h > 0
            ORDER BY cc.volume_24h DESC
            LIMIT 8
        """
        
        categories = await self.db.fetch(query)
        
        if not categories:
            logger.warning("No trending categories found")
            return {"status": "skipped", "reason": "no_data"}
        
        # Get previous snapshot for rank comparison
        prev_query = """
            SELECT category, rank, volume_24h
            FROM predictions_gold.trending_categories
            WHERE snapshot_timestamp <= NOW() - INTERVAL '1 hour'
            ORDER BY snapshot_timestamp DESC
            LIMIT 20
        """
        prev_data = {row["category"]: row for row in await self.db.fetch(prev_query)}
        
        # Insert trending categories
        insert_query = """
            INSERT INTO predictions_gold.trending_categories (
                snapshot_timestamp, snapshot_id, category, rank,
                market_count, volume_24h, volume_change_24h_pct,
                trend_direction, trend_score, percentage_of_total, rank_change,
                polymarket_count, kalshi_count, limitless_count
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
            )
        """
        
        for cat in categories:
            category_name = cat["category"]
            
            # Calculate volume change and rank change
            volume_change_pct = 0.0
            rank_change = 0
            
            if category_name in prev_data:
                prev = prev_data[category_name]
                if prev["volume_24h"] > 0:
                    volume_change_pct = (
                        (cat["volume_24h"] - prev["volume_24h"]) / prev["volume_24h"] * 100
                    )
                rank_change = prev["rank"] - cat["rank"]  # Positive = moved up
            
            # Determine trend
            if volume_change_pct > 10:
                trend_direction = "up"
                trend_score = min(100, int(volume_change_pct))
            elif volume_change_pct < -10:
                trend_direction = "down"
                trend_score = max(0, 50 - int(abs(volume_change_pct)))
            else:
                trend_direction = "stable"
                trend_score = 50
            
            await self.db.execute(
                insert_query,
                snapshot_timestamp, snapshot_id,
                category_name, cat["rank"],
                cat["market_count"], cat["volume_24h"],
                round(volume_change_pct, 2),
                trend_direction, trend_score,
                cat["percentage_of_total"], rank_change,
                cat["polymarket_count"], cat["kalshi_count"], cat["limitless_count"]
            )
        
        logger.info("Trending categories aggregated", categories_count=len(categories))
        
        return {
            "status": "success",
            "snapshot_id": str(snapshot_id),
            "categories_count": len(categories)
        }
    
    # =========================================================================
    # CLEANUP
    # =========================================================================
    
    async def cleanup_old_snapshots(self) -> dict[str, Any]:
        """
        Clean up old snapshot data according to retention policies.
        
        Retention:
        - Most tables: 90 days
        - Activity feed: 30 days
        """
        logger.info("Cleaning up old snapshots")
        
        query = "SELECT predictions_gold.cleanup_old_snapshots()"
        deleted_count = await self.db.fetchval(query)
        
        logger.info("Old snapshots cleaned up", deleted_count=deleted_count)
        
        return {
            "status": "success",
            "deleted_count": deleted_count
        }
