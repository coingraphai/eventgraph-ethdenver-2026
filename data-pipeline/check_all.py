import asyncio, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from dotenv import load_dotenv
load_dotenv()
import asyncpg

async def check():
    host = os.environ.get('POSTGRES_HOST')
    port = int(os.environ.get('POSTGRES_PORT', 5432))
    db   = os.environ.get('POSTGRES_DB', 'defaultdb')
    user = os.environ.get('POSTGRES_USER', 'doadmin')
    pw   = os.environ.get('POSTGRES_PASSWORD', '')
    conn = await asyncpg.connect(host=host, port=port, database=db, user=user, password=pw, ssl='require')

    print('=== BRONZE LAYER ===')
    for tbl in ['api_responses_polymarket','api_responses_kalshi','api_responses_limitless']:
        cnt = await conn.fetchval(f"SELECT COUNT(*) FROM predictions_bronze.{tbl}")
        latest = await conn.fetchval(f"SELECT MAX(created_at) FROM predictions_bronze.{tbl}")
        print(f"  {tbl}: {cnt:,} rows, latest: {latest}")

    print('\n=== SILVER MARKETS ===')
    rows = await conn.fetch("SELECT source, COUNT(*) as cnt, COUNT(CASE WHEN is_active THEN 1 END) as active, COUNT(CASE WHEN volume_24h > 0 THEN 1 END) as with_vol FROM predictions_silver.markets GROUP BY source ORDER BY source")
    for r in rows:
        print(f"  {r['source']}: {r['cnt']} total, {r['active']} active, {r['with_vol']} with volume")

    print('\n=== SILVER PRICES ===')
    rows = await conn.fetch("SELECT source, COUNT(*) as cnt, MAX(snapshot_at) as latest FROM predictions_silver.prices GROUP BY source ORDER BY source")
    for r in rows:
        print(f"  {r['source']}: {r['cnt']:,} prices, latest: {r['latest']}")

    print('\n=== SILVER TRADES ===')
    rows = await conn.fetch("SELECT source, COUNT(*) as cnt, MIN(traded_at) as oldest, MAX(traded_at) as newest FROM predictions_silver.trades GROUP BY source ORDER BY source")
    for r in rows:
        print(f"  {r['source']}: {r['cnt']:,} trades | {r['oldest']} -> {r['newest']}")

    print('\n=== GOLD LAYER ===')
    rows = await conn.fetch("SELECT table_schema, table_name FROM information_schema.tables WHERE table_schema='predictions_gold' ORDER BY table_name")
    for r in rows:
        cnt = await conn.fetchval(f"SELECT COUNT(*) FROM predictions_gold.\"{r['table_name']}\"")
        print(f"  {r['table_name']}: {cnt:,} rows")

    print('\n=== TOP 3 MARKETS BY VOLUME (Polymarket) ===')
    rows = await conn.fetch("SELECT question, yes_price, volume_24h FROM predictions_silver.markets WHERE source='polymarket' AND yes_price IS NOT NULL ORDER BY volume_24h DESC NULLS LAST LIMIT 3")
    for r in rows:
        vol = float(r['volume_24h']) if r['volume_24h'] else 0
        print(f"  {str(r['question'])[:60]} | yes={r['yes_price']} | vol=${vol:,.0f}")

    print('\n=== TOP 3 MARKETS BY VOLUME (Kalshi) ===')
    rows = await conn.fetch("SELECT question, yes_price, volume_24h FROM predictions_silver.markets WHERE source='kalshi' AND yes_price IS NOT NULL ORDER BY volume_24h DESC NULLS LAST LIMIT 3")
    for r in rows:
        vol = float(r['volume_24h']) if r['volume_24h'] else 0
        print(f"  {str(r['question'])[:60]} | yes={r['yes_price']} | vol=${vol:,.0f}")

    print('\n=== INGESTION RUN HISTORY (last 5) ===')
    rows = await conn.fetch("SELECT source, ingestion_type, status, records_fetched, records_stored, duration_seconds, started_at FROM predictions_ingestion.run_history ORDER BY started_at DESC LIMIT 5")
    for r in rows:
        dur = f"{r['duration_seconds']:.0f}s" if r['duration_seconds'] else "running"
        print(f"  {r['source']} {r['ingestion_type']} | {r['status']} | fetched={r['records_fetched']} stored={r['records_stored']} | {dur} | {r['started_at']}")

    await conn.close()

asyncio.run(check())
