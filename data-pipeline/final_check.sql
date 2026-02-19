-- Final validation: silver + gold layer health check
SELECT '=== SILVER MARKETS ===' AS section, '' AS detail, 0 AS count_val
UNION ALL
SELECT 'Silver markets by source', source, COUNT(*)::int
FROM predictions_silver.markets
GROUP BY source
UNION ALL
SELECT 'Markets with yes_price', source, COUNT(*)::int
FROM predictions_silver.markets WHERE yes_price IS NOT NULL
GROUP BY source

UNION ALL
SELECT '=== SILVER PRICES ===' AS section, '' AS detail, 0 AS count_val
UNION ALL
SELECT 'Price snapshots', source, COUNT(*)::int
FROM predictions_silver.prices
GROUP BY source

UNION ALL
SELECT '=== GOLD LAYER ===' AS section, '' AS detail, 0 AS count_val
UNION ALL
SELECT 'market_detail_cache', '', COUNT(*)::int FROM predictions_gold.market_detail_cache
UNION ALL
SELECT 'market_price_history', '', COUNT(*)::int FROM predictions_gold.market_price_history
UNION ALL
SELECT 'market_metrics_summary', '', COUNT(*)::int FROM predictions_gold.market_metrics_summary
UNION ALL
SELECT 'top_markets_snapshot', '', COUNT(*)::int FROM predictions_gold.top_markets_snapshot
UNION ALL
SELECT 'category_distribution', '', COUNT(*)::int FROM predictions_gold.category_distribution
UNION ALL
SELECT 'market_trade_activity', '', COUNT(*)::int FROM predictions_gold.market_trade_activity

UNION ALL
SELECT '=== PRICE SANITY CHECK ===' AS section, '' AS detail, 0 AS count_val
UNION ALL
SELECT 'Kalshi avg price', '', ROUND(AVG(yes_price)::numeric, 4)::int
FROM predictions_silver.markets WHERE source='kalshi' AND yes_price IS NOT NULL
UNION ALL
SELECT 'Polymarket avg price', '', ROUND(AVG(yes_price)::numeric, 4)::int
FROM predictions_silver.markets WHERE source='polymarket' AND yes_price IS NOT NULL
UNION ALL
SELECT 'Limitless avg price', '', ROUND(AVG(yes_price)::numeric, 4)::int
FROM predictions_silver.markets WHERE source='limitless' AND yes_price IS NOT NULL

ORDER BY section, detail;
