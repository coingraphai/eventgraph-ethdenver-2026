#!/usr/bin/env python3
"""
Fetch prices for ALL active Polymarket markets.

This script:
1. Fetches prices in batches of 50 (concurrent API calls)
2. Handles missing token IDs gracefully (5% of markets don't have them)
3. Processes batches sequentially (safest approach)
4. Shows progress in real-time

Expected performance:
- ~7,800 markets / 50 per batch = ~156 batches
- ~2-3 seconds per batch = 5-8 minutes total
"""

import asyncio
from predictions_ingest.ingestion.orchestrator import DomePolymarketIngester
from predictions_ingest.database import get_db
import uuid
from dataclasses import dataclass
import sys

@dataclass
class SimpleMarket:
    source_market_id: str

async def main():
    print('=' * 70)
    print('POLYMARKET PRICE FETCHER')
    print('=' * 70)
    print()
    print('Configuration:')
    print('  - Batch size: 50 concurrent API calls per batch')
    print('  - Processing: Sequential batches (safest for rate limits)')
    print('  - Optimization: Pre-filters markets without token IDs (~5% skipped)')
    print()
    
    ingester = DomePolymarketIngester()
    run_id = str(uuid.uuid4())
    
    # Connect to API
    print('Connecting to Dome API...')
    await ingester.client.connect()
    print('✓ Connected')
    print()
    
    # Get all active markets
    print('Fetching active markets from database...')
    db = await get_db()
    async with db.asyncpg_connection() as conn:
        # Get markets WITH token IDs only
        markets_data = await conn.fetch('''
            SELECT source_market_id
            FROM predictions_silver.markets
            WHERE source = 'polymarket' 
              AND is_active = true
              AND extra_data->'side_a'->>'id' IS NOT NULL
        ''')
        
        # Check current coverage
        coverage = await conn.fetchrow('''
            SELECT COUNT(*) as total,
                   COUNT(yes_price) as with_price,
                   COUNT(extra_data->'side_a'->>'id') as with_token_id
            FROM predictions_silver.markets
            WHERE source = 'polymarket' AND is_active = true
        ''')
    
    total_markets = coverage['total']
    markets_with_token = coverage['with_token_id']
    markets_without_token = total_markets - markets_with_token
    already_have = coverage['with_price']
    need_to_fetch = len(markets_data) - already_have
    
    print(f'✓ Found {total_markets} active markets')
    print(f'  - With token IDs: {markets_with_token} (will process)')
    print(f'  - Without token IDs: {markets_without_token} (skipped)')
    print(f'  - Already have prices: {already_have}')
    print(f'  - Need to fetch: {need_to_fetch}')
    print()
    
    if need_to_fetch == 0:
        print('All markets already have prices! ✨')
        await ingester.client.close()
        return
    
    # Estimate time - only count markets WITH token IDs
    num_batches = (len(markets_data) + 49) // 50
    est_time = num_batches * 2.5  # seconds per batch
    print(f'Estimated time: {est_time/60:.1f} minutes ({num_batches} batches)')
    print()
    print('Starting price fetch...')
    print('-' * 70)
    
    # Create simple market objects
    markets = [SimpleMarket(source_market_id=m['source_market_id']) for m in markets_data]
    
    # Fetch prices
    try:
        fetched, updated = await ingester.price_fetcher.fetch_prices_batch(markets, run_id)
        
        print()
        print('-' * 70)
        print()
        print('✅ COMPLETE!')
        print(f'  - Fetched: {fetched} prices')
        print(f'  - Updated: {updated} markets')
        print()
        
        # Show final coverage
        async with db.asyncpg_connection() as conn:
            result = await conn.fetchrow('''
                SELECT COUNT(*) as total,
                       COUNT(yes_price) as with_price
                FROM predictions_silver.markets
                WHERE source = 'polymarket' AND is_active = true
            ''')
        
        final_coverage = 100.0 * result['with_price'] / result['total']
        print(f'Final coverage: {result["with_price"]}/{result["total"]} ({final_coverage:.1f}%)')
        
        missing = result['total'] - result['with_price']
        if missing > 0:
            print(f'  - {missing} markets still without prices')
            print(f'    (likely missing token IDs or expired markets)')
        
    except KeyboardInterrupt:
        print()
        print()
        print('⚠️  Interrupted by user')
        print('Progress has been saved. Re-run to continue.')
        sys.exit(130)
    finally:
        await ingester.client.close()

if __name__ == '__main__':
    asyncio.run(main())
