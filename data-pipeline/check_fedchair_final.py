"""Quick Fed Chair price check"""
import asyncio, sys, os, ssl as ssl_module
sys.path.insert(0, os.path.dirname(__file__))
from predictions_ingest.config import get_settings

async def main():
    import asyncpg
    s = get_settings()
    ctx = ssl_module.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl_module.CERT_NONE
    conn = await asyncpg.connect(s.database_url.replace('?sslmode=require',''), ssl=ctx)
    rows = await conn.fetch("""
        SELECT source_market_id, yes_price, no_price, last_updated_at
        FROM predictions_silver.markets
        WHERE source_market_id LIKE 'KXFEDCHAIRNOM-29-%'
        ORDER BY yes_price DESC
    """)
    print("FED CHAIR PRICES AFTER DELTA:")
    for r in rows:
        print(f"  {r['source_market_id']:30s} yes={r['yes_price']}  no={r['no_price']}  updated={r['last_updated_at']}")
    await conn.close()

asyncio.run(main())
