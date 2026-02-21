"""Check for duplicate rows, and add a DB-level audit trigger to catch who overwrites prices"""
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
    
    # Check for duplicate rows
    dupes = await conn.fetch("""
        SELECT source, source_market_id, COUNT(*) as cnt
        FROM predictions_silver.markets
        WHERE source_market_id LIKE 'KXFEDCHAIRNOM-29-%'
        GROUP BY source, source_market_id
        HAVING COUNT(*) > 1
    """)
    print(f"Duplicate rows for Fed Chair: {len(dupes)}")
    for d in dupes:
        print(f"  {d['source']} / {d['source_market_id']}: {d['cnt']} rows")
    
    # Check all Fed Chair rows with their source values
    rows = await conn.fetch("""
        SELECT id, source, source_market_id, yes_price, no_price, last_updated_at, update_count
        FROM predictions_silver.markets
        WHERE source_market_id IN ('KXFEDCHAIRNOM-29-KW', 'KXFEDCHAIRNOM-29-KH')
        ORDER BY source_market_id, source
    """)
    print(f"\nAll Fed Chair rows ({len(rows)}):")
    for r in rows:
        print(f"  id={r['id']} src={r['source']} mid={r['source_market_id']} yes={r['yes_price']} no={r['no_price']} updated={r['last_updated_at']} count={r['update_count']}")
    
    # Create an audit table and trigger to catch who changes yes_price
    print("\nCreating audit trigger to catch price changes...")
    await conn.execute("""
        CREATE TABLE IF NOT EXISTS predictions_silver.price_audit_log (
            id SERIAL PRIMARY KEY,
            source_market_id TEXT,
            old_yes_price DECIMAL(10,6),
            new_yes_price DECIMAL(10,6),
            old_no_price DECIMAL(10,6),
            new_no_price DECIMAL(10,6),
            changed_at TIMESTAMPTZ DEFAULT NOW(),
            query_text TEXT
        )
    """)
    
    await conn.execute("""
        CREATE OR REPLACE FUNCTION predictions_silver.audit_price_changes()
        RETURNS TRIGGER AS $$
        BEGIN
            IF OLD.yes_price IS DISTINCT FROM NEW.yes_price 
               AND NEW.source_market_id LIKE 'KXFEDCHAIRNOM-29-%' THEN
                INSERT INTO predictions_silver.price_audit_log 
                    (source_market_id, old_yes_price, new_yes_price, old_no_price, new_no_price, query_text)
                VALUES (
                    NEW.source_market_id, 
                    OLD.yes_price, NEW.yes_price, 
                    OLD.no_price, NEW.no_price,
                    current_query()
                );
            END IF;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    """)
    
    await conn.execute("""
        DROP TRIGGER IF EXISTS audit_price_trigger ON predictions_silver.markets
    """)
    await conn.execute("""
        CREATE TRIGGER audit_price_trigger
        BEFORE UPDATE ON predictions_silver.markets
        FOR EACH ROW
        EXECUTE FUNCTION predictions_silver.audit_price_changes()
    """)
    
    print("  ✅ Audit trigger created! It will log every yes_price change for Fed Chair markets.")
    
    # Now set prices to correct values
    print("\nSetting correct prices...")
    await conn.execute("""
        UPDATE predictions_silver.markets 
        SET yes_price = 0.01, no_price = 0.99, last_updated_at = NOW()
        WHERE source_market_id = 'KXFEDCHAIRNOM-29-KH'
    """)
    await conn.execute("""
        UPDATE predictions_silver.markets 
        SET yes_price = 0.94, no_price = 0.06, last_updated_at = NOW()
        WHERE source_market_id = 'KXFEDCHAIRNOM-29-KW'
    """)
    
    # Verify
    rows = await conn.fetch("""
        SELECT source_market_id, yes_price, no_price 
        FROM predictions_silver.markets
        WHERE source_market_id IN ('KXFEDCHAIRNOM-29-KW', 'KXFEDCHAIRNOM-29-KH')
        ORDER BY source_market_id
    """)
    for r in rows:
        print(f"  {r['source_market_id']}: yes={r['yes_price']}, no={r['no_price']}")
    
    print("\n✅ Now wait for the next delta cycle (15 min) and check the audit log with:")
    print("   SELECT * FROM predictions_silver.price_audit_log ORDER BY changed_at;")
    
    await conn.close()

asyncio.run(main())
