"""Check if the Fed Chair event now shows Kevin Warsh as top candidate."""
import urllib.request
import json

# Check DB directly
import asyncio
import asyncpg

DB_URL = "postgresql://doadmin:***REDACTED_DB_PASSWORD***@***REDACTED_DB_HOST***:25060/defaultdb?sslmode=require"

async def main():
    conn = await asyncpg.connect(DB_URL)
    rows = await conn.fetch("""
        SELECT source_market_id, title, yes_price, last_updated_at
        FROM predictions_silver.markets
        WHERE source = 'kalshi' AND source_market_id LIKE 'KXFEDCHAIRNOM-29%'
        ORDER BY yes_price DESC
    """)
    print("=== KXFEDCHAIRNOM-29 current prices ===")
    for r in rows:
        name = r['title'].replace("Will Trump next nominate ", "").replace(" as Fed Chair?", "")
        print(f"  {name:<25} yes={r['yes_price']:.2f}  updated={str(r['last_updated_at'])[:19]}")
    await conn.close()

asyncio.run(main())
