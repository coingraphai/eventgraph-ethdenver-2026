"""
Fetch and populate market slugs from Dome API efficiently.
Handles pagination to get all ~17k markets.
"""
import asyncio
import sys
from pathlib import Path
import os

sys.path.insert(0, str(Path(__file__).parent.parent))

import httpx
from predictions_ingest.database import get_db
import structlog

logger = structlog.get_logger()

DOME_API_BASE = "https://api.domeapi.io/v1"
DOME_API_KEY = "***REDACTED_DOME_KEY***"  # From .env
BATCH_SIZE = 100  # Maximum allowed by API


async def fetch_all_markets() -> dict:
    """
    Fetch all open markets from Dome API with pagination.
    Returns dict mapping condition_id -> event_slug.
    """
    print(f"📡 Fetching all markets from Dome API...")
    print(f"   API: {DOME_API_BASE}/polymarket/markets")
    
    slug_map = {}
    offset = 0
    total_fetched = 0
    
    async with httpx.AsyncClient(timeout=60.0) as client:
        while True:
            try:
                response = await client.get(
                    f"{DOME_API_BASE}/polymarket/markets",
                    params={'status': 'open', 'limit': BATCH_SIZE, 'offset': offset},
                    headers={'x-api-key': DOME_API_KEY}
                )
                response.raise_for_status()
                
                data = response.json()
                markets = data.get('markets', [])
                pagination = data.get('pagination', {})
                
                if not markets:
                    break
                
                # Build the mapping
                for market in markets:
                    condition_id = market.get('condition_id')
                    event_slug = market.get('event_slug') or market.get('market_slug')
                    
                    if condition_id and event_slug:
                        slug_map[condition_id] = event_slug
                
                total_fetched += len(markets)
                print(f"   ⏳ Fetched {total_fetched:,}/{pagination.get('total', '?'):,} markets...")
                
                # Check if there are more markets
                if not pagination.get('has_more', False):
                    break
                
                offset += BATCH_SIZE
                
                # Small delay to respect rate limits
                await asyncio.sleep(0.1)
                
            except Exception as e:
                print(f"   ❌ Error at offset {offset}: {e}")
                logger.error("fetch_failed", offset=offset, error=str(e))
                break
    
    print(f"   ✅ Total markets fetched: {total_fetched:,}")
    print(f"   ✅ Built mapping for {len(slug_map):,} markets")
    
    return slug_map


async def populate_slugs():
    """Fetch slugs from Dome API and populate silver.markets table."""
    print("=" * 70)
    print("POPULATE MARKET SLUGS FROM DOME API")
    print("=" * 70)
    print()
    
    db = await get_db()
    
    # Step 1: Check current state
    print("1️⃣ Current state:")
    async with db.asyncpg_connection() as conn:
        total_markets = await conn.fetchval(
            'SELECT COUNT(*) FROM predictions_silver.markets WHERE source = $1',
            'polymarket'
        )
        with_slug = await conn.fetchval(
            'SELECT COUNT(*) FROM predictions_silver.markets WHERE source = $1 AND slug IS NOT NULL',
            'polymarket'
        )
        without_slug = total_markets - with_slug
        
        print(f"   Total markets: {total_markets:,}")
        print(f"   With slug: {with_slug:,}")
        print(f"   Missing slug: {without_slug:,}")
        
        if without_slug == 0:
            print("\n✅ All markets already have slugs!")
            return
    
    # Step 2: Fetch all markets from Dome
    print(f"\n2️⃣ Fetching from Dome API...")
    slug_map = await fetch_all_markets()
    
    if not slug_map:
        print("\n❌ Failed to fetch slug data from API!")
        return
    
    # Step 3: Update markets in database
    print(f"\n3️⃣ Updating markets with slugs...")
    updated_count = 0
    not_found_count = 0
    
    async with db.asyncpg_connection() as conn:
        # Get all markets that need slugs
        markets_needing_slugs = await conn.fetch('''
            SELECT id, source_market_id
            FROM predictions_silver.markets
            WHERE source = 'polymarket'
              AND slug IS NULL
        ''')
        
        print(f"   📊 Processing {len(markets_needing_slugs):,} markets...")
        
        for market in markets_needing_slugs:
            market_id = market['id']
            source_market_id = market['source_market_id']
            
            # Look up the slug
            event_slug = slug_map.get(source_market_id)
            
            if event_slug:
                await conn.execute('''
                    UPDATE predictions_silver.markets
                    SET 
                        slug = $1::varchar,
                        extra_data = jsonb_set(
                            COALESCE(extra_data, '{}'::jsonb),
                            '{event_slug}',
                            to_jsonb($1::text)
                        ),
                        last_updated_at = NOW()
                    WHERE id = $2
                ''', event_slug, market_id)
                updated_count += 1
                
                if updated_count % 1000 == 0:
                    print(f"      Updated {updated_count:,}...")
            else:
                not_found_count += 1
        
        print(f"   ✅ Updated {updated_count:,} markets")
        if not_found_count > 0:
            print(f"   ⚠️  {not_found_count:,} markets not found in API (might be closed)")
        
        # Step 4: Final verification
        print(f"\n4️⃣ Final verification:")
        final_with_slug = await conn.fetchval(
            'SELECT COUNT(*) FROM predictions_silver.markets WHERE source = $1 AND slug IS NOT NULL',
            'polymarket'
        )
        final_without_slug = total_markets - final_with_slug
        coverage = (final_with_slug / total_markets * 100) if total_markets > 0 else 0
        
        print(f"   Markets with slug: {final_with_slug:,}")
        print(f"   Markets without slug: {final_without_slug:,}")
        print(f"   Coverage: {coverage:.1f}%")
        
        # Step 5: Check event-market linking
        print(f"\n5️⃣ Event-market linking:")
        event_count = await conn.fetchval(
            'SELECT COUNT(*) FROM predictions_silver.events WHERE source = $1',
            'polymarket'
        )
        linked_markets = await conn.fetchval('''
            SELECT COUNT(DISTINCT m.id)
            FROM predictions_silver.markets m
            INNER JOIN predictions_silver.events e 
                ON e.slug = m.slug AND e.source = m.source
            WHERE m.source = 'polymarket'
              AND m.slug IS NOT NULL
        ''')
        
        print(f"   Events in database: {event_count:,}")
        print(f"   Markets linked to events: {linked_markets:,}")
        
        if event_count < 100:
            print(f"\n   ⚠️  Only {event_count} events loaded!")
            print(f"   💡 Next step: python scripts/load_events.py --max 20000")
        elif linked_markets < final_with_slug:
            print(f"\n   ⚠️  {final_with_slug - linked_markets:,} markets have slugs but no matching events")
            print(f"   💡 Consider loading more events: python scripts/load_events.py --max 20000")
    
    print("\n" + "=" * 70)
    print("✅ SLUG POPULATION COMPLETE!")
    print("=" * 70)


if __name__ == "__main__":
    asyncio.run(populate_slugs())
