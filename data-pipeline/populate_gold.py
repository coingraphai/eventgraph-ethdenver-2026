"""
Gold layer population script.
Reads from predictions_silver and writes to predictions_gold tables
to power the backend API endpoints.

Run after each ingestion cycle:
    python populate_gold.py
"""
import asyncio
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(__file__))
from dotenv import load_dotenv
load_dotenv()
import asyncpg

DB_DSN = dict(
    host=os.environ['POSTGRES_HOST'],
    port=int(os.environ.get('POSTGRES_PORT', 5432)),
    database=os.environ.get('POSTGRES_DB', 'defaultdb'),
    user=os.environ.get('POSTGRES_USER', 'doadmin'),
    password=os.environ['POSTGRES_PASSWORD'],
    ssl='require',
)

async def populate_market_detail_cache(conn):
    """Copy all markets from silver to gold market_detail_cache."""
    result = await conn.execute("""
        INSERT INTO predictions_gold.market_detail_cache (
            market_id, source, source_market_id, slug,
            title, description, question, category, tags, image_url,
            status, is_active, is_resolved, resolution_value, outcomes, outcome_count,
            yes_price, no_price, last_price, mid_price,
            volume_24h, volume_7d, volume_30d, volume_total,
            liquidity, trade_count_24h,
            created_at, end_date, cached_at
        )
        SELECT
            COALESCE(id, gen_random_uuid()) AS market_id,
            source,
            source_market_id,
            slug,
            COALESCE(title, question, 'Unknown') AS title,
            description,
            question,
            category_name AS category,
            COALESCE(tags, ARRAY[]::text[]) AS tags,
            image_url,
            CASE
                WHEN is_resolved THEN 'resolved'
                WHEN is_active THEN 'active'
                ELSE 'closed'
            END AS status,
            is_active,
            is_resolved,
            CAST(resolution_value AS VARCHAR(100)),
            '[]'::jsonb AS outcomes,
            COALESCE(outcome_count, 2) AS outcome_count,
            yes_price,
            no_price,
            yes_price AS last_price,
            CASE
                WHEN yes_price IS NOT NULL AND no_price IS NOT NULL
                THEN (yes_price + no_price) / 2
                ELSE yes_price
            END AS mid_price,
            COALESCE(volume_24h, 0) AS volume_24h,
            COALESCE(volume_7d, 0) AS volume_7d,
            COALESCE(volume_30d, 0) AS volume_30d,
            COALESCE(volume_total, 0) AS volume_total,
            COALESCE(liquidity, 0) AS liquidity,
            COALESCE(trade_count_24h, 0) AS trade_count_24h,
            created_at_source AS created_at,
            end_date,
            NOW() AS cached_at
        FROM predictions_silver.markets
        ON CONFLICT (source, source_market_id) DO UPDATE SET
            title           = EXCLUDED.title,
            description     = EXCLUDED.description,
            question        = EXCLUDED.question,
            category        = EXCLUDED.category,
            status          = EXCLUDED.status,
            is_active       = EXCLUDED.is_active,
            is_resolved     = EXCLUDED.is_resolved,
            yes_price       = EXCLUDED.yes_price,
            no_price        = EXCLUDED.no_price,
            last_price      = EXCLUDED.last_price,
            mid_price       = EXCLUDED.mid_price,
            volume_24h      = EXCLUDED.volume_24h,
            volume_7d       = EXCLUDED.volume_7d,
            volume_30d      = EXCLUDED.volume_30d,
            volume_total    = EXCLUDED.volume_total,
            liquidity       = EXCLUDED.liquidity,
            trade_count_24h = EXCLUDED.trade_count_24h,
            end_date        = EXCLUDED.end_date,
            cached_at       = NOW()
    """)
    count = int(result.split()[-1])
    print(f"  market_detail_cache: {count} rows upserted")
    return count


