"""
Market Intelligence API - Advanced on-demand market analytics

Fetches orderbook & trades from Dome API on-demand and calculates:
- Liquidity Score (spread + depth components)
- Flow Imbalance (-100 to +100)
- Whale Activity Detection
- Conviction Move Detection
- Market Fragility (gap risk + flicker)
- Execution Cost Estimation
- Trend/Chop Regime
- Volatility Heat
- Market Quality Score

Based on YC Top-10 Signals specification.
NO DATABASE STORAGE - All calculations done in real-time.
"""

from fastapi import APIRouter, Query, HTTPException
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
from decimal import Decimal
from collections import defaultdict
import logging
import math
import statistics

from app.services.dome_api_service import DomeAPIService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/market-intelligence", tags=["Market Intelligence"])


# ============================================================================
# Helper Functions
# ============================================================================

def clamp(value: float, min_val: float, max_val: float) -> float:
    """Clamp value between min and max."""
    return max(min_val, min(max_val, value))


def normalize(value: float, min_val: float, max_val: float) -> float:
    """Normalize value to 0-1 range."""
    if max_val == min_val:
        return 0
    return clamp((value - min_val) / (max_val - min_val), 0, 1)


def percentile(values: List[float], p: float) -> float:
    """Calculate percentile of a list."""
    if not values:
        return 0
    sorted_vals = sorted(values)
    idx = int(len(sorted_vals) * p / 100)
    return sorted_vals[min(idx, len(sorted_vals) - 1)]


# ============================================================================
# Orderbook Validation & Core Primitives
# ============================================================================

def validate_orderbook(orderbook: Dict) -> Dict[str, Any]:
    """
    Validate orderbook and compute core price primitives.
    
    Returns status: "ok", "unreliable", or "missing"
    """
    bids = orderbook.get("bids", [])
    asks = orderbook.get("asks", [])
    
    if not bids or not asks:
        return {
            "status": "missing",
            "best_bid": 0,
            "best_ask": 0,
            "mid": 0,
            "spread_abs": 0,
            "spread_bps": 0,
            "confidence": "low"
        }
    
    # Parse and sort
    parsed_bids = sorted(
        [{"price": float(b.get("price", 0)), "size": float(b.get("size", 0))} for b in bids],
        key=lambda x: x["price"],
        reverse=True
    )
    parsed_asks = sorted(
        [{"price": float(a.get("price", 0)), "size": float(a.get("size", 0))} for a in asks],
        key=lambda x: x["price"]
    )
    
    best_bid = parsed_bids[0]["price"] if parsed_bids else 0
    best_ask = parsed_asks[0]["price"] if parsed_asks else 0
    
    # Check for valid prices
    if best_bid <= 0 or best_ask <= 0:
        return {
            "status": "missing",
            "best_bid": best_bid,
            "best_ask": best_ask,
            "mid": 0,
            "spread_abs": 0,
            "spread_bps": 0,
            "confidence": "low",
            "bids": parsed_bids,
            "asks": parsed_asks
        }
    
    mid = (best_ask + best_bid) / 2
    spread_abs = best_ask - best_bid
    spread_bps = (spread_abs / mid * 10000) if mid > 0 else 0
    
    # Check for unreliable/crossed book (spread > 20%)
    if spread_abs > 0.20:
        status = "unreliable"
        confidence = "low"
    else:
        status = "ok"
        confidence = "high"
    
    return {
        "status": status,
        "best_bid": best_bid,
        "best_ask": best_ask,
        "mid": mid,
        "spread_abs": spread_abs,
        "spread_bps": spread_bps,
        "confidence": confidence,
        "bids": parsed_bids,
        "asks": parsed_asks
    }


# ============================================================================
# Signal 1: Liquidity Score (0-100)
# ============================================================================

