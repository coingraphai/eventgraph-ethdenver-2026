"""
Cross-Venue Market Comparison API
Shows similar markets across Polymarket and Kalshi for price/liquidity comparison

STRATEGY: Focus on TOP VOLUME events (500-1000 per platform) to find meaningful matches
like Fed Chair nominations, elections, crypto prices that exist on BOTH platforms.
"""
from fastapi import APIRouter, Query, Depends
from sqlalchemy.orm import Session
from typing import List, Dict, Any, Optional, Union
from pydantic import BaseModel
import time
import asyncio
import logging
import os
import httpx

from app.database.session import get_db
from app.services.kalshi_service import get_kalshi_client
from app.services.production_cache_service import get_production_cache
from app.api.arbitrage import (
    calculate_similarity,
    _extract_entities,
)

router = APIRouter()

def get_dome_api_key() -> str:
    """Get Dome API key safely"""
    return os.getenv("DOME_API_KEY", "").strip()
logger = logging.getLogger(__name__)

# Cache for cross-venue comparisons
_cross_venue_cache: Dict[str, Any] = {
    "data": None,
    "timestamp": 0.0,
    "ttl": 60.0,  # 60 second cache (increased for stability)
}


class CrossVenueMarket(BaseModel):
    """A matched market pair across venues"""
    title: str
    similarity_score: float
    match_confidence: str  # "high" (0.9+), "medium" (0.75-0.9), "low" (<0.75)
    # Polymarket data
    poly_id: str
    poly_price: float  # Mid price
    poly_bid: float
    poly_ask: float
    poly_volume: float
    poly_market_url: str
    poly_close_date: Optional[Union[str, int]] = None
    # Kalshi data
    kalshi_id: str
    kalshi_ticker: str
    kalshi_price: float  # Mid price
    kalshi_bid: float
    kalshi_ask: float
    kalshi_volume: float
    kalshi_market_url: str
    kalshi_close_date: Optional[Union[str, int]] = None
    # Comparison metrics
    price_diff: float  # poly_price - kalshi_price
    price_diff_percent: float
    spread_percent: float  # abs(price_diff) / avg_price * 100
    volume_ratio: float  # poly_volume / kalshi_volume
    poly_bullish: bool  # True if Polymarket is more bullish (higher price)
    # Opportunity detection (clean formula)
    is_opportunity: bool
    gross_spread: float  # sell_price - buy_price
    net_spread: float  # after fees and slippage
    buy_venue: str  # "polymarket" or "kalshi"
    sell_venue: str  # "polymarket" or "kalshi"
    potential_profit_pct: float  # net_spread / buy_price * 100


class CrossVenueStats(BaseModel):
    total_matches: int
    high_confidence_matches: int
    avg_similarity: float
    avg_spread: float
    markets_with_spread_gt_5pct: int
    opportunities_found: int
    avg_net_spread: float
    scan_time: float


class CrossVenueResponse(BaseModel):
    matches: List[CrossVenueMarket]
    stats: CrossVenueStats


