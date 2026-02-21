"""Check DB schema and volume data for Kalshi events."""
import asyncio
import asyncpg
import json


async def main():
    conn = await asyncpg.connect(
        host='***REDACTED_DB_HOST***',
        port=25060, database='defaultdb', user='doadmin',
        password='***REDACTED_DB_PASSWORD***', ssl='require'
    )

    # Top 15 Kalshi events by volume from events table
    rows = await conn.fetch(
        "SELECT source_event_id, title, market_count, total_volume "
        "FROM predictions_silver.events "
        "WHERE source = 'kalshi' "
        "ORDER BY total_volume DESC NULLS LAST LIMIT 15"
    )
    print('=== Top 15 Kalshi events (events table) ===')
    for r in rows:
        tv = float(r['total_volume'] or 0)
        mc = r['market_count'] or 0
        eid = r['source_event_id']
        t = (r['title'] or '')[:55]
        print(f'  vol={tv:>15,.0f}  mkts={mc:>3}  {eid:30s} {t}')

    # Check raw bronze data for KH to see Dome API volume field
    rows2 = await conn.fetch(
        "SELECT response_data "
        "FROM predictions_bronze.api_responses_kalshi "
        "WHERE response_data::text LIKE '%KXFEDCHAIRNOM-29-KH%' "
        "ORDER BY ingested_at DESC LIMIT 1"
    )
    print('\n=== Raw KH Dome API data (volume fields) ===')
    if rows2:
        d = rows2[0]['response_data']
        if isinstance(d, str):
            d = json.loads(d)
        # If it's a list, find KH
        if isinstance(d, list):
            for item in d:
                if item.get('ticker') == 'KXFEDCHAIRNOM-29-KH' or item.get('id') == 'KXFEDCHAIRNOM-29-KH':
                    d = item
                    break
        for k in sorted(d.keys()):
            if any(x in k.lower() for x in ['vol', 'trade', 'price', 'ticker', 'event', 'dollar', 'open_interest', 'liquidity']):
                print(f'  {k}: {d[k]}')
    else:
        print('  No bronze data found')

    # Check silver market volumes
    rows4 = await conn.fetch(
        "SELECT source_market_id, volume_total, volume_24h "
        "FROM predictions_silver.markets "
        "WHERE source = 'kalshi' AND source_market_id IN ('KXFEDCHAIRNOM-29-KH', 'KXSB-26-PHI') "
        "ORDER BY source_market_id"
    )
    print('\n=== Silver market volume comparison ===')
    for r in rows4:
        print(f'  {r["source_market_id"]}: vol_total={r["volume_total"]}  vol_24h={r["volume_24h"]}')

    await conn.close()


asyncio.run(main())