async def populate_market_price_history(conn):
    """
    Build hourly price history from predictions_silver.prices snapshots.
    Aggregates into OHLCV candles per market per hour.
    """
    result = await conn.execute("""
        INSERT INTO predictions_gold.market_price_history (
            market_id, source, source_market_id,
            period_start, period_end, granularity,
            open_price, high_price, low_price, close_price,
            volume, trade_count
        )
        SELECT
            COALESCE(m.id, gen_random_uuid()) AS market_id,
            p.source,
            p.source_market_id,
            date_trunc('hour', p.snapshot_at) AS period_start,
            date_trunc('hour', p.snapshot_at) + INTERVAL '1 hour' AS period_end,
            '1h' AS granularity,
            -- OHLCV: use first/last/min/max within the hour
            FIRST_VALUE(p.yes_price) OVER (
                PARTITION BY p.source_market_id, date_trunc('hour', p.snapshot_at)
                ORDER BY p.snapshot_at
            ) AS open_price,
            MAX(p.yes_price) OVER (
                PARTITION BY p.source_market_id, date_trunc('hour', p.snapshot_at)
            ) AS high_price,
            MIN(p.yes_price) OVER (
                PARTITION BY p.source_market_id, date_trunc('hour', p.snapshot_at)
            ) AS low_price,
            LAST_VALUE(p.yes_price) OVER (
                PARTITION BY p.source_market_id, date_trunc('hour', p.snapshot_at)
                ORDER BY p.snapshot_at
                ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
            ) AS close_price,
            COALESCE(SUM(p.volume_1h) OVER (
                PARTITION BY p.source_market_id, date_trunc('hour', p.snapshot_at)
            ), 0) AS volume,
            COUNT(*) OVER (
                PARTITION BY p.source_market_id, date_trunc('hour', p.snapshot_at)
            ) AS trade_count
        FROM predictions_silver.prices p
        LEFT JOIN predictions_silver.markets m
            ON m.source_market_id = p.source_market_id AND m.source = p.source
        WHERE p.yes_price IS NOT NULL
        ON CONFLICT (source_market_id, period_start, granularity) DO UPDATE SET
            close_price = EXCLUDED.close_price,
            high_price  = GREATEST(market_price_history.high_price, EXCLUDED.high_price),
            low_price   = LEAST(market_price_history.low_price, EXCLUDED.low_price),
            volume      = EXCLUDED.volume,
            trade_count = EXCLUDED.trade_count
    """)
    count = int(result.split()[-1])
    print(f"  market_price_history: {count} rows upserted")
    return count


async def populate_market_price_history_simple(conn):
    """
    Simpler version: insert each price snapshot as its own 1h candle.
    Good starting point when data is sparse.
    """
    result = await conn.execute("""
        INSERT INTO predictions_gold.market_price_history (
            market_id, source, source_market_id,
            period_start, period_end, granularity,
            open_price, high_price, low_price, close_price,
            volume, trade_count
        )
        SELECT
            COALESCE(m.id, gen_random_uuid()),
            p.source,
            p.source_market_id,
            date_trunc('hour', p.snapshot_at),
            date_trunc('hour', p.snapshot_at) + INTERVAL '1 hour',
            '1h',
            p.yes_price, p.yes_price, p.yes_price, p.yes_price,
            COALESCE(p.volume_1h, 0),
            COALESCE(p.trade_count_1h, 0)
        FROM predictions_silver.prices p
        LEFT JOIN predictions_silver.markets m
            ON m.source_market_id = p.source_market_id AND m.source = p.source
        WHERE p.yes_price IS NOT NULL
        ON CONFLICT (source_market_id, period_start, granularity) DO UPDATE SET
            close_price = EXCLUDED.close_price,
            volume      = EXCLUDED.volume + market_price_history.volume,
            trade_count = EXCLUDED.trade_count + market_price_history.trade_count
    """)
    count = int(result.split()[-1])
    print(f"  market_price_history (simple): {count} rows upserted")
    return count


