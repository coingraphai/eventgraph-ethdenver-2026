#!/usr/bin/env python3
"""Validate arbitrage opportunities by cross-checking DB prices and analyzing quality"""
import asyncio, ssl, sys, json
sys.path.insert(0, '.')
from predictions_ingest.config import get_settings

async def main():
    import asyncpg
    st = get_settings()
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    conn = await asyncpg.connect(st.database_url.replace('?sslmode=require',''), ssl=ctx)
    
    # Spot-check several "opportunities" from the API output
    checks = [
        # (title_fragment, poly_expected, kalshi_expected)
        ("Boston Celtics.*NBA Finals", 0.0595, 0.04),
        ("Rahm Emanuel.*2028", 0.0135, 0.02),
        ("bitcoin.*GTA", 0.486, 0.67),
        ("Ken Paxton.*Texas", 0.735, 0.58),
        ("US acquire.*Greenland", 0.175, 0.32),
        ("Shai Gilgeous.*NBA MVP", 0.585, 0.75),
        ("Arsenal.*Premier League", 0.585, 0.56),
    ]
    
    print("=== CROSS-CHECK DB PRICES vs API RESPONSE ===\n")
    for title_frag, poly_exp, kalshi_exp in checks:
        # Query actual DB values
        rows = await conn.fetch(f"""
            SELECT source, source_market_id, title, yes_price, no_price, volume_total,
                   last_updated_at
            FROM predictions_silver.markets
            WHERE title ~* '{title_frag}'
              AND is_active = true
              AND source IN ('polymarket', 'kalshi')
            ORDER BY source, volume_total DESC NULLS LAST
        """)
        
        print(f"--- {title_frag} ---")
        if not rows:
            print(f"  ⚠️  NOT FOUND in DB!")
            continue
            
        for r in rows:
            src = r['source']
            yes_p = float(r['yes_price']) if r['yes_price'] else None
            expected = poly_exp if src == 'polymarket' else kalshi_exp
            match = abs(yes_p - expected) < 0.005 if yes_p else False
            updated = r['last_updated_at']
            print(f"  {src:12s} | yes={yes_p} | expected={expected} | {'✅ match' if match else '❌ MISMATCH'} | vol={r['volume_total']} | updated={updated}")
        print()
    
    # Count how many "opportunities" have spreads that are just Kalshi tick noise
    print("=== TICK NOISE ANALYSIS ===")
    print("Kalshi uses 1¢ increments. Polymarket uses fractional cents.")
    print("A spread of ≤1¢ at low prices is likely just tick granularity, not real arbitrage.\n")
    
    # Find all cross-platform pairs with similar titles
    rows = await conn.fetch("""
        WITH poly AS (
            SELECT title, yes_price, volume_total 
            FROM predictions_silver.markets 
            WHERE source='polymarket' AND is_active=true AND yes_price > 0.01 AND yes_price < 0.99
        ),
        kalshi AS (
            SELECT title, yes_price, volume_total
            FROM predictions_silver.markets
            WHERE source='kalshi' AND is_active=true AND yes_price > 0.01 AND yes_price < 0.99
        )
        SELECT 
            count(*) as total_poly,
            (SELECT count(*) FROM kalshi) as total_kalshi
        FROM poly
    """)
    print(f"Active markets: Poly={rows[0]['total_poly']}, Kalshi={rows[0]['total_kalshi']}")
    
    # Check the staleness of prices
    print("\n=== PRICE STALENESS ===")
    stale = await conn.fetch("""
        SELECT source, 
               min(last_updated_at) as oldest_update,
               max(last_updated_at) as newest_update,
               avg(EXTRACT(EPOCH FROM (now() - last_updated_at))/60) as avg_age_minutes
        FROM predictions_silver.markets
        WHERE is_active = true AND source IN ('polymarket', 'kalshi')
        GROUP BY source
    """)
    for r in stale:
        print(f"  {r['source']:12s} | oldest={r['oldest_update']} | newest={r['newest_update']} | avg_age={r['avg_age_minutes']:.0f} min")
    
    await conn.close()

asyncio.run(main())
