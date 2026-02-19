"""
Market Test Model
Isolated experimental table for market testing - does NOT touch existing markets functionality
"""
from typing import Optional, List, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field
from enum import Enum
import uuid


class MarketStatus(str, Enum):
    OPEN = "open"
    CLOSED = "closed"
    RESOLVED = "resolved"


class MarketTestBase(BaseModel):
    """Base model for market test"""
    market_id: str = Field(..., description="Internal canonical market ID")
    title: str
    category: str
    start: Optional[datetime] = None
    end: Optional[datetime] = None
    status: MarketStatus = MarketStatus.OPEN
    platforms: List[str] = []
    
    # Polymarket mapping
    polymarket_market_slug: Optional[str] = None
    polymarket_condition_id: Optional[str] = None
    polymarket_token_id_yes: Optional[str] = None
    polymarket_token_id_no: Optional[str] = None
    
    # Kalshi mapping
    kalshi_market_ticker: Optional[str] = None
    kalshi_event_ticker: Optional[str] = None
    
    # Extra metadata
    metadata: Dict[str, Any] = {}


class MarketTestCreate(MarketTestBase):
    """Create model for market test"""
    pass


class MarketTestUpdate(BaseModel):
    """Update model for market test"""
    title: Optional[str] = None
    category: Optional[str] = None
    start: Optional[datetime] = None
    end: Optional[datetime] = None
    status: Optional[MarketStatus] = None
    platforms: Optional[List[str]] = None
    polymarket_market_slug: Optional[str] = None
    polymarket_condition_id: Optional[str] = None
    polymarket_token_id_yes: Optional[str] = None
    polymarket_token_id_no: Optional[str] = None
    kalshi_market_ticker: Optional[str] = None
    kalshi_event_ticker: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


class MarketTest(MarketTestBase):
    """Full market test model with database fields"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        from_attributes = True


class MarketTestEnriched(MarketTest):
    """Market test with enriched data from Dome API"""
    # Volume metrics
    volume_total_usd: float = 0.0
    volume_24h_usd: Optional[float] = None
    volume_7d_usd: Optional[float] = None
    
    # Price metrics
    yes_price_last: Optional[float] = None  # Renamed from last_price_yes
    last_price_yes: Optional[float] = None  # Keep for compatibility
    last_price_no: Optional[float] = None
    mid_price: Optional[float] = None
    yes_change_24h: Optional[float] = None  # Absolute change
    yes_change_24h_pct: Optional[float] = None  # Percentage change
    
    # Order book metrics
    bid_depth_usd: Optional[float] = None
    ask_depth_usd: Optional[float] = None
    spread_bps: Optional[float] = None
    
    # Trade metrics
    trades_24h: Optional[int] = None
    trade_count_24h: Optional[int] = None  # Keep for compatibility
    avg_trade_notional_24h_usd: Optional[float] = None
    avg_trade_size_24h_contracts: Optional[float] = None
    avg_trade_size_usd: Optional[float] = None  # Keep for compatibility
    
    # Trade timing
    last_trade_time: Optional[datetime] = None
    last_trade_age_minutes: Optional[int] = None
    
    # Buy/sell pressure
    buy_pressure_24h_ratio: Optional[float] = None  # 0-1, 0.5 = balanced
    buy_notional_24h_usd: Optional[float] = None
    sell_notional_24h_usd: Optional[float] = None
    
    # Whale activity
    whale_trades_24h: Optional[int] = None
    whale_threshold_usd: float = 5000.0  # Fixed threshold
    
    # Liquidity scoring
    liquidity_score: Optional[int] = None  # 0-100
    liquidity_label: Optional[str] = None  # "High"|"Medium"|"Low"|"Very Low"
    
    # Arbitrage opportunity
    arb_best_spread: Optional[float] = None  # In basis points
    arb_direction: Optional[str] = None  # "poly_to_kalshi" | "kalshi_to_poly" | null
    arb_executability: Optional[str] = None  # "Good"|"Medium"|"Poor"|null
    
    # Actions - for frontend
    actions: Dict[str, str] = {}  # { open_market, trade, arb_view }
    
    # Platform-specific data
    polymarket_data: Optional[Dict[str, Any]] = None
    kalshi_data: Optional[Dict[str, Any]] = None


# In-memory storage for market test data
_market_test_storage: Dict[str, MarketTest] = {}


def get_all_market_tests() -> List[MarketTest]:
    """Get all market tests from in-memory storage"""
    return list(_market_test_storage.values())


def get_market_test_by_id(market_test_id: str) -> Optional[MarketTest]:
    """Get a market test by ID"""
    return _market_test_storage.get(market_test_id)


def get_market_test_by_market_id(market_id: str) -> Optional[MarketTest]:
    """Get a market test by market_id"""
    for mt in _market_test_storage.values():
        if mt.market_id == market_id:
            return mt
    return None


def create_market_test(data: MarketTestCreate) -> MarketTest:
    """Create a new market test"""
    market_test = MarketTest(**data.model_dump())
    _market_test_storage[market_test.id] = market_test
    return market_test


def update_market_test(market_test_id: str, data: MarketTestUpdate) -> Optional[MarketTest]:
    """Update an existing market test"""
    if market_test_id not in _market_test_storage:
        return None
    
    existing = _market_test_storage[market_test_id]
    update_data = data.model_dump(exclude_unset=True)
    
    for key, value in update_data.items():
        setattr(existing, key, value)
    
    existing.updated_at = datetime.utcnow()
    _market_test_storage[market_test_id] = existing
    return existing


def delete_market_test(market_test_id: str) -> bool:
    """Delete a market test"""
    if market_test_id in _market_test_storage:
        del _market_test_storage[market_test_id]
        return True
    return False


def seed_sample_market_tests():
    """Seed some sample market tests for demonstration - will be replaced with real data"""
    # This is just placeholder data - the API will load real markets from Dome
    return 0