@router.get("/cross-venue", response_model=CrossVenueResponse)
async def get_cross_venue_comparison(
    min_similarity: float = Query(default=0.70, ge=0.5, le=1.0, description="Minimum similarity score (0-1)"),
    min_volume: float = Query(default=100, ge=0, description="Minimum volume on each platform ($)"),
    limit: int = Query(default=100, ge=10, le=500, description="Max number of matches to return"),
    db: Session = Depends(get_db)
):
    """
    Get matched markets across Polymarket and Kalshi for comparison.
    Shows side-by-side pricing, volume, and spreads.
    """
    start_time = time.time()
    
    # Check cache
    now = time.time()
    if _cross_venue_cache["data"] and (now - _cross_venue_cache["timestamp"]) < _cross_venue_cache["ttl"]:
        logger.info("Cross-venue: serving from cache")
        # Re-filter cached data with current parameters
        cached_matches = _cross_venue_cache["data"]
        filtered = [
            m for m in cached_matches
            if m.similarity_score >= min_similarity
            and m.poly_volume >= min_volume
            and m.kalshi_volume >= min_volume
        ][:limit]
        
        stats = _calculate_stats(filtered, time.time() - start_time)
        return CrossVenueResponse(matches=filtered, stats=stats)
    
    # Fetch markets from both platforms using Dome API (top volume events)
    logger.info("Cross-venue: fetching TOP VOLUME events from Polymarket and Kalshi via Dome API...")
    poly_markets, kalshi_markets = await asyncio.gather(
        fetch_polymarket_top_events(),
        fetch_kalshi_top_events(),
        return_exceptions=True
    )
    
    if isinstance(poly_markets, Exception):
        logger.error(f"Polymarket fetch failed: {poly_markets}")
        poly_markets = []
    if isinstance(kalshi_markets, Exception):
        logger.error(f"Kalshi fetch failed: {kalshi_markets}")
        kalshi_markets = []
    
    logger.info(f"Fetched Poly={len(poly_markets)}, Kalshi={len(kalshi_markets)}")
    
    # Filter out markets without prices
    poly_markets = [m for m in poly_markets if m.get('price') and m.get('price') > 0 and m.get('volume', 0) >= min_volume]
    kalshi_markets = [m for m in kalshi_markets if m.get('price') and m.get('price') > 0 and m.get('volume', 0) >= min_volume]
    
    logger.info(f"After filtering: Poly={len(poly_markets)}, Kalshi={len(kalshi_markets)}")
    
    # Build inverted index for Kalshi markets
    kalshi_index = {}
    for idx, km in enumerate(kalshi_markets):
        entities = _extract_entities(km.get('title', ''))
        for entity in entities:
            if entity not in kalshi_index:
                kalshi_index[entity] = []
            kalshi_index[entity].append((idx, km))
    
    # Match markets
    matches = []
    for pm in poly_markets:
        poly_title = pm.get('title', '')
        poly_entities = _extract_entities(poly_title)
        
        if not poly_entities:
            continue
        
        # Find candidate Kalshi markets
        candidates = {}
        for entity in poly_entities:
            if entity in kalshi_index:
                for idx, km in kalshi_index[entity]:
                    candidates[idx] = km
        
        # Score each candidate
        for km in candidates.values():
            kalshi_title = km.get('title', '')
            similarity = calculate_similarity(poly_title, kalshi_title)
            
            if similarity < min_similarity:
                continue
            
            # Determine match confidence based on similarity
            if similarity >= 0.90:
                match_confidence = "high"
            elif similarity >= 0.75:
                match_confidence = "medium"
            else:
                match_confidence = "low"
            
            # Calculate comparison metrics
            poly_price = float(pm.get('price', 0))
            poly_bid = float(pm.get('bid', poly_price * 0.98))  # Fallback to 98% of mid if no bid
            poly_ask = float(pm.get('ask', poly_price * 1.02))  # Fallback to 102% of mid if no ask
            kalshi_price = float(km.get('price', 0))
            kalshi_bid = float(km.get('bid', kalshi_price * 0.98))
            kalshi_ask = float(km.get('ask', kalshi_price * 1.02))
            poly_volume = float(pm.get('volume', 0))
            kalshi_volume = float(km.get('volume', 0))
            
            # Get close dates for validation
            poly_close_date = pm.get('end_date') or pm.get('close_date')
            kalshi_close_date = km.get('end_date') or km.get('close_date')
            
            price_diff = poly_price - kalshi_price
            avg_price = (poly_price + kalshi_price) / 2
            price_diff_percent = (price_diff / avg_price * 100) if avg_price > 0 else 0
            spread_percent = abs(price_diff_percent)
            volume_ratio = poly_volume / kalshi_volume if kalshi_volume > 0 else 0
            
            # 🏆 Clean Opportunity Detection Formula
            # For each matched event:
            #   buy_price = lowest_ask_across_venues
            #   sell_price = highest_bid_across_venues
            #   gross_spread = sell_price - buy_price
            #   net_spread = gross_spread - fees - slippage_buffer
            #   if net_spread >= threshold and liquidity_ok: mark_as_opportunity
            
            # Find best buy and sell prices
            lowest_ask = min(poly_ask, kalshi_ask)
            highest_bid = max(poly_bid, kalshi_bid)
            
            # Determine buy/sell venues
            if poly_ask <= kalshi_ask:
                buy_venue = "polymarket"
                sell_venue = "kalshi"
            else:
                buy_venue = "kalshi"
                sell_venue = "polymarket"
            
            # Calculate spreads
            gross_spread = highest_bid - lowest_ask
            
            # Estimate fees and slippage
            # Polymarket: ~2% fee on profits
            # Kalshi: ~7% fee on profits
            # Slippage: ~0.5% buffer for market movement
            poly_fee = 0.02
            kalshi_fee = 0.07
            slippage_buffer = 0.005
            
            if buy_venue == "polymarket":
                total_cost_adjustment = poly_fee + kalshi_fee + slippage_buffer
            else:
                total_cost_adjustment = kalshi_fee + poly_fee + slippage_buffer
            
            net_spread = gross_spread - (lowest_ask * total_cost_adjustment)
            
            # Mark as opportunity if:
            # 1. Net spread is positive and >= 0.5% threshold
            # 2. High confidence match (similarity >= 0.90)
            # 3. Sufficient liquidity on both sides (>= min_volume)
            min_spread_threshold = 0.005  # 0.5%
            is_opportunity = (
                net_spread >= min_spread_threshold and
                similarity >= 0.90 and
                poly_volume >= min_volume and
                kalshi_volume >= min_volume
            )
            
            potential_profit_pct = (net_spread / lowest_ask * 100) if lowest_ask > 0 else 0
            
            # Construct market URLs
            poly_id = pm.get('id', '')
            kalshi_ticker = km.get('market_ticker', '') or km.get('id', '')
            
            # Polymarket: use search since condition_ids don't map well
            poly_url = f"https://polymarket.com/search?query={poly_title}&ref=eventgraph"
            
            # Kalshi: use trade page with ticker
            if kalshi_ticker:
                kalshi_url = f"https://kalshi.com/trade/{kalshi_ticker.upper()}"
            else:
                kalshi_url = f"https://kalshi.com/browse?search={kalshi_title}"
            
            matches.append(CrossVenueMarket(
                title=poly_title,  # Use Polymarket title as canonical
                similarity_score=round(similarity, 3),
                match_confidence=match_confidence,
                poly_id=poly_id,
                poly_price=poly_price,
                poly_bid=round(poly_bid, 4),
                poly_ask=round(poly_ask, 4),
                poly_volume=poly_volume,
                poly_market_url=poly_url,
                poly_close_date=poly_close_date,
                kalshi_id=km.get('id', ''),
                kalshi_ticker=kalshi_ticker,
                kalshi_price=kalshi_price,
                kalshi_bid=round(kalshi_bid, 4),
                kalshi_ask=round(kalshi_ask, 4),
                kalshi_volume=kalshi_volume,
                kalshi_market_url=kalshi_url,
                kalshi_close_date=kalshi_close_date,
                price_diff=round(price_diff, 4),
                price_diff_percent=round(price_diff_percent, 2),
                spread_percent=round(spread_percent, 2),
                volume_ratio=round(volume_ratio, 2),
                poly_bullish=(poly_price > kalshi_price),
                is_opportunity=is_opportunity,
                gross_spread=round(gross_spread, 4),
                net_spread=round(net_spread, 4),
                buy_venue=buy_venue,
                sell_venue=sell_venue,
                potential_profit_pct=round(potential_profit_pct, 2)
            ))
    
    # Sort by opportunity potential (opportunities first, then by net spread)
    matches.sort(key=lambda m: (m.is_opportunity, m.net_spread if m.is_opportunity else m.spread_percent), reverse=True)
    
    # Cache all matches
    _cross_venue_cache["data"] = matches
    _cross_venue_cache["timestamp"] = time.time()
    
    # Apply limit
    matches = matches[:limit]
    
    # Calculate stats
    stats = _calculate_stats(matches, time.time() - start_time)
    
    logger.info(f"Found {len(matches)} cross-venue matches in {stats.scan_time:.2f}s")
    
    return CrossVenueResponse(matches=matches, stats=stats)


