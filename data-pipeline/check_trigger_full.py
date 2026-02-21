import asyncio, asyncpg, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from predictions_ingest.config import get_settings

async def main():
    settings = get_settings()
    import ssl as ssl_module
    ssl_ctx = ssl_module.create_default_context()
    ssl_ctx.check_hostname = False
    ssl_ctx.verify_mode = ssl_module.CERT_NONE
    db_url = settings.database_url.replace('?sslmode=require', '')
    conn = await asyncpg.connect(db_url, ssl=ssl_ctx)
    
    # Get the trigger function source
    row = await conn.fetchrow("""
        SELECT prosrc FROM pg_proc 
        WHERE proname = 'fix_kalshi_prices'
        AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'predictions_silver')
    """)
    print('=== TRIGGER FUNCTION SOURCE ===')
    print(row['prosrc'])
    
    # Get trigger details
    rows = await conn.fetch("""
        SELECT tgname, tgtype, tgenabled, pg_get_triggerdef(oid) as def
        FROM pg_trigger 
        WHERE tgrelid = 'predictions_silver.markets'::regclass
        AND NOT tgisinternal
    """)
    print()
    print('=== TRIGGERS ===')
    for r in rows:
        print(f"Name: {r['tgname']}")
        print(f"Type (bitfield): {r['tgtype']}")
        print(f"Enabled: {r['tgenabled']}")
        print(f"Definition: {r['def']}")
        print()
    
    # Check current Fed Chair prices and extra_data
    rows = await conn.fetch("""
        SELECT source_market_id, title, yes_price, no_price,
               extra_data->>'last_price' as last_price,
               extra_data->>'yes' as yes_field,
               extra_data->>'price' as price_field,
               last_updated_at
        FROM predictions_silver.markets
        WHERE source_market_id IN ('KXFEDCHAIRNOM-29-KW', 'KXFEDCHAIRNOM-29-KH')
        ORDER BY source_market_id
    """)
    print()
    print('=== FED CHAIR CURRENT STATE ===')
    for r in rows:
        print(f"  {r['source_market_id']}: yes_price={r['yes_price']}, last_price={r['last_price']}, yes={r['yes_field']}, price={r['price_field']}, updated={r['last_updated_at']}")
    
    # Check: what does normalize_market set as yes_price for these?
    # Look at extra_data completely
    rows = await conn.fetch("""
        SELECT source_market_id, extra_data
        FROM predictions_silver.markets
        WHERE source_market_id IN ('KXFEDCHAIRNOM-29-KW', 'KXFEDCHAIRNOM-29-KH')
        ORDER BY source_market_id
    """)
    print()
    print('=== FULL EXTRA_DATA ===')
    import json
    for r in rows:
        print(f"  {r['source_market_id']}:")
        ed = json.loads(r['extra_data']) if r['extra_data'] else {}
        for k, v in sorted(ed.items()):
            print(f"    {k}: {v}")
    
    await conn.close()

asyncio.run(main())
