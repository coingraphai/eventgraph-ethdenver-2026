"""
DEFINITIVE TEST: Update Fed Chair prices and verify they persist.
- Update KW to 0.94 and KH to 0.01
- Verify immediately
- Wait 10 seconds, verify again
- Wait 30 seconds, verify again
- Also check for any triggers/rules that could interfere
"""
import asyncio, sys, os, ssl as ssl_module, time
sys.path.insert(0, os.path.dirname(__file__))
from predictions_ingest.config import get_settings

async def main():
    import asyncpg
    settings = get_settings()
    ssl_ctx = ssl_module.create_default_context()
    ssl_ctx.check_hostname = False
    ssl_ctx.verify_mode = ssl_module.CERT_NONE
    db_url = settings.database_url.replace('?sslmode=require', '')
    
    conn = await asyncpg.connect(db_url, ssl=ssl_ctx)
    
    # =========================================================================
    # Step 0: Check for triggers/rules
    # =========================================================================
    triggers = await conn.fetch("""
        SELECT tgname, pg_get_triggerdef(oid) as def
        FROM pg_trigger 
        WHERE tgrelid = 'predictions_silver.markets'::regclass AND NOT tgisinternal
    """)
    print(f"Triggers on markets table: {len(triggers)}")
    for t in triggers:
        print(f"  ⚠️ TRIGGER: {t['tgname']}: {t['def']}")
    
    rules = await conn.fetch("""
        SELECT rulename FROM pg_rules 
        WHERE tablename = 'markets' AND schemaname = 'predictions_silver'
    """)
    print(f"Rules on markets table: {len(rules)}")
    
    # =========================================================================
    # Step 1: Read current prices
    # =========================================================================
    rows = await conn.fetch("""
        SELECT source_market_id, yes_price, no_price, last_updated_at
        FROM predictions_silver.markets
        WHERE source_market_id IN ('KXFEDCHAIRNOM-29-KW', 'KXFEDCHAIRNOM-29-KH')
        ORDER BY source_market_id
    """)
    print(f"\n--- BEFORE UPDATE ---")
    for r in rows:
        print(f"  {r['source_market_id']}: yes={r['yes_price']}, no={r['no_price']}, updated={r['last_updated_at']}")
    
    # =========================================================================
    # Step 2: Update prices
    # =========================================================================
    await conn.execute("""
        UPDATE predictions_silver.markets 
        SET yes_price = 0.01, no_price = 0.99, mid_price = 0.50, last_updated_at = NOW()
        WHERE source_market_id = 'KXFEDCHAIRNOM-29-KH'
    """)
    await conn.execute("""
        UPDATE predictions_silver.markets 
        SET yes_price = 0.94, no_price = 0.06, mid_price = 0.50, last_updated_at = NOW()
        WHERE source_market_id = 'KXFEDCHAIRNOM-29-KW'
    """)
    
    # =========================================================================
    # Step 3: Verify immediately (same connection)
    # =========================================================================
    rows = await conn.fetch("""
        SELECT source_market_id, yes_price, no_price, last_updated_at
        FROM predictions_silver.markets
        WHERE source_market_id IN ('KXFEDCHAIRNOM-29-KW', 'KXFEDCHAIRNOM-29-KH')
        ORDER BY source_market_id
    """)
    print(f"\n--- AFTER UPDATE (same connection) ---")
    for r in rows:
        status = "✅" if (r['source_market_id'] == 'KXFEDCHAIRNOM-29-KW' and float(r['yes_price']) > 0.9) or \
                         (r['source_market_id'] == 'KXFEDCHAIRNOM-29-KH' and float(r['yes_price']) < 0.05) else "❌"
        print(f"  {status} {r['source_market_id']}: yes={r['yes_price']}, no={r['no_price']}")
    
    # =========================================================================
    # Step 4: Verify with NEW connection (to rule out session-level caching)
    # =========================================================================
    conn2 = await asyncpg.connect(db_url, ssl=ssl_ctx)
    rows = await conn2.fetch("""
        SELECT source_market_id, yes_price, no_price, last_updated_at
        FROM predictions_silver.markets
        WHERE source_market_id IN ('KXFEDCHAIRNOM-29-KW', 'KXFEDCHAIRNOM-29-KH')
        ORDER BY source_market_id
    """)
    print(f"\n--- VERIFY (new connection) ---")
    for r in rows:
        status = "✅" if (r['source_market_id'] == 'KXFEDCHAIRNOM-29-KW' and float(r['yes_price']) > 0.9) or \
                         (r['source_market_id'] == 'KXFEDCHAIRNOM-29-KH' and float(r['yes_price']) < 0.05) else "❌"
        print(f"  {status} {r['source_market_id']}: yes={r['yes_price']}, no={r['no_price']}")
    await conn2.close()
    
    # =========================================================================
    # Step 5: Wait 10 seconds, verify with yet another connection
    # =========================================================================
    print(f"\n⏳ Waiting 10 seconds...")
    await asyncio.sleep(10)
    
    conn3 = await asyncpg.connect(db_url, ssl=ssl_ctx)
    rows = await conn3.fetch("""
        SELECT source_market_id, yes_price, no_price, last_updated_at
        FROM predictions_silver.markets
        WHERE source_market_id IN ('KXFEDCHAIRNOM-29-KW', 'KXFEDCHAIRNOM-29-KH')
        ORDER BY source_market_id
    """)
    print(f"\n--- VERIFY AFTER 10s (another new connection) ---")
    for r in rows:
        status = "✅" if (r['source_market_id'] == 'KXFEDCHAIRNOM-29-KW' and float(r['yes_price']) > 0.9) or \
                         (r['source_market_id'] == 'KXFEDCHAIRNOM-29-KH' and float(r['yes_price']) < 0.05) else "❌"
        print(f"  {status} {r['source_market_id']}: yes={r['yes_price']}, no={r['no_price']}, updated={r['last_updated_at']}")
    await conn3.close()
    
    # =========================================================================
    # Step 6: Wait 30 more seconds, final verification
    # =========================================================================
    print(f"\n⏳ Waiting 30 more seconds...")
    await asyncio.sleep(30)
    
    conn4 = await asyncpg.connect(db_url, ssl=ssl_ctx)
    rows = await conn4.fetch("""
        SELECT source_market_id, yes_price, no_price, last_updated_at
        FROM predictions_silver.markets
        WHERE source_market_id IN ('KXFEDCHAIRNOM-29-KW', 'KXFEDCHAIRNOM-29-KH')
        ORDER BY source_market_id
    """)
    print(f"\n--- FINAL VERIFY AFTER 40s (yet another new connection) ---")
    all_ok = True
    for r in rows:
        ok = (r['source_market_id'] == 'KXFEDCHAIRNOM-29-KW' and float(r['yes_price']) > 0.9) or \
             (r['source_market_id'] == 'KXFEDCHAIRNOM-29-KH' and float(r['yes_price']) < 0.05)
        status = "✅" if ok else "❌"
        if not ok:
            all_ok = False
        print(f"  {status} {r['source_market_id']}: yes={r['yes_price']}, no={r['no_price']}, updated={r['last_updated_at']}")
    await conn4.close()
    
    if all_ok:
        print(f"\n🎉 PRICES ARE STABLE! No ghost process is overwriting them.")
    else:
        print(f"\n💀 PRICES REVERTED! Something is still overwriting them even with no scheduler running.")
    
    await conn.close()

asyncio.run(main())
