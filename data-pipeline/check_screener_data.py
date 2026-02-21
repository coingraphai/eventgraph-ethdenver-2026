#!/usr/bin/env python3
"""Check what data is available for the screener"""
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
    
    print("=== KALSHI top 5 ===")
    rows = await conn.fetch("""
        SELECT source, source_market_id, source_url, volume_24h, trade_count_24h, 
               unique_traders, spread, liquidity, yes_price, no_price, end_date, volume_total
        FROM predictions_silver.markets 
        WHERE source = 'kalshi' AND is_active = true 
        ORDER BY volume_total DESC NULLS LAST LIMIT 5
    """)
    for r in rows:
        print(f"  {r['source_market_id'][:35]:35s} | url={str(r['source_url'])[:60]} | vol24h={r['volume_24h']} | trades={r['trade_count_24h']} | spread={r['spread']} | liq={r['liquidity']} | yes={r['yes_price']} | no={r['no_price']}")
    
    print("\n=== POLYMARKET top 5 ===")
    rows = await conn.fetch("""
        SELECT source, source_market_id, source_url, volume_24h, trade_count_24h, 
               unique_traders, spread, liquidity, yes_price, no_price, end_date, volume_total
        FROM predictions_silver.markets 
        WHERE source = 'polymarket' AND is_active = true 
        ORDER BY volume_total DESC NULLS LAST LIMIT 5
    """)
    for r in rows:
        print(f"  {r['source_market_id'][:35]:35s} | url={str(r['source_url'])[:60]} | vol24h={r['volume_24h']} | trades={r['trade_count_24h']} | spread={r['spread']} | liq={r['liquidity']} | yes={r['yes_price']} | no={r['no_price']}")
    
    print("\n=== LIMITLESS top 3 ===")
    rows = await conn.fetch("""
        SELECT source, source_market_id, source_url, volume_24h, trade_count_24h, 
               unique_traders, spread, liquidity, yes_price, no_price, end_date, volume_total
        FROM predictions_silver.markets 
        WHERE source = 'limitless' AND is_active = true 
        ORDER BY volume_total DESC NULLS LAST LIMIT 3
    """)
    for r in rows:
        print(f"  {r['source_market_id'][:35]:35s} | url={str(r['source_url'])[:60]} | vol24h={r['volume_24h']} | trades={r['trade_count_24h']} | spread={r['spread']} | liq={r['liquidity']} | yes={r['yes_price']} | no={r['no_price']}")
    
    print("\n=== GOLD CACHE ===")
    cnt = await conn.fetchval('SELECT count(*) FROM predictions_gold.market_detail_cache')
    print(f"  Gold cache rows: {cnt}")
    
    print("\n=== COLUMN COVERAGE (active markets) ===")
    stats = await conn.fetchrow("""
        SELECT 
            count(*) as total,
            count(yes_price) as has_price,
            count(volume_24h) as has_vol24h,
            count(volume_total) as has_vol_total,
            count(trade_count_24h) as has_trades,
            count(unique_traders) as has_traders,
            count(spread) as has_spread,
            count(liquidity) as has_liq,
            count(end_date) as has_end_date,
            count(source_url) as has_source_url,
            count(no_price) as has_no_price
        FROM predictions_silver.markets WHERE is_active = true
    """)
    for col in ['total', 'has_price', 'has_vol24h', 'has_vol_total', 'has_trades', 'has_traders', 'has_spread', 'has_liq', 'has_end_date', 'has_source_url', 'has_no_price']:
        print(f"  {col:20s}: {stats[col]}")
    
    # Coverage by source
    print("\n=== COLUMN COVERAGE BY SOURCE ===")
    rows = await conn.fetch("""
        SELECT source,
            count(*) as total,
            count(yes_price) as has_price,
            count(volume_24h) as has_vol24h,
            count(volume_total) as has_vol_total,
            count(spread) as has_spread,
            count(liquidity) as has_liq,
            count(end_date) as has_end_date,
            count(source_url) as has_url
        FROM predictions_silver.markets WHERE is_active = true
        GROUP BY source
    """)
    for r in rows:
        print(f"  {r['source']:12s} | total={r['total']:5d} | price={r['has_price']:5d} | vol24h={r['has_vol24h']:5d} | volTotal={r['has_vol_total']:5d} | spread={r['has_spread']:5d} | liq={r['has_liq']:5d} | endDate={r['has_end_date']:5d} | url={r['has_url']:5d}")
    
    # Check what Kalshi source_url looks like
    print("\n=== KALSHI SOURCE URL FORMAT ===")
    row = await conn.fetchrow("SELECT source_url FROM predictions_silver.markets WHERE source='kalshi' AND source_url IS NOT NULL LIMIT 1")
    if row:
        print(f"  {row['source_url']}")
    else:
        print("  No Kalshi source_url found")
    
    await conn.close()

asyncio.run(main())
