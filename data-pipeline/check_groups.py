import psycopg2, json
import os

conn = psycopg2.connect(
    host="***REDACTED_DB_HOST***",
    port=25060, dbname="defaultdb", user="doadmin",
    password=os.environ.get("POSTGRES_PASSWORD", ""), sslmode="require"
)
cur = conn.cursor()

# 1. Check grouping fields per source
cur.execute("""
    SELECT source, COUNT(*) total,
        COUNT(slug) with_slug,
        COUNT(extra_data->>'event_slug') poly_event_slug,
        COUNT(extra_data->>'event_ticker') kalshi_event_ticker
    FROM predictions_silver.markets GROUP BY source
""")
print("=== GROUPING FIELDS ===")
for r in cur.fetchall():
    print(r)

# 2. Sample Polymarket event_slug
cur.execute("""
    SELECT extra_data->>'event_slug', extra_data->>'event_title', title
    FROM predictions_silver.markets WHERE source='polymarket' LIMIT 5
""")
print("\n=== POLYMARKET event_slug samples ===")
for r in cur.fetchall():
    print(r)

# 3. Sample Kalshi event_ticker
cur.execute("""
    SELECT extra_data->>'event_ticker', source_market_id, title
    FROM predictions_silver.markets WHERE source='kalshi' LIMIT 5
""")
print("\n=== KALSHI event_ticker samples ===")
for r in cur.fetchall():
    print(r)

# 4. Sample Limitless
cur.execute("""
    SELECT slug, extra_data->>'groupId', extra_data->>'category', title
    FROM predictions_silver.markets WHERE source='limitless' LIMIT 5
""")
print("\n=== LIMITLESS slug/group samples ===")
for r in cur.fetchall():
    print(r)

# 5. How many poly markets share same event_slug (groups)?
cur.execute("""
    SELECT extra_data->>'event_slug' as event_slug, COUNT(*) markets
    FROM predictions_silver.markets WHERE source='polymarket'
    GROUP BY 1 HAVING COUNT(*) > 1
    ORDER BY 2 DESC LIMIT 10
""")
print("\n=== POLYMARKET multi-market events (top 10) ===")
for r in cur.fetchall():
    print(r)

# 6. How many kalshi markets share same event_ticker?
cur.execute("""
    SELECT extra_data->>'event_ticker' as event_ticker, COUNT(*) markets
    FROM predictions_silver.markets WHERE source='kalshi'
    GROUP BY 1 HAVING COUNT(*) > 1
    ORDER BY 2 DESC LIMIT 10
""")
print("\n=== KALSHI multi-market events (top 10) ===")
for r in cur.fetchall():
    print(r)

conn.close()
print("\nDone.")
