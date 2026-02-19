#!/usr/bin/env python3
"""Check database schemas."""
import asyncio
import asyncpg
import ssl
from predictions_ingest.config import get_settings

async def check_schemas():
    settings = get_settings()
    
    # SSL context
    ssl_context = ssl.create_default_context()
    ssl_context.check_hostname = False
    ssl_context.verify_mode = ssl.CERT_NONE
    
    conn = await asyncpg.connect(
        host=settings.postgres_host,
        port=settings.postgres_port,
        user=settings.postgres_user,
        password=settings.postgres_password,
        database=settings.postgres_db,
        ssl=ssl_context
    )
    
    print("Checking schemas...")
    schemas = await conn.fetch("""
        SELECT schema_name
        FROM information_schema.schemata
        WHERE schema_name NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
        ORDER BY schema_name
    """)
    
    for schema in schemas:
        name = schema['schema_name']
        tables = await conn.fetch(f"""
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = '{name}'
            ORDER BY table_name
        """)
        print(f"\n{name}:")
        for table in tables:
            print(f"  - {table['table_name']}")
    
    await conn.close()

if __name__ == "__main__":
    asyncio.run(check_schemas())
