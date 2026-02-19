"""
Arbitrage API - Dedicated endpoint for finding cross-venue opportunities
Fast, reliable arbitrage detection with fallback strategies
"""
from fastapi import APIRouter, Query, HTTPException, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import logging
import asyncio
import time
import math
from datetime import datetime

from app.database.session import get_db
from app.services.production_cache_service import get_production_cache
from app.services.kalshi_service import get_kalshi_client

# Focus on Polymarket and Kalshi only for quality data
# from app.services.limitless_service import get_limitless_client
# from app.services.opiniontrade_service import get_opiniontrade_client

router = APIRouter()
logger = logging.getLogger(__name__)


class ArbitrageOpportunity(BaseModel):
    id: str
    title: str
    platforms: List[str]
    prices: Dict[str, float]  # platform -> price
    volumes: Dict[str, float]  # platform -> volume
    market_ids: Dict[str, str]  # platform -> original market id/slug
    best_buy_platform: str
    best_buy_price: float
    best_sell_platform: str
    best_sell_price: float
    spread_percent: float
    profit_potential: float
    confidence: str
    match_score: float
    # Execution feasibility fields
    feasibility_score: float  # 0-100 score indicating how executable this trade is
    feasibility_label: str  # 'excellent', 'good', 'fair', 'poor'
    min_side_volume: float  # Volume on the thinner side (execution bottleneck)
    estimated_slippage: float  # Estimated slippage as % based on volume
    # Strategy explanation fields
    strategy_summary: str  # One-line summary: "BUY on Polymarket at 5.3¢, SELL on Kalshi at 8.0¢"
    strategy_steps: List[str]  # Step-by-step execution instructions


class ArbitrageStats(BaseModel):
    total_opportunities: int
    avg_spread: float
    total_profit_potential: float
    markets_scanned: int
    platform_pairs: int
    scan_time: float


class ArbitrageResponse(BaseModel):
    opportunities: List[ArbitrageOpportunity]
    stats: ArbitrageStats


import re
from difflib import SequenceMatcher

# --- Module-level cache for arbitrage results ---
_arb_cache: Dict[str, Any] = {
    "data": None,
    "timestamp": 0.0,
    "ttl": 20.0,  # 20 second cache — balance between fresh prices and API rate limits
}

# Time budget for the comparison loop (seconds)
# This applies ONLY to the comparison phase, not the fetch phase
_SCAN_TIME_BUDGET = 60.0

# Common stop-words that inflate similarity for unrelated markets
# Includes prediction-market-specific noise words
_STOP_WORDS = {
    # Standard stop words
    'will', 'the', 'a', 'an', 'by', 'in', 'of', 'to', 'for', 'on', 'at',
    'before', 'after', 'or', 'and', 'be', 'is', 'it', 'this', 'that',
    'any', 'all', 'new', 'first', 'come', 'comes', 'which', 'than',
    'has', 'have', 'does', 'do', 'not', 'no', 'yes', 'what', 'who',
    'how', 'many', 'much', 'more', 'most', 'there', 'their', 'they',
    'been', 'were', 'was', 'are', 'its', 'can', 'could', 'would', 'should',
    # Prediction-market-specific noise that causes false matches
    'above', 'below', 'price', 'win', 'wins', 'winner', 'release', 'released',
    'launch', 'launched', 'token', 'hit', 'reach', 'market', 'markets',
    'game', 'team', 'pick', 'draft', 'round', 'season',
    'cup', 'mens', 'womens',
    'world', 'national', 'international', 'united', 'states',
    'president',
    'trillion', 'trillionaire', 'billion', 'billionaire', 'million',
    'dollar', 'dollars', 'percent', 'rate',
    'make', 'made', 'buy', 'sell', 'get', 'got', 'take', 'run', 'goes',
    'next', 'last', 'end', 'start', 'day', 'days', 'week', 'month', 'year',
    '2024', '2025', '2026', '2027', '2028', '2029', '2030',
    'q1', 'q2', 'q3', 'q4', 'january', 'february', 'march', 'april',
    'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december',
    'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
}

# Template words: these describe the TYPE of market, not WHICH specific one.
# "Will [PERSON] leave the Trump Cabinet?" — 'leave', 'cabinet', 'trump' are template.
# "Will [TEAM] win the NBA Finals?" — 'finals', 'conference', 'playoffs' are template.
# Markets that share ONLY template words but different subjects are FALSE MATCHES.
_TEMPLATE_WORDS = {
    # Political templates
    'senate', 'race', 'governor', 'cabinet', 'leave', 'person',
    'nomination', 'nominee', 'nominate', 'nominated',
    'democrat', 'republican', 'democrats', 'republicans', 'democratic',
    'election', 'presidential', 'gubernatorial', 'governorship',
    'flip', 'flips', 'congressional', 'senatorial',
    # Sports templates
    'finals', 'final', 'championship', 'conference', 'playoffs', 'playoff',
    'league', 'premier', 'eastern', 'western', 'seed',
    'pro', 'basketball', 'football', 'baseball', 'hockey', 'soccer',
    # Market type templates
    'fdv', 'ipo', 'closing', 'cap', 'volume',
    'normalize', 'relations',
}

