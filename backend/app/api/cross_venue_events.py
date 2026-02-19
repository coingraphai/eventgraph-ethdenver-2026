"""
Cross-Venue EVENT Comparison API
================================

Matches EVENTS (not individual markets) across Polymarket and Kalshi.
Shows event-level metrics AND individual market YES/NO prices.
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
from collections import defaultdict

from app.database.session import get_db
from app.api.arbitrage import calculate_similarity, _extract_entities

router = APIRouter()
logger = logging.getLogger(__name__)

# Cache for cross-venue events
_cross_venue_events_cache: Dict[str, Any] = {
    "data": None,
    "timestamp": 0.0,
    "ttl": 120.0,  # 2 minute cache
}


class MarketOutcome(BaseModel):
    """A single market/outcome within an event"""
    market_id: str
    title: str
    yes_price: Optional[float] = None
    no_price: Optional[float] = None
    yes_bid: Optional[float] = None
    yes_ask: Optional[float] = None
    volume: float = 0
    url: Optional[str] = None


class PlatformEvent(BaseModel):
    """Event data from a single platform"""
    event_id: str
    title: str
    url: str
    total_volume: float
    market_count: int
    end_date: Optional[Union[str, int]] = None
    category: Optional[str] = None
    markets: List[MarketOutcome] = []  # Individual markets with prices


class CrossVenueEvent(BaseModel):
    """A matched event pair across venues"""
    canonical_title: str
    similarity_score: float
    match_confidence: str  # "high", "medium", "low"
    
    polymarket: PlatformEvent
    kalshi: PlatformEvent
    
    # Combined metrics
    total_volume: float
    volume_difference: float
    volume_ratio: float
    market_count_diff: int
    end_date_match: bool


class CrossVenueEventsStats(BaseModel):
    total_event_matches: int
    high_confidence_matches: int
    avg_similarity: float
    total_combined_volume: float
    polymarket_events_scanned: int
    kalshi_events_scanned: int
    scan_time: float


class CrossVenueEventsResponse(BaseModel):
    events: List[CrossVenueEvent]
    stats: CrossVenueEventsStats


@router.get("/cross-venue-events", response_model=CrossVenueEventsResponse)
async def get_cross_venue_events(
    min_similarity: float = Query(default=0.65, ge=0.4, le=1.0, description="Minimum similarity score"),
    min_volume: float = Query(default=5000, ge=0, description="Minimum total volume ($)"),
    limit: int = Query(default=50, ge=5, le=200, description="Max number of event matches"),
    db: Session = Depends(get_db)
):
    """
    Get matched EVENTS across Polymarket and Kalshi with individual market prices.
    """
    start_time = time.time()
    
    # Check cache
    now = time.time()
    if _cross_venue_events_cache["data"] and (now - _cross_venue_events_cache["timestamp"]) < _cross_venue_events_cache["ttl"]:
        logger.info("Cross-venue events: serving from cache")
        cached_data = _cross_venue_events_cache["data"]
        cached_events = cached_data["events"]
        # Re-filter
        filtered = [e for e in cached_events if e.similarity_score >= min_similarity and e.total_volume >= min_volume][:limit]
        stats = CrossVenueEventsStats(
            total_event_matches=len(filtered),
            high_confidence_matches=sum(1 for e in filtered if e.match_confidence == "high"),
            avg_similarity=round(sum(e.similarity_score for e in filtered) / len(filtered), 3) if filtered else 0,
            total_combined_volume=sum(e.total_volume for e in filtered),
            polymarket_events_scanned=cached_data["poly_count"],
            kalshi_events_scanned=cached_data["kalshi_count"],
            scan_time=round(time.time() - start_time, 2)
        )
        return CrossVenueEventsResponse(events=filtered, stats=stats)
    
    # Fetch events from both platforms
    logger.info("Cross-venue events: fetching events from Polymarket and Kalshi...")
    poly_events, kalshi_events = await asyncio.gather(
        fetch_polymarket_events_with_markets(),
        fetch_kalshi_events_with_markets(),
        return_exceptions=True
    )
    
    if isinstance(poly_events, Exception):
        logger.error(f"Polymarket events fetch failed: {poly_events}")
        poly_events = []
    if isinstance(kalshi_events, Exception):
        logger.error(f"Kalshi events fetch failed: {kalshi_events}")
        kalshi_events = []
    
    poly_count = len(poly_events)
    kalshi_count = len(kalshi_events)
    logger.info(f"Fetched {poly_count} Polymarket events, {kalshi_count} Kalshi events")
    
    # Build index for Kalshi events - index by multiple entities
    kalshi_index = defaultdict(list)
    for ke in kalshi_events:
        entities = list(_extract_entities(ke['title']))
        # Also add normalized words
        words = ke['title'].lower().split()
        key_words = [w for w in words if len(w) > 4 and w not in {'will', 'the', 'what', 'which', 'before', 'after', 'during'}]
        entities.extend(key_words[:5])
        
        for entity in set(entities):
            kalshi_index[entity].append(ke)
    
    # Match events
    matches = []
    matched_kalshi = set()
    
    for pe in poly_events:
        poly_title = pe['title']
        poly_entities = list(_extract_entities(poly_title))
        
        # Add key words for better matching
        words = poly_title.lower().split()
        key_words = [w for w in words if len(w) > 4 and w not in {'will', 'the', 'what', 'which', 'before', 'after', 'during'}]
        poly_entities.extend(key_words[:5])
        poly_entities = list(set(poly_entities))
        
        if not poly_entities:
            continue
        
        # Find candidate Kalshi events
        candidates = {}
        for entity in poly_entities:
            if entity in kalshi_index:
                for ke in kalshi_index[entity]:
                    ke_id = ke['event_id']
                    if ke_id not in matched_kalshi:
                        candidates[ke_id] = ke
        
        # Score each candidate
        best_match = None
        best_similarity = 0
        
        for ke_id, ke in candidates.items():
            kalshi_title = ke['title']
            similarity = calculate_similarity(poly_title, kalshi_title)
            
            if similarity > best_similarity and similarity >= min_similarity:
                best_similarity = similarity
                best_match = (ke, similarity)
        
        if best_match:
            ke, similarity = best_match
            matched_kalshi.add(ke['event_id'])
            
            # Determine confidence
            if similarity >= 0.90:
                confidence = "high"
            elif similarity >= 0.75:
                confidence = "medium"
            else:
                confidence = "low"
            
            # Calculate combined metrics
            total_vol = pe['volume'] + ke['volume']
            vol_diff = abs(pe['volume'] - ke['volume'])
            vol_ratio = max(pe['volume'], ke['volume']) / max(min(pe['volume'], ke['volume']), 1)
            market_diff = abs(pe['market_count'] - ke['market_count'])
            
            # Check if end dates roughly match (within 30 days)
            end_match = False
            if pe.get('end_date') and ke.get('end_date'):
                try:
                    pe_end = int(pe['end_date']) if pe['end_date'] else 0
                    ke_end = int(ke['end_date']) if ke['end_date'] else 0
                    end_match = abs(pe_end - ke_end) < 30 * 24 * 3600  # 30 days
                except:
                    pass
            
            # Use the longer/better title as canonical
            canonical = poly_title if len(poly_title) >= len(ke['title']) else ke['title']
            
            matches.append(CrossVenueEvent(
                canonical_title=canonical,
                similarity_score=round(similarity, 3),
                match_confidence=confidence,
                polymarket=PlatformEvent(
                    event_id=pe['event_id'],
                    title=poly_title,
                    url=pe['url'],
                    total_volume=pe['volume'],
                    market_count=pe['market_count'],
                    end_date=pe.get('end_date'),
                    category=pe.get('category'),
                    markets=pe.get('markets', []),
                ),
                kalshi=PlatformEvent(
                    event_id=ke['event_id'],
                    title=ke['title'],
                    url=ke['url'],
                    total_volume=ke['volume'],
                    market_count=ke['market_count'],
                    end_date=ke.get('end_date'),
                    category=ke.get('category'),
                    markets=ke.get('markets', []),
                ),
                total_volume=total_vol,
                volume_difference=vol_diff,
                volume_ratio=round(vol_ratio, 2),
                market_count_diff=market_diff,
                end_date_match=end_match,
            ))
    
    # Sort by total volume (highest first)
    matches.sort(key=lambda m: m.total_volume, reverse=True)
    
    # Cache all matches
    _cross_venue_events_cache["data"] = {
        "events": matches,
        "poly_count": poly_count,
        "kalshi_count": kalshi_count,
    }
    _cross_venue_events_cache["timestamp"] = time.time()
    
    # Apply filters and limit
    filtered = [m for m in matches if m.total_volume >= min_volume][:limit]
    
    stats = CrossVenueEventsStats(
        total_event_matches=len(filtered),
        high_confidence_matches=sum(1 for e in filtered if e.match_confidence == "high"),
        avg_similarity=round(sum(e.similarity_score for e in filtered) / len(filtered), 3) if filtered else 0,
        total_combined_volume=sum(e.total_volume for e in filtered),
        polymarket_events_scanned=poly_count,
        kalshi_events_scanned=kalshi_count,
        scan_time=round(time.time() - start_time, 2)
    )
    logger.info(f"Found {len(filtered)} cross-venue event matches in {stats.scan_time:.2f}s")
    
    return CrossVenueEventsResponse(events=filtered, stats=stats)


async def fetch_polymarket_events_with_markets() -> List[Dict]:
    """Fetch Polymarket events AND markets, join them together"""
    dome_api_key = os.getenv("DOME_API_KEY", "")
    if not dome_api_key:
        logger.warning("No DOME_API_KEY")
        return []
    
    try:
        headers = {
            "Authorization": f"Bearer {dome_api_key}",
            "Content-Type": "application/json",
        }
        
        async with httpx.AsyncClient(timeout=httpx.Timeout(90.0)) as client:
            # Step 1: Fetch events
            all_events = []
            event_slugs = set()
            pagination_key = None
            
            for page in range(10):  # Max 1000 events
                params = {"limit": 100, "status": "open"}
                if pagination_key:
                    params["pagination_key"] = pagination_key
                
                resp = await client.get(
                    "https://api.domeapi.io/v1/polymarket/events",
                    headers=headers,
                    params=params
                )
                resp.raise_for_status()
                data = resp.json()
                
                for event in data.get("events", []):
                    volume = event.get("volume_fiat_amount", 0) or 0
                    if volume < 1000:  # Skip very low volume
                        continue
                    
                    slug = event.get("event_slug", "")
                    if not slug:
                        continue
                    
                    event_slugs.add(slug)
                    tags = event.get("tags") or []
                    category = tags[0] if tags else None
                    
                    all_events.append({
                        'event_id': slug,
                        'title': event.get("title", ""),
                        'url': f"https://polymarket.com/event/{slug}",
                        'volume': float(volume),
                        'market_count': event.get("market_count", 0) or 0,
                        'end_date': event.get("end_time"),
                        'category': category,
                        'markets': [],  # Will be populated later
                    })
                
                pagination = data.get("pagination", {})
                if not pagination.get("has_more"):
                    break
                pagination_key = pagination.get("pagination_key")
                if not pagination_key:
                    break
            
            logger.info(f"Polymarket: fetched {len(all_events)} events")
            
            # Step 2: Fetch markets for top events (by volume)
            # Sort events by volume and take top 200 for market fetch
            all_events.sort(key=lambda e: e['volume'], reverse=True)
            top_event_slugs = [e['event_id'] for e in all_events[:200]]
            
            # Build markets index by event_slug
            markets_by_event: Dict[str, List[MarketOutcome]] = defaultdict(list)
            
            # Fetch markets in batches
            pagination_key = None
            for page in range(20):  # Fetch up to 2000 markets
                params = {"limit": 100, "status": "open", "min_volume": 1000}
                if pagination_key:
                    params["pagination_key"] = pagination_key
                
                resp = await client.get(
                    "https://api.domeapi.io/v1/polymarket/markets",
                    headers=headers,
                    params=params
                )
                resp.raise_for_status()
                data = resp.json()
                
                for mkt in data.get("markets", []):
                    event_slug = mkt.get("event_slug", "")
                    if event_slug not in top_event_slugs:
                        continue
                    
                    market_slug = mkt.get("market_slug", "")
                    side_a = mkt.get("side_a", {})
                    side_b = mkt.get("side_b", {})
                    
                    # For Polymarket we don't have live prices from Dome API
                    # Just show volume and allow user to click through
                    vol = mkt.get("volume_total", 0) or 0
                    
                    markets_by_event[event_slug].append(MarketOutcome(
                        market_id=side_a.get("id", market_slug),
                        title=mkt.get("title", ""),
                        yes_price=None,  # No price data from Dome API
                        no_price=None,
                        yes_bid=None,
                        yes_ask=None,
                        volume=vol,
                        url=f"https://polymarket.com/event/{event_slug}/{market_slug}" if market_slug else None,
                    ))
                
                pagination = data.get("pagination", {})
                if not pagination.get("has_more"):
                    break
                pagination_key = pagination.get("pagination_key")
                if not pagination_key:
                    break
            
            # Step 3: Assign markets to events
            for event in all_events:
                event_slug = event['event_id']
                if event_slug in markets_by_event:
                    mkts = markets_by_event[event_slug]
                    # Sort by volume
                    mkts.sort(key=lambda m: m.volume, reverse=True)
                    event['markets'] = mkts[:20]  # Max 20 markets per event
            
            logger.info(f"Polymarket: assigned markets to {len(markets_by_event)} events")
            return all_events
            
    except Exception as e:
        logger.error(f"Polymarket events fetch failed: {e}")
        import traceback
        traceback.print_exc()
        return []


async def fetch_kalshi_events_with_markets() -> List[Dict]:
    """Fetch Kalshi events by grouping markets by event_ticker, including prices"""
    dome_api_key = os.getenv("DOME_API_KEY", "")
    if not dome_api_key:
        logger.warning("No DOME_API_KEY")
        return []
    
    try:
        headers = {
            "Authorization": f"Bearer {dome_api_key}",
            "Content-Type": "application/json",
        }
        
        async with httpx.AsyncClient(timeout=httpx.Timeout(90.0)) as client:
            # Fetch markets and group by event_ticker
            events = defaultdict(lambda: {
                'title': '',
                'volume': 0,
                'market_count': 0,
                'end_date': None,
                'markets': []
            })
            
            offset = 0
            for _ in range(15):  # Max 1500 markets
                params = {
                    "limit": 100,
                    "offset": offset,
                    "status": "open",
                }
                
                resp = await client.get(
                    "https://api.domeapi.io/v1/kalshi/markets",
                    headers=headers,
                    params=params
                )
                resp.raise_for_status()
                data = resp.json()
                
                markets = data.get("markets", [])
                if not markets:
                    break
                
                for market in markets:
                    event_ticker = market.get("event_ticker", "")
                    if not event_ticker:
                        continue
                    
                    market_ticker = market.get("market_ticker", "")
                    
                    # Get prices
                    yes_price = market.get("last_price", 0)
                    if yes_price > 1:
                        yes_price = yes_price / 100  # Convert from cents
                    
                    yes_bid = market.get("yes_bid", market.get("bid"))
                    yes_ask = market.get("yes_ask", market.get("ask"))
                    if yes_bid and yes_bid > 1:
                        yes_bid = yes_bid / 100
                    if yes_ask and yes_ask > 1:
                        yes_ask = yes_ask / 100
                    
                    mkt_volume = market.get("volume", 0) or 0
                    
                    # Aggregate by event
                    events[event_ticker]['volume'] += mkt_volume
                    events[event_ticker]['market_count'] += 1
                    events[event_ticker]['end_date'] = market.get("end_time") or market.get("close_time")
                    
                    # Use first market title as event title
                    if not events[event_ticker]['title']:
                        events[event_ticker]['title'] = market.get("title", "")
                    
                    events[event_ticker]['markets'].append(MarketOutcome(
                        market_id=market_ticker,
                        title=market.get("title", ""),
                        yes_price=yes_price,
                        no_price=1 - yes_price if yes_price else None,
                        yes_bid=yes_bid,
                        yes_ask=yes_ask,
                        volume=mkt_volume,
                        url=f"https://kalshi.com/markets/{market_ticker.lower()}" if market_ticker else None,
                    ))
                
                offset += len(markets)
                total = data.get("pagination", {}).get("total", 0)
                if offset >= total:
                    break
            
            # Convert to list and build URLs
            all_events = []
            for event_ticker, edata in events.items():
                if edata['volume'] < 1000:
                    continue
                
                # Sort markets by volume
                edata['markets'].sort(key=lambda m: m.volume, reverse=True)
                
                # Get base event ticker for URL (remove date suffix)
                base_ticker = event_ticker.split('-')[0] if '-' in event_ticker else event_ticker
                
                all_events.append({
                    'event_id': event_ticker,
                    'title': edata['title'],
                    'url': f"https://kalshi.com/markets/{base_ticker.lower()}",
                    'volume': float(edata['volume']),
                    'market_count': edata['market_count'],
                    'end_date': edata['end_date'],
                    'category': None,
                    'markets': edata['markets'][:20],  # Max 20 markets
                })
            
            # Sort by volume
            all_events.sort(key=lambda e: e['volume'], reverse=True)
            logger.info(f"Kalshi: fetched {len(all_events)} events with markets")
            return all_events
            
    except Exception as e:
        logger.error(f"Kalshi events fetch failed: {e}")
        return []
