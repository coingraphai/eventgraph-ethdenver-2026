"""
Test trades fetching with 20 records to confirm code works.
"""
import asyncio
import uuid
from datetime import datetime, timedelta
from predictions_ingest.clients.dome import DomeClient, DataSource
from predictions_ingest.config import get_settings
from predictions_ingest.database import get_db
from predictions_ingest.ingestion.bronze_layer import BronzeWriter
from predictions_ingest.ingestion.silver_layer import SilverWriter
from predictions_ingest.ingestion.orchestrator import TradesFetcher
import structlog

logger = structlog.get_logger()


async def test_trades_fetching():
    """Test trades fetching for a small sample of markets."""
    
    print("\n" + "="*80)
    print("TRADES FETCHING TEST - 20 Markets")
    print("="*80)
    
    # Initialize components
    client = DomeClient(source=DataSource.POLYMARKET)
    bronze_writer = BronzeWriter()
    silver_writer = SilverWriter()
    settings = get_settings()
    
    # Configure for test: top 20 markets only
    settings.trades_top_n_markets = 20
    settings.trades_since_hours = 24
    settings.trades_min_usd = 1000
    
    print(f"\nConfiguration:")
    print(f"  - Top N Markets: {settings.trades_top_n_markets}")
    print(f"  - Since Hours: {settings.trades_since_hours}")
    print(f"  - Min USD: ${settings.trades_min_usd}")
    
    try:
        await client.connect()
        
        # Get 20 active markets with highest volume
        print(f"\n[1/4] Fetching top 20 active markets by volume...")
        db = await get_db()
        async with db.asyncpg_connection() as conn:
            results = await conn.fetch("""
                SELECT source_market_id, title, COALESCE(volume_24h, 0) as volume_24h
                FROM predictions_silver.markets
                WHERE source = 'polymarket'
                ORDER BY COALESCE(volume_24h, 0) DESC
                LIMIT 20
            """)
            
            if not results:
                print("  ❌ No active markets found in database")
                return
            
            print(f"  ✅ Found {len(results)} markets")
            
            # Convert to Market-like objects
            class MockMarket:
                def __init__(self, source_market_id, title, volume_24h):
                    self.source_market_id = source_market_id
                    self.title = title
                    self.volume_24h = volume_24h
                    self.is_active = True
                    self.source = DataSource.POLYMARKET
            
            markets = [MockMarket(r['source_market_id'], r['title'], r['volume_24h']) for r in results]
            
            # Display top 5 markets
            print(f"\n  Top 5 markets:")
            for i, m in enumerate(markets[:5]):
                print(f"    {i+1}. {m.title[:60]}... (${m.volume_24h:,.0f})")
        
        # Create trades fetcher
        print(f"\n[2/4] Initializing TradesFetcher...")
        trades_fetcher = TradesFetcher(client, bronze_writer, silver_writer, DataSource.POLYMARKET)
        print(f"  ✅ Fetcher ready")
        
        # Fetch trades
        print(f"\n[3/4] Fetching trades (this may take 1-2 minutes)...")
        run_id = str(uuid.uuid4())  # Generate proper UUID
        
        start_time = datetime.utcnow()
        trades_fetched, trades_inserted = await trades_fetcher.fetch_trades_batch(
            markets=markets,
            run_id=run_id,
        )
        elapsed = (datetime.utcnow() - start_time).total_seconds()
        
        print(f"\n[4/4] Results:")
        print(f"  - Trades fetched from API: {trades_fetched}")
        print(f"  - Trades inserted to DB: {trades_inserted}")
        print(f"  - Duration: {elapsed:.1f} seconds")
        print(f"  - Markets/sec: {len(markets) / elapsed:.2f}")
        
        if trades_inserted > 0:
            # Query sample trades
            async with db.asyncpg_connection() as conn:
                sample_trades = await conn.fetch("""
                    SELECT source_market_id, side, price, quantity, total_value, traded_at
                    FROM predictions_silver.trades
                    WHERE source = 'polymarket'
                      AND ingested_at >= NOW() - INTERVAL '5 minutes'
                    ORDER BY traded_at DESC
                    LIMIT 5
                """)
                
                print(f"\n  Sample trades (last 5):")
                for t in sample_trades:
                    print(f"    - {t['side']:4s} {t['quantity']:8.2f} @ ${t['price']:.4f} = ${t['total_value']:8,.2f} at {t['traded_at']}")
        
        print(f"\n{'='*80}")
        print(f"✅ TEST COMPLETED SUCCESSFULLY")
        print(f"{'='*80}\n")
        
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
    finally:
        await client.close()


if __name__ == "__main__":
    asyncio.run(test_trades_fetching())