async def fetch_polymarket_top_events() -> List[Dict]:
    """
    Fetch TOP VOLUME Polymarket events directly from Dome API.
    Focus on 500+ events sorted by volume to find meaningful cross-venue matches.
    """
    dome_api_key = os.getenv("DOME_API_KEY", "")
    if not dome_api_key:
        logger.warning("No DOME_API_KEY - cannot fetch Polymarket events")
        return []
    
    try:
        headers = {
            "Authorization": f"Bearer {dome_api_key}",
            "Content-Type": "application/json",
        }
        base_url = "https://api.domeapi.io"
        
        async with httpx.AsyncClient(timeout=httpx.Timeout(30.0)) as client:
            # Fetch EVENTS (grouped markets) sorted by volume
            # This gives us high-quality prediction markets like Fed Chair, Elections, etc.
            all_events = []
            pagination_key = None
            max_pages = 5  # ~500 top-volume events (faster response)
            
            for page_num in range(max_pages):
                params = {
                    "limit": 100,
                    "status": "open",
                }
                if pagination_key:
                    params["pagination_key"] = pagination_key
                
                resp = await client.get(
                    f"{base_url}/v1/polymarket/events",
                    headers=headers,
                    params=params
                )
                resp.raise_for_status()
                data = resp.json()
                
                events_page = data.get("events", [])
                if not events_page:
                    break
                
                # Process each event
                for event in events_page:
                    # Volume is in 'volume_fiat_amount' field (in dollars)
                    volume = event.get("volume_fiat_amount", 0) or event.get("volume", 0) or 0
                    if volume < 10000:  # Skip low-volume events (< $10k)
                        continue
                    
                    # Get the main market from the event
                    markets = event.get("markets", [])
                    
                    # Default price estimation based on title keywords
                    yes_price = 0.5  # Default to 50%
                    
                    # Try to get price from markets array if available
                    if markets:
                        main_market = markets[0]
                        if "outcomes" in main_market and isinstance(main_market["outcomes"], list):
                            for outcome in main_market["outcomes"]:
                                if outcome.get("title", "").lower() in ["yes", "true"]:
                                    yes_price = outcome.get("price", 0.5)
                                    break
                        if yes_price == 0.5:
                            yes_price = main_market.get("yes_price") or main_market.get("price") or 0.5
                    
                    all_events.append({
                        'id': event.get("event_slug", "") or event.get("id", ""),
                        'title': event.get("title", ""),
                        'price': yes_price,
                        'bid': yes_price * 0.98 if yes_price else None,  # Estimate
                        'ask': yes_price * 1.02 if yes_price else None,  # Estimate
                        'volume': float(volume),
                        'end_date': event.get("end_time"),
                        'event_slug': event.get("event_slug", ""),
                    })
                
                pagination = data.get("pagination", {})
                if not pagination.get("has_more"):
                    break
                pagination_key = pagination.get("pagination_key")
                if not pagination_key:
                    break
            
            # Sort by volume (highest first)
            all_events.sort(key=lambda e: e.get('volume', 0), reverse=True)
            
            logger.info(f"Polymarket: fetched {len(all_events)} top-volume events via Dome API")
            return all_events
            
    except Exception as e:
        logger.error(f"Polymarket Dome API fetch failed: {e}", exc_info=True)
        return []