# Common entity aliases in prediction markets
# Maps alternate names to canonical form for matching
_ENTITY_ALIASES = {
    # Crypto
    'btc': 'bitcoin', 'eth': 'ethereum', 'sol': 'solana', 'xrp': 'ripple',
    'bnb': 'binance', 'doge': 'dogecoin', 'ada': 'cardano', 'dot': 'polkadot',
    'avax': 'avalanche', 'matic': 'polygon', 'link': 'chainlink',
    'ltc': 'litecoin', 'uni': 'uniswap', 'aave': 'aave', 'shib': 'shibainu',
    # Gaming
    'gta6': 'gtavi', 'gta': 'gtavi', 'vi': 'gtavi',
    # Sports abbreviations
    'nfl': 'football', 'nba': 'basketball', 'mlb': 'baseball',
    'nhl': 'hockey',
    'epl': 'premierleague', 'ucl': 'championsleague',
    'superbowl': 'superbowl', 'worldcup': 'worldcup',
    # Politics
    'dem': 'democrat', 'democratic': 'democrat', 'dems': 'democrat',
    'gop': 'republican', 'rep': 'republican', 'republicans': 'republican',
    'potus': 'president', 'scotus': 'supremecourt',
    'governorship': 'governor', 'gubernatorial': 'governor',
    'senatorial': 'senate', 'congressional': 'congress',
    # People (common in prediction markets)
    'donaldtrump': 'trump', 'donald': 'trump',
    'elonmusk': 'musk', 'elon': 'musk',
    'biden': 'biden', 'joebiden': 'biden',
    'desantis': 'desantis', 'rondesantis': 'desantis',
    'kamala': 'harris', 'kamalaharris': 'harris',
    # Tech / AI
    'ai': 'artificialintelligence', 'ev': 'electricvehicle',
    'openai': 'openai', 'chatgpt': 'openai',
    'agi': 'artificialintelligence',
    # Economy
    'fed': 'federalreserve', 'fomc': 'federalreserve',
    'gdp': 'gdp', 'cpi': 'inflation', 'pce': 'inflation',
    'recession': 'recession', 'downturn': 'recession',
    # Geopolitics
    'greenland': 'greenland', 'ukraine': 'ukraine', 'russia': 'russia',
    'china': 'china', 'taiwan': 'taiwan', 'prc': 'china', 'roc': 'taiwan',
    # Actions — map similar verbs to canonical
    'acquire': 'buy', 'purchase': 'buy', 'annex': 'buy',
    'convicted': 'convict', 'conviction': 'convict', 'indicted': 'indict',
    'impeach': 'impeach', 'impeached': 'impeach', 'impeachment': 'impeach',
    'resign': 'resign', 'resigned': 'resign', 'resignation': 'resign',
    'fired': 'fire', 'firing': 'fire', 'terminate': 'fire',
}


def _normalize(s):
    return re.sub(r'[^a-z0-9\s]', '', s.lower()).strip()


def _canonicalize(word):
    return _ENTITY_ALIASES.get(word, word)


def _extract_entities(title):
    """Extract all entities from a title (stop words removed, canonicalized, len>=3)."""
    words = set(_normalize(title).split()) - _STOP_WORDS
    entities = set()
    for w in words:
        if w.isdigit():
            continue
        c = _canonicalize(w)
        if len(c) >= 3:
            entities.add(c)
    return entities


def _extract_subject_entities(title):
    """
    Extract SUBJECT entities — the specific nouns that distinguish this market.
    These are entities that are NOT template/category words.
    
    "Will Doug Burgum leave the Trump Cabinet?" → {'doug', 'burgum'} (subjects)
      template: {'leave', 'cabinet', 'trump'}
    "Will the Golden State Warriors win the NBA Finals?" → {'golden', 'state', 'warriors'} (subjects)
      template: {'finals', 'basketball'}
    """
    words = set(_normalize(title).split()) - _STOP_WORDS
    subjects = set()
    for w in words:
        if w.isdigit():
            continue
        c = _canonicalize(w)
        if len(c) >= 3 and c not in _TEMPLATE_WORDS:
            subjects.add(c)
    return subjects


