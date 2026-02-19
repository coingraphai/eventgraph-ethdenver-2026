#!/usr/bin/env python3
"""
Quick database check to verify data ingestion.
Shows summary of data in Bronze, Silver, and Gold layers.
"""
import asyncio
import asyncpg
import ssl
from predictions_ingest.config import get_settings

async def check_database():
    settings = get_settings()
    
    # SSL context for DigitalOcean
    ssl_context = ssl.create_default_context()
    ssl_context.check_hostname = False
    ssl_context.verify_mode = ssl.CERT_NONE
    
    # Connect to database
    conn = await asyncpg.connect(
        host=settings.postgres_host,
        port=settings.postgres_port,
        user=settings.postgres_user,
        password=settings.postgres_password,
        database=settings.postgres_db,
        ssl=ssl_context
    )
    
    print("=" * 70)
    print("DATABASE STATUS CHECK")
    print("=" * 70)
    print(f"Database: {settings.postgres_host}/{settings.postgres_db}")
    print()
    
    # Bronze Layer
    print("📦 BRONZE LAYER (Raw Data)")
    print("-" * 70)
    try:
        row = await conn.fetchrow("""
            SELECT 
                COUNT(*) as total_records,
                COUNT(DISTINCT source) as sources,
                MIN(fetched_at) as first_ingest,
                MAX(fetched_at) as last_ingest
            FROM predictions_bronze.api_responses_polymarket
        """)
        print(f"  Polymarket Records: {row['total_records']:,}")
        print(f"  First Ingest: {row['first_ingest']}")
        print(f"  Last Ingest: {row['last_ingest']}")
    except Exception as e:
        print(f"  ❌ Error: {e}")
    
    print()
    
    # Silver Layer - Markets
    print("🥈 SILVER LAYER (Normalized)")
    print("-" * 70)
    try:
        row = await conn.fetchrow("""
            SELECT 
                COUNT(*) as total_markets,
                COUNT(DISTINCT source) as sources,
                SUM(CASE WHEN is_active THEN 1 ELSE 0 END) as active_markets,
                MIN(created_at) as oldest,
                MAX(updated_at) as latest_update
            FROM predictions_silver.markets
        """)
        print(f"  Total Markets: {row['total_markets']:,}")
        print(f"  Active Markets: {row['active_markets']:,}")
        print(f"  Sources: {row['sources']}")
        print(f"  Latest Update: {row['latest_update']}")
        
        # By source
        rows = await conn.fetch("""
            SELECT 
                source, 
                COUNT(*) as markets,
                SUM(CASE WHEN is_active THEN 1 ELSE 0 END) as active
            FROM predictions_silver.markets
            GROUP BY source
            ORDER BY markets DESC
        """)
        print("\n  By Source:")
        for r in rows:
            print(f"    {r['source']}: {r['markets']:,} markets ({r['active']:,} active)")
    except Exception as e:
        print(f"  ❌ Error: {e}")
    
    print()
    
    # Silver Layer - Prices
    try:
        row = await conn.fetchrow("""
            SELECT 
                COUNT(*) as total_prices,
                MIN(timestamp) as first_price,
                MAX(timestamp) as last_price
            FROM predictions_silver.prices
        """)
        print(f"  Total Prices: {row['total_prices']:,}")
        print(f"  Latest Price: {row['last_price']}")
    except Exception as e:
        print(f"  ❌ Price Error: {e}")
    
    print()
    
    # Silver Layer - Trades
    try:
        row = await conn.fetchrow("""
            SELECT 
                COUNT(*) as total_trades,
                SUM(size_usd) as total_volume,
                MIN(timestamp) as first_trade,
                MAX(timestamp) as last_trade
            FROM predictions_silver.trades
        """)
        volume = row['total_volume'] or 0
        print(f"  Total Trades: {row['total_trades']:,}")
        print(f"  Total Volume: ${volume:,.2f}")
        print(f"  Latest Trade: {row['last_trade']}")
    except Exception as e:
        print(f"  ❌ Trade Error: {e}")
    
    print()
    
    # Gold Layer
    print("🥇 GOLD LAYER (Analytics)")
    print("-" * 70)
    try:
        # Check if views exist
        views = await conn.fetch("""
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'predictions_gold'
            AND table_type = 'VIEW'
            ORDER BY table_name
        """)
        print(f"  Views: {len(views)}")
        for v in views[:10]:  # Show first 10
            print(f"    - {v['table_name']}")
    except Exception as e:
        print(f"  ❌ Error: {e}")
    
    print()
    print("=" * 70)
    print("✅ Database check complete!")
    print("=" * 70)
    
    await conn.close()

if __name__ == "__main__":
    asyncio.run(check_database())
