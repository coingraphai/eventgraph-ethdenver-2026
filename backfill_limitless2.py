"""
Fixed backfill: populate end_date and volume_total for Limitless markets.
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


def fetch_all_markets():
    all_markets = []
    page = 1
    while True:
        url = f"https://api.limitless.exchange/markets/active?page={page}&limit=25"
        req = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "Backfill2/1.0"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read())
        markets = data.get("data", [])
        total = data.get("totalMarketsCount", 0)
        if not markets:
            break
        all_markets.extend(markets)
        if len(all_markets) >= total or len(markets) < 25:
            break
        page += 1
        time.sleep(0.12)
    print(f"Fetched {len(all_markets)} markets from API")
    return all_markets


def main():
    markets = fetch_all_markets()
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()

    end_updated = 0
    vol_updated = 0

    for m in markets:
        market_id = str(m.get("id", ""))
        if not market_id:
            continue

        # Parse end_date from expirationTimestamp (ms)
        exp_ts = m.get("expirationTimestamp")
        end_date = None
        if exp_ts:
            try:
                end_date = datetime.fromtimestamp(int(exp_ts) / 1000, tz=timezone.utc)
            except Exception:
                pass

        # Volume in micro-units → USD
        raw_volume = m.get("volume")
        volume_total = None
        if raw_volume is not None:
            try:
                volume_total = float(Decimal(str(raw_volume)) / Decimal("1000000"))
            except Exception:
                pass

        if end_date:
            cur.execute(
                "UPDATE predictions_silver.markets SET end_date=%s WHERE source='limitless' AND source_market_id=%s AND end_date IS NULL",
                (end_date, market_id)
            )
            end_updated += cur.rowcount

        if volume_total is not None:
            cur.execute(
                "UPDATE predictions_silver.markets SET volume_total=%s WHERE source='limitless' AND source_market_id=%s",
                (volume_total, market_id)
            )
            vol_updated += cur.rowcount

    conn.commit()
    conn.close()
    print(f"end_date updated: {end_updated}, volume_total updated: {vol_updated}")


if __name__ == "__main__":
    main()
