#!/usr/bin/env python3
"""Check gold cache content"""
import asyncio, ssl, sys
sys.path.insert(0, '.')
from predictions_ingest.config import get_settings

async def main():
    import asyncpg
    st = get_settings()
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    conn = await asyncpg.connect(st.database_url.replace('?sslmode=require',''), ssl=ctx)
    
    # Check gold cache schema
    cols = await conn.fetch("""
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_schema='predictions_gold' AND table_name='market_detail_cache'
        ORDER BY ordinal_position
    """)
    print("=== GOLD CACHE COLUMNS ===")
    for c in cols:
        print(f"  {c['column_name']:35s} {c['data_type']}")
    
    # Check what's populated
    print("\n=== GOLD CACHE FIELD COVERAGE ===")
    stats = await conn.fetchrow("""
        SELECT count(*) as total,
            count(price_change_24h) as has_price_change,
            count(price_change_pct_24h) as has_price_change_pct,
            count(volume_change_pct_24h) as has_vol_change,
            count(trade_count_24h) as has_trades,
            count(unique_traders_24h) as has_traders,
            count(volume_24h) as has_vol24,
            count(yes_price) as has_yes
        FROM predictions_gold.market_detail_cache
    """)
    for col in stats.keys():
        print(f"  {col:30s}: {stats[col]}")
    
    # Sample gold cache row
    print("\n=== SAMPLE GOLD CACHE ROWS ===")
    rows = await conn.fetch("""
        SELECT * FROM predictions_gold.market_detail_cache LIMIT 3
    """)
    for r in rows:
        print(f"  {dict(r)}")
    
    await conn.close()

asyncio.run(main())
