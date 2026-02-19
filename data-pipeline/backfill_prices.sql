-- Fix 1: Backfill Kalshi yes_price from bronze last_price (cent scale 0-100 -> 0.0-1.0)
UPDATE predictions_silver.markets m
SET
    yes_price = ROUND((b.body_json->>'last_price')::numeric / 100, 6),
    no_price  = ROUND(1 - (b.body_json->>'last_price')::numeric / 100, 6),
    last_updated_at = NOW()
FROM (
    SELECT DISTINCT ON (body_json->>'market_ticker')
        body_json->>'market_ticker' AS market_ticker,
        body_json
    FROM predictions_bronze.api_responses_kalshi
    WHERE url_path = '/kalshi/markets'
      AND body_json->>'last_price' IS NOT NULL
    ORDER BY body_json->>'market_ticker', created_at DESC
) b
WHERE m.source = 'kalshi'
  AND m.source_market_id = b.market_ticker;

-- Fix 2: Fix Limitless prices (stored at 0-100 scale, divide by 100)
UPDATE predictions_silver.markets
SET
    yes_price = ROUND(yes_price / 100, 6),
    no_price  = ROUND(COALESCE(no_price / 100, 1 - yes_price / 100), 6),
    last_updated_at = NOW()
WHERE source = 'limitless' AND yes_price > 1;

-- Fix 3: Backfill silver.prices yes_price from silver.markets (all NULL rows)
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

-- Show results
SELECT source,
       COUNT(*) markets,
       COUNT(yes_price) with_price,
       ROUND(AVG(yes_price),4) avg_price,
       ROUND(MAX(yes_price),4) max_price
FROM predictions_silver.markets
WHERE yes_price IS NOT NULL
GROUP BY source ORDER BY source;
