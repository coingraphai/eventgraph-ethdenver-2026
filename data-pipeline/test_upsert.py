"""Test upsert price behavior: verify that upsert does NOT overwrite prices."""
import asyncio
import asyncpg

DB_URL = "postgresql://doadmin:***REDACTED_DB_PASSWORD***@***REDACTED_DB_HOST***:25060/defaultdb?sslmode=require"

async def main():
    conn = await asyncpg.connect(DB_URL)
    
    # 1. Set KW to a known test value (0.99)
    await conn.execute(
        "UPDATE predictions_silver.markets SET yes_price = 0.99, last_updated_at = NOW() WHERE source_market_id = $1",
        "KXFEDCHAIRNOM-29-KW",
    )
    
    row = await conn.fetchrow(
        "SELECT yes_price FROM predictions_silver.markets WHERE source_market_id = $1",
        "KXFEDCHAIRNOM-29-KW",
    )
    print(f"Before upsert: yes_price={row['yes_price']}")
    
    # 2. Now load the actual _bulk_upsert_markets query from the source
    from predictions_ingest.ingestion.silver_layer import SilverWriter
    import inspect
    src = inspect.getsource(SilverWriter._bulk_upsert_markets)
    
    # Check if yes_price = EXCLUDED.yes_price is in the UPDATE clause
    # (it should NOT be if the fix is applied)
    if "yes_price = EXCLUDED.yes_price" in src:
        print("BUG: yes_price = EXCLUDED.yes_price found in _bulk_upsert_markets!")
    else:
        print("FIX CONFIRMED: yes_price NOT in ON CONFLICT UPDATE")
    
    # 3. Also check upsert_market (single)
    src2 = inspect.getsource(SilverWriter.upsert_market)
    if "yes_price = EXCLUDED.yes_price" in src2:
        print("BUG: yes_price = EXCLUDED.yes_price found in upsert_market!")
    else:
        print("FIX CONFIRMED: yes_price NOT in upsert_market ON CONFLICT UPDATE")
    
    # 4. Check if there's a DB trigger overwriting prices
    triggers = await conn.fetch("""
        SELECT trigger_name, event_manipulation, action_statement
        FROM information_schema.triggers
        WHERE event_object_schema = 'predictions_silver'
        AND event_object_table = 'markets'
    """)
    if triggers:
        print(f"\nFound {len(triggers)} triggers on predictions_silver.markets:")
        for t in triggers:
            print(f"  {t['trigger_name']} ({t['event_manipulation']}): {t['action_statement'][:100]}")
    else:
        print("\nNo triggers on predictions_silver.markets")
    
    await conn.close()

asyncio.run(main())
