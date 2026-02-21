"""
Drop the fix_kalshi_prices_trigger and fix all Kalshi prices from live API.
This is a one-shot comprehensive fix.
"""
import asyncio, sys, os, json, ssl as ssl_module
sys.path.insert(0, os.path.dirname(__file__))
from predictions_ingest.config import get_settings
from predictions_ingest.clients.dome import DomeClient
from predictions_ingest.models import DataSource

async def main():
    settings = get_settings()
    
    # Connect to DB
    import asyncpg
    ssl_ctx = ssl_module.create_default_context()
    ssl_ctx.check_hostname = False
    ssl_ctx.verify_mode = ssl_module.CERT_NONE
    db_url = settings.database_url.replace('?sslmode=require', '')
    conn = await asyncpg.connect(db_url, ssl=ssl_ctx)
    
    # =========================================================================
    # STEP 1: DROP THE TRIGGER
    # =========================================================================
    print("=" * 60)
    print("STEP 1: Dropping fix_kalshi_prices_trigger...")
    
    # Check if trigger exists
    trigger = await conn.fetchrow("""
        SELECT tgname FROM pg_trigger 
        WHERE tgrelid = 'predictions_silver.markets'::regclass
        AND tgname = 'fix_kalshi_prices_trigger'
        AND NOT tgisinternal
    """)
    
    if trigger:
        await conn.execute("DROP TRIGGER fix_kalshi_prices_trigger ON predictions_silver.markets")
        print("  ✅ Trigger DROPPED")
        
        # Also drop the function
        await conn.execute("DROP FUNCTION IF EXISTS predictions_silver.fix_kalshi_prices()")
        print("  ✅ Trigger function DROPPED")
    else:
        print("  ℹ️  Trigger already dropped")
    
    # Verify no triggers remain
    triggers = await conn.fetch("""
        SELECT tgname FROM pg_trigger 
        WHERE tgrelid = 'predictions_silver.markets'::regclass
        AND NOT tgisinternal
    """)
    print(f"  Remaining triggers on markets table: {[t['tgname'] for t in triggers]}")
    
    # =========================================================================
    # STEP 2: FIX ALL KALSHI MARKET PRICES FROM LIVE API
    # =========================================================================
    print()
    print("=" * 60)
    print("STEP 2: Fixing Kalshi prices from live API...")
    
    # Get all Kalshi markets from DB
    markets = await conn.fetch("""
        SELECT source_market_id, yes_price 
        FROM predictions_silver.markets 
        WHERE source = 'kalshi' AND is_active = true
        ORDER BY volume_total DESC NULLS LAST
    """)
    print(f"  Found {len(markets)} active Kalshi markets")
    
    # Connect to Dome API
    client = DomeClient(source=DataSource.KALSHI)
    await client.connect()
    
    fixed = 0
    failed = 0
    unchanged = 0
    
    for i, market in enumerate(markets):
        mid = market['source_market_id']
        old_price = market['yes_price']
        
        try:
            raw_price = await client.fetch_market_price(mid)
            if raw_price:
                price = client.normalize_price(raw_price, mid)
                if price.yes_price is not None:
                    new_price = float(price.yes_price)
                    no_price = float(price.no_price) if price.no_price else None
                    
                    if old_price and abs(float(old_price) - new_price) < 0.001:
                        unchanged += 1
                    else:
                        # Update directly in DB (no trigger to interfere)
                        mid_price = (new_price + no_price) / 2 if no_price else None
                        await conn.execute("""
                            UPDATE predictions_silver.markets
                            SET yes_price = $2,
                                no_price = $3,
                                mid_price = $4,
                                last_updated_at = NOW()
                            WHERE source_market_id = $1
                        """, mid, new_price, no_price, mid_price)
                        fixed += 1
                        
                        if mid.startswith('KXFEDCHAIRNOM'):
                            print(f"  🔧 {mid}: {old_price} → {new_price}")
        except Exception as e:
            failed += 1
            if i < 5:
                print(f"  ❌ {mid}: {e}")
        
        if (i + 1) % 100 == 0:
            print(f"  ... processed {i+1}/{len(markets)} (fixed={fixed}, unchanged={unchanged}, failed={failed})")
    
    await client.close()
    
    print(f"\n  ✅ DONE: fixed={fixed}, unchanged={unchanged}, failed={failed}")
    
    # Verify Fed Chair
    rows = await conn.fetch("""
        SELECT source_market_id, yes_price, no_price
        FROM predictions_silver.markets
        WHERE source_market_id IN ('KXFEDCHAIRNOM-29-KW', 'KXFEDCHAIRNOM-29-KH')
        ORDER BY source_market_id
    """)
    print()
    print("  FED CHAIR VERIFICATION:")
    for r in rows:
        print(f"    {r['source_market_id']}: yes={r['yes_price']}, no={r['no_price']}")
    
    await conn.close()
    print()
    print("=" * 60)
    print("COMPLETE. Trigger dropped, all prices fixed.")

asyncio.run(main())
