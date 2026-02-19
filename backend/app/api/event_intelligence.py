"""
Event Intelligence API - Aggregated event-wide analytics

Fetches trades & orderbook data for ALL markets in an event and computes:
- Event-wide flow bias (aggregate buy/sell pressure)
- Whale activity summary (large trades across all markets)
- Momentum movers (biggest price changes)
- Market-level signals (heat, flow, whale, risk)
- Live trade feed for the event

Uses Dome API for Polymarket/Kalshi data.
"""

from fastapi import APIRouter, Query, HTTPException
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
import logging
import asyncio
import httpx
import os
from dotenv import load_dotenv
from collections import defaultdict

load_dotenv()

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/event-intelligence", tags=["Event Intelligence"])

# Dome API config
DOME_API_KEY = os.getenv("DOME_API_KEY", "")
DOME_API_BASE = "https://api.domeapi.io"


def get_headers():
    return {
        "Authorization": f"Bearer {DOME_API_KEY}",
        "Content-Type": "application/json"
    }


# ============================================================================
# Trade & Orderbook Fetching
# ============================================================================

async def fetch_market_trades(client: httpx.AsyncClient, market_slug: str, hours: int = 24) -> tuple:
    """Fetch trades for a single market from Dome API.
    
    Returns:
        Tuple of (trades_list, total_count) where total_count is the real 
        total from API pagination (not capped at limit).
    """
    try:
        start_time = int((datetime.utcnow() - timedelta(hours=hours)).timestamp())
        
        response = await client.get(
            f"{DOME_API_BASE}/v1/polymarket/orders",
            params={
                "market_slug": market_slug,
                "start_time": start_time,
                "limit": 500,
            },
            headers=get_headers(),
            timeout=15.0
        )
        response.raise_for_status()
        data = response.json()
        trades = data.get("orders", [])
        # pagination.total gives the real count (not capped by limit)
        total_count = data.get("pagination", {}).get("total", len(trades))
        return trades, total_count
    except Exception as e:
        logger.warning(f"Failed to fetch trades for {market_slug}: {e}")
        return [], 0


async def fetch_market_orderbook(client: httpx.AsyncClient, token_id: str) -> Dict:
    """Fetch current orderbook for a token from Dome API."""
    try:
        # Get orderbook snapshots (last hour)
        end_time = int(datetime.utcnow().timestamp() * 1000)
        start_time = end_time - (60 * 60 * 1000)  # 1 hour in ms
        
        response = await client.get(
            f"{DOME_API_BASE}/v1/polymarket/orderbooks",
            params={
                "token_id": token_id,
                "start_time": start_time,
                "end_time": end_time,
                "limit": 1,  # Just latest
            },
            headers=get_headers(),
            timeout=15.0
        )
        response.raise_for_status()
        data = response.json()
        snapshots = data.get("snapshots", [])
        if snapshots:
            return snapshots[-1]  # Most recent
        return {}
    except Exception as e:
        logger.warning(f"Failed to fetch orderbook for {token_id[:20]}...: {e}")
        return {}


async def fetch_market_price_history(client: httpx.AsyncClient, token_id: str, hours: int = 24) -> List[Dict]:
    """Fetch price history by sampling at intervals."""
    prices = []
    try:
        now = datetime.utcnow()
        # Sample every 30 mins for last 24h = 48 points
        for i in range(0, hours * 2, 1):
            at_time = int((now - timedelta(minutes=i * 30)).timestamp())
            response = await client.get(
                f"{DOME_API_BASE}/v1/polymarket/market-price/{token_id}",
                params={"at_time": at_time},
                headers=get_headers(),
                timeout=10.0
            )
            if response.status_code == 200:
                data = response.json()
                prices.append({
                    "timestamp": at_time,
                    "price": data.get("price", 0)
                })
            # Rate limit protection
            if i > 0 and i % 10 == 0:
                await asyncio.sleep(0.1)
    except Exception as e:
        logger.warning(f"Failed to fetch price history: {e}")
    
    return list(reversed(prices))


# ============================================================================
# Kalshi-Specific Fetching (via Dome API)
# ============================================================================

async def fetch_kalshi_market_trades(client: httpx.AsyncClient, market_ticker: str, hours: int = 24) -> tuple:
    """Fetch trades for a single Kalshi market from Dome API.
    
    Returns:
        Tuple of (trades_list, total_count) where total_count is the real 
        total from API pagination (not capped at limit).
    """
    try:
        start_time = int((datetime.utcnow() - timedelta(hours=hours)).timestamp())
        
        response = await client.get(
            f"{DOME_API_BASE}/v1/kalshi/trades",
            params={
                "ticker": market_ticker,
                "start_time": start_time,
                "limit": 500,
            },
            headers=get_headers(),
            timeout=15.0
        )
        response.raise_for_status()
        data = response.json()
        trades = data.get("trades", [])
        total_count = data.get("pagination", {}).get("total", len(trades))
        
        # Normalize Kalshi trade format to match Polymarket structure
        normalized = []
        for t in trades:
            # Kalshi returns yes_price/no_price in cents (0-100)
            yes_price = float(t.get("yes_price_dollars", 0) or t.get("yes_price", 0) / 100)
            no_price = float(t.get("no_price_dollars", 0) or t.get("no_price", 0) / 100)
            count = int(t.get("count", 1))
            taker_side = t.get("taker_side", "yes").upper()
            
            # Determine trade side (BUY = buying YES, SELL = buying NO)
            if taker_side.lower() == "yes":
                side = "BUY"
                price = yes_price
            else:
                side = "SELL"
                price = no_price
            
            # Calculate value (count * price in dollars)
            value = count * price
            
            normalized.append({
                "trade_id": t.get("trade_id"),
                "market_ticker": market_ticker,
                "side": side,
                "price": price,
                "shares_normalized": count,
                "quantity": count,
                "timestamp": t.get("created_time"),
                "value": value,
            })
        
        return normalized, total_count
    except Exception as e:
        logger.warning(f"Failed to fetch Kalshi trades for {market_ticker}: {e}")
        return [], 0


async def fetch_kalshi_market_orderbook(client: httpx.AsyncClient, market_ticker: str) -> Dict:
    """Fetch current orderbook for a Kalshi market from Dome API."""
    try:
        # Get latest orderbook snapshot (no time params = latest)
        response = await client.get(
            f"{DOME_API_BASE}/v1/kalshi/orderbooks",
            params={
                "ticker": market_ticker,
                "limit": 1,  # Just latest
            },
            headers=get_headers(),
            timeout=15.0
        )
        response.raise_for_status()
        data = response.json()
        snapshots = data.get("snapshots", [])
        
        if snapshots:
            snapshot = snapshots[-1]
            orderbook = snapshot.get("orderbook", {})
            
            # Normalize to standard format with bids/asks
            # Kalshi returns: yes (bids for YES), no (bids for NO)
            # yes_dollars/no_dollars are in decimal format
            yes_bids = orderbook.get("yes_dollars", []) or orderbook.get("yes", [])
            no_bids = orderbook.get("no_dollars", []) or orderbook.get("no", [])
            
            # Convert to standard bid/ask format
            # YES bids are our "bids" (buying YES)
            # NO bids are effectively "asks" for YES (price of NO = 1 - price of YES)
            bids = []
            asks = []
            
            for level in yes_bids:
                if isinstance(level, list) and len(level) >= 2:
                    price = float(level[0]) if isinstance(level[0], (int, float)) else float(level[0])
                    size = float(level[1])
                    # Convert cents to decimal if needed
                    if price > 1:
                        price = price / 100
                    bids.append({"price": price, "size": size})
            
            for level in no_bids:
                if isinstance(level, list) and len(level) >= 2:
                    price = float(level[0]) if isinstance(level[0], (int, float)) else float(level[0])
                    size = float(level[1])
                    # Convert cents to decimal if needed
                    if price > 1:
                        price = price / 100
                    # NO bids at price X means YES asks at price (1 - X)
                    asks.append({"price": 1 - price, "size": size})
            
            return {"bids": bids, "asks": asks}
        return {}
    except Exception as e:
        logger.warning(f"Failed to fetch Kalshi orderbook for {market_ticker}: {e}")
        return {}