async def fetch_kalshi_top_events() -> List[Dict]:
    """
    Fetch TOP VOLUME Kalshi events directly from Dome API.
    Focus on 500+ events sorted by volume.
    """
    dome_api_key = os.getenv("DOME_API_KEY", "")
    if not dome_api_key:
        logger.warning("No DOME_API_KEY - cannot fetch Kalshi events")
        return []
    
    try:
        headers = {
            "Authorization": f"Bearer {dome_api_key}",
            "Content-Type": "application/json",
        }
        base_url = "https://api.domeapi.io"
        
        async with httpx.AsyncClient(timeout=httpx.Timeout(30.0)) as client:
            # Fetch markets with min_volume filter for high-quality matches
            all_markets = []
            offset = 0
            max_pages = 5  # Get top 500 high-volume markets (faster response)
            
            for page_num in range(max_pages):
                params = {
                    "limit": 100,
                    "offset": offset,
                    "status": "open",
                    "min_volume": 5000,  # Only markets with $5k+ volume
                }
                
                resp = await client.get(
                    f"{base_url}/v1/kalshi/markets",
                    headers=headers,
                    params=params
                )
                resp.raise_for_status()
                data = resp.json()
                
                markets_page = data.get("markets", [])
                if not markets_page:
                    break
                
                for market in markets_page:
                    volume = market.get("volume", 0) or 0
                    # Kalshi prices are in cents (0-100), convert to decimal
                    last_price = market.get("last_price", 50)
                    if last_price and last_price > 1:
                        yes_price = last_price / 100.0  # Convert from cents to decimal
                    else:
                        yes_price = last_price or 0.5
                    
                    yes_bid = market.get("yes_bid")
                    yes_ask = market.get("yes_ask")
                    if yes_bid and yes_bid > 1:
                        yes_bid = yes_bid / 100.0
                    if yes_ask and yes_ask > 1:
                        yes_ask = yes_ask / 100.0
                    
                    all_markets.append({
                        'id': market.get("market_ticker", "") or market.get("ticker", ""),
                        'title': market.get("title", ""),
                        'price': yes_price,
                        'bid': yes_bid if yes_bid else (yes_price * 0.98 if yes_price else None),
                        'ask': yes_ask if yes_ask else (yes_price * 1.02 if yes_price else None),
                        'volume': float(volume),
                        'market_ticker': market.get("market_ticker", "") or market.get("ticker", ""),
                        'end_date': market.get("end_time") or market.get("close_time"),
                        'event_ticker': market.get("event_ticker", ""),
                    })
                
                total = data.get("pagination", {}).get("total", 0)
                offset += len(markets_page)
                if offset >= total or len(markets_page) < 100:
                    break
            
            # Sort by volume
            all_markets.sort(key=lambda m: m.get('volume', 0), reverse=True)
            
            logger.info(f"Kalshi: fetched {len(all_markets)} top-volume markets via Dome API")
            return all_markets
            
    except Exception as e:
        logger.error(f"Kalshi Dome API fetch failed: {e}", exc_info=True)
        return []


