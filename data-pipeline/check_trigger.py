"""Check extra_data.last_price for KW and KH to understand trigger behavior."""
import asyncio
import asyncpg
import json

DB_URL = "postgresql://doadmin:***REDACTED_DB_PASSWORD***@***REDACTED_DB_HOST***:25060/defaultdb?sslmode=require"

async def main():
    conn = await asyncpg.connect(DB_URL)
    
    for market_id in ["KXFEDCHAIRNOM-29-KW", "KXFEDCHAIRNOM-29-KH"]:
        row = await conn.fetchrow(
            "SELECT extra_data, yes_price FROM predictions_silver.markets WHERE source_market_id = $1",
            market_id,
        )
        ed = json.loads(row["extra_data"]) if row["extra_data"] else {}
        print(f"\n{market_id}:")
        print(f"  yes_price in DB: {row['yes_price']}")
        print(f"  extra_data.last_price: {ed.get('last_price')}")
        print(f"  extra_data.yes_price: {ed.get('yes_price')}")
        
        # Check what the trigger would do
        lp = ed.get("last_price")
        yp = float(row["yes_price"]) if row["yes_price"] else None
        if yp and yp >= 1.0 and lp is not None and 0 <= float(lp) <= 100:
            print(f"  TRIGGER WOULD FIRE: yes_price={yp} >= 1.0, would set to {float(lp)/100}")
        else:
            print(f"  Trigger would NOT fire (yes_price={yp}, last_price={lp})")
    
    await conn.close()

asyncio.run(main())