async def fetch_kalshi_market_price_history(client: httpx.AsyncClient, market_ticker: str, hours: int = 24) -> List[Dict]:
    """Fetch price history for Kalshi market by sampling at intervals."""
    prices = []
    try:
        now = datetime.utcnow()
        # Sample every 30 mins for last 24h = 48 points
        for i in range(0, hours * 2, 1):
            at_time = int((now - timedelta(minutes=i * 30)).timestamp())
            response = await client.get(
                f"{DOME_API_BASE}/v1/kalshi/market-price/{market_ticker}",
                params={"at_time": at_time},
                headers=get_headers(),
                timeout=10.0
            )
            if response.status_code == 200:
                data = response.json()
                yes_data = data.get("yes", {})
                price = yes_data.get("price", 0)
                prices.append({
                    "timestamp": at_time,
                    "price": price
                })
            # Rate limit protection
            if i > 0 and i % 10 == 0:
                await asyncio.sleep(0.1)
    except Exception as e:
        logger.warning(f"Failed to fetch Kalshi price history for {market_ticker}: {e}")
    
    return list(reversed(prices))


async def fetch_kalshi_event_markets(client: httpx.AsyncClient, event_ticker: str) -> List[Dict]:
    """Fetch all markets for a Kalshi event."""
    try:
        all_markets = []
        pagination_key = None
        
        while True:
            params = {
                "event_ticker[]": event_ticker,
                "limit": 100,
            }
            if pagination_key:
                params["pagination_key"] = pagination_key
            
            response = await client.get(
                f"{DOME_API_BASE}/v1/kalshi/markets",
                params=params,
                headers=get_headers(),
                timeout=15.0
            )
            response.raise_for_status()
            data = response.json()
            markets = data.get("markets", [])
            all_markets.extend(markets)
            
            pagination = data.get("pagination", {})
            if pagination.get("has_more") and pagination.get("pagination_key"):
                pagination_key = pagination["pagination_key"]
            else:
                break
        
        return all_markets
    except Exception as e:
        logger.warning(f"Failed to fetch Kalshi markets for event {event_ticker}: {e}")
        return []


# ============================================================================
# Metric Calculations
# ============================================================================

def calculate_trade_metrics(trades: List[Dict], api_total_count: int = None) -> Dict:
    """Calculate metrics from a list of trades.
    
    Args:
        trades: List of trade dicts (may be capped at 500 by API limit)
        api_total_count: Real total trade count from API pagination metadata.
                        If provided, used instead of len(trades) for total_trades.
    """
    if not trades:
        return {
            "total_trades": api_total_count or 0,
            "total_volume": 0,
            "buy_volume": 0,
            "sell_volume": 0,
            "buy_count": 0,
            "sell_count": 0,
            "flow_score": 0,
            "avg_trade_size": 0,
            "whale_trades": [],
            "large_trades": [],
            "whale_count": 0,
            "whale_volume": 0,
            "whale_share": 0,
            "vwap": 0,
            "trades_per_hour": 0,
        }
    
    buy_volume = 0
    sell_volume = 0
    buy_count = 0
    sell_count = 0
    total_value = 0
    weighted_price_sum = 0
    sizes = []
    
    for t in trades:
        size = float(t.get("shares_normalized", 0) or t.get("quantity", 0) or 0)
        price = float(t.get("price", 0) or 0)
        value = size * price
        
        sizes.append(size)
        total_value += value
        weighted_price_sum += price * size
        
        if t.get("side") == "BUY":
            buy_volume += size
            buy_count += 1
        else:
            sell_volume += size
            sell_count += 1
    
    total_volume = buy_volume + sell_volume
    flow_score = int(100 * (buy_volume - sell_volume) / total_volume) if total_volume > 0 else 0
    vwap = weighted_price_sum / total_volume if total_volume > 0 else 0
    avg_trade_size = total_value / len(trades) if trades else 0
    
    # Whale detection (top 5% by size)
    if len(sizes) >= 10:
        sizes_sorted = sorted(sizes)
        whale_threshold = sizes_sorted[int(len(sizes) * 0.95)]
    else:
        whale_threshold = float('inf')
    
    whale_trades = []
    large_trades = []  # All trades >= $500 USD (for frontend filter buttons)
    whale_volume = 0
    LARGE_TRADE_MIN_USD = 500  # Minimum USD value for "large trades" table
    
    for t in trades:
        size = float(t.get("shares_normalized", 0) or t.get("quantity", 0) or 0)
        raw_price = float(t.get("price", 0))
        # Convert to YES probability (NO trades have price > 0.5)
        yes_price = raw_price if raw_price <= 0.5 else 1 - raw_price
        # Calculate USD value based on actual trade size
        size_usd = size * raw_price  # Original value in $
        
        trade_entry = {
            "timestamp": t.get("timestamp"),
            "side": t.get("side"),
            "size": size,
            "price": yes_price,  # YES probability
            "size_usd": size_usd,  # USD value
            "value": size_usd,
            "market_slug": t.get("market_slug"),
            "market_question": t.get("title", ""),
            "title": t.get("title", ""),
        }
        
        # Whale detection (percentile-based, for analytics)
        if size >= whale_threshold and whale_threshold < float('inf'):
            whale_volume += size
            whale_trades.append(trade_entry)
        
        # Large trades (fixed USD threshold, for the filterable table)
        if size_usd >= LARGE_TRADE_MIN_USD:
            large_trades.append(trade_entry)
    
    # Trades per hour
    if trades:
        try:
            timestamps = []
            for t in trades:
                ts = t.get("timestamp")
                if ts:
                    if isinstance(ts, str):
                        timestamps.append(datetime.fromisoformat(ts.replace("Z", "+00:00")))
                    else:
                        timestamps.append(datetime.fromtimestamp(ts))
            
            if len(timestamps) >= 2:
                time_span = (max(timestamps) - min(timestamps)).total_seconds() / 3600
                trades_per_hour = len(trades) / max(time_span, 1)
            else:
                trades_per_hour = len(trades)
        except:
            trades_per_hour = 0
    else:
        trades_per_hour = 0
    
    return {
        "total_trades": api_total_count if api_total_count is not None else len(trades),
        "total_volume": total_volume,
        "buy_volume": buy_volume,
        "sell_volume": sell_volume,
        "buy_count": buy_count,
        "sell_count": sell_count,
        "flow_score": flow_score,
        "avg_trade_size": avg_trade_size,
        "whale_trades": sorted(whale_trades, key=lambda x: x.get("value", 0), reverse=True)[:100],
        "large_trades": sorted(large_trades, key=lambda x: x.get("value", 0), reverse=True)[:200],
        "whale_count": len(whale_trades),
        "whale_volume": whale_volume,
        "whale_share": (whale_volume / total_volume * 100) if total_volume > 0 else 0,
        "vwap": round(vwap, 4),
        "trades_per_hour": round(trades_per_hour, 1),
    }


