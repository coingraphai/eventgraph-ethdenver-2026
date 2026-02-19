"""
Pydantic models for prediction market data.
Provides type-safe schemas for all entities across sources.
"""
from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field, field_validator


class DataSource(str, Enum):
    """Supported data sources."""
    POLYMARKET = "polymarket"
    KALSHI = "kalshi"
    LIMITLESS = "limitless"
    OPINIONTRADE = "opiniontrade"


class IngestionType(str, Enum):
    """Types of data ingestion."""
    STATIC = "static"   # Full load (weekly)
    DELTA = "delta"     # Incremental (hourly)


class MarketStatus(str, Enum):
    """Market status values."""
    ACTIVE = "active"
    CLOSED = "closed"
    RESOLVED = "resolved"
    PAUSED = "paused"
    PENDING = "pending"


class TradeSide(str, Enum):
    """Trade side values."""
    BUY = "buy"
    SELL = "sell"


# =============================================================================
# BASE MODELS
# =============================================================================

class BaseEntity(BaseModel):
    """Base model for all entities."""
    
    class Config:
        use_enum_values = True
        str_strip_whitespace = True


# =============================================================================
# MARKET MODELS
# =============================================================================

class Outcome(BaseModel):
    """A single market outcome."""
    id: Optional[str] = None
    name: str
    token_id: Optional[str] = None
    price: Optional[Decimal] = None
    
    class Config:
        use_enum_values = True


class MarketBase(BaseEntity):
    """Base market model with common fields."""
    source: DataSource
    source_market_id: str
    title: str
    
    # Optional identifiers
    slug: Optional[str] = None
    condition_id: Optional[str] = None
    question_id: Optional[str] = None
    
    # Description
    description: Optional[str] = None
    question: Optional[str] = None
    
    # Category
    category_id: Optional[str] = None
    category_name: Optional[str] = None
    tags: list[str] = Field(default_factory=list)
    
    # Status
    status: MarketStatus = MarketStatus.ACTIVE
    is_active: bool = True
    is_resolved: bool = False
    resolution_value: Optional[str] = None
    
    # Outcomes
    outcomes: list[Outcome] = Field(default_factory=list)
    outcome_count: int = 2
    
    # Pricing
    yes_price: Optional[Decimal] = None
    no_price: Optional[Decimal] = None
    last_trade_price: Optional[Decimal] = None
    mid_price: Optional[Decimal] = None
    spread: Optional[Decimal] = None
    
    # Volume
    volume_24h: Decimal = Decimal("0")
    volume_7d: Decimal = Decimal("0")
    volume_30d: Decimal = Decimal("0")
    volume_total: Decimal = Decimal("0")
    
    # Liquidity
    liquidity: Decimal = Decimal("0")
    open_interest: Decimal = Decimal("0")
    
    # Activity
    trade_count_24h: int = 0
    trade_count_total: int = 0
    unique_traders: int = 0
    
    # Timing
    created_at_source: Optional[datetime] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    resolution_date: Optional[datetime] = None
    last_trade_at: Optional[datetime] = None
    
    # Media
    image_url: Optional[str] = None
    icon_url: Optional[str] = None
    source_url: Optional[str] = None
    
    # Flexible metadata
    extra_data: dict[str, Any] = Field(default_factory=dict)


class Market(MarketBase):
    """Full market model with tracking fields."""
    id: Optional[str] = None
    body_hash: Optional[str] = None
    first_seen_at: Optional[datetime] = None
    last_updated_at: Optional[datetime] = None


# =============================================================================
# EVENT MODELS
# =============================================================================

class Event(BaseEntity):
    """Event model (groups multiple markets)."""
    source: DataSource
    source_event_id: str
    
    title: str
    description: Optional[str] = None
    slug: Optional[str] = None
    
    category_id: Optional[str] = None
    category_name: Optional[str] = None
    tags: list[str] = Field(default_factory=list)
    
    status: str = "active"
    is_active: bool = True
    
    market_count: int = 0
    total_volume: Decimal = Decimal("0")
    total_liquidity: Decimal = Decimal("0")
    
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    
    image_url: Optional[str] = None
    icon_url: Optional[str] = None
    
    extra_data: dict[str, Any] = Field(default_factory=dict)


