"""
One-shot script: fetch fresh prices from Dome API for KXFEDCHAIRNOM-29 markets
and update the DB directly.
"""
import asyncio
import aiohttp
import asyncpg
import os

DB_URL = os.environ.get("DATABASE_URL", "postgresql://doadmin@localhost:5432/defaultdb")
API_KEY = "***REDACTED_DOME_KEY***"
BASE_URL = "https://api.domeapi.io/v1"

# All KXFEDCHAIRNOM-29 tickers in DB
TICKERS = [
    "KXFEDCHAIRNOM-29-KH",
    "KXFEDCHAIRNOM-29-KW",
    "KXFEDCHAIRNOM-29-CWAL",
    "KXFEDCHAIRNOM-29-RREI",
    "KXFEDCHAIRNOM-29-SBES",
    "KXFEDCHAIRNOM-29-JS",
    "KXFEDCHAIRNOM-29-MBOW",
    "KXFEDCHAIRNOM-29-DMAL",
    "KXFEDCHAIRNOM-29-JP",
    "KXFEDCHAIRNOM-29-DZER",
]


async def main():
    conn = await asyncpg.connect(DB_URL)
    headers = {"X-API-Key": API_KEY}

    async with aiohttp.ClientSession(headers=headers) as session:
        for ticker in TICKERS:
            try:
                url = f"{BASE_URL}/kalshi/market-price/{ticker}"
                async with session.get(url) as r:
                    data = await r.json()
                    yes_p = data.get("yes", {}).get("price")
                    no_p = data.get("no", {}).get("price")
                    if yes_p is not None:
                        await conn.execute(
                            """
                            UPDATE predictions_silver.markets
                            SET yes_price = $1, no_price = $2, last_updated_at = NOW()
                            WHERE source = 'kalshi' AND source_market_id = $3
                            """,
                            float(yes_p),
                            float(no_p) if no_p is not None else None,
                            ticker,
                        )
                        print(f"  {ticker:<35} yes={yes_p:.2f}  no={no_p:.2f}  -> UPDATED")
                    else:
                        print(f"  {ticker:<35} no price data: {data}")
            except Exception as e:
                print(f"  {ticker:<35} ERROR: {e}")

    await conn.close()
    print("\nDone!")


if __name__ == "__main__":
    asyncio.run(main())
