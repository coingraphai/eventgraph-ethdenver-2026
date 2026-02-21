"""
Fix prices that were incorrectly divided by 100 in the backfill.
Re-fetches all active markets and stores prices correctly (no /100 division).
"""
import time
import json
import urllib.request
from datetime import datetime, timezone
from decimal import Decimal

import psycopg2


DB_CONFIG = dict(
    host='***REDACTED_DB_HOST***',
    port=25060, dbname='defaultdb', user='doadmin',
    password='***REDACTED_DB_PASSWORD***', sslmode='require'
)


def fetch_markets_page(page: int, limit: int = 25) -> dict:
    url = f"https://api.limitless.exchange/markets/active?page={page}&limit={limit}"
    req = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "FixPrices/1.0"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read())


def fetch_all_markets():
    all_markets = []
    page = 1
    while True:
        data = fetch_markets_page(page, limit=25)
        markets = data.get("data", [])
        total = data.get("totalMarketsCount", 0)
        if not markets:
            break
        all_markets.extend(markets)
        if len(all_markets) >= total or len(markets) < 25:
            break
        page += 1
        time.sleep(0.15)
    return all_markets


def main():
    print("Fetching all active markets from Limitless API...")
    markets = fetch_all_markets()
    print(f"Total markets fetched: {len(markets)}")

    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()

    updated = 0

    for m in markets:
        market_id = str(m.get("id", ""))
        if not market_id:
            continue

        # Prices from Limitless API can be 0-1 or 0-100 — normalize to 0-1
        prices = m.get("prices", [])
        yes_price = None
        no_price = None
        if len(prices) >= 2:
            try:
                y = float(prices[0])
                n = float(prices[1])
                # Normalize: if > 1, it's in 0-100 format
                if y > 1:
                    y = y / 100.0
                if n > 1:
                    n = n / 100.0
                yes_price = round(y, 6)
                no_price = round(n, 6)
            except Exception:
                pass
        elif len(prices) == 1:
            try:
                y = float(prices[0])
                if y > 1:
                    y = y / 100.0
                yes_price = round(y, 6)
                no_price = round(1.0 - yes_price, 6)
            except Exception:
                pass

        if yes_price is None:
            continue

        cur.execute("""
            UPDATE predictions_silver.markets
            SET
                yes_price = %s,
                no_price = %s,
                last_updated_at = NOW()
            WHERE source = 'limitless' AND source_market_id = %s
        """, (yes_price, no_price, market_id))

        if cur.rowcount > 0:
            updated += 1

    conn.commit()
    conn.close()
    print(f"Fixed prices for {updated} markets.")


if __name__ == "__main__":
    main()