def calculate_similarity(title1: str, title2: str) -> float:
    """
    Calculate title similarity for cross-platform arbitrage matching.
    
    KEY INSIGHT from real data analysis:
    Most prediction markets follow a template pattern: [SUBJECT] + [ACTION/EVENT TYPE].
    
    FALSE POSITIVES happen when two markets share the same template but different subjects:
    - "Doug Burgum leave Cabinet" ↔ "Marco Rubio leave Cabinet" (different person!)
    - "Ohio Senate race" ↔ "Georgia Senate race" (different state!)
    - "Indiana Pacers NBA Finals" ↔ "San Antonio Basketball Finals" (different team!)
    - "Leeds Premier League" ↔ "Liverpool Premier League" (different team!)
    
    TRUE MATCHES share the same subject(s):
    - "Trump Judy Shelton Fed Chair" ↔ "Trump Judy Shelton Fed Chair" ✓
    - "Trump acquire Greenland" ↔ "Trump buy Greenland" ✓
    - "Gavin Newsom Democratic nomination" ↔ "Gavin Newsom Democratic nominee" ✓
    
    Algorithm:
    1. Extract ALL entities (for inverted index lookup)
    2. Separate entities into SUBJECTS (proper nouns) vs TEMPLATE (category words)
    3. Require subject overlap — markets about different people/teams/places are never the same
    4. Use template overlap as bonus signal, not primary matching
    """
    t1 = _normalize(title1)
    t2 = _normalize(title2)
    
    if t1 == t2:
        return 1.0
    
    # All entities (for overall overlap check)
    entities1 = _extract_entities(title1)
    entities2 = _extract_entities(title2)
    
    if not entities1 or not entities2:
        return 0.0
    
    # Subject entities (proper nouns that distinguish THIS market)
    subjects1 = _extract_subject_entities(title1)
    subjects2 = _extract_subject_entities(title2)
    
    # --- Entity overlap with prefix matching ---
    entity_intersection = entities1 & entities2
    entity_union = entities1 | entities2
    
    # Prefix matching for stemming (convicted/conviction, nomination/nominee)
    if len(entity_intersection) < min(len(entities1), len(entities2)):
        unmatched1 = entities1 - entity_intersection
        unmatched2 = entities2 - entity_intersection
        for e1 in list(unmatched1):
            for e2 in list(unmatched2):
                prefix_len = min(5, min(len(e1), len(e2)))
                if prefix_len >= 4 and e1[:prefix_len] == e2[:prefix_len]:
                    entity_intersection.add(e1)
                    unmatched1.discard(e1)
                    unmatched2.discard(e2)
                    break
        entity_union = entity_intersection | unmatched1 | unmatched2
    
    if not entity_intersection:
        return 0.0
    
    # --- CRITICAL: Subject entity overlap ---
    # If both titles have identifiable subjects, they MUST share at least one
    subject_intersection = subjects1 & subjects2
    
    # Also do prefix matching on subjects
    if subjects1 and subjects2 and not subject_intersection:
        for s1 in subjects1:
            for s2 in subjects2:
                prefix_len = min(5, min(len(s1), len(s2)))
                if prefix_len >= 4 and s1[:prefix_len] == s2[:prefix_len]:
                    subject_intersection.add(s1)
                    break
    
    # If both have 2+ subject entities but share NONE → definitely different markets
    # "Doug Burgum" vs "Marco Rubio" — both are 2-word proper names, zero overlap
    if len(subjects1) >= 2 and len(subjects2) >= 2 and not subject_intersection:
        return 0.0
    
    # If one has subjects and other has subjects, need overlap
    if subjects1 and subjects2 and not subject_intersection:
        # Check if the non-overlapping subjects could be the SAME entity
        # via sequence matching (e.g., "warriors" vs "warrior")
        best_sub_sim = 0
        for s1 in subjects1:
            for s2 in subjects2:
                if len(s1) >= 4 and len(s2) >= 4:
                    sr = SequenceMatcher(None, s1, s2).ratio()
                    best_sub_sim = max(best_sub_sim, sr)
        if best_sub_sim < 0.75:
            return 0.0  # Subjects are clearly different
    
    # --- Compute subject Jaccard (the key discriminator) ---
    subject_union = subjects1 | subjects2
    if subject_union:
        subject_jaccard = len(subject_intersection) / len(subject_union)
    else:
        # No subjects found on either side — fall back to entity Jaccard
        subject_jaccard = len(entity_intersection) / len(entity_union) if entity_union else 0
    
    entity_jaccard = len(entity_intersection) / len(entity_union)
    entity_recall = len(entity_intersection) / min(len(entities1), len(entities2))
    
    # Early exit: if entity overlap is clearly too low, skip expensive SequenceMatcher
    if entity_jaccard < 0.25 and (not subject_union or subject_jaccard < 0.35):
        return 0.0
    
    # Sequence similarity (expensive — only run for promising candidates)
    seq_ratio = SequenceMatcher(None, t1, t2).ratio()
    
    # --- Scoring ---
    # Use a combined score that weights subject overlap heavily
    # Subject Jaccard is the primary signal (prevents template false-positives)
    # Entity Jaccard provides broader context
    # Sequence ratio catches phrasing similarity
    
    if subject_union:
        # We have subject info — weight it heavily
        score = (0.40 * subject_jaccard) + (0.20 * entity_jaccard) + (0.25 * seq_ratio) + (0.15 * entity_recall)
    else:
        # No subjects distinguishable — use entity Jaccard as before
        score = (0.55 * entity_jaccard) + (0.30 * seq_ratio) + (0.15 * entity_recall)
    
    # Hard floor: need at least some meaningful overlap
    if entity_jaccard < 0.15:
        return 0.0
    
    # For entity-heavy titles with low subject overlap, penalize
    if subject_union and subject_jaccard < 0.25:
        return 0.0
    
    # Additional guard: if both sides have 2+ subjects and subject recall < 50%,
    # the markets are about different things even if they share one common entity.
    # E.g., "Doug Burgum leave Trump Cabinet" vs "Marco Rubio leave Trump Cabinet"
    #   subjects1={doug, burgum, trump}, subjects2={marco, rubio, trump} → intersection={trump}
    #   subject_recall = 1/3 = 0.33 < 0.50 → block
    if subjects1 and subjects2:
        subject_recall = len(subject_intersection) / min(len(subjects1), len(subjects2))
        if subject_recall < 0.50:
            return 0.0
    
    return score


