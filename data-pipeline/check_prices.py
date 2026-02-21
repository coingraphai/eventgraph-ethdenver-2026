"""Quick check Fed Chair prices in DB"""
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
    
    rows = await conn.fetch("""
        SELECT source_market_id, yes_price, no_price, last_updated_at
        FROM predictions_silver.markets
        WHERE source_market_id IN ('KXFEDCHAIRNOM-29-KW', 'KXFEDCHAIRNOM-29-KH')
        ORDER BY source_market_id
    """)
    for r in rows:
        print(f"{r['source_market_id']}: yes={r['yes_price']}, no={r['no_price']}, updated={r['last_updated_at']}")
    
    # Also check triggers
    triggers = await conn.fetch("""
        SELECT tgname FROM pg_trigger 
        WHERE tgrelid = 'predictions_silver.markets'::regclass AND NOT tgisinternal
    """)
    print(f"\nTriggers on markets: {[t['tgname'] for t in triggers]}")
    
    await conn.close()

asyncio.run(main())
