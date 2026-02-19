-- Re-run silver.prices backfill after yes_price is now populated in silver.markets
UPDATE predictions_silver.prices p
SET
    yes_price = m.yes_price,
    no_price  = m.no_price,
    mid_price = ROUND((m.yes_price + m.no_price) / 2, 6)
FROM predictions_silver.markets m
WHERE p.source_market_id = m.source_market_id
  AND p.source = m.source
  AND p.yes_price IS NULL
  AND m.yes_price IS NOT NULL;

SELECT source, COUNT(*) total, COUNT(yes_price) with_price
FROM predictions_silver.prices
GROUP BY source ORDER BY source;
