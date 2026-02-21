#!/usr/bin/env python3
"""Check cross-venue match quality."""
import requests, re, json

resp = requests.get('http://localhost:8001/cross-venue-events-db', params={
    'min_similarity': 0.10,
    'min_volume': 0,
    'limit': 200,
    'force': True
}, timeout=60)
data = resp.json()
stats = data.get('stats', {})
events = data.get('events', [])

print(f'=== CROSS-VENUE DATA QUALITY CHECK ===')
print(f'Total matches: {stats.get("total_matches")}')
print(f'High confidence: {stats.get("high_confidence")}')
print(f'Medium confidence: {stats.get("medium_confidence")}')
low = stats.get("total_matches", 0) - stats.get("high_confidence", 0) - stats.get("medium_confidence", 0)
print(f'Low confidence: {low}')
print(f'Avg similarity: {stats.get("avg_similarity")}')
print(f'Query time: {stats.get("query_ms")}ms')
print()

bad_matches = []
for i, ev in enumerate(events):
    sim = ev.get('similarity_score', 0)
    conf = ev.get('match_confidence', '')
    poly = ev.get('polymarket', {})
    kalshi = ev.get('kalshi', {})
    poly_title = poly.get('title', '')
    kalshi_title = kalshi.get('title', '')
    total_vol = ev.get('total_volume', 0)
    spread = ev.get('price_spread')
    
    # Flag potential mismatches
    flag = ''
    pt = poly_title.lower()
    kt = kalshi_title.lower()
    
    # Check sport mismatch
    poly_sports = set()
    kalshi_sports = set()
    for s in ['nba', 'basketball', 'nfl', 'football', 'mlb', 'baseball', 'nhl', 'hockey', 'soccer', 'mls']:
        if s in pt: poly_sports.add(s)
        if s in kt: kalshi_sports.add(s)
    
    # Normalize: NBA = basketball, NFL = football, etc
    sport_groups = {'nba': 'basketball', 'basketball': 'basketball', 'pro basketball': 'basketball',
                   'nfl': 'football', 'football': 'football',
                   'mlb': 'baseball', 'baseball': 'baseball',
                   'nhl': 'hockey', 'hockey': 'hockey'}
    
    if ('nba' in pt or 'basketball' in pt) and ('nfl' in kt or 'football' in kt):
        flag = 'SPORT MISMATCH (NBA vs NFL)'
    elif ('nfl' in pt or 'football' in pt) and ('nba' in kt or 'basketball' in kt):
        flag = 'SPORT MISMATCH (NFL vs NBA)'
    elif ('mvp' in pt and 'mvp' in kt):
        # Check if different sports for MVP
        if poly_sports and kalshi_sports and not poly_sports.intersection(kalshi_sports):
            flag = f'MVP SPORT MISMATCH {poly_sports} vs {kalshi_sports}'
    
    # Check dollar amount mismatch
    poly_dollars = re.findall(r'\$[\d,]+(?:k|m|b)?', pt)
    kalshi_dollars = re.findall(r'\$[\d,]+(?:k|m|b)?', kt)
    if poly_dollars and kalshi_dollars and set(poly_dollars) != set(kalshi_dollars):
        flag = f'DOLLAR MISMATCH {poly_dollars} vs {kalshi_dollars}'
    
    # Check year mismatch
    poly_years = set(re.findall(r'20[2-3]\d', pt))
    kalshi_years = set(re.findall(r'20[2-3]\d', kt))
    if poly_years and kalshi_years and not poly_years.intersection(kalshi_years):
        flag = f'YEAR MISMATCH {poly_years} vs {kalshi_years}'
    
    emoji = 'HI' if conf == 'high' else 'MD' if conf == 'medium' else 'LO'
    spread_str = f'{spread*100:.1f}c' if spread else 'N/A'
    vol_str = f'${total_vol:,.0f}'
    
    # Check market data completeness
    poly_mkts = poly.get('markets', [])
    kalshi_mkts = kalshi.get('markets', [])
    poly_has_prices = sum(1 for m in poly_mkts if m.get('yes_price') is not None)
    kalshi_has_prices = sum(1 for m in kalshi_mkts if m.get('yes_price') is not None)
    poly_has_urls = sum(1 for m in poly_mkts if m.get('url'))
    kalshi_has_urls = sum(1 for m in kalshi_mkts if m.get('url'))
    
    print(f'[{emoji:2s}] sim={sim:.3f} spread={spread_str:>6s} vol={vol_str:>12s}  {"*** " + flag if flag else ""}')
    print(f'   POLY:   {poly_title[:90]}')
    print(f'   KALSHI: {kalshi_title[:90]}')
    print(f'   Markets: P={len(poly_mkts)}({poly_has_prices}priced,{poly_has_urls}urls) K={len(kalshi_mkts)}({kalshi_has_prices}priced,{kalshi_has_urls}urls)')
    
    if flag:
        bad_matches.append((i, flag, poly_title, kalshi_title))
    print()

print(f'\n=== SUMMARY ===')
print(f'Total matches: {len(events)}')
print(f'Bad matches found: {len(bad_matches)}')
for idx, flag, pt, kt in bad_matches:
    print(f'  #{idx}: {flag}')
    print(f'    P: {pt[:70]}')
    print(f'    K: {kt[:70]}')

# Check available data fields
if events:
    ev = events[0]
    print(f'\n=== AVAILABLE DATA FIELDS ===')
    print(f'Event fields: {list(ev.keys())}')
    print(f'Platform fields: {list(ev.get("polymarket", {}).keys())}')
    print(f'Market fields: {list(ev.get("polymarket", {}).get("markets", [{}])[0].keys()) if ev.get("polymarket", {}).get("markets") else "none"}')