# =============================================================================
# TRADE MODELS
# =============================================================================

class Trade(BaseEntity):
    """Trade record model."""
    source: DataSource
    source_trade_id: Optional[str] = None
    source_market_id: str
    
    # Trade details
    side: TradeSide
    outcome: Optional[str] = None
    outcome_index: Optional[int] = None
    
    price: Decimal
    quantity: Decimal
    total_value: Optional[Decimal] = None
    fee: Decimal = Decimal("0")
    
    # Parties
    maker_address: Optional[str] = None
    taker_address: Optional[str] = None
    
    # Blockchain
    block_number: Optional[int] = None
    transaction_hash: Optional[str] = None
    log_index: Optional[int] = None
    
    # Timing
    traded_at: datetime
    
    @field_validator('total_value', mode='before')
    @classmethod
    def calculate_total_value(cls, v, info):
        if v is None and 'price' in info.data and 'quantity' in info.data:
            return info.data['price'] * info.data['quantity']
        return v


# =============================================================================
# PRICE MODELS
# =============================================================================

class PriceSnapshot(BaseEntity):
    """Price snapshot at a point in time."""
    source: DataSource
    source_market_id: str
    
    yes_price: Optional[Decimal] = None
    no_price: Optional[Decimal] = None
    mid_price: Optional[Decimal] = None
    
    best_bid: Optional[Decimal] = None
    best_ask: Optional[Decimal] = None
    spread: Optional[Decimal] = None
    
    volume_1h: Decimal = Decimal("0")
    trade_count_1h: int = 0
    
    # OHLCV
    open_price: Optional[Decimal] = None
    high_price: Optional[Decimal] = None
    low_price: Optional[Decimal] = None
    close_price: Optional[Decimal] = None
    
    snapshot_at: datetime


# =============================================================================
# ORDERBOOK MODELS
# =============================================================================

class OrderLevel(BaseModel):
    """Single level in orderbook."""
    price: Decimal
    size: Decimal
    orders: int = 1


class OrderbookSnapshot(BaseEntity):
    """Orderbook snapshot at a point in time."""
    source: DataSource
    source_market_id: str
    
    best_bid: Optional[Decimal] = None
    best_ask: Optional[Decimal] = None
    spread: Optional[Decimal] = None
    mid_price: Optional[Decimal] = None
    
    bid_depth_10pct: Decimal = Decimal("0")
    ask_depth_10pct: Decimal = Decimal("0")
    total_bid_depth: Decimal = Decimal("0")
    total_ask_depth: Decimal = Decimal("0")
    
    bids: list[OrderLevel] = Field(default_factory=list)
    asks: list[OrderLevel] = Field(default_factory=list)
    
    snapshot_at: datetime


# =============================================================================
# CATEGORY MODELS
# =============================================================================

class Category(BaseEntity):
    """Category model."""
    source: DataSource
    source_category_id: str
    
    name: str
    slug: Optional[str] = None
    description: Optional[str] = None
    
    parent_id: Optional[str] = None
    level: int = 0
    
    market_count: int = 0
    active_market_count: int = 0
    
    icon_url: Optional[str] = None


# =============================================================================
# INGESTION MODELS
# =============================================================================

class SyncState(BaseModel):
    """Sync state for an endpoint."""
    source: DataSource
    endpoint_name: str
    
    last_success_at: Optional[datetime] = None
    last_cursor: Optional[str] = None
    last_page: int = 0
    last_offset: int = 0
    last_record_timestamp: Optional[datetime] = None
    last_record_id: Optional[str] = None
    
    high_watermark: dict[str, Any] = Field(default_factory=dict)
    
    total_records_fetched: int = 0
    total_records_stored: int = 0
    consecutive_errors: int = 0


class RunResult(BaseModel):
    """Result of an ingestion run."""
    source: DataSource
    endpoint_name: Optional[str] = None
    ingestion_type: IngestionType
    
    started_at: datetime
    completed_at: Optional[datetime] = None
    duration_seconds: Optional[float] = None
    
    status: str = "running"
    error_message: Optional[str] = None
    
    records_fetched: int = 0
    records_stored: int = 0
    records_updated: int = 0
    duplicates_skipped: int = 0
    api_calls_made: int = 0
    bytes_transferred: int = 0