def calculate_liquidity_score(ob_data: Dict) -> Dict[str, Any]:
    """
    Liquidity Score = 0.55 * spreadScore + 0.45 * depthScore
    
    spreadScore: based on spread in bps (200 bps = 0)
    depthScore: based on depth within ±2% of mid (log scale, cap at 1M)
    """
    if ob_data["status"] == "missing":
        return {
            "score": None,
            "spread_component": 0,
            "depth_component": 0,
            "bid_depth": 0,
            "ask_depth": 0,
            "max_trade_size": 0,
            "status": "unavailable",
            "confidence": "low",
            "description": "Orderbook data not available"
        }
    
    mid = ob_data["mid"]
    spread_bps = ob_data["spread_bps"]
    bids = ob_data.get("bids", [])
    asks = ob_data.get("asks", [])
    
    # A) Spread component (200 bps = 0, 0 bps = 1)
    spread_score = clamp(1 - (spread_bps / 200), 0, 1)
    
    # B) Depth component (within ±2% of mid)
    band = 0.02
    bid_depth = sum(b["size"] for b in bids if b["price"] >= mid * (1 - band))
    ask_depth = sum(a["size"] for a in asks if a["price"] <= mid * (1 + band))
    depth = min(bid_depth, ask_depth)  # Conservative
    
    # Log scale depth score (cap at 1M shares)
    if depth > 0:
        depth_score = clamp(math.log10(1 + depth) / math.log10(1 + 1_000_000), 0, 1)
    else:
        depth_score = 0
    
    # C) Combined liquidity score
    liquidity_score = round(100 * (0.55 * spread_score + 0.45 * depth_score))
    
    # Estimate max trade size (conservative: 10% of min depth at mid price)
    max_trade_size = depth * mid * 0.1 if mid > 0 else 0
    
    if ob_data["status"] == "unreliable":
        confidence = "low"
        description = f"Wide spread detected ({spread_bps:.0f} bps) - liquidity estimate uncertain"
    elif liquidity_score >= 70:
        confidence = "high"
        description = f"Good liquidity - trade up to ~${int(max_trade_size):,}"
    elif liquidity_score >= 40:
        confidence = "medium"
        description = f"Moderate liquidity - trade up to ~${int(max_trade_size):,}"
    else:
        confidence = "medium"
        description = f"Low liquidity - high slippage risk"
    
    return {
        "score": liquidity_score,
        "spread_component": round(spread_score * 100),
        "depth_component": round(depth_score * 100),
        "bid_depth": bid_depth,
        "ask_depth": ask_depth,
        "max_trade_size": max_trade_size,
        "status": "ok" if ob_data["status"] == "ok" else "degraded",
        "confidence": confidence,
        "description": description
    }


# ============================================================================
# Signal 2: Flow Imbalance (-100 to +100)
# ============================================================================

def calculate_flow_imbalance(trades: List[Dict], window_hours: int = 6) -> Dict[str, Any]:
    """
    Flow Imbalance = (buyVol - sellVol) / (buyVol + sellVol) * 100
    
    Returns -100 (all sells) to +100 (all buys)
    """
    if not trades:
        return {
            "score": 0,
            "label": "No data",
            "buy_volume": 0,
            "sell_volume": 0,
            "buy_count": 0,
            "sell_count": 0,
            "confidence": "low",
            "description": "No trade data available"
        }
    
    # Filter to window
    cutoff = datetime.utcnow() - timedelta(hours=window_hours)
    window_trades = []
    for t in trades:
        try:
            ts = t.get("timestamp")
            if ts:
                if isinstance(ts, str):
                    trade_time = datetime.fromisoformat(ts.replace("Z", "+00:00")).replace(tzinfo=None)
                else:
                    trade_time = datetime.fromtimestamp(ts)
                if trade_time >= cutoff:
                    window_trades.append(t)
        except:
            window_trades.append(t)  # Include if can't parse
    
    if not window_trades:
        window_trades = trades  # Use all if filtering failed
    
    buy_vol = sum(t.get("quantity", 0) or t.get("shares_normalized", 0) or 0 
                  for t in window_trades if t.get("side") == "BUY")
    sell_vol = sum(t.get("quantity", 0) or t.get("shares_normalized", 0) or 0 
                   for t in window_trades if t.get("side") == "SELL")
    buy_count = sum(1 for t in window_trades if t.get("side") == "BUY")
    sell_count = sum(1 for t in window_trades if t.get("side") == "SELL")
    
    total_vol = buy_vol + sell_vol
    if total_vol < 0.01:  # Epsilon
        imbalance = 0
    else:
        imbalance = (buy_vol - sell_vol) / total_vol
    
    score = round(100 * imbalance)  # -100 to +100
    
    # Determine label
    if score >= 50:
        label = "Strong buy pressure"
    elif score >= 20:
        label = "Buy pressure"
    elif score <= -50:
        label = "Strong sell pressure"
    elif score <= -20:
        label = "Sell pressure"
    else:
        label = "Balanced"
    
    confidence = "high" if len(window_trades) >= 10 else "medium" if len(window_trades) >= 3 else "low"
    
    return {
        "score": score,
        "label": label,
        "buy_volume": buy_vol,
        "sell_volume": sell_vol,
        "buy_count": buy_count,
        "sell_count": sell_count,
        "total_trades": len(window_trades),
        "window_hours": window_hours,
        "confidence": confidence,
        "description": f"{label} - {buy_count} buys vs {sell_count} sells in last {window_hours}h"
    }