async def populate_market_metrics_summary(conn):
    """Aggregate platform stats from silver into gold summary table."""
    result = await conn.execute("""
        INSERT INTO predictions_gold.market_metrics_summary (
            snapshot_id, snapshot_timestamp,
            total_markets, total_open_markets,
            combined_volume_24h, combined_volume_7d, avg_volume_per_market,
            polymarket_open_markets, polymarket_volume_24h, polymarket_market_share_pct,
            kalshi_open_markets, kalshi_volume_24h, kalshi_market_share_pct,
            limitless_open_markets, limitless_volume_24h, limitless_market_share_pct,
            trend_direction, change_pct_24h, change_pct_7d
        )
        SELECT
            gen_random_uuid(),
            NOW(),
            SUM(cnt) AS total_markets,
            SUM(active_cnt) AS total_open_markets,
            SUM(vol24) AS combined_volume_24h,
            SUM(vol7) AS combined_volume_7d,
            CASE WHEN SUM(cnt) > 0 THEN SUM(vol24)/NULLIF(SUM(cnt),0) ELSE 0 END AS avg_volume_per_market,
            MAX(CASE WHEN source='polymarket' THEN active_cnt ELSE 0 END),
            MAX(CASE WHEN source='polymarket' THEN vol24 ELSE 0 END),
            CASE WHEN SUM(vol24)>0 THEN
                MAX(CASE WHEN source='polymarket' THEN vol24 ELSE 0 END)*100/NULLIF(SUM(vol24),0)
            ELSE 0 END,
            MAX(CASE WHEN source='kalshi' THEN active_cnt ELSE 0 END),
            MAX(CASE WHEN source='kalshi' THEN vol24 ELSE 0 END),
            CASE WHEN SUM(vol24)>0 THEN
                MAX(CASE WHEN source='kalshi' THEN vol24 ELSE 0 END)*100/NULLIF(SUM(vol24),0)
            ELSE 0 END,
            MAX(CASE WHEN source='limitless' THEN active_cnt ELSE 0 END),
            MAX(CASE WHEN source='limitless' THEN vol24 ELSE 0 END),
            CASE WHEN SUM(vol24)>0 THEN
                MAX(CASE WHEN source='limitless' THEN vol24 ELSE 0 END)*100/NULLIF(SUM(vol24),0)
            ELSE 0 END,
            'stable', 0, 0
        FROM (
            SELECT
                source,
                COUNT(*) AS cnt,
                COUNT(*) FILTER (WHERE is_active) AS active_cnt,
                COALESCE(SUM(volume_24h), 0) AS vol24,
                COALESCE(SUM(volume_7d), 0) AS vol7
            FROM predictions_silver.markets
            GROUP BY source
        ) s
    """)
    print(f"  market_metrics_summary: 1 snapshot inserted")


async def populate_top_markets_snapshot(conn):
    """Top 10 markets by volume across all platforms (rank check ≤ 10)."""
    result = await conn.execute("""
        INSERT INTO predictions_gold.top_markets_snapshot (
            snapshot_timestamp, snapshot_id, market_id, rank,
            title, title_short, platform, volume_total_usd, volume_24h_usd, volume_millions, category
        )
        SELECT
            NOW(),
            gen_random_uuid(),
            COALESCE(id, gen_random_uuid()),
            ROW_NUMBER() OVER (ORDER BY COALESCE(volume_total, volume_24h, 0) DESC),
            COALESCE(title, question, 'Unknown'),
            LEFT(COALESCE(title, question, 'Unknown'), 50),
            source,
            COALESCE(volume_total, 0),
            COALESCE(volume_24h, 0),
            COALESCE(volume_total, 0) / 1000000.0,
            category_name
        FROM predictions_silver.markets
        WHERE is_active = true
        ORDER BY COALESCE(volume_total, volume_24h, 0) DESC
        LIMIT 10
    """)
    count = int(result.split()[-1])
    print(f"  top_markets_snapshot: {count} rows inserted")