async def fetch_kalshi_markets() -> List[Dict]:
    """Fetch Kalshi markets - prefer Dome API, fallback to client"""
    # Try Dome API first (better volume sorting)
    dome_markets = await fetch_kalshi_top_events()
    if dome_markets:
        return dome_markets
    
    # Fallback to Kalshi client
    try:
        client = get_kalshi_client()
        raw_markets = await client.fetch_all_markets(
            status="open",
            max_markets=5000,
            use_cache=True,
        )
        
        if not raw_markets:
            return []
        
        markets = []
        for raw in raw_markets:
            event = client.transform_to_event(raw)
            yes_price = event.get("yes_price")
            if yes_price is None:
                top_market = event.get("top_market", {})
                yes_price = top_market.get("yes_price")
            
            volume = event.get("total_volume", 0) or 0
            market_ticker = raw.get("market_ticker") or event.get("market_ticker", "")
            
            markets.append({
                'id': market_ticker or event.get("event_id", ""),
                'title': event.get("title", ""),
                'price': yes_price,
                'volume': float(volume),
                'market_ticker': market_ticker,
            })
        
        return markets
    except Exception as e:
        logger.error(f"Kalshi fetch failed: {e}", exc_info=True)
        return []


def _calculate_stats(matches: List[CrossVenueMarket], scan_time: float) -> CrossVenueStats:
    """Calculate aggregate statistics for matches"""
    if not matches:
        return CrossVenueStats(
            total_matches=0,
            high_confidence_matches=0,
            avg_similarity=0.0,
            avg_spread=0.0,
            markets_with_spread_gt_5pct=0,
            opportunities_found=0,
            avg_net_spread=0.0,
            scan_time=round(scan_time, 2)
        )
    
    opportunities = [m for m in matches if m.is_opportunity]
    high_confidence = [m for m in matches if m.match_confidence == "high"]
    
    return CrossVenueStats(
        total_matches=len(matches),
        high_confidence_matches=len(high_confidence),
        avg_similarity=round(sum(m.similarity_score for m in matches) / len(matches), 3),
        avg_spread=round(sum(m.spread_percent for m in matches) / len(matches), 2),
        markets_with_spread_gt_5pct=sum(1 for m in matches if m.spread_percent > 5.0),
        opportunities_found=len(opportunities),
        avg_net_spread=round(sum(m.net_spread for m in opportunities) / len(opportunities), 4) if opportunities else 0.0,
        scan_time=round(scan_time, 2)
    )
