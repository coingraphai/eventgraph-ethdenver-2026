"""Direct atomic test: write price and immediately read it back"""
import asyncio, sys, os, ssl as ssl_module
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
    
    mid = 'KXFEDCHAIRNOM-29-KW'
    
    # Step 1: Read current
    row = await conn.fetchrow(
        "SELECT yes_price, no_price, last_updated_at FROM predictions_silver.markets WHERE source_market_id = $1",
        mid
    )
    print(f"BEFORE: yes={row['yes_price']}, no={row['no_price']}, updated={row['last_updated_at']}")
    
    # Step 2: Update to correct value
    result = await conn.execute(
        "UPDATE predictions_silver.markets SET yes_price = 0.94, no_price = 0.06, last_updated_at = NOW() WHERE source_market_id = $1",
        mid
    )
    print(f"UPDATE result: {result}")
    
    # Step 3: Read back immediately
    row = await conn.fetchrow(
        "SELECT yes_price, no_price, last_updated_at FROM predictions_silver.markets WHERE source_market_id = $1",
        mid
    )
    print(f"AFTER:  yes={row['yes_price']}, no={row['no_price']}, updated={row['last_updated_at']}")
    
    # Step 4: Wait 2 seconds, read again
    await asyncio.sleep(2)
    row = await conn.fetchrow(
        "SELECT yes_price, no_price, last_updated_at FROM predictions_silver.markets WHERE source_market_id = $1",
        mid
    )
    print(f"AFTER 2s: yes={row['yes_price']}, no={row['no_price']}, updated={row['last_updated_at']}")

    # Step 5: Check for DB replicas or standby nodes
    try:
        is_recovery = await conn.fetchval("SELECT pg_is_in_recovery()")
        print(f"\nDB is in recovery (standby): {is_recovery}")
    except:
        pass
    
    # Step 6: Check if there are any triggers we missed
    triggers = await conn.fetch("""
        SELECT tgname, pg_get_triggerdef(oid) as def
        FROM pg_trigger 
        WHERE tgrelid = 'predictions_silver.markets'::regclass AND NOT tgisinternal
    """)
    print(f"Triggers: {[t['tgname'] for t in triggers]}")
    for t in triggers:
        print(f"  {t['def']}")
    
    # Step 7: Check if there are any rules
    rules = await conn.fetch("""
        SELECT rulename, definition FROM pg_rules 
        WHERE tablename = 'markets' AND schemaname = 'predictions_silver'
    """)
    print(f"Rules: {[r['rulename'] for r in rules]}")
    
    # Step 8: Is 'markets' actually a view?
    obj_type = await conn.fetchval("""
        SELECT CASE relkind 
            WHEN 'r' THEN 'table'
            WHEN 'v' THEN 'view'
            WHEN 'm' THEN 'materialized view'
            WHEN 'p' THEN 'partitioned table'
            ELSE relkind::text
        END
        FROM pg_class WHERE relname = 'markets' 
        AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'predictions_silver')
    """)
    print(f"Object type: {obj_type}")
    
    await conn.close()

asyncio.run(main())