# ============================================================================
# Signal 3: Whale Activity
# ============================================================================

def detect_whale_activity(trades: List[Dict], window_hours: int = 24) -> Dict[str, Any]:
    """
    Detect whale trades (>95th percentile size).
    """
    if not trades:
        return {
            "whale_count": 0,
            "whale_share": 0,
            "whale_trades": [],
            "threshold": 0,
            "confidence": "low",
            "description": "No trade data"
        }
    
    # Get trade sizes
    sizes = []
    for t in trades:
        size = t.get("quantity", 0) or t.get("shares_normalized", 0) or 0
        if size > 0:
            sizes.append(size)
    
    if len(sizes) < 10:
        return {
            "whale_count": 0,
            "whale_share": 0,
            "whale_trades": [],
            "threshold": 0,
            "confidence": "low",
            "description": "Insufficient data for whale detection"
        }
    
    # 95th percentile threshold
    threshold = percentile(sizes, 95)
    
    # Filter to 24h window for whale detection
    cutoff = datetime.utcnow() - timedelta(hours=window_hours)
    whale_trades = []
    total_vol_24h = 0
    whale_vol = 0
    
    for t in trades:
        size = t.get("quantity", 0) or t.get("shares_normalized", 0) or 0
        try:
            ts = t.get("timestamp")
            if ts:
                if isinstance(ts, str):
                    trade_time = datetime.fromisoformat(ts.replace("Z", "+00:00")).replace(tzinfo=None)
                else:
                    trade_time = datetime.fromtimestamp(ts)
                if trade_time >= cutoff:
                    total_vol_24h += size
                    if size >= threshold:
                        whale_vol += size
                        whale_trades.append({
                            "timestamp": t.get("timestamp"),
                            "side": t.get("side"),
                            "size": size,
                            "price": t.get("price"),
                            "value": size * (t.get("price") or 0)
                        })
        except:
            pass
    
    whale_share = (whale_vol / total_vol_24h * 100) if total_vol_24h > 0 else 0
    whale_count = len(whale_trades)
    
    if whale_count >= 3:
        level = "high"
        description = f"{whale_count} large trades (>95th pct) detected in last 24h"
    elif whale_count >= 1:
        level = "medium"
        description = f"{whale_count} large trade detected"
    else:
        level = "low"
        description = "No significant whale activity"
    
    return {
        "whale_count": whale_count,
        "whale_share": round(whale_share, 1),
        "whale_trades": whale_trades[:10],  # Top 10
        "threshold": threshold,
        "level": level,
        "confidence": "high" if len(sizes) >= 50 else "medium",
        "description": description
    }


# ============================================================================
# Signal 4: Conviction Move Detector
# ============================================================================