@router.get("/opportunities", response_model=ArbitrageResponse)
async def get_arbitrage_opportunities(
    min_spread: float = Query(default=0.5, ge=0.1, le=20.0, description="Minimum spread percentage"),
    min_match_score: float = Query(default=0.40, ge=0.3, le=1.0, description="Minimum similarity score"),
    limit: int = Query(default=50, ge=1, le=200, description="Maximum opportunities to return"),
    db: Session = Depends(get_db)
):
    """
    Find arbitrage opportunities across all platforms.
    Results are cached for 60 seconds to ensure sub-second response times.
    """
    start_time = time.time()
    
    # Check cache first (critical for performance — scan takes 10-15s)
    cache_key = f"{min_spread}_{min_match_score}_{limit}"
    now = time.time()
    if (_arb_cache["data"] is not None 
        and (now - _arb_cache["timestamp"]) < _arb_cache["ttl"]
        and _arb_cache.get("key") == cache_key):
        cached = _arb_cache["data"]
        cached["stats"]["scan_time"] = 0.001  # Indicate cache hit
        logger.info("Arbitrage: serving from cache")
        return ArbitrageResponse(**cached)
    
    try:
        # Fetch markets from Polymarket and Kalshi only (focused approach for quality)
        poly_markets, kalshi_markets = await asyncio.gather(
            fetch_polymarket_markets(db),
            fetch_kalshi_markets(),
            return_exceptions=True
        )
        
        # Handle exceptions
        poly_markets = [] if isinstance(poly_markets, Exception) else poly_markets
        kalshi_markets = [] if isinstance(kalshi_markets, Exception) else kalshi_markets
        
        logger.info(f"Fetched markets: Poly={len(poly_markets)}, Kalshi={len(kalshi_markets)}")
        
        # Combine Polymarket and Kalshi markets, filtering out bad data
        all_markets = []
        for markets, platform in [
            (poly_markets, 'poly'),
            (kalshi_markets, 'kalshi'),
        ]:
            for m in markets:
                price = m.get('price')
                volume = m.get('volume', 0)
                
                # Skip markets with no real price data
                if price is None or price <= 0:
                    continue
                
                # Skip OpinionTrade markets stuck at default 0.50 price
                # ALL OpinionTrade markets at exactly $0.50 are untraded defaults
                # with no real price discovery — they create 100% false matches
                if platform == 'opiniontrade' and abs(price - 0.50) < 0.02:
                    continue
                
                # Skip Kalshi markets stuck at exactly 0.50 (default when no trades)
                # These are phantom prices that create false arbitrage signals
                if platform == 'kalshi' and abs(price - 0.50) < 0.005:
                    continue
                
                # Volume floor: markets with < $50 volume can't be traded
                # and just waste comparison time (especially for 16K Polymarket markets)
                if volume < 50:
                    continue
                
                # For initial market collection, accept any market with a valid price
                # Volume filtering happens later at the opportunity level
                m['platform'] = platform
                all_markets.append(m)
        # Log per-platform counts after filtering
        platform_counts = {}
        for m in all_markets:
            p = m.get('platform', '?')
            platform_counts[p] = platform_counts.get(p, 0) + 1
        logger.info(f"After filtering: {len(all_markets)} markets — {platform_counts}")
        
        # Reset start_time so time budget applies ONLY to comparison phase
        # The fetch phase can take 30-120s for Polymarket price lookups
        fetch_time = time.time() - start_time
        logger.info(f"Fetch phase completed in {fetch_time:.1f}s, starting comparison phase")
        start_time = time.time()
        
        if not all_markets:
            return ArbitrageResponse(
                opportunities=[],
                stats=ArbitrageStats(
                    total_opportunities=0,
                    avg_spread=0.0,
                    total_profit_potential=0.0,
                    markets_scanned=0,
                    platform_pairs=0,
                    scan_time=time.time() - start_time
                )
            )
        
        # ============================================================
        # INVERTED INDEX APPROACH — O(candidates) instead of O(n²)
        # ============================================================
        # Instead of comparing every market to every other market,
        # build a word→markets inverted index. For each market, look up
        # only the markets that share at least one entity word.
        # This turns 16K×3.6K = 57M comparisons into ~50K.
        # ============================================================
        
        opportunities = []
        processed_pairs = set()  # Track deduplicated groups
        
        # Group markets by platform
        platform_markets = {}
        for idx, m in enumerate(all_markets):
            p = m['platform']
            if p not in platform_markets:
                platform_markets[p] = []
            platform_markets[p].append((idx, m))
        
        platforms = list(platform_markets.keys())
        logger.info(f"Comparing across {len(platforms)} platforms: {[f'{p}={len(platform_markets[p])}' for p in platforms]}")
        
        # Pre-compute entity word sets and slug entities for every market
        market_words = {}
        market_slug_entities = {}
        _slug_noise = _STOP_WORDS | {'kx', '', 'be', 'at', 'et', 'am', 'pm', 'utc'}
        
        for idx, m in enumerate(all_markets):
            title = m.get('title', '')
            # Use the module-level _extract_entities for consistency
            entities = _extract_entities(title)
            market_words[idx] = entities
            
            # Pre-compute slug entities (skip hex IDs like Polymarket condition_ids)
            slug = str(m.get('id', '')).lower()
            if slug and len(slug) > 10 and not slug.startswith('0x'):
                slug_words = set(re.split(r'[-_]', slug)) - _slug_noise
                market_slug_entities[idx] = {_ENTITY_ALIASES.get(w, w) for w in slug_words if len(w) >= 3 and not w.isdigit()}
            else:
                market_slug_entities[idx] = set()
        
        # Build per-platform inverted index: word → list of (idx, market)
        platform_word_index = {}
        for p in platforms:
            word_index = {}
            for idx, m in platform_markets[p]:
                for word in market_words[idx]:
                    if word not in word_index:
                        word_index[word] = []
                    word_index[word].append((idx, m))
            platform_word_index[p] = word_index
        
        # For each pair of platforms, use the SMALLER platform's markets
        # to probe the LARGER platform's inverted index
        comparisons_done = 0
        
        for p1_idx in range(len(platforms)):
            if time.time() - start_time > _SCAN_TIME_BUDGET:
                logger.warning(f"Arbitrage scan time budget exceeded at platform level")
                break
            for p2_idx in range(p1_idx + 1, len(platforms)):
                p1, p2 = platforms[p1_idx], platforms[p2_idx]
                
                # Probe from the smaller platform into the larger platform's index
                if len(platform_markets[p1]) <= len(platform_markets[p2]):
                    probe_platform, index_platform = p1, p2
                    probe_markets = platform_markets[p1]
                    word_index = platform_word_index[p2]
                else:
                    probe_platform, index_platform = p2, p1
                    probe_markets = platform_markets[p2]
                    word_index = platform_word_index[p1]
                
                for probe_idx, probe_m in probe_markets:
                    # Time budget check — bail out before DO's request timeout
                    if time.time() - start_time > _SCAN_TIME_BUDGET:
                        logger.warning(f"Arbitrage scan time budget exceeded ({_SCAN_TIME_BUDGET}s), returning partial results")
                        break
                    
                    probe_words = market_words[probe_idx]
                    if not probe_words:
                        continue
                    
                    # Gather candidate matches from inverted index
                    # Require at least 1 shared entity word to reduce false candidates
                    candidate_counts: Dict[int, int] = {}
                    for word in probe_words:
                        if word in word_index:
                            for cand_idx, cand_m in word_index[word]:
                                candidate_counts[cand_idx] = candidate_counts.get(cand_idx, 0) + 1
                    
                    # Only consider candidates sharing 1+ entity words (lowered from 2 for better recall)
                    candidate_set = {idx for idx, count in candidate_counts.items() if count >= 1}
                    
                    if not candidate_set:
                        continue
                    
                    for cand_idx in candidate_set:
                        comparisons_done += 1
                        cand_m = all_markets[cand_idx]
                        
                        # Determine which is m1, m2 based on original platform assignment
                        if probe_platform == p1:
                            m1, m2, idx1, idx2 = probe_m, cand_m, probe_idx, cand_idx
                        else:
                            m1, m2, idx1, idx2 = cand_m, probe_m, cand_idx, probe_idx
                        
                        # Full similarity check
                        similarity = calculate_similarity(m1.get('title', ''), m2.get('title', ''))
                        
                        if similarity < min_match_score:
                            continue
                        
                        # Slug-based validation (skip for hex IDs like Polymarket condition_ids)
                        se1 = market_slug_entities.get(idx1, set())
                        se2 = market_slug_entities.get(idx2, set())
                        if se1 and se2:
                            slug_shared = se1 & se2
                            slug_union = se1 | se2
                            if not slug_shared:
                                continue
                            if len(slug_shared) / len(slug_union) < 0.35:
                                continue
                        
                        # Build group: start with these two, find matches from other platforms
                        group = {p1: m1, p2: m2}
                        group_similarities = [similarity]
                        
                        # Look for matches from remaining platforms using THEIR inverted index
                        for p3_idx in range(len(platforms)):
                            if p3_idx == p1_idx or p3_idx == p2_idx:
                                continue
                            p3 = platforms[p3_idx]
                            p3_word_index = platform_word_index[p3]
                            
                            # Find candidates in p3 that share words with m1
                            p3_candidates = set()
                            for word in market_words[idx1]:
                                if word in p3_word_index:
                                    for ci, cm in p3_word_index[word]:
                                        p3_candidates.add((ci, id(cm)))
                            
                            best_sim = 0
                            best_m3 = None
                            for ci, _ in p3_candidates:
                                cm = all_markets[ci]
                                sim = calculate_similarity(m1.get('title', ''), cm.get('title', ''))
                                if sim >= min_match_score and sim > best_sim:
                                    best_sim = sim
                                    best_m3 = cm
                            if best_m3:
                                group[p3] = best_m3
                                group_similarities.append(best_sim)
                        
                        # Deduplicate: use sorted platform+id key
                        group_key = tuple(sorted(f"{p}:{group[p].get('id','')}" for p in group))
                        if group_key in processed_pairs:
                            continue
                        processed_pairs.add(group_key)
            
                        avg_match_score = sum(group_similarities) / len(group_similarities) if group_similarities else 0.0
                        
                        # Calculate prices and spreads
                        prices = {}
                        volumes = {}
                        
                        for platform, market in group.items():
                            price = market.get('price')
                            if price is not None and price > 0:
                                prices[platform] = float(price)
                                volumes[platform] = float(market.get('volume', 0))
                        
                        if len(prices) < 2:
                            continue
                        
                        # Find best buy (lowest) and best sell (highest)
                        sorted_prices = sorted(prices.items(), key=lambda x: x[1])
                        best_buy_platform, best_buy_price = sorted_prices[0]
                        best_sell_platform, best_sell_price = sorted_prices[-1]
                        
                        spread = best_sell_price - best_buy_price
                        spread_percent = (spread / best_buy_price) * 100
                        
                        # Filter unrealistic opportunities
                        if spread_percent < min_spread:
                            continue
                        
                        # Exclude extreme outliers (likely data errors)
                        if spread_percent > 100:
                            continue
                        
                        # Validate prices are in valid range (0-1)
                        if not (0 <= best_buy_price <= 1 and 0 <= best_sell_price <= 1):
                            continue
                        
                        # Require minimum volume to ensure tradability
                        min_volume = min(volumes.values()) if volumes else 0
                        avg_volume = sum(volumes.values()) / len(volumes) if volumes else 0
                        # Low threshold — feasibility score will grade actual executability
                        if min_volume < 10:
                            continue
                        
                        # Estimate profit potential (conservative: 2% of min volume, capped at $5K)
                        profit_potential = spread * min(min_volume * 0.02, 5000)
                        
                        # === EXECUTION FEASIBILITY SCORE ===
                        volume_ratio = min_volume / max(volumes.values()) if max(volumes.values()) > 0 else 0
                        
                        # Volume score: more volume = more executable (log scale)
                        vol_score = min(100, max(0, math.log10(max(min_volume, 1)) * 20))
                        
                        # Balance score: similar volumes on both sides = better execution
                        balance_score = volume_ratio * 100
                        
                        # Spread realism score
                        if spread_percent <= 2:
                            spread_score = 40
                        elif spread_percent <= 10:
                            spread_score = 100
                        elif spread_percent <= 25:
                            spread_score = 70
                        elif spread_percent <= 50:
                            spread_score = 30
                        else:
                            spread_score = 10
                        
                        feasibility_score = round((vol_score * 0.45) + (balance_score * 0.25) + (spread_score * 0.30), 1)
                        
                        # Estimated slippage based on volume
                        if min_volume > 100000:
                            estimated_slippage = 0.5
                        elif min_volume > 50000:
                            estimated_slippage = 1.0
                        elif min_volume > 10000:
                            estimated_slippage = 2.0
                        elif min_volume > 5000:
                            estimated_slippage = 3.5
                        else:
                            estimated_slippage = 5.0
                        
                        if feasibility_score >= 70:
                            feasibility_label = 'excellent'
                        elif feasibility_score >= 50:
                            feasibility_label = 'good'
                        elif feasibility_score >= 30:
                            feasibility_label = 'fair'
                        else:
                            feasibility_label = 'poor'
                        
                        # Calculate confidence
                        if spread_percent > 50:
                            confidence = 'low'
                        elif spread_percent > 15 and min_volume > 10000:
                            confidence = 'high'
                        elif spread_percent > 5 and min_volume > 5000:
                            confidence = 'medium'
                        else:
                            confidence = 'low'
                        
                        # Use first market's title as canonical
                        title = list(group.values())[0].get('title', 'Unknown Market')
                        valid_platforms = list(prices.keys())
                        market_ids = {p: str(group[p].get('id', '')) for p in valid_platforms}
                        
                        # --- Generate Strategy Explanation ---
                        _PLATFORM_LABELS = {
                            'poly': 'Polymarket', 
                            'kalshi': 'Kalshi',
                        }
                        buy_label = _PLATFORM_LABELS.get(best_buy_platform, best_buy_platform)
                        sell_label = _PLATFORM_LABELS.get(best_sell_platform, best_sell_platform)
                        buy_cents = best_buy_price * 100
                        sell_cents = best_sell_price * 100
                        spread_cents = spread * 100
                        
                        strategy_summary = (
                            f"BUY YES on {buy_label} at {buy_cents:.1f}¢ → "
                            f"SELL YES on {sell_label} at {sell_cents:.1f}¢ → "
                            f"Lock in {spread_cents:.1f}¢ profit per share"
                        )
                        
                        strategy_steps = [
                            f"1. Buy YES shares on {buy_label} at {buy_cents:.1f}¢ each",
                            f"2. Simultaneously sell YES shares on {sell_label} at {sell_cents:.1f}¢ each",
                            f"3. Profit: {spread_cents:.1f}¢ per share ({spread_percent:.1f}% spread)",
                            f"4. If event resolves YES: collect $1 on {buy_label}, pay $1 on {sell_label} → net zero + locked profit",
                            f"5. If event resolves NO: both positions expire worthless → you keep the {spread_cents:.1f}¢ difference",
                        ]
                        
                        opportunities.append(ArbitrageOpportunity(
                            id='-'.join(sorted(valid_platforms)) + '-' + str(len(opportunities)),
                            title=title,
                            platforms=valid_platforms,
                            prices=prices,
                            volumes=volumes,
                            market_ids=market_ids,
                            best_buy_platform=best_buy_platform,
                            best_buy_price=best_buy_price,
                            best_sell_platform=best_sell_platform,
                            best_sell_price=best_sell_price,
                            spread_percent=spread_percent,
                            profit_potential=profit_potential,
                            confidence=confidence,
                            match_score=round(avg_match_score, 3),
                            feasibility_score=feasibility_score,
                            feasibility_label=feasibility_label,
                            min_side_volume=round(min_volume, 2),
                            estimated_slippage=estimated_slippage,
                            strategy_summary=strategy_summary,
                            strategy_steps=strategy_steps,
                        ))
        
        logger.info(f"Inverted index comparisons: {comparisons_done} (vs {sum(len(platform_markets[p]) for p in platforms)**2 // 2} brute force)")
        
        # Log near-misses for tuning (matches that passed similarity but failed spread/volume)
        if len(opportunities) < 5:
            logger.info(f"Low opportunities ({len(opportunities)}). processed_pairs={len(processed_pairs)}")
        
        # === TITLE-BASED DEDUPLICATION ===
        # Problem: Kalshi splits events into sub-markets (one per candidate),
        # so "Wembanyama NBA MVP" on Polymarket matches 27 different Kalshi
        # "who-will-win-mvp-kx..." sub-markets, producing 27 duplicate results.
        # Fix: for each unique market title (normalized), keep only the BEST match.
        pre_dedup = len(opportunities)
        dedup_map = {}  # normalized_title -> best opportunity
        for opp in opportunities:
            # Normalize: extract subject entities as the dedup key
            title_key = frozenset(_extract_subject_entities(opp.title))
            platforms_key = frozenset(opp.platforms)
            dedup_key = (title_key, platforms_key)
            
            existing = dedup_map.get(dedup_key)
            if existing is None:
                dedup_map[dedup_key] = opp
            else:
                # Keep the one with higher match_score, then higher spread
                if (opp.match_score, opp.spread_percent) > (existing.match_score, existing.spread_percent):
                    dedup_map[dedup_key] = opp
        
        opportunities = list(dedup_map.values())
        logger.info(f"Title dedup: {pre_dedup} -> {len(opportunities)} opportunities")
        
        # Sort by confidence (high first), then by spread
        confidence_order = {'high': 0, 'medium': 1, 'low': 2}
        opportunities.sort(key=lambda x: (confidence_order.get(x.confidence, 3), -x.spread_percent))
        opportunities = opportunities[:limit]
        
        # Calculate stats
        total_opps = len(opportunities)
        avg_spread = sum(o.spread_percent for o in opportunities) / total_opps if total_opps else 0
        total_profit = sum(o.profit_potential for o in opportunities)
        platform_pairs = len(set(f"{o.best_buy_platform}-{o.best_sell_platform}" for o in opportunities))
        
        scan_time = time.time() - start_time
        
        logger.info(f"Found {total_opps} arbitrage opportunities in {scan_time:.2f}s "
                    f"(scanned {len(all_markets)} markets)")
        
        result = ArbitrageResponse(
            opportunities=opportunities,
            stats=ArbitrageStats(
                total_opportunities=total_opps,
                avg_spread=round(avg_spread, 2),
                total_profit_potential=round(total_profit, 2),
                markets_scanned=len(all_markets),
                platform_pairs=platform_pairs,
                scan_time=round(scan_time, 2)
            )
        )
        
        # Cache the result for subsequent requests
        _arb_cache["data"] = result.model_dump()
        _arb_cache["timestamp"] = time.time()
        _arb_cache["key"] = cache_key
        
        return result
        
    except Exception as e:
        logger.error(f"Arbitrage scan error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


async def fetch_polymarket_markets(db: Session) -> List[Dict]:
    """
    Fetch Polymarket markets with LIVE prices via Dome API.
    
    The events endpoint has NO prices. We must:
    1. Fetch markets from /v1/polymarket/markets (has token IDs)
    2. Batch-fetch live prices from /v1/polymarket/market-price/{token_id}
    
    Falls back to DB if available, then cache as last resort.
    """
    import os
    import httpx
    
    dome_api_key = os.getenv("DOME_API_KEY", "")
    if not dome_api_key:
        logger.warning("No DOME_API_KEY set, falling back to DB for Polymarket")
        return await _fetch_polymarket_from_db(db)
    
    try:
        headers = {
            "Authorization": f"Bearer {dome_api_key}",
            "Content-Type": "application/json",
        }
        base_url = "https://api.domeapi.io"
        
        async with httpx.AsyncClient(timeout=httpx.Timeout(30.0)) as client:
            # Step 1: Fetch markets (paginated) — get titles, token IDs, volumes
            all_raw_markets = []
            pagination_key = None
            max_pages = 10  # ~1000 markets — balance between coverage and API rate limits
            
            for page_num in range(max_pages):
                params = {"limit": 100}
                if pagination_key:
                    params["pagination_key"] = pagination_key
                
                resp = await client.get(
                    f"{base_url}/v1/polymarket/markets",
                    headers=headers,
                    params=params
                )
                resp.raise_for_status()
                data = resp.json()
                
                markets_page = data.get("markets", [])
                if not markets_page:
                    break
                
                all_raw_markets.extend(markets_page)
                
                pagination = data.get("pagination", {})
                if not pagination.get("has_more"):
                    break
                pagination_key = pagination.get("pagination_key")
                if not pagination_key:
                    break
            
            logger.info(f"Polymarket: fetched {len(all_raw_markets)} raw markets from Dome API")
            
            if not all_raw_markets:
                logger.warning("Polymarket: 0 markets from Dome API, falling back to DB")
                return await _fetch_polymarket_from_db(db)
            
            # Step 2: Batch-fetch live prices for all markets via token IDs
            # Extract token_id (side_a.id) for each market
            token_map = {}  # token_id -> market index
            for i, m in enumerate(all_raw_markets):
                side_a = m.get("side_a", {})
                token_id = side_a.get("id") if isinstance(side_a, dict) else None
                if token_id:
                    token_map[token_id] = i
            
            logger.info(f"Polymarket: fetching live prices for {len(token_map)} tokens...")
            
            # Batch price fetches with concurrency control and rate limit handling
            token_prices = {}
            semaphore = asyncio.Semaphore(10)  # Max 10 concurrent price requests (reduced from 25)
            
            async def fetch_price(token_id: str, retry_count: int = 0) -> tuple:
                async with semaphore:
                    try:
                        resp = await client.get(
                            f"{base_url}/v1/polymarket/market-price/{token_id}",
                            headers=headers
                        )
                        resp.raise_for_status()
                        price_data = resp.json()
                        return token_id, price_data.get("price")
                    except httpx.HTTPStatusError as e:
                        # Handle rate limiting with exponential backoff
                        if e.response.status_code == 429 and retry_count < 2:
                            await asyncio.sleep(0.5 * (2 ** retry_count))  # 0.5s, then 1s
                            return await fetch_price(token_id, retry_count + 1)
                        return token_id, None
                    except Exception as e:
                        return token_id, None
            
            # Fire all price requests in parallel
            price_tasks = [fetch_price(tid) for tid in token_map.keys()]
            
            # Process in batches to avoid overwhelming the API
            batch_size = 50  # Smaller batches (reduced from 100)
            for i in range(0, len(price_tasks), batch_size):
                batch = price_tasks[i:i+batch_size]
                results = await asyncio.gather(*batch, return_exceptions=True)
                for result in results:
                    if isinstance(result, tuple):
                        tid, price = result
                        if price is not None:
                            token_prices[tid] = float(price)
                # Longer delay between batches to respect rate limits
                if i + batch_size < len(price_tasks):
                    await asyncio.sleep(0.2)  # 200ms delay between batches
            
            logger.info(f"Polymarket: got live prices for {len(token_prices)}/{len(token_map)} tokens")
            
            # Step 3: Build market list with real prices
            markets = []
            for m in all_raw_markets:
                side_a = m.get("side_a", {})
                token_id = side_a.get("id") if isinstance(side_a, dict) else None
                
                # Get live price for this token
                price = token_prices.get(token_id) if token_id else None
                
                # Get volume
                volume = m.get("volume_total", 0) or m.get("volume_fiat_amount", 0) or 0
                try:
                    volume = float(volume)
                except (ValueError, TypeError):
                    volume = 0
                
                # Use market_slug or condition_id as ID
                market_id = m.get("market_slug") or m.get("condition_id") or m.get("id", "")
                title = m.get("title") or m.get("question") or ""
                
                markets.append({
                    'id': market_id,
                    'title': title,
                    'price': price,
                    'volume': volume
                })
            
            priced = sum(1 for m in markets if m['price'] is not None)
            logger.info(f"Polymarket DIRECT API: {len(markets)} markets, {priced} with live prices")
            return markets
    
    except Exception as e:
        logger.error(f"Polymarket direct API fetch failed: {e}", exc_info=True)
        logger.warning("Falling back to DB for Polymarket...")
        return await _fetch_polymarket_from_db(db)


async def _fetch_polymarket_from_db(db: Session) -> List[Dict]:
    """Fallback: fetch Polymarket markets from DB."""
    try:
        db.execute(text("SET statement_timeout = '5000'"))
        query = """
            SELECT 
                source_market_id as id,
                question as title,
                yes_price as price,
                COALESCE(volume_24h, volume_total, 0) as volume
            FROM predictions_silver.markets
            WHERE source = 'polymarket' 
              AND status = 'active'
              AND yes_price IS NOT NULL
              AND yes_price > 0
              AND yes_price < 1
              AND COALESCE(volume_total, 0) >= 100
            ORDER BY COALESCE(volume_total, 0) DESC
            LIMIT 3000
        """
        result = db.execute(text(query))
        markets = []
        for row in result:
            markets.append({
                'id': row.id,
                'title': row.title,
                'price': float(row.price) if row.price else None,
                'volume': float(row.volume) if row.volume else 0
            })
        db.execute(text("SET statement_timeout = '0'"))
        logger.info(f"Polymarket DB fallback: fetched {len(markets)} markets")
        return markets
    except Exception as e:
        logger.warning(f"Polymarket DB fallback also failed ({e})")
        try:
            db.rollback()
        except:
            pass
        return []


async def fetch_kalshi_markets() -> List[Dict]:
    """
    Fetch Kalshi markets DIRECTLY from Dome API via KalshiAPIClient.
    Uses bid/ask orderbook prices (not stale cache data).
    """
    try:
        client = get_kalshi_client()
        # Fetch all markets directly from API (with client-level 60s cache)
        raw_markets = await client.fetch_all_markets(
            status="open",
            max_markets=5000,
            use_cache=True,  # Client has 5min cache, much fresher than ProductionCache
        )
        
        if not raw_markets:
            logger.warning("Kalshi direct API returned 0 markets")
            return []
        
        markets = []
        for raw in raw_markets:
            # Use the service's transform_to_event which handles bid/ask pricing
            event = client.transform_to_event(raw)
            
            yes_price = event.get("yes_price")
            if yes_price is None:
                # Try top_market
                top_market = event.get("top_market", {})
                yes_price = top_market.get("yes_price")
            
            volume = event.get("total_volume", 0) or 0
            
            # Get market_ticker for proper URL construction
            market_ticker = raw.get("market_ticker") or event.get("market_ticker", "")
            
            markets.append({
                'id': market_ticker or event.get("event_id", ""),  # Use market_ticker as primary ID
                'title': event.get("title", ""),
                'price': yes_price,
                'volume': float(volume),
                'market_ticker': market_ticker,  # Store for URL generation
            })
        
        priced = sum(1 for m in markets if m['price'] is not None)
        logger.info(f"Kalshi DIRECT API: {len(markets)} markets, {priced} with prices")
        return markets
    except Exception as e:
        logger.error(f"Kalshi direct API fetch failed: {e}", exc_info=True)
        return []


async def _fetch_from_cache(platform: str) -> List[Dict]:
    """
    DEPRECATED fallback — only used if direct API fetchers fail.
    All platforms should use their direct API fetchers above.
    """
    try:
        cache_service = get_production_cache()
        raw_markets = await cache_service.get_markets(platform)
        
        if not raw_markets:
            logger.warning(f"{platform} cache returned 0 markets")
            return []
        
        markets = []
        for m in raw_markets:
            price = m.get('yes_price') or m.get('top_market', {}).get('yes_price')
            if price is None:
                price = m.get('price') or m.get('yesPrice')
                if price is not None and price > 1:
                    price = float(price) / 100
            
            volume = m.get('total_volume') or m.get('volume') or 0
            if isinstance(volume, str):
                try:
                    volume = float(str(volume).replace('$', '').replace(',', ''))
                except:
                    volume = 0
            
            markets.append({
                'id': m.get('event_id') or m.get('condition_id') or m.get('slug') or str(m.get('marketId', '')),
                'title': m.get('title') or m.get('question') or m.get('event_title') or m.get('marketTitle', ''),
                'price': float(price) if price else None,
                'volume': float(volume) if volume else 0
            })
        
        logger.info(f"{platform}: fetched {len(markets)} markets from cache (FALLBACK)")
        return markets
    except Exception as e:
        logger.error(f"Error fetching {platform} markets from cache: {e}")
        return []
