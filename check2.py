import psycopg2
conn = psycopg2.connect(
    host='***REDACTED_DB_HOST***',
    port=25060, dbname='defaultdb', user='doadmin',
    password='***REDACTED_DB_PASSWORD***', sslmode='require'
)
cur = conn.cursor()

cur.execute("""
    SELECT source_market_id, yes_price, no_price,
           extra_data->>'last_price' as last_price,
           title
    FROM predictions_silver.markets
    WHERE source='kalshi' AND extra_data->>'event_ticker' = 'KXFEDCHAIRNOM-29'
    ORDER BY yes_price DESC NULLS LAST
    LIMIT 6
""")
print("KXFEDCHAIRNOM-29 current DB yes_prices:")
for r in cur.fetchall():
    print(f"  {r[0]:30} yes={r[1]}, lp={r[3]}, {r[4][:40]}")

# Also check KXPRESNOMD-28
cur.execute("""
    SELECT source_market_id, yes_price, extra_data->>'last_price', title
    FROM predictions_silver.markets
    WHERE source='kalshi' AND extra_data->>'event_ticker' = 'KXPRESNOMD-28'
    ORDER BY yes_price DESC NULLS LAST
    LIMIT 5
""")
print("\nKXPRESNOMD-28 top by yes_price:")
for r in cur.fetchall():
    print(f"  {r[0]:30} yes={r[1]}, lp={r[2]}, {r[3][:35]}")

conn.close()