def calculate_advanced_trade_signals(trades: List[Dict]) -> Dict:
    """Calculate advanced trading signals from trade history."""
    if not trades:
        return {
            "velocity_1h": 0,
            "velocity_change": 0,
            "velocity_trend": "stable",
            "smart_money_flow": 0,
            "smart_money_signal": "neutral",
            "large_trade_ratio": 0,
            "recent_large_buys": 0,
            "recent_large_sells": 0,
            "momentum_score": 0,
        }
    
    # Parse timestamps
    parsed_trades = []
    for t in trades:
        try:
            ts = t.get("timestamp")
            if ts:
                if isinstance(ts, str):
                    dt = datetime.fromisoformat(ts.replace("Z", "+00:00")).replace(tzinfo=None)
                else:
                    dt = datetime.fromtimestamp(ts)
                
                size = float(t.get("shares_normalized", 0) or t.get("quantity", 0) or 0)
                price = float(t.get("price", 0))
                yes_price = price if price <= 0.5 else 1 - price
                
                parsed_trades.append({
                    "time": dt,
                    "side": t.get("side"),
                    "size": size,
                    "price": yes_price,
                    "value": size * price,
                })
        except:
            pass
    
    if not parsed_trades:
        return {
            "velocity_1h": 0,
            "velocity_change": 0,
            "velocity_trend": "stable",
            "smart_money_flow": 0,
            "smart_money_signal": "neutral",
            "large_trade_ratio": 0,
            "recent_large_buys": 0,
            "recent_large_sells": 0,
            "momentum_score": 0,
        }
    
    now = datetime.utcnow()
    
    # Velocity: trades in last 1h vs previous 1h
    trades_1h = [t for t in parsed_trades if t["time"] >= now - timedelta(hours=1)]
    trades_prev_1h = [t for t in parsed_trades if now - timedelta(hours=2) <= t["time"] < now - timedelta(hours=1)]
    
    velocity_1h = len(trades_1h)
    velocity_prev = len(trades_prev_1h) if trades_prev_1h else 1
    velocity_change = int(100 * (velocity_1h - velocity_prev) / max(velocity_prev, 1))
    
    if velocity_change >= 50:
        velocity_trend = "accelerating"
    elif velocity_change >= 20:
        velocity_trend = "increasing"
    elif velocity_change <= -50:
        velocity_trend = "decelerating"
    elif velocity_change <= -20:
        velocity_trend = "decreasing"
    else:
        velocity_trend = "stable"
    
    # Smart Money: Large trades (top 10%) vs small trades direction
    if len(parsed_trades) >= 10:
        sizes = sorted([t["value"] for t in parsed_trades])
        large_threshold = sizes[int(len(sizes) * 0.9)]
        
        large_trades = [t for t in parsed_trades if t["value"] >= large_threshold]
        small_trades = [t for t in parsed_trades if t["value"] < large_threshold]
        
        large_buy_vol = sum(t["value"] for t in large_trades if t["side"] == "BUY")
        large_sell_vol = sum(t["value"] for t in large_trades if t["side"] == "SELL")
        small_buy_vol = sum(t["value"] for t in small_trades if t["side"] == "BUY")
        small_sell_vol = sum(t["value"] for t in small_trades if t["side"] == "SELL")
        
        large_total = large_buy_vol + large_sell_vol
        small_total = small_buy_vol + small_sell_vol
        
        large_flow = (large_buy_vol - large_sell_vol) / large_total * 100 if large_total > 0 else 0
        small_flow = (small_buy_vol - small_sell_vol) / small_total * 100 if small_total > 0 else 0
        
        # Smart money = large traders buying while small traders selling (or vice versa)
        smart_money_flow = int(large_flow)
        
        if large_flow > 30 and small_flow < -10:
            smart_money_signal = "accumulation"  # Big players buying, retail selling
        elif large_flow < -30 and small_flow > 10:
            smart_money_signal = "distribution"  # Big players selling, retail buying
        elif large_flow > 20:
            smart_money_signal = "bullish"
        elif large_flow < -20:
            smart_money_signal = "bearish"
        else:
            smart_money_signal = "neutral"
        
        large_trade_ratio = round(large_total / (large_total + small_total) * 100, 1) if (large_total + small_total) > 0 else 0
    else:
        smart_money_flow = 0
        smart_money_signal = "neutral"
        large_trade_ratio = 0
        large_threshold = float('inf')
    
    # Recent large trades (last 1h)
    recent_large = [t for t in trades_1h if t["value"] >= large_threshold] if len(parsed_trades) >= 10 else []
    recent_large_buys = len([t for t in recent_large if t["side"] == "BUY"])
    recent_large_sells = len([t for t in recent_large if t["side"] == "SELL"])
    
    # Momentum Score: Combination of velocity trend + flow + smart money
    momentum_base = velocity_change / 2  # -50 to +50
    flow_component = smart_money_flow / 5  # -20 to +20
    momentum_score = int(max(-100, min(100, momentum_base + flow_component)))
    
    return {
        "velocity_1h": velocity_1h,
        "velocity_change": velocity_change,
        "velocity_trend": velocity_trend,
        "smart_money_flow": smart_money_flow,
        "smart_money_signal": smart_money_signal,
        "large_trade_ratio": large_trade_ratio,
        "recent_large_buys": recent_large_buys,
        "recent_large_sells": recent_large_sells,
        "momentum_score": momentum_score,
    }


def calculate_orderbook_metrics(orderbook: Dict) -> Dict:
    """Calculate metrics from orderbook data."""
    bids = orderbook.get("bids", [])
    asks = orderbook.get("asks", [])
    
    if not bids or not asks:
        return {
            "status": "unavailable",
            "spread": 0,
            "spread_bps": 0,
            "best_bid": 0,
            "best_ask": 0,
            "mid_price": 0,
            "bid_depth": 0,
            "ask_depth": 0,
            "liquidity_score": 0,
            "imbalance": 0,
        }
    
    # Parse
    parsed_bids = sorted(
        [{"price": float(b.get("price", 0)), "size": float(b.get("size", 0))} for b in bids],
        key=lambda x: x["price"], reverse=True
    )
    parsed_asks = sorted(
        [{"price": float(a.get("price", 0)), "size": float(a.get("size", 0))} for a in asks],
        key=lambda x: x["price"]
    )
    
    best_bid = parsed_bids[0]["price"] if parsed_bids else 0
    best_ask = parsed_asks[0]["price"] if parsed_asks else 0
    mid_price = (best_bid + best_ask) / 2 if best_bid and best_ask else 0
    spread = best_ask - best_bid
    spread_bps = (spread / mid_price * 10000) if mid_price > 0 else 0
    
    # Depth within 2% of mid
    band = 0.02
    bid_depth = sum(b["size"] for b in parsed_bids if b["price"] >= mid_price * (1 - band))
    ask_depth = sum(a["size"] for a in parsed_asks if a["price"] <= mid_price * (1 + band))
    
    # Liquidity score
    import math
    spread_score = max(0, min(1, 1 - spread_bps / 200))
    depth = min(bid_depth, ask_depth)
    depth_score = min(1, math.log10(1 + depth) / math.log10(1 + 1_000_000)) if depth > 0 else 0
    liquidity_score = int(100 * (0.55 * spread_score + 0.45 * depth_score))
    
    # Imbalance
    total_depth = bid_depth + ask_depth
    imbalance = int(100 * (bid_depth - ask_depth) / total_depth) if total_depth > 0 else 0
    
    return {
        "status": "ok",
        "spread": round(spread, 4),
        "spread_bps": round(spread_bps, 1),
        "best_bid": round(best_bid, 4),
        "best_ask": round(best_ask, 4),
        "mid_price": round(mid_price, 4),
        "bid_depth": bid_depth,
        "ask_depth": ask_depth,
        "liquidity_score": liquidity_score,
        "imbalance": imbalance,
        "bids": parsed_bids[:20],
        "asks": parsed_asks[:20],
    }


def calculate_advanced_orderbook_signals(orderbook: Dict) -> Dict:
    """Calculate advanced trading signals from orderbook data."""
    bids = orderbook.get("bids", [])
    asks = orderbook.get("asks", [])
    
    if not bids or not asks:
        return {
            "wall_bids": [],
            "wall_asks": [],
            "support_level": None,
            "resistance_level": None,
            "slippage_buy_10k": 0,
            "slippage_sell_10k": 0,
            "depth_ratio": 0,
            "pressure_signal": "neutral",
        }
    
    # Parse orderbook
    parsed_bids = sorted(
        [{"price": float(b.get("price", 0)), "size": float(b.get("size", 0))} for b in bids],
        key=lambda x: x["price"], reverse=True
    )
    parsed_asks = sorted(
        [{"price": float(a.get("price", 0)), "size": float(a.get("size", 0))} for a in asks],
        key=lambda x: x["price"]
    )
    
    best_bid = parsed_bids[0]["price"] if parsed_bids else 0
    best_ask = parsed_asks[0]["price"] if parsed_asks else 1
    mid_price = (best_bid + best_ask) / 2
    
    # Wall detection (orders > $50k)
    wall_threshold = 50000
    wall_bids = [
        {"price": round(b["price"], 4), "size": round(b["size"], 0)}
        for b in parsed_bids if b["size"] >= wall_threshold
    ][:5]
    wall_asks = [
        {"price": round(a["price"], 4), "size": round(a["size"], 0)}
        for a in parsed_asks if a["size"] >= wall_threshold
    ][:5]
    
    # Support/Resistance - biggest walls within 20% of mid
    support_level = None
    resistance_level = None
    
    nearby_bid_walls = [w for w in wall_bids if w["price"] >= mid_price * 0.8]
    if nearby_bid_walls:
        support_level = max(nearby_bid_walls, key=lambda x: x["size"])["price"]
    
    nearby_ask_walls = [w for w in wall_asks if w["price"] <= mid_price * 1.2]
    if nearby_ask_walls:
        resistance_level = min(nearby_ask_walls, key=lambda x: x["price"])["price"]
    
    # Slippage calculation for $10k order
    def calc_slippage(orders: List[Dict], target_usd: float, is_buy: bool) -> float:
        if not orders:
            return 0
        remaining = target_usd
        weighted_price = 0
        
        sorted_orders = sorted(orders, key=lambda x: x["price"], reverse=not is_buy)
        
        for order in sorted_orders:
            available_usd = order["size"] * order["price"]
            take = min(remaining, available_usd)
            weighted_price += take * order["price"]
            remaining -= take
            if remaining <= 0:
                break
        
        if target_usd <= 0:
            return 0
        
        avg_fill = weighted_price / target_usd
        reference = sorted_orders[0]["price"] if sorted_orders else 0
        if reference <= 0:
            return 0
        
        if is_buy:
            return round((avg_fill - reference) / reference * 100, 2)
        else:
            return round((reference - avg_fill) / reference * 100, 2)
    
    slippage_buy = calc_slippage(parsed_asks, 10000, True)
    slippage_sell = calc_slippage(parsed_bids, 10000, False)
    
    # Depth ratio (bid depth / ask depth within 5%)
    band = 0.05
    bid_depth_5 = sum(b["size"] for b in parsed_bids if b["price"] >= mid_price * (1 - band))
    ask_depth_5 = sum(a["size"] for a in parsed_asks if a["price"] <= mid_price * (1 + band))
    
    depth_ratio = round(bid_depth_5 / ask_depth_5, 2) if ask_depth_5 > 0 else 0
    
    # Pressure signal based on depth ratio
    if depth_ratio >= 1.5:
        pressure_signal = "strong_buy"
    elif depth_ratio >= 1.2:
        pressure_signal = "buy"
    elif depth_ratio <= 0.67:
        pressure_signal = "strong_sell"
    elif depth_ratio <= 0.83:
        pressure_signal = "sell"
    else:
        pressure_signal = "neutral"
    
    return {
        "wall_bids": wall_bids,
        "wall_asks": wall_asks,
        "support_level": support_level,
        "resistance_level": resistance_level,
        "slippage_buy_10k": slippage_buy,
        "slippage_sell_10k": slippage_sell,
        "bid_depth_5pct": round(bid_depth_5, 0),
        "ask_depth_5pct": round(ask_depth_5, 0),
        "depth_ratio": depth_ratio,
        "pressure_signal": pressure_signal,
    }


