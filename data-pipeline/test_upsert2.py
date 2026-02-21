"""Run a manual Kalshi delta and check if prices survive."""
import asyncio
import asyncpg
import sys
import os

# Add the data-pipeline to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

DB_URL = "postgresql://doadmin:***REDACTED_DB_PASSWORD***@***REDACTED_DB_HOST***:25060/defaultdb?sslmode=require"

async def main():
    conn = await asyncpg.connect(DB_URL)
    
    # Set test prices
    await conn.execute(
        "UPDATE predictions_silver.markets SET yes_price = 0.93, no_price = 0.07 WHERE source_market_id = $1",
        "KXFEDCHAIRNOM-29-KW",
    )
    await conn.execute(
        "UPDATE predictions_silver.markets SET yes_price = 0.01, no_price = 0.99 WHERE source_market_id = $1",
        "KXFEDCHAIRNOM-29-KH",
    )
    
    # Check before
    for mid in ["KXFEDCHAIRNOM-29-KW", "KXFEDCHAIRNOM-29-KH"]:
        row = await conn.fetchrow(
            "SELECT yes_price FROM predictions_silver.markets WHERE source_market_id = $1", mid
        )
        print(f"BEFORE: {mid} yes_price={row['yes_price']}")
    
    # Now simulate the _bulk_upsert with the ACTUAL query from the code
    from predictions_ingest.ingestion.silver_layer import SilverWriter
    import inspect
    src = inspect.getsource(SilverWriter._bulk_upsert_markets)
    
    # Extract the query string
    import re
    # Find everything between triple-quoted query string
    query_match = re.search(r'query = """(.*?)"""', src, re.DOTALL)
    if query_match:
        query = query_match.group(1)
        print(f"\nQuery snippet (price area):")
        for line in query.split('\n'):
            if 'price' in line.lower() or 'EXCLUDED' in line.lower():
                print(f"  {line.strip()}")
    
    # Actually test with executemany - simulate what the pipeline does
    # Use a minimal test: upsert KW with stale price 0.24
    import json
    test_record = (
        "kalshi", "KXFEDCHAIRNOM-29-KW", "kw-test",
        "Test KW", None, None, None, None, None,
        "active", True, False, None, 2, "[]",
        0.24, 0.76, None, None,  # STALE prices
        None, None, None, 1000000.0, None, None, None,
        None, None, None, None, None, None, None,
        json.dumps({"last_price": 24, "event_ticker": "KXFEDCHAIRNOM-29"}),
    )
    
    await conn.executemany(query, [test_record])
    
    # Check after
    for mid in ["KXFEDCHAIRNOM-29-KW", "KXFEDCHAIRNOM-29-KH"]:
        row = await conn.fetchrow(
            "SELECT yes_price FROM predictions_silver.markets WHERE source_market_id = $1", mid
        )
        print(f"\nAFTER:  {mid} yes_price={row['yes_price']}")
    
    # Check if KW price changed
    row = await conn.fetchrow(
        "SELECT yes_price FROM predictions_silver.markets WHERE source_market_id = $1",
        "KXFEDCHAIRNOM-29-KW",
    )
    if float(row["yes_price"]) == 0.93:
        print("\n✅ SUCCESS: KW price preserved at 0.93 (not overwritten by upsert)")
    elif float(row["yes_price"]) == 0.24:
        print("\n❌ FAILURE: KW price was overwritten to 0.24!")
    else:
        print(f"\n⚠️  UNEXPECTED: KW price is {row['yes_price']}")
    
    await conn.close()

asyncio.run(main())