async def populate_category_distribution(conn):
    """Category breakdown across platforms."""
    result = await conn.execute("""
        INSERT INTO predictions_gold.category_distribution (
            snapshot_timestamp, snapshot_id, category, display_order,
            market_count, percentage,
            polymarket_count, kalshi_count, limitless_count,
            total_volume_24h, avg_volume_per_market
        )
        SELECT
            NOW(),
            gen_random_uuid(),
            COALESCE(category_name, 'Other') AS category,
            ROW_NUMBER() OVER (ORDER BY COUNT(*) DESC),
            COUNT(*) AS market_count,
            COUNT(*) * 100.0 / NULLIF(SUM(COUNT(*)) OVER (), 0) AS percentage,
            COUNT(*) FILTER (WHERE source = 'polymarket') AS polymarket_count,
            COUNT(*) FILTER (WHERE source = 'kalshi') AS kalshi_count,
            COUNT(*) FILTER (WHERE source = 'limitless') AS limitless_count,
            COALESCE(SUM(volume_24h), 0) AS total_volume_24h,
            COALESCE(AVG(volume_24h), 0) AS avg_volume_per_market
        FROM predictions_silver.markets
        WHERE is_active = true
        GROUP BY category_name
        ORDER BY market_count DESC
        LIMIT 20
    """)
    count = int(result.split()[-1])
    print(f"  category_distribution: {count} rows inserted")


async def populate_market_trade_activity(conn):
    """Aggregate silver.trades per market into gold trade activity windows."""
    result = await conn.execute("""
        INSERT INTO predictions_gold.market_trade_activity (
            snapshot_timestamp, market_id, source, source_market_id,
            window_start, window_end, window_hours,
            total_trades, buy_trades, sell_trades,
            total_volume, buy_volume, sell_volume, avg_trade_size, max_trade_size,
            unique_traders,
            recent_trades
        )
        SELECT
            NOW() AS snapshot_timestamp,
            COALESCE(m.id, gen_random_uuid()) AS market_id,
            t.source,
            t.source_market_id,
            NOW() - INTERVAL '24 hours' AS window_start,
            NOW() AS window_end,
            24 AS window_hours,
            COUNT(*) AS total_trades,
            COUNT(*) FILTER (WHERE t.side = 'buy') AS buy_trades,
            COUNT(*) FILTER (WHERE t.side = 'sell') AS sell_trades,
            COALESCE(SUM(t.total_value), 0) AS total_volume,
            COALESCE(SUM(t.total_value) FILTER (WHERE t.side = 'buy'), 0) AS buy_volume,
            COALESCE(SUM(t.total_value) FILTER (WHERE t.side = 'sell'), 0) AS sell_volume,
            COALESCE(AVG(t.total_value), 0) AS avg_trade_size,
            COALESCE(MAX(t.total_value), 0) AS max_trade_size,
            COUNT(DISTINCT COALESCE(t.maker_address, t.taker_address)) AS unique_traders,
            '[]'::jsonb AS recent_trades
        FROM predictions_silver.trades t
        LEFT JOIN predictions_silver.markets m
            ON m.source_market_id = t.source_market_id AND m.source = t.source
        WHERE t.traded_at >= NOW() - INTERVAL '24 hours'
        GROUP BY t.source, t.source_market_id, m.id
        ON CONFLICT (source_market_id, window_hours, snapshot_timestamp) DO NOTHING
    """)
    count = int(result.split()[-1])
    print(f"  market_trade_activity: {count} market aggregates inserted")


async def main():
    print("=== Populating Gold Layer from Silver Data ===")
    print(f"Started at: {datetime.now(timezone.utc).isoformat()}")
    conn = await asyncpg.connect(**DB_DSN)

    try:
        print("\n[1] Populating market_detail_cache...")
        await populate_market_detail_cache(conn)

        print("\n[2] Populating market_price_history...")
        await populate_market_price_history_simple(conn)

        print("\n[3] Populating market_metrics_summary...")
        await populate_market_metrics_summary(conn)

        print("\n[4] Populating top_markets_snapshot...")
        await populate_top_markets_snapshot(conn)

        print("\n[5] Populating category_distribution...")
        await populate_category_distribution(conn)

        print("\n[6] Populating market_trade_activity...")
        await populate_market_trade_activity(conn)

        print(f"\n✅ Gold layer populated successfully at {datetime.now(timezone.utc).isoformat()}")

    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback; traceback.print_exc()
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