def detect_conviction_move(trades: List[Dict], flow_data: Dict) -> Dict[str, Any]:
    """
    Detect high-conviction price moves (price move + flow alignment).
    
    isConviction = |priceMove| >= 0.02 AND sign(priceMove) == sign(flow)
    """
    if not trades or len(trades) < 5:
        return {
            "detected": False,
            "level": None,
            "price_move": 0,
            "direction": None,
            "confidence": "low",
            "description": "Insufficient data"
        }
    
    # Get prices with timestamps
    price_data = []
    for t in trades:
        price = t.get("price")
        ts = t.get("timestamp")
        if price and ts:
            try:
                if isinstance(ts, str):
                    trade_time = datetime.fromisoformat(ts.replace("Z", "+00:00")).replace(tzinfo=None)
                else:
                    trade_time = datetime.fromtimestamp(ts)
                price_data.append({"time": trade_time, "price": float(price)})
            except:
                pass
    
    if len(price_data) < 3:
        return {
            "detected": False,
            "level": None,
            "price_move": 0,
            "direction": None,
            "confidence": "low",
            "description": "Insufficient price data"
        }
    
    # Sort by time
    price_data.sort(key=lambda x: x["time"])
    
    # Current price (average of last 5 trades)
    recent_prices = [p["price"] for p in price_data[-5:]]
    current_price = sum(recent_prices) / len(recent_prices)
    
    # Price 60 mins ago (or earliest available)
    cutoff_60m = datetime.utcnow() - timedelta(minutes=60)
    old_prices = [p["price"] for p in price_data if p["time"] <= cutoff_60m]
    if old_prices:
        old_price = sum(old_prices[-5:]) / len(old_prices[-5:])
    else:
        old_price = price_data[0]["price"]
    
    price_move = current_price - old_price
    flow_score = flow_data.get("score", 0)
    
    # Check conviction criteria
    is_conviction = (
        abs(price_move) >= 0.02 and  # Moved >= 2 points
        ((price_move > 0 and flow_score > 0) or (price_move < 0 and flow_score < 0))  # Flow supports move
    )
    
    if is_conviction:
        direction = "up" if price_move > 0 else "down"
        level = "high" if abs(price_move) >= 0.04 else "medium"
        description = f"Moved {price_move*100:+.1f}pts with {'strong ' if abs(flow_score) > 40 else ''}{flow_data.get('label', 'flow').lower()}"
    else:
        direction = None
        level = None
        description = "No conviction move detected"
    
    return {
        "detected": is_conviction,
        "level": level,
        "price_move": round(price_move, 4),
        "price_move_pct": round(price_move * 100, 2),
        "direction": direction,
        "current_price": round(current_price, 4),
        "old_price": round(old_price, 4),
        "confidence": "high" if len(price_data) >= 20 else "medium",
        "description": description
    }


# ============================================================================
# Signal 5: Market Fragility
# ============================================================================

def calculate_fragility(ob_data: Dict) -> Dict[str, Any]:
    """
    Fragility = gap risk + stability issues.
    
    Score 0-100 (higher = riskier)
    """
    if ob_data["status"] == "missing":
        return {
            "score": None,
            "gap_risk": 0,
            "level": "unknown",
            "confidence": "low",
            "description": "Cannot assess - no orderbook"
        }
    
    bids = ob_data.get("bids", [])
    asks = ob_data.get("asks", [])
    
    # A) Gap risk - max price gap in top 5 levels
    gap_ask = 0
    for i in range(1, min(5, len(asks))):
        gap = asks[i]["price"] - asks[i-1]["price"]
        gap_ask = max(gap_ask, gap)
    
    gap_bid = 0
    for i in range(1, min(5, len(bids))):
        gap = bids[i-1]["price"] - bids[i]["price"]  # bids sorted desc
        gap_bid = max(gap_bid, gap)
    
    gap_risk = max(gap_ask, gap_bid)
    
    # Normalize gap risk (0.05 = very fragile)
    gap_score = normalize(gap_risk, 0, 0.05)
    
    # B) Thin book check
    top_bid_size = sum(b["size"] for b in bids[:5]) if bids else 0
    top_ask_size = sum(a["size"] for a in asks[:5]) if asks else 0
    thin_book = top_bid_size < 1000 or top_ask_size < 1000
    thin_penalty = 0.3 if thin_book else 0
    
    # C) Combined fragility score
    fragility_score = round(100 * clamp(0.7 * gap_score + thin_penalty, 0, 1))
    
    # Apply unreliable penalty
    if ob_data["status"] == "unreliable":
        fragility_score = min(100, fragility_score + 30)
    
    # Determine level
    if fragility_score >= 60:
        level = "high"
        description = "High fragility - thin book with price gaps"
    elif fragility_score >= 30:
        level = "medium"
        description = "Moderate fragility - some orderbook instability"
    else:
        level = "low"
        description = "Low fragility - stable orderbook"
    
    return {
        "score": fragility_score,
        "gap_risk": round(gap_risk, 4),
        "thin_book": thin_book,
        "level": level,
        "confidence": "high" if ob_data["status"] == "ok" else "medium",
        "description": description
    }


