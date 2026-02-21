"""Check audit log and current state"""
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
    
    # Check audit log
    rows = await conn.fetch("""
        SELECT * FROM predictions_silver.price_audit_log ORDER BY changed_at
    """)
    print(f"AUDIT LOG ({len(rows)} entries):")
    for r in rows:
        print(f"  {r['changed_at']} | {r['source_market_id']} | yes: {r['old_yes_price']} -> {r['new_yes_price']} | QUERY: {r['query_text'][:200]}")
    
    # Current state
    rows = await conn.fetch("""
        SELECT source_market_id, yes_price, no_price, last_updated_at, update_count
        FROM predictions_silver.markets
        WHERE source_market_id IN ('KXFEDCHAIRNOM-29-KW', 'KXFEDCHAIRNOM-29-KH')
        ORDER BY source_market_id
    """)
    print(f"\nCURRENT STATE:")
    for r in rows:
        print(f"  {r['source_market_id']}: yes={r['yes_price']}, no={r['no_price']}, updated={r['last_updated_at']}, count={r['update_count']}")
    
    await conn.close()

asyncio.run(main())
