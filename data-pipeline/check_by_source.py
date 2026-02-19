#!/usr/bin/env python3
"""Check what data is stored for each source (Polymarket, Kalshi, Limitless)."""
import asyncio
import asyncpg
import ssl
from predictions_ingest.config import get_settings

async def check_by_source():
    settings = get_settings()
    
    # SSL context
    ssl_context = ssl.create_default_context()
    ssl_context.check_hostname = False
    ssl_context.verify_mode = ssl.CERT_NONE
    
    conn = await asyncpg.connect(
        host=settings.postgres_host,
        port=settings.postgres_port,
        user=settings.postgres_user,
        password=settings.postgres_password,
        database=settings.postgres_db,
        ssl=ssl_context
    )
    
    print("=" * 80)
    print("DATA BY SOURCE - POLYMARKET, KALSHI, LIMITLESS")
    print("=" * 80)
    print()
    
    # Bronze Layer - API Responses by source
    print("📦 BRONZE LAYER - Raw API Responses")
    print("-" * 80)
    
    sources = ['polymarket', 'kalshi', 'limitless']
    for source in sources:
        try:
            row = await conn.fetchrow(f"""
                SELECT 
                    COUNT(*) as count,
                    MIN(fetched_at) as first,
                    MAX(fetched_at) as last
                FROM predictions_bronze.api_responses_{source}
            """)
            print(f"\n  {source.upper()}:")
            print(f"    Raw API calls: {row['count']:,}")
            print(f"    First fetch: {row['first']}")
            print(f"    Last fetch: {row['last']}")
        except Exception as e:
            print(f"  {source.upper()}: ❌ {e}")
    
    print()
    print()
    
    # Silver Layer - Markets by source
    print("🥈 SILVER LAYER - Normalized Data")
    print("-" * 80)
    
    try:
        rows = await conn.fetch("""
            SELECT 
                source,
                COUNT(*) as total_markets,
                SUM(CASE WHEN is_active THEN 1 ELSE 0 END) as active_markets,
                MAX(last_updated_at) as last_update
            FROM predictions_silver.markets
            GROUP BY source
            ORDER BY total_markets DESC
        """)
        
        print("\n  MARKETS:")
        for row in rows:
            print(f"\n    {row['source'].upper()}:")
            print(f"      Total markets: {row['total_markets']:,}")
            print(f"      Active markets: {row['active_markets']:,}")
            print(f"      Last updated: {row['last_update']}")
    except Exception as e:
        print(f"  MARKETS: ❌ {e}")
    
    # Prices by source
    try:
        rows = await conn.fetch("""
            SELECT 
                m.source,
                COUNT(p.id) as price_count,
                MAX(p.fetched_at) as last_price
            FROM predictions_silver.prices p
            JOIN predictions_silver.markets m ON p.market_id = m.id
            GROUP BY m.source
            ORDER BY price_count DESC
        """)
        
        print("\n  PRICES:")
        for row in rows:
            print(f"\n    {row['source'].upper()}:")
            print(f"      Price records: {row['price_count']:,}")
            print(f"      Last price: {row['last_price']}")
    except Exception as e:
        print(f"  PRICES: ❌ {e}")
    
    # Trades by source
    try:
        rows = await conn.fetch("""
            SELECT 
                m.source,
                COUNT(t.id) as trade_count,
                SUM(t.amount_usd) as total_volume,
                MAX(t.fetched_at) as last_trade
            FROM predictions_silver.trades t
            JOIN predictions_silver.markets m ON t.market_id = m.id
            GROUP BY m.source
            ORDER BY trade_count DESC
        """)
        
        print("\n  TRADES:")
        for row in rows:
            volume = row['total_volume'] or 0
            print(f"\n    {row['source'].upper()}:")
            print(f"      Trade records: {row['trade_count']:,}")
            print(f"      Total volume: ${volume:,.2f}")
            print(f"      Last trade: {row['last_trade']}")
    except Exception as e:
        print(f"  TRADES: ❌ {e}")
    
    print()
    print()
    print("=" * 80)
    print("SUMMARY")
    print("=" * 80)
    
    try:
        row = await conn.fetchrow("""
            SELECT 
                COUNT(*) as total_markets,
                SUM(CASE WHEN is_active THEN 1 ELSE 0 END) as active_markets
            FROM predictions_silver.markets
        """)
        print(f"Total Markets: {row['total_markets']:,} ({row['active_markets']:,} active)")
    except:
        pass
    
    try:
        row = await conn.fetchrow("SELECT COUNT(*) as count FROM predictions_silver.prices")
        print(f"Total Prices: {row['count']:,}")
    except:
        pass
    
    try:
        row = await conn.fetchrow("""
            SELECT COUNT(*) as count, SUM(amount_usd) as volume 
            FROM predictions_silver.trades
        """)
        volume = row['volume'] or 0
        print(f"Total Trades: {row['count']:,} (${volume:,.2f})")
    except:
        pass
    
    print("=" * 80)
    
    await conn.close()

if __name__ == "__main__":
    asyncio.run(check_by_source())