# ============================================================================
# Signal 6: Execution Cost Estimator
# ============================================================================

def estimate_execution_cost(ob_data: Dict, notional: float, side: str = "buy") -> Dict[str, Any]:
    """
    Simulate orderbook consumption for a given notional.
    
    Returns slippage in probability points.
    """
    if ob_data["status"] == "missing":
        return {
            "notional": notional,
            "slippage_pts": None,
            "avg_price": None,
            "feasible": False,
            "filled_pct": 0,
            "confidence": "low",
            "description": "Execution estimate unavailable"
        }
    
    mid = ob_data["mid"]
    levels = ob_data.get("asks" if side == "buy" else "bids", [])
    
    if not levels or mid <= 0:
        return {
            "notional": notional,
            "slippage_pts": None,
            "avg_price": None,
            "feasible": False,
            "filled_pct": 0,
            "confidence": "low",
            "description": "Insufficient orderbook depth"
        }
    
    remaining = notional
    cost = 0
    total_qty = 0
    
    for level in levels:
        if remaining <= 0:
            break
        
        price = level["price"]
        size = level["size"]
        level_notional = price * size
        
        take = min(remaining, level_notional)
        qty = take / price if price > 0 else 0
        cost += take
        total_qty += qty
        remaining -= take
    
    if total_qty <= 0:
        return {
            "notional": notional,
            "slippage_pts": None,
            "avg_price": None,
            "feasible": False,
            "filled_pct": 0,
            "confidence": "low",
            "description": "Cannot fill order"
        }
    
    filled_pct = ((notional - remaining) / notional) * 100
    avg_price = cost / total_qty if total_qty > 0 else 0
    slippage = abs(avg_price - mid)
    slippage_pts = slippage * 100  # Convert to probability points
    
    feasible = remaining <= 0
    
    if not feasible:
        description = f"Partial fill only ({filled_pct:.0f}%)"
        confidence = "low"
    elif slippage_pts < 0.5:
        description = "Excellent execution"
        confidence = "high"
    elif slippage_pts < 1:
        description = "Good execution"
        confidence = "high"
    elif slippage_pts < 2:
        description = "Moderate slippage"
        confidence = "medium"
    else:
        description = "High slippage - consider smaller size"
        confidence = "medium"
    
    return {
        "notional": notional,
        "slippage_pts": round(slippage_pts, 2),
        "avg_price": round(avg_price, 4),
        "mid_price": round(mid, 4),
        "feasible": feasible,
        "filled_pct": round(filled_pct, 1),
        "confidence": confidence if ob_data["status"] == "ok" else "low",
        "description": description
    }


# ============================================================================
# Signal 7: Trend vs Chop (Regime)
# ============================================================================