def calculate_price_change(trades: List[Dict], hours: float = 1) -> Dict:
    """Calculate price change over a time window.
    
    IMPORTANT: Polymarket trades include both YES and NO sides.
    YES trades: price < 0.5 (probability of YES)
    NO trades: price > 0.5 (probability of NO, which is 1 - YES)
    
    We filter to only use YES-side trades (price <= 0.5) OR if all trades are > 0.5,
    we convert them to YES probability (1 - price).
    """
    if not trades:
        return {"change": 0, "change_pct": 0, "current": 0, "previous": 0}
    
    # Sort by timestamp and extract YES-side prices
    sorted_trades = []
    for t in trades:
        try:
            ts = t.get("timestamp")
            price = float(t.get("price", 0))
            if ts and price and price > 0:
                if isinstance(ts, str):
                    dt = datetime.fromisoformat(ts.replace("Z", "+00:00")).replace(tzinfo=None)
                else:
                    dt = datetime.fromtimestamp(ts)
                
                # Convert to YES probability
                # If price > 0.5, it's likely a NO-side trade, convert to YES
                yes_price = price if price <= 0.5 else 1 - price
                sorted_trades.append({"time": dt, "price": yes_price, "original": price})
        except:
            pass
    
    if len(sorted_trades) < 2:
        return {"change": 0, "change_pct": 0, "current": 0, "previous": 0}
    
    sorted_trades.sort(key=lambda x: x["time"])
    
    # Current = avg of last 5 YES-side prices
    recent = sorted_trades[-5:]
    current = sum(t["price"] for t in recent) / len(recent)
    
    # Previous = trades from X hours ago
    cutoff = datetime.utcnow() - timedelta(hours=hours)
    old_trades = [t for t in sorted_trades if t["time"] <= cutoff]
    
    if old_trades:
        previous = sum(t["price"] for t in old_trades[-5:]) / min(5, len(old_trades))
    else:
        previous = sorted_trades[0]["price"]
    
    # Calculate change in cents (more intuitive)
    change = current - previous  # This is in decimal (0.01 = 1 cent)
    
    # Calculate percentage change, but cap it for display purposes
    if previous > 0.001:  # Avoid division by very small numbers
        change_pct = (change / previous * 100)
    else:
        change_pct = 0
    
    return {
        "change": round(change, 4),
        "change_pct": round(change_pct, 2),
        "current": round(current, 4),
        "previous": round(previous, 4),
    }


def determine_heat_level(trades_per_hour: float, avg_event_tph: float) -> str:
    """Determine market heat based on trade velocity."""
    if avg_event_tph == 0:
        return "cold"
    ratio = trades_per_hour / avg_event_tph
    if ratio >= 2:
        return "hot"
    elif ratio >= 1:
        return "warm"
    return "cold"


def determine_risk_level(liquidity_score: int, spread_bps: float) -> str:
    """Determine risk level based on liquidity and spread."""
    if liquidity_score >= 60 and spread_bps < 100:
        return "good"
    elif liquidity_score >= 30 or spread_bps < 300:
        return "thin"
    return "risky"


def _get_consensus(signals: List[str]) -> str:
    """Get consensus signal from a list of signals."""
    if not signals:
        return "neutral"
    
    # Count bullish vs bearish signals
    bullish = sum(1 for s in signals if s in ["bullish", "accumulation", "strong_buy", "buy"])
    bearish = sum(1 for s in signals if s in ["bearish", "distribution", "strong_sell", "sell"])
    total = len(signals)
    
    if bullish >= total * 0.6:
        return "bullish"
    elif bearish >= total * 0.6:
        return "bearish"
    elif bullish > bearish:
        return "slightly_bullish"
    elif bearish > bullish:
        return "slightly_bearish"
    return "neutral"


# ============================================================================
# Main Endpoint
# ============================================================================

