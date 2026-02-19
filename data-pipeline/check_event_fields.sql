-- Check event grouping fields across all sources
SELECT 'POLYMARKET' as src, 
  slug, 
  extra_data->>'event_slug' as event_slug,
  extra_data->>'event_id' as event_id,
  title
FROM predictions_silver.markets 
WHERE source='polymarket' 
LIMIT 5;

SELECT 'KALSHI' as src,
  source_market_id,
  extra_data->>'event_ticker' as event_ticker,
  title
FROM predictions_silver.markets 
WHERE source='kalshi' 
LIMIT 5;

SELECT 'LIMITLESS' as src,
  source_market_id,
  slug,
  extra_data->>'groupId' as group_id,
  extra_data->>'marketGroup' as market_group,
  title
FROM predictions_silver.markets 
WHERE source='limitless' 
LIMIT 5;

-- Count how many poly markets have event_slug
SELECT 
  source,
  COUNT(*) total,
  COUNT(NULLIF(slug,'')) with_slug,
  COUNT(extra_data->>'event_slug') with_event_slug,
  COUNT(extra_data->>'event_ticker') with_event_ticker
FROM predictions_silver.markets
GROUP BY source;