def detect_regime(trades: List[Dict]) -> Dict[str, Any]:
    """
    Detect if market is Trending, Choppy, or Neutral.
    
    Based on 5-min VWAP series momentum and flip rate.
    """
    if not trades or len(trades) < 10:
        return {
            "regime": "unknown",
            "momentum": 0,
            "flip_rate": 0,
            "confidence": "low",
            "description": "Insufficient data"
        }
    
    # Build 5-min VWAP buckets
    bucket_size = 300  # 5 minutes in seconds
    buckets = defaultdict(lambda: {"vol": 0, "value": 0})
    
    for t in trades:
        price = t.get("price", 0)
        qty = t.get("quantity", 0) or t.get("shares_normalized", 0) or 0
        ts = t.get("timestamp")
        
        if not ts or not price:
            continue
        
        try:
            if isinstance(ts, str):
                trade_time = datetime.fromisoformat(ts.replace("Z", "+00:00")).replace(tzinfo=None)
                bucket_ts = int(trade_time.timestamp()) // bucket_size * bucket_size
            else:
                bucket_ts = int(ts) // bucket_size * bucket_size
            
            buckets[bucket_ts]["vol"] += qty
            buckets[bucket_ts]["value"] += price * qty
        except:
            pass
    
    if len(buckets) < 3:
        return {
            "regime": "unknown",
            "momentum": 0,
            "flip_rate": 0,
            "confidence": "low",
            "description": "Insufficient time range"
        }
    
    # Calculate VWAPs
    sorted_buckets = sorted(buckets.keys())
    vwaps = []
    for ts in sorted_buckets:
        b = buckets[ts]
        if b["vol"] > 0:
            vwaps.append(b["value"] / b["vol"])
    
    if len(vwaps) < 3:
        return {
            "regime": "neutral",
            "momentum": 0,
            "flip_rate": 0,
            "confidence": "low",
            "description": "Limited data"
        }
    
    # Calculate returns and flip rate
    returns = [vwaps[i] - vwaps[i-1] for i in range(1, len(vwaps))]
    
    sign_changes = sum(1 for i in range(1, len(returns)) 
                       if (returns[i] > 0) != (returns[i-1] > 0))
    flip_rate = sign_changes / len(returns) if returns else 0
    
    # Momentum: current VWAP vs 60 mins ago (12 buckets)
    lookback = min(12, len(vwaps) - 1)
    momentum = vwaps[-1] - vwaps[-(lookback+1)] if lookback > 0 else 0
    
    # Determine regime
    if abs(momentum) >= 0.015 and flip_rate < 0.35:
        regime = "trending"
        direction = "up" if momentum > 0 else "down"
        description = f"Trending {direction} - moves following through"
    elif flip_rate >= 0.45:
        regime = "choppy"
        description = "Choppy - frequent reversals"
    else:
        regime = "neutral"
        description = "Neutral - no clear pattern"
    
    return {
        "regime": regime,
        "momentum": round(momentum, 4),
        "momentum_pts": round(momentum * 100, 2),
        "flip_rate": round(flip_rate, 2),
        "confidence": "high" if len(vwaps) >= 12 else "medium",
        "description": description
    }


# ============================================================================
# Signal 8: Volatility Heat
# ============================================================================

def calculate_volatility(trades: List[Dict]) -> Dict[str, Any]:
    """
    Calculate volatility from price movements.
    """
    if not trades or len(trades) < 5:
        return {
            "score": 0,
            "level": "calm",
            "std_dev": 0,
            "price_range_pct": 0,
            "confidence": "low",
            "description": "Insufficient data"
        }
    
    prices = [t.get("price", 0) for t in trades if t.get("price")]
    
    if len(prices) < 3:
        return {
            "score": 0,
            "level": "calm",
            "std_dev": 0,
            "price_range_pct": 0,
            "confidence": "low",
            "description": "Insufficient price data"
        }
    
    # Calculate returns
    returns = [prices[i] - prices[i-1] for i in range(1, len(prices))]
    
    if not returns:
        return {
            "score": 0,
            "level": "calm",
            "std_dev": 0,
            "price_range_pct": 0,
            "confidence": "low",
            "description": "No price changes"
        }
    
    # Volatility as std dev of returns
    try:
        vol = statistics.stdev(returns) if len(returns) > 1 else 0
    except:
        vol = 0
    
    # Also compute price range
    min_price = min(prices)
    max_price = max(prices)
    avg_price = sum(prices) / len(prices)
    price_range_pct = ((max_price - min_price) / avg_price * 100) if avg_price > 0 else 0
    
    # Score (0.01 = 1 probability point std dev = 100 score)
    vol_score = round(clamp(vol / 0.01, 0, 1) * 100)
    
    # Level
    if vol_score >= 70:
        level = "hot"
        description = f"High volatility - top {100 - vol_score}% active"
    elif vol_score >= 40:
        level = "moderate"
        description = "Moderate volatility"
    else:
        level = "calm"
        description = "Low volatility - stable prices"
    
    return {
        "score": vol_score,
        "level": level,
        "std_dev": round(vol, 6),
        "price_range_pct": round(price_range_pct, 2),
        "confidence": "high" if len(prices) >= 50 else "medium",
        "description": description
    }


# ============================================================================
# Signal 10: Market Quality Score (Composite)
# ============================================================================