@router.get("/{platform}/{event_id}")
async def get_event_intelligence(
    platform: str,
    event_id: str,
    hours: int = Query(24, description="Hours of trade history to analyze"),
    top_markets: int = Query(50, description="Number of top markets to fetch detailed data for"),
):
    """
    Get comprehensive intelligence for an event.
    
    Fetches trades and orderbook data for top markets and computes:
    - Event-wide flow, whale activity, momentum
    - Per-market signals (heat, flow, whale, risk)
    - Live trade feed
    """
    if not DOME_API_KEY:
        raise HTTPException(status_code=500, detail="DOME_API_KEY not configured")
    
    # Normalize platform names
    is_polymarket = platform in ["polymarket", "poly"]
    is_kalshi = platform in ["kalshi"]
    
    if not is_polymarket and not is_kalshi:
        return {
            "status": "limited",
            "message": f"Trade/orderbook data not available for {platform}",
            "event_id": event_id,
            "platform": platform,
            "signals": {},
            "markets": [],
            "trades": [],
        }
    
    logger.info(f"🔍 Fetching event intelligence for {platform}/{event_id}")
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        
        # ================================================================
        # KALSHI PATH
        # ================================================================
        if is_kalshi:
            # For Kalshi, we need to handle two cases:
            # 1. Direct event_ticker (e.g., "KXNCAAF-26") 
            # 2. Slug format from database (e.g., "will-the-georgia-win-the-college-football-playoff--kxncaaf26uga")
            
            kalshi_event_ticker = event_id
            
            # Check if this looks like a slug (contains lowercase letters and dashes)
            # Event tickers are uppercase with dashes (e.g., KXNCAAF-26)
            if not event_id.isupper() and '-' in event_id:
                # This is a slug - try to extract event_ticker from it
                # Pattern: slug ends with the ticker embedded (e.g., "...kxncaaf26uga" -> "KXNCAAF-26")
                # Or we need to search Dome API for matching events
                
                logger.info(f"Kalshi slug detected: {event_id}, searching for event_ticker...")
                
                # Try to find matching event by searching Dome markets
                # Extract keywords from slug for search
                search_terms = event_id.replace("-", " ").lower()
                
                # First, try common ticker patterns embedded in slug
                # e.g., "kxncaaf26" in the slug -> "KXNCAAF-26"
                import re
                
                # Look for patterns like "kx..." which is common Kalshi prefix
                ticker_patterns = re.findall(r'kx[a-z0-9]+', event_id.lower())
                
                if ticker_patterns:
                    # Take the last match (usually at the end of slug)
                    raw_ticker = ticker_patterns[-1].upper()
                    # Try to insert dash before the number portion
                    # e.g., "KXNCAAF26" -> "KXNCAAF-26"
                    ticker_match = re.match(r'(KX[A-Z]+)(\d+)', raw_ticker)
                    if ticker_match:
                        kalshi_event_ticker = f"{ticker_match.group(1)}-{ticker_match.group(2)}"
                        logger.info(f"Extracted Kalshi event_ticker: {kalshi_event_ticker}")
                    else:
                        # Try RECSSNBER pattern
                        ticker_match2 = re.match(r'([A-Z]+)(\d+)', raw_ticker)
                        if ticker_match2:
                            kalshi_event_ticker = f"{ticker_match2.group(1)}-{ticker_match2.group(2)}"
                            logger.info(f"Extracted Kalshi event_ticker: {kalshi_event_ticker}")
                else:
                    # Look for other patterns like "recssnber25"
                    other_patterns = re.findall(r'[a-z]+\d+$', event_id.lower())
                    if other_patterns:
                        raw_ticker = other_patterns[-1].upper()
                        ticker_match = re.match(r'([A-Z]+)(\d+)', raw_ticker)
                        if ticker_match:
                            kalshi_event_ticker = f"{ticker_match.group(1)}-{ticker_match.group(2)}"
                            logger.info(f"Extracted Kalshi event_ticker: {kalshi_event_ticker}")
            
            # Fetch markets using the event_ticker
            markets = await fetch_kalshi_event_markets(client, kalshi_event_ticker)
            
            if not markets:
                # If no markets found with extracted ticker, log and return 404
                logger.warning(f"No markets found for Kalshi event_ticker '{kalshi_event_ticker}' (original: '{event_id}')")
                raise HTTPException(status_code=404, detail=f"No Kalshi markets found for event '{event_id}' (tried ticker: '{kalshi_event_ticker}')")
            
            # Sort by volume and take top N for detailed analysis
            markets_sorted = sorted(markets, key=lambda m: m.get("volume", 0) or 0, reverse=True)
            top_markets_list = markets_sorted[:top_markets]
            
            logger.info(f"📊 Analyzing {len(top_markets_list)} top Kalshi markets out of {len(markets)}")
            
            # Fetch trades for top markets in parallel
            trade_tasks = [
                fetch_kalshi_market_trades(client, m.get("market_ticker", ""), hours)
                for m in top_markets_list
            ]
            all_trades_lists = await asyncio.gather(*trade_tasks)
            
            # Fetch orderbooks for top markets
            orderbook_tasks = [
                fetch_kalshi_market_orderbook(client, m.get("market_ticker", ""))
                for m in top_markets_list
            ]
            all_orderbooks = await asyncio.gather(*orderbook_tasks, return_exceptions=True)
            
            # Compute per-market intelligence (same logic as Polymarket)
            all_trades = []
            all_total_count = 0
            market_intelligence = []
            
            for i, m in enumerate(top_markets_list):
                trades_result = all_trades_lists[i] if i < len(all_trades_lists) else ([], 0)
                trades, total_count = trades_result if isinstance(trades_result, tuple) else (trades_result, len(trades_result) if isinstance(trades_result, list) else 0)
                orderbook = all_orderbooks[i] if i < len(all_orderbooks) and not isinstance(all_orderbooks[i], Exception) else {}
                
                # Add market context to trades
                for t in trades:
                    t["market_slug"] = m.get("market_ticker")
                    t["title"] = m.get("title", "")
                    all_trades.append(t)
                all_total_count += total_count
                
                trade_metrics = calculate_trade_metrics(trades, api_total_count=total_count)
                ob_metrics = calculate_orderbook_metrics(orderbook)
                price_change = calculate_price_change(trades, hours=1)
                advanced_trade_signals = calculate_advanced_trade_signals(trades)
                advanced_ob_signals = calculate_advanced_orderbook_signals(orderbook)
                
                # Get current price from market data
                last_price = m.get("last_price", 0)
                if last_price > 1:
                    last_price = last_price / 100  # Convert cents to decimal
                
                market_intelligence.append({
                    "market_slug": m.get("market_ticker"),
                    "title": m.get("title"),
                    "volume_total": m.get("volume", 0),
                    "volume_24h": m.get("volume_24h", 0),
                    "token_id": m.get("market_ticker"),  # Use ticker as ID for Kalshi
                    "last_price": last_price,
                    "trades": trade_metrics,
                    "orderbook": ob_metrics,
                    "price_change_1h": price_change,
                    "advanced_trade_signals": advanced_trade_signals,
                    "advanced_ob_signals": advanced_ob_signals,
                })
            
            # Compute event-wide metrics
            event_trade_metrics = calculate_trade_metrics(all_trades, api_total_count=all_total_count)
            
            # Calculate average trades per hour for heat comparison
            avg_trades_per_hour = event_trade_metrics["trades_per_hour"] / len(top_markets_list) if top_markets_list else 0
            
            # Add signals to each market
            for mi in market_intelligence:
                tph = mi["trades"]["trades_per_hour"]
                liq = mi["orderbook"]["liquidity_score"]
                spread = mi["orderbook"]["spread_bps"]
                
                mi["signals"] = {
                    "heat": determine_heat_level(tph, avg_trades_per_hour),
                    "flow": mi["trades"]["flow_score"],
                    "whale_active": mi["trades"]["whale_count"] > 0,
                    "delta_1h": mi["price_change_1h"]["change_pct"],
                    "risk": determine_risk_level(liq, spread),
                }
            
            # Find momentum movers (biggest 1h changes)
            momentum_movers = sorted(
                market_intelligence,
                key=lambda x: abs(x["price_change_1h"]["change_pct"]),
                reverse=True
            )[:5]
            
            # Prepare trade feed (recent trades across all markets)
            trade_feed = sorted(
                all_trades,
                key=lambda t: t.get("timestamp", 0) or 0,
                reverse=True
            )[:50]
            
            # Format trade feed for frontend
            formatted_feed = []
            for t in trade_feed:
                formatted_feed.append({
                    "timestamp": t.get("timestamp"),
                    "side": t.get("side"),
                    "price": float(t.get("price", 0)),
                    "size": float(t.get("shares_normalized", 0) or t.get("quantity", 0) or 0),
                    "value": float(t.get("value", 0)),
                    "market_slug": t.get("market_slug"),
                    "title": t.get("title", "")[:50],
                })
            
            # Generate insights (same logic as Polymarket)
            insights = []
            
            # Whale insight
            if event_trade_metrics["whale_count"] > 0:
                whale_value = sum(w["value"] for w in event_trade_metrics["whale_trades"])
                insights.append({
                    "type": "whale",
                    "level": "high" if event_trade_metrics["whale_count"] >= 3 else "medium",
                    "text": f"🐳 {event_trade_metrics['whale_count']} whale trades detected (${whale_value:,.0f} total) in last {hours}h",
                    "timestamp": datetime.utcnow().isoformat(),
                })
            
            # Flow insight
            flow = event_trade_metrics["flow_score"]
            if abs(flow) >= 30:
                direction = "buying" if flow > 0 else "selling"
                insights.append({
                    "type": "flow",
                    "level": "high" if abs(flow) >= 50 else "medium",
                    "text": f"📈 Strong {direction} pressure across event (Flow: {flow:+d})",
                    "timestamp": datetime.utcnow().isoformat(),
                })
            
            # Momentum insight
            if momentum_movers and abs(momentum_movers[0]["price_change_1h"]["change_pct"]) >= 1:
                top_mover = momentum_movers[0]
                direction = "up" if top_mover["price_change_1h"]["change"] > 0 else "down"
                insights.append({
                    "type": "momentum",
                    "level": "medium",
                    "text": f"⚡ {top_mover['title'][:40]}... moved {top_mover['price_change_1h']['change_pct']:+.1f}pts in last hour",
                    "timestamp": datetime.utcnow().isoformat(),
                })
            
            # Activity insight
            if event_trade_metrics["trades_per_hour"] >= 10:
                insights.append({
                    "type": "activity",
                    "level": "medium",
                    "text": f"🔥 High activity: {event_trade_metrics['trades_per_hour']:.0f} trades/hour across top markets",
                    "timestamp": datetime.utcnow().isoformat(),
                })
            
            logger.info(f"✅ Kalshi event intelligence computed: {len(market_intelligence)} markets, {len(all_trades)} trades, {len(insights)} insights")
            
            return {
                "status": "ok",
                "event_id": event_id,
                "platform": platform,
                "analyzed_at": datetime.utcnow().isoformat(),
                "hours_analyzed": hours,
                "markets_analyzed": len(top_markets_list),
                "total_markets": len(markets),
                
                # Event-wide signals
                "signals": {
                    "flow_score": event_trade_metrics["flow_score"],
                    "flow_label": "Strong buy" if event_trade_metrics["flow_score"] >= 30 else "Strong sell" if event_trade_metrics["flow_score"] <= -30 else "Balanced",
                    "whale_count": event_trade_metrics["whale_count"],
                    "whale_volume": event_trade_metrics["whale_volume"],
                    "whale_share": round(event_trade_metrics["whale_share"], 1),
                    "total_trades": event_trade_metrics["total_trades"],
                    "total_volume": event_trade_metrics["total_volume"],
                    "trades_per_hour": event_trade_metrics["trades_per_hour"],
                    "avg_trade_size": round(event_trade_metrics["avg_trade_size"], 2),
                    "buy_count": event_trade_metrics["buy_count"],
                    "sell_count": event_trade_metrics["sell_count"],
                },
                
                # AI-generated insights
                "insights": insights,
                
                # Momentum movers
                "momentum_movers": [
                    {
                        "market_slug": m["market_slug"],
                        "market_question": m["title"],
                        "title": m["title"],
                        "change": m["price_change_1h"]["change"],
                        "change_pct": m["price_change_1h"]["change_pct"],
                        "current": m["price_change_1h"]["current"],
                        "previous": m["price_change_1h"]["previous"],
                    }
                    for m in momentum_movers
                ],
                
                # Top whale trades
                "whale_trades": event_trade_metrics["whale_trades"][:100],
                
                # Large trades (>=$500, for filterable table)
                "large_trades": event_trade_metrics.get("large_trades", [])[:200],
                
                # Per-market intelligence
                "markets": [
                    {
                        "market_slug": m["market_slug"],
                        "title": m["title"],
                        "volume_total": m["volume_total"],
                        "signals": m["signals"],
                        "flow": m["trades"]["flow_score"],
                        "trades_count": m["trades"]["total_trades"],
                        "whale_count": m["trades"]["whale_count"],
                        "liquidity_score": m["orderbook"]["liquidity_score"],
                        "spread_bps": m["orderbook"]["spread_bps"],
                        "delta_1h": m["price_change_1h"]["change_pct"],
                        "smart_money": m.get("advanced_trade_signals", {}).get("smart_money_signal", "neutral"),
                        "velocity_trend": m.get("advanced_trade_signals", {}).get("velocity_trend", "stable"),
                        "momentum_score": m.get("advanced_trade_signals", {}).get("momentum_score", 0),
                        "pressure_signal": m.get("advanced_ob_signals", {}).get("pressure_signal", "neutral"),
                        "support_level": m.get("advanced_ob_signals", {}).get("support_level"),
                        "resistance_level": m.get("advanced_ob_signals", {}).get("resistance_level"),
                    }
                    for m in market_intelligence
                ],
                
                # Advanced signals summary
                "advanced_signals": {
                    "smart_money_consensus": _get_consensus([
                        m.get("advanced_trade_signals", {}).get("smart_money_signal", "neutral")
                        for m in market_intelligence
                    ]),
                    "avg_momentum_score": int(sum(
                        m.get("advanced_trade_signals", {}).get("momentum_score", 0)
                        for m in market_intelligence
                    ) / max(len(market_intelligence), 1)),
                    "orderbook_pressure": _get_consensus([
                        m.get("advanced_ob_signals", {}).get("pressure_signal", "neutral")
                        for m in market_intelligence
                    ]),
                    "accumulation_count": sum(
                        1 for m in market_intelligence
                        if m.get("advanced_trade_signals", {}).get("smart_money_signal") == "accumulation"
                    ),
                    "distribution_count": sum(
                        1 for m in market_intelligence
                        if m.get("advanced_trade_signals", {}).get("smart_money_signal") == "distribution"
                    ),
                    "accelerating_count": sum(
                        1 for m in market_intelligence
                        if m.get("advanced_trade_signals", {}).get("velocity_trend") in ["accelerating", "increasing"]
                    ),
                    "decelerating_count": sum(
                        1 for m in market_intelligence
                        if m.get("advanced_trade_signals", {}).get("velocity_trend") in ["decelerating", "decreasing"]
                    ),
                },
                
                # Live trade feed
                "trade_feed": formatted_feed,
            }
        
        # ================================================================
        # POLYMARKET PATH (existing code)
        # ================================================================
        # Step 1: Get markets in this event
        # Try direct event_slug first, then search if not found
        markets = []
        dome_event_slug = event_id
        
        try:
            # First attempt: direct event_slug query
            markets_resp = await client.get(
                f"{DOME_API_BASE}/v1/polymarket/markets",
                params={"event_slug[]": event_id, "limit": 100},
                headers=get_headers(),
            )
            markets_resp.raise_for_status()
            markets_data = markets_resp.json()
            markets = markets_data.get("markets", [])
            
            # If no markets found, try to find the Dome event slug by searching events
            if not markets:
                logger.info(f"No markets found with slug '{event_id}', searching Dome events...")
                
                # Extract keywords from the slug for searching
                # e.g., "who-will-win-the-2028-democratic-presidential-nomination" 
                # -> search for "2028 democratic presidential"
                keywords = event_id.replace("-", " ")
                
                # Search Dome events
                events_resp = await client.get(
                    f"{DOME_API_BASE}/v1/polymarket/events",
                    params={"limit": 50, "status": "open"},
                    headers=get_headers(),
                )
                events_resp.raise_for_status()
                events_data = events_resp.json()
                dome_events = events_data.get("events", [])
                
                # Find best matching event
                best_match = None
                best_score = 0
                search_terms = set(keywords.lower().split())
                # Remove common words
                search_terms -= {"who", "will", "win", "the", "be", "a", "an", "in", "on", "at", "to", "for"}
                
                for evt in dome_events:
                    evt_slug = evt.get("event_slug", "")
                    evt_title = evt.get("title", "").lower()
                    evt_words = set(evt_slug.replace("-", " ").lower().split()) | set(evt_title.split())
                    
                    # Count matching keywords
                    matches = len(search_terms & evt_words)
                    if matches > best_score:
                        best_score = matches
                        best_match = evt
                
                if best_match and best_score >= 2:
                    dome_event_slug = best_match.get("event_slug")
                    logger.info(f"✅ Found matching Dome event: '{dome_event_slug}' (score: {best_score})")
                    
                    # Fetch markets with the correct Dome event slug
                    markets_resp = await client.get(
                        f"{DOME_API_BASE}/v1/polymarket/markets",
                        params={"event_slug[]": dome_event_slug, "limit": 100},
                        headers=get_headers(),
                    )
                    markets_resp.raise_for_status()
                    markets_data = markets_resp.json()
                    markets = markets_data.get("markets", [])
                    logger.info(f"📊 Found {len(markets)} markets for '{dome_event_slug}'")
                    
        except Exception as e:
            logger.error(f"Failed to fetch markets: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to fetch markets: {e}")
        
        if not markets:
            raise HTTPException(status_code=404, detail=f"No markets found for event '{event_id}' (tried Dome slug: '{dome_event_slug}')")
        
        # Sort by volume and take top N for detailed analysis
        markets_sorted = sorted(markets, key=lambda m: m.get("volume_total", 0) or 0, reverse=True)
        top_markets_list = markets_sorted[:top_markets]
        
        logger.info(f"📊 Analyzing {len(top_markets_list)} top markets out of {len(markets)}")
        
        # Step 2: Fetch trades for top markets in parallel
        trade_tasks = [
            fetch_market_trades(client, m.get("market_slug", ""), hours)
            for m in top_markets_list
        ]
        all_trades_lists = await asyncio.gather(*trade_tasks)
        
        # Step 3: Fetch orderbooks for top markets
        orderbook_tasks = []
        for m in top_markets_list:
            token_id = m.get("side_a", {}).get("id")
            if token_id:
                orderbook_tasks.append(fetch_market_orderbook(client, token_id))
            else:
                orderbook_tasks.append(asyncio.coroutine(lambda: {})())
        
        all_orderbooks = await asyncio.gather(*orderbook_tasks, return_exceptions=True)
        
        # Step 4: Compute per-market intelligence
        all_trades = []
        all_total_count = 0
        market_intelligence = []
        
        for i, m in enumerate(top_markets_list):
            trades_result = all_trades_lists[i] if i < len(all_trades_lists) else ([], 0)
            trades, total_count = trades_result if isinstance(trades_result, tuple) else (trades_result, len(trades_result) if isinstance(trades_result, list) else 0)
            orderbook = all_orderbooks[i] if i < len(all_orderbooks) and not isinstance(all_orderbooks[i], Exception) else {}
            
            # Add market context to trades
            for t in trades:
                t["market_slug"] = m.get("market_slug")
                t["title"] = m.get("title", "")
                all_trades.append(t)
            all_total_count += total_count
            
            trade_metrics = calculate_trade_metrics(trades, api_total_count=total_count)
            ob_metrics = calculate_orderbook_metrics(orderbook)
            price_change = calculate_price_change(trades, hours=1)
            advanced_trade_signals = calculate_advanced_trade_signals(trades)
            advanced_ob_signals = calculate_advanced_orderbook_signals(orderbook)
            
            market_intelligence.append({
                "market_slug": m.get("market_slug"),
                "title": m.get("title"),
                "volume_total": m.get("volume_total", 0),
                "volume_1_week": m.get("volume_1_week", 0),
                "token_id": m.get("side_a", {}).get("id"),
                "trades": trade_metrics,
                "orderbook": ob_metrics,
                "price_change_1h": price_change,
                "advanced_trade_signals": advanced_trade_signals,
                "advanced_ob_signals": advanced_ob_signals,
                # Signals will be computed after we have event-wide averages
            })
        
        # Step 5: Compute event-wide metrics
        event_trade_metrics = calculate_trade_metrics(all_trades, api_total_count=all_total_count)
        
        # Calculate average trades per hour for heat comparison
        avg_trades_per_hour = event_trade_metrics["trades_per_hour"] / len(top_markets_list) if top_markets_list else 0
        
        # Step 6: Add signals to each market
        for mi in market_intelligence:
            tph = mi["trades"]["trades_per_hour"]
            liq = mi["orderbook"]["liquidity_score"]
            spread = mi["orderbook"]["spread_bps"]
            
            mi["signals"] = {
                "heat": determine_heat_level(tph, avg_trades_per_hour),
                "flow": mi["trades"]["flow_score"],
                "whale_active": mi["trades"]["whale_count"] > 0,
                "delta_1h": mi["price_change_1h"]["change_pct"],
                "risk": determine_risk_level(liq, spread),
            }
        
        # Step 7: Find momentum movers (biggest 1h changes)
        momentum_movers = sorted(
            market_intelligence,
            key=lambda x: abs(x["price_change_1h"]["change_pct"]),
            reverse=True
        )[:5]
        
        # Step 8: Prepare trade feed (recent trades across all markets)
        trade_feed = sorted(
            all_trades,
            key=lambda t: t.get("timestamp", ""),
            reverse=True
        )[:50]
        
        # Format trade feed for frontend
        formatted_feed = []
        for t in trade_feed:
            formatted_feed.append({
                "timestamp": t.get("timestamp"),
                "side": t.get("side"),
                "price": float(t.get("price", 0)),
                "size": float(t.get("shares_normalized", 0) or t.get("quantity", 0) or 0),
                "value": float(t.get("shares_normalized", 0) or 0) * float(t.get("price", 0)),
                "market_slug": t.get("market_slug"),
                "title": t.get("title", "")[:50],
            })
        
        # Step 9: Generate insights
        insights = []
        
        # Whale insight
        if event_trade_metrics["whale_count"] > 0:
            whale_value = sum(w["value"] for w in event_trade_metrics["whale_trades"])
            insights.append({
                "type": "whale",
                "level": "high" if event_trade_metrics["whale_count"] >= 3 else "medium",
                "text": f"🐳 {event_trade_metrics['whale_count']} whale trades detected (${whale_value:,.0f} total) in last {hours}h",
                "timestamp": datetime.utcnow().isoformat(),
            })
        
        # Flow insight
        flow = event_trade_metrics["flow_score"]
        if abs(flow) >= 30:
            direction = "buying" if flow > 0 else "selling"
            insights.append({
                "type": "flow",
                "level": "high" if abs(flow) >= 50 else "medium",
                "text": f"📈 Strong {direction} pressure across event (Flow: {flow:+d})",
                "timestamp": datetime.utcnow().isoformat(),
            })
        
        # Momentum insight
        if momentum_movers and abs(momentum_movers[0]["price_change_1h"]["change_pct"]) >= 1:
            top_mover = momentum_movers[0]
            direction = "up" if top_mover["price_change_1h"]["change"] > 0 else "down"
            insights.append({
                "type": "momentum",
                "level": "medium",
                "text": f"⚡ {top_mover['title'][:40]}... moved {top_mover['price_change_1h']['change_pct']:+.1f}pts in last hour",
                "timestamp": datetime.utcnow().isoformat(),
            })
        
        # Activity insight
        if event_trade_metrics["trades_per_hour"] >= 10:
            insights.append({
                "type": "activity",
                "level": "medium",
                "text": f"🔥 High activity: {event_trade_metrics['trades_per_hour']:.0f} trades/hour across top markets",
                "timestamp": datetime.utcnow().isoformat(),
            })
        
        # Smart Money insights
        accumulation_count = sum(
            1 for m in market_intelligence
            if m.get("advanced_trade_signals", {}).get("smart_money_signal") == "accumulation"
        )
        distribution_count = sum(
            1 for m in market_intelligence
            if m.get("advanced_trade_signals", {}).get("smart_money_signal") == "distribution"
        )
        
        if accumulation_count >= 2:
            insights.append({
                "type": "smart_money",
                "level": "high",
                "text": f"🧠 Smart money accumulation detected in {accumulation_count} markets (big players buying while retail sells)",
                "timestamp": datetime.utcnow().isoformat(),
            })
        elif distribution_count >= 2:
            insights.append({
                "type": "smart_money",
                "level": "high",
                "text": f"⚠️ Smart money distribution in {distribution_count} markets (big players selling to retail)",
                "timestamp": datetime.utcnow().isoformat(),
            })
        
        # Velocity trend insight
        accelerating = sum(
            1 for m in market_intelligence
            if m.get("advanced_trade_signals", {}).get("velocity_trend") in ["accelerating", "increasing"]
        )
        if accelerating >= 3:
            insights.append({
                "type": "velocity",
                "level": "medium",
                "text": f"📊 Trading velocity increasing in {accelerating} markets - attention growing",
                "timestamp": datetime.utcnow().isoformat(),
            })
        
        # Orderbook pressure insight
        buy_pressure = sum(
            1 for m in market_intelligence
            if m.get("advanced_ob_signals", {}).get("pressure_signal") in ["strong_buy", "buy"]
        )
        sell_pressure = sum(
            1 for m in market_intelligence
            if m.get("advanced_ob_signals", {}).get("pressure_signal") in ["strong_sell", "sell"]
        )
        
        if buy_pressure >= 3:
            insights.append({
                "type": "orderbook",
                "level": "medium",
                "text": f"📗 Strong bid-side depth in {buy_pressure} markets - buyers stacking orders",
                "timestamp": datetime.utcnow().isoformat(),
            })
        elif sell_pressure >= 3:
            insights.append({
                "type": "orderbook",
                "level": "medium",
                "text": f"📕 Heavy ask-side depth in {sell_pressure} markets - sellers waiting",
                "timestamp": datetime.utcnow().isoformat(),
            })
        
        logger.info(f"✅ Event intelligence computed: {len(market_intelligence)} markets, {len(all_trades)} trades, {len(insights)} insights")
        
        return {
            "status": "ok",
            "event_id": event_id,
            "platform": platform,
            "analyzed_at": datetime.utcnow().isoformat(),
            "hours_analyzed": hours,
            "markets_analyzed": len(top_markets_list),
            "total_markets": len(markets),
            
            # Event-wide signals
            "signals": {
                "flow_score": event_trade_metrics["flow_score"],
                "flow_label": "Strong buy" if event_trade_metrics["flow_score"] >= 30 else "Strong sell" if event_trade_metrics["flow_score"] <= -30 else "Balanced",
                "whale_count": event_trade_metrics["whale_count"],
                "whale_volume": event_trade_metrics["whale_volume"],
                "whale_share": round(event_trade_metrics["whale_share"], 1),
                "total_trades": event_trade_metrics["total_trades"],
                "total_volume": event_trade_metrics["total_volume"],
                "trades_per_hour": event_trade_metrics["trades_per_hour"],
                "avg_trade_size": round(event_trade_metrics["avg_trade_size"], 2),
                "buy_count": event_trade_metrics["buy_count"],
                "sell_count": event_trade_metrics["sell_count"],
            },
            
            # AI-generated insights
            "insights": insights,
            
            # Momentum movers
            "momentum_movers": [
                {
                    "market_slug": m["market_slug"],
                    "market_question": m["title"],  # Alias for frontend
                    "title": m["title"],
                    "change": m["price_change_1h"]["change"],
                    "change_pct": m["price_change_1h"]["change_pct"],
                    "current": m["price_change_1h"]["current"],
                    "previous": m["price_change_1h"]["previous"],
                }
                for m in momentum_movers
            ],
            
            # Top whale trades - return more for Large Trades table
            "whale_trades": event_trade_metrics["whale_trades"][:100],
            
            # Large trades (>=$500, for filterable table)
            "large_trades": event_trade_metrics.get("large_trades", [])[:200],
            
            # Per-market intelligence
            "markets": [
                {
                    "market_slug": m["market_slug"],
                    "title": m["title"],
                    "volume_total": m["volume_total"],
                    "signals": m["signals"],
                    "flow": m["trades"]["flow_score"],
                    "trades_count": m["trades"]["total_trades"],
                    "whale_count": m["trades"]["whale_count"],
                    "liquidity_score": m["orderbook"]["liquidity_score"],
                    "spread_bps": m["orderbook"]["spread_bps"],
                    "delta_1h": m["price_change_1h"]["change_pct"],
                    # Advanced signals
                    "smart_money": m.get("advanced_trade_signals", {}).get("smart_money_signal", "neutral"),
                    "velocity_trend": m.get("advanced_trade_signals", {}).get("velocity_trend", "stable"),
                    "momentum_score": m.get("advanced_trade_signals", {}).get("momentum_score", 0),
                    "pressure_signal": m.get("advanced_ob_signals", {}).get("pressure_signal", "neutral"),
                    "support_level": m.get("advanced_ob_signals", {}).get("support_level"),
                    "resistance_level": m.get("advanced_ob_signals", {}).get("resistance_level"),
                }
                for m in market_intelligence
            ],
            
            # Advanced signals summary (aggregate across top markets)
            "advanced_signals": {
                # Aggregate smart money signal
                "smart_money_consensus": _get_consensus([
                    m.get("advanced_trade_signals", {}).get("smart_money_signal", "neutral")
                    for m in market_intelligence
                ]),
                # Average momentum score
                "avg_momentum_score": int(sum(
                    m.get("advanced_trade_signals", {}).get("momentum_score", 0)
                    for m in market_intelligence
                ) / max(len(market_intelligence), 1)),
                # Aggregate pressure signal
                "orderbook_pressure": _get_consensus([
                    m.get("advanced_ob_signals", {}).get("pressure_signal", "neutral")
                    for m in market_intelligence
                ]),
                # Markets with accumulation pattern
                "accumulation_count": sum(
                    1 for m in market_intelligence
                    if m.get("advanced_trade_signals", {}).get("smart_money_signal") == "accumulation"
                ),
                # Markets with distribution pattern
                "distribution_count": sum(
                    1 for m in market_intelligence
                    if m.get("advanced_trade_signals", {}).get("smart_money_signal") == "distribution"
                ),
                # Velocity trends
                "accelerating_count": sum(
                    1 for m in market_intelligence
                    if m.get("advanced_trade_signals", {}).get("velocity_trend") in ["accelerating", "increasing"]
                ),
                "decelerating_count": sum(
                    1 for m in market_intelligence
                    if m.get("advanced_trade_signals", {}).get("velocity_trend") in ["decelerating", "decreasing"]
                ),
            },
            
            # Live trade feed
            "trade_feed": formatted_feed,
        }


