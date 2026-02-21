"""Root cause diagnostic - what does normalize_price ACTUALLY return?"""
import asyncio, sys, os, json
sys.path.insert(0, os.path.dirname(__file__))
from predictions_ingest.config import get_settings
from predictions_ingest.clients.dome import DomeClient
from predictions_ingest.models import DataSource

async def main():
    settings = get_settings()
    client = DomeClient(source=DataSource.KALSHI)
    await client.connect()
    
    for mid in ["KXFEDCHAIRNOM-29-KW", "KXFEDCHAIRNOM-29-KH"]:
        print(f"\n{'='*60}")
        print(f"MARKET: {mid}")
        print(f"{'='*60}")
        
        # 1. Raw API response from market-price endpoint
        raw = await client.fetch_market_price(mid)
        print(f"\n1. RAW API RESPONSE from /kalshi/market-price/{mid}:")
        print(json.dumps(raw, indent=2, default=str))
        
        # 2. What normalize_price returns
        price = client.normalize_price(raw, mid)
        print(f"\n2. normalize_price() RETURNS:")
        print(f"   yes_price = {price.yes_price}")
        print(f"   no_price  = {price.no_price}")
        
        # 3. Show the intermediate values
        _yes_nested = raw.get("yes") or {}
        print(f"\n3. INTERMEDIATE VALUES:")
        print(f"   raw.get('yes_price') = {raw.get('yes_price')}")
        print(f"   raw.get('yesPrice')  = {raw.get('yesPrice')}")
        print(f"   raw.get('last_price')= {raw.get('last_price')}")
        print(f"   raw.get('price')     = {raw.get('price')}")
        print(f"   _yes_nested          = {_yes_nested}")
        print(f"   isinstance(nested,dict) = {isinstance(_yes_nested, dict)}")
        if isinstance(_yes_nested, dict):
            print(f"   nested.get('price')  = {_yes_nested.get('price')}")
    
    await client.close()

asyncio.run(main())