def calculate_quality_score(
    liquidity: Dict,
    fragility: Dict,
    volatility: Dict,
    flow: Dict
) -> Dict[str, Any]:
    """
    Composite quality score (0-100).
    
    quality = 0.40*liquidity + 0.25*(100-fragility) + 0.20*(100-volatility) + 0.15*flowBalance
    """
    liq_score = liquidity.get("score") or 0
    frag_score = fragility.get("score") or 50  # Default to medium if unknown
    vol_score = volatility.get("score") or 30
    flow_score = abs(flow.get("score", 0))  # Penalize extreme imbalance slightly
    flow_balance = 100 - flow_score  # More balanced = better quality
    
    # If liquidity is unavailable, reduce weight
    if liquidity.get("score") is None:
        quality = round(
            0.35 * (100 - frag_score) +
            0.35 * (100 - vol_score) +
            0.30 * flow_balance
        )
        confidence = "low"
    else:
        quality = round(
            0.40 * liq_score +
            0.25 * (100 - frag_score) +
            0.20 * (100 - vol_score) +
            0.15 * flow_balance
        )
        confidence = liquidity.get("confidence", "medium")
    
    quality = clamp(quality, 0, 100)
    
    if quality >= 70:
        label = "High signal"
        description = "High quality market - stable and liquid"
    elif quality >= 45:
        label = "Medium signal"
        description = "Moderate quality - trade with care"
    else:
        label = "Low signal"
        description = "Low quality - high risk"
    
    return {
        "score": quality,
        "label": label,
        "confidence": confidence,
        "description": description,
        "components": {
            "liquidity": liq_score,
            "fragility_inv": 100 - frag_score,
            "volatility_inv": 100 - vol_score,
            "flow_balance": flow_balance
        }
    }


# ============================================================================
# Generate Insights
# ============================================================================

def generate_insights(
    conviction: Dict,
    whale: Dict,
    regime: Dict,
    fragility: Dict,
    liquidity: Dict
) -> List[Dict]:
    """Generate actionable insight cards."""
    insights = []
    now_ts = int(datetime.utcnow().timestamp())
    
    # Conviction move
    if conviction.get("detected"):
        insights.append({
            "type": "conviction",
            "level": conviction.get("level", "medium"),
            "text": conviction.get("description"),
            "ts": now_ts
        })
    
    # Whale activity
    if whale.get("whale_count", 0) >= 1:
        insights.append({
            "type": "whale",
            "level": whale.get("level", "low"),
            "text": whale.get("description"),
            "ts": now_ts
        })
    
    # Regime
    if regime.get("regime") == "trending":
        insights.append({
            "type": "regime",
            "level": "medium",
            "text": regime.get("description"),
            "ts": now_ts
        })
    
    # Fragility warning
    if fragility.get("level") == "high":
        insights.append({
            "type": "warning",
            "level": "high",
            "text": fragility.get("description"),
            "ts": now_ts
        })
    
    # Liquidity warning
    if liquidity.get("score") is not None and liquidity.get("score") < 30:
        insights.append({
            "type": "warning",
            "level": "medium",
            "text": "Low liquidity - high slippage risk",
            "ts": now_ts
        })
    
    return insights


# ============================================================================
# API Endpoints
# ============================================================================