@router.get("/{platform}/{event_id}/market/{market_slug}")
async def get_market_detail_intelligence(
    platform: str,
    event_id: str,
    market_slug: str,
    hours: int = Query(24, description="Hours of history to fetch"),
):
    """
    Get detailed intelligence for a specific market within an event.
    
    Includes:
    - Full trade history
    - Price history for charting
    - Orderbook depth
    """
    if not DOME_API_KEY:
        raise HTTPException(status_code=500, detail="DOME_API_KEY not configured")
    
    # Normalize platform names
    is_polymarket = platform in ["polymarket", "poly"]
    is_kalshi = platform in ["kalshi"]
    
    if not is_polymarket and not is_kalshi:
        return {"status": "limited", "message": f"Not available for {platform}"}
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        
        # ================================================================
        # KALSHI PATH
        # ================================================================
        if is_kalshi:
            # For Kalshi, market_slug is the market_ticker
            market_ticker = market_slug
            
            # Get market info from Dome
            markets_resp = await client.get(
                f"{DOME_API_BASE}/v1/kalshi/markets",
                params={"market_ticker[]": market_ticker, "limit": 1},
                headers=get_headers(),
            )
            markets_resp.raise_for_status()
            markets = markets_resp.json().get("markets", [])
            
            if not markets:
                raise HTTPException(status_code=404, detail="Kalshi market not found")
            
            market = markets[0]
            
            # Fetch trades
            trades, total_count = await fetch_kalshi_market_trades(client, market_ticker, hours)
            
            # Fetch orderbook
            orderbook = await fetch_kalshi_market_orderbook(client, market_ticker)
            
            # Fetch price history
            price_history = await fetch_kalshi_market_price_history(client, market_ticker, hours)
            
            trade_metrics = calculate_trade_metrics(trades, api_total_count=total_count)
            ob_metrics = calculate_orderbook_metrics(orderbook)
            price_change = calculate_price_change(trades, hours=1)
            
            # Get current price
            last_price = market.get("last_price", 0)
            if last_price > 1:
                last_price = last_price / 100  # Convert cents to decimal
            
            return {
                "status": "ok",
                "market_slug": market_ticker,
                "title": market.get("title"),
                "token_id": market_ticker,
                "volume_total": market.get("volume", 0),
                "last_price": last_price,
                
                "trade_metrics": trade_metrics,
                "orderbook": ob_metrics,
                "price_change_1h": price_change,
                
                "price_history": price_history,
                
                "recent_trades": [
                    {
                        "timestamp": t.get("timestamp"),
                        "side": t.get("side"),
                        "price": float(t.get("price", 0)),
                        "size": float(t.get("shares_normalized", 0) or t.get("quantity", 0) or 0),
                        "value": float(t.get("value", 0)),
                    }
                    for t in sorted(trades, key=lambda x: x.get("timestamp", 0) or 0, reverse=True)[:100]
                ],
            }
        
        # ================================================================
        # POLYMARKET PATH
        # ================================================================
        # Get market info
        markets_resp = await client.get(
            f"{DOME_API_BASE}/v1/polymarket/markets",
            params={"market_slug[]": market_slug},
            headers=get_headers(),
        )
        markets_resp.raise_for_status()
        markets = markets_resp.json().get("markets", [])
        
        if not markets:
            raise HTTPException(status_code=404, detail="Market not found")
        
        market = markets[0]
        token_id = market.get("side_a", {}).get("id")
        
        # Fetch trades
        trades, total_count = await fetch_market_trades(client, market_slug, hours)
        
        # Fetch orderbook
        orderbook = await fetch_market_orderbook(client, token_id) if token_id else {}
        
        # Fetch price history (sample every 30 mins)
        price_history = await fetch_market_price_history(client, token_id, hours) if token_id else []
        
        trade_metrics = calculate_trade_metrics(trades, api_total_count=total_count)
        ob_metrics = calculate_orderbook_metrics(orderbook)
        price_change = calculate_price_change(trades, hours=1)
        
        return {
            "status": "ok",
            "market_slug": market_slug,
            "title": market.get("title"),
            "token_id": token_id,
            "volume_total": market.get("volume_total", 0),
            
            "trade_metrics": trade_metrics,
            "orderbook": ob_metrics,
            "price_change_1h": price_change,
            
            "price_history": price_history,
            
            "recent_trades": [
                {
                    "timestamp": t.get("timestamp"),
                    "side": t.get("side"),
                    "price": float(t.get("price", 0)),
                    "size": float(t.get("shares_normalized", 0) or t.get("quantity", 0) or 0),
                    "value": float(t.get("shares_normalized", 0) or 0) * float(t.get("price", 0)),
                }
                for t in sorted(trades, key=lambda x: x.get("timestamp", ""), reverse=True)[:100]
            ],
        }