@router.get("/{platform}/{market_id}")
async def get_market_intelligence(
    platform: str,
    market_id: str,
    token_id: Optional[str] = Query(None, description="Token ID for orderbook"),
    hours: int = Query(24, ge=1, le=168, description="Trade history hours"),
):
    """
    Get comprehensive market intelligence using YC Top-10 signals.
    
    Returns structured JSON with:
    - truth: probability, liquidity, flow, quality
    - now: insights and time series data
    - risk: fragility, volatility
    - execution: slippage estimates
    """
    platform_map = {
        "poly": "polymarket",
        "polymarket": "polymarket",
        "kalshi": "kalshi",
    }
    normalized_platform = platform_map.get(platform.lower(), platform.lower())
    
    # Fetch data from Dome API
    async with DomeAPIService() as service:
        trades_result = await service.get_trades(
            market_id=market_id,
            hours=hours,
            min_usd=0,
            limit=1000,
            platform=normalized_platform
        )
        trades = trades_result.get("trades", [])
        
        orderbook = {"bids": [], "asks": []}
        if token_id:
            orderbook = await service.get_orderbook(
                token_id=token_id,
                depth=50,
                platform=normalized_platform
            )
    
    # Validate orderbook and get primitives
    ob_data = validate_orderbook(orderbook)
    
    # Calculate all signals
    liquidity = calculate_liquidity_score(ob_data)
    flow = calculate_flow_imbalance(trades, window_hours=6)
    whale = detect_whale_activity(trades)
    conviction = detect_conviction_move(trades, flow)
    fragility = calculate_fragility(ob_data)
    volatility = calculate_volatility(trades)
    regime = detect_regime(trades)
    quality = calculate_quality_score(liquidity, fragility, volatility, flow)
    
    # Execution estimates
    estimates = []
    for notional in [1000, 10000, 50000, 100000]:
        buy_est = estimate_execution_cost(ob_data, notional, "buy")
        sell_est = estimate_execution_cost(ob_data, notional, "sell")
        estimates.append({
            "notional": notional,
            "buy_slippage_pts": buy_est.get("slippage_pts"),
            "sell_slippage_pts": sell_est.get("slippage_pts"),
            "feasible": buy_est.get("feasible", False) and sell_est.get("feasible", False)
        })
    
    # Generate insights
    insights = generate_insights(conviction, whale, regime, fragility, liquidity)
    
    # Build response per spec
    return {
        "market": {
            "market_id": market_id,
            "token_id": token_id,
            "platform": normalized_platform,
        },
        "truth": {
            "probability": {
                "value": ob_data["mid"],
                "display": f"{int(ob_data['mid'] * 100)}%" if ob_data["mid"] > 0 else "-",
                "confidence": ob_data["confidence"]
            },
            "liquidity": {
                "score": liquidity.get("score"),
                "status": liquidity.get("status"),
                "confidence": liquidity.get("confidence"),
                "description": liquidity.get("description")
            },
            "flow": {
                "score": flow.get("score"),
                "label": flow.get("label"),
                "confidence": flow.get("confidence"),
                "buy_volume": flow.get("buy_volume"),
                "sell_volume": flow.get("sell_volume")
            },
            "quality": {
                "score": quality.get("score"),
                "label": quality.get("label"),
                "confidence": quality.get("confidence"),
                "description": quality.get("description")
            }
        },
        "now": {
            "insights": insights,
            "conviction": conviction,
            "whale": whale,
            "regime": regime,
            "trade_stats": {
                "total": len(trades),
                "buy_count": flow.get("buy_count", 0),
                "sell_count": flow.get("sell_count", 0),
                "total_volume": flow.get("buy_volume", 0) + flow.get("sell_volume", 0)
            },
            "recent_trades": trades[:20]
        },
        "risk": {
            "fragility": {
                "score": fragility.get("score"),
                "level": fragility.get("level"),
                "confidence": fragility.get("confidence"),
                "description": fragility.get("description")
            },
            "volatility": {
                "score": volatility.get("score"),
                "level": volatility.get("level"),
                "confidence": volatility.get("confidence"),
                "description": volatility.get("description")
            },
            "spread": {
                "abs": ob_data["spread_abs"],
                "bps": round(ob_data["spread_bps"], 1),
                "best_bid": ob_data["best_bid"],
                "best_ask": ob_data["best_ask"]
            }
        },
        "execution": {
            "mid": ob_data["mid"],
            "estimates": estimates,
            "confidence": ob_data["confidence"] if ob_data["status"] == "ok" else "low",
            "orderbook_status": ob_data["status"]
        },
        "raw": {
            "trades_count": len(trades),
            "orderbook_bids": len(ob_data.get("bids", [])),
            "orderbook_asks": len(ob_data.get("asks", [])),
            "orderbook_status": ob_data["status"]
        },
        "_meta": {
            "timestamp": datetime.utcnow().isoformat(),
            "hours_analyzed": hours
        }
    }


@router.get("/{platform}/{market_id}/execution-cost")
async def estimate_trade_cost(
    platform: str,
    market_id: str,
    token_id: str = Query(..., description="Token ID for orderbook"),
    trade_size: float = Query(10000, ge=100, le=1000000),
    side: str = Query("buy"),
):
    """Estimate execution cost for a specific trade size."""
    platform_map = {"poly": "polymarket", "polymarket": "polymarket", "kalshi": "kalshi"}
    normalized_platform = platform_map.get(platform.lower(), platform.lower())
    
    async with DomeAPIService() as service:
        orderbook = await service.get_orderbook(token_id=token_id, depth=100, platform=normalized_platform)
    
    ob_data = validate_orderbook(orderbook)
    return estimate_execution_cost(ob_data, trade_size, side.lower())
