"""
Configuration settings for the predictions data ingestion system.
Uses Pydantic Settings for type-safe environment variable loading.
"""
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    model_config = SettingsConfigDict(
        env_file=str(Path(__file__).parent.parent / ".env"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )
    
    # ==========================================================================
    # DATABASE CONFIGURATION
    # ==========================================================================
    postgres_host: str = Field(default="localhost")
    postgres_port: int = Field(default=5432)
    postgres_db: str = Field(default="predictions")
    postgres_user: str = Field(default="postgres")
    postgres_password: str = Field(default="")
    postgres_sslmode: str = Field(default="prefer")
    
    db_pool_size: int = Field(default=10, ge=1, le=100)
    db_pool_max_overflow: int = Field(default=20, ge=0, le=100)
    db_batch_size: int = Field(default=500, ge=100, le=5000)
    
    @property
    def database_url(self) -> str:
        """Synchronous database URL (psycopg2)."""
        password = f":{self.postgres_password}" if self.postgres_password else ""
        return (
            f"postgresql://{self.postgres_user}{password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
            f"?sslmode={self.postgres_sslmode}"
        )
    
    @property
    def database_url_asyncpg(self) -> str:
        """Database URL for asyncpg (uses ssl= parameter)."""
        password = f":{self.postgres_password}" if self.postgres_password else ""
        ssl_param = "ssl=require" if self.postgres_sslmode == "require" else ""
        url = (
            f"postgresql://{self.postgres_user}{password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )
        if ssl_param:
            url += f"?{ssl_param}"
        return url
    
    @property
    def database_url_async(self) -> str:
        """Async database URL for SQLAlchemy asyncpg."""
        password = f":{self.postgres_password}" if self.postgres_password else ""
        return (
            f"postgresql+asyncpg://{self.postgres_user}{password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )
    
    # ==========================================================================
    # DOME API CONFIGURATION (Polymarket + Kalshi)
    # ==========================================================================
    dome_api_key: str = Field(default="", description="Dome API key")
    dome_api_base_url: str = Field(
        default="https://api.domeapi.io/v1",
        description="Dome API base URL"
    )
    dome_rate_limit_rps: float = Field(
        default=75.0,  # Dev tier: 100 QPS, use 75 for optimal performance
        ge=1.0,
        le=300.0,
        description="Dome API rate limit (requests per second)"
    )
    
    # ==========================================================================
    # LIMITLESS API CONFIGURATION
    # ==========================================================================
    limitless_api_base_url: str = Field(
        default="https://api.limitless.exchange",
        description="Limitless Exchange API base URL"
    )
    limitless_rate_limit_rps: float = Field(
        default=5.0,
        ge=1.0,
        le=50.0,
        description="Limitless API rate limit"
    )
    
    # ==========================================================================
    # OPINION TRADE API CONFIGURATION
    # ==========================================================================
    opiniontrade_api_key: str = Field(default="", description="Opinion Trade API key")
    opiniontrade_api_base_url: str = Field(
        default="https://openapi.opinion.trade",
        description="Opinion Trade API base URL"
    )
    opiniontrade_rate_limit_rps: float = Field(
        default=10.0,  # API limit is 15 RPS, use 10 for safety
        ge=1.0,
        le=15.0,
        description="Opinion Trade API rate limit"
    )
    
    # ==========================================================================
    # GENERAL API SETTINGS
    # ==========================================================================
    api_timeout_seconds: int = Field(default=30, ge=5, le=300)
    max_concurrency: int = Field(default=10, ge=1, le=50)
    default_page_size: int = Field(default=100, ge=10, le=1000)
    max_pages_per_endpoint: int = Field(default=0, description="0 = unlimited")
    
    # ==========================================================================
    # RETRY CONFIGURATION
    # ==========================================================================
    retry_max_attempts: int = Field(default=5, ge=1, le=20)
    backoff_base_seconds: float = Field(default=1.0, ge=0.1, le=10.0)
    backoff_max_seconds: float = Field(default=60.0, ge=1.0, le=300.0)
    backoff_jitter: float = Field(default=0.5, ge=0.0, le=1.0)
    
    # ==========================================================================
    # SCHEDULING CONFIGURATION
    # ==========================================================================
    
    # Static (full) load schedule - runs once to bootstrap data
    # After initial load, can be run weekly/monthly to ensure data consistency
    static_schedule_enabled: bool = Field(default=True)
    static_schedule_day: str = Field(default="sun", description="Day of week for static load (sun, mon, tue, etc.)")
    static_schedule_hour: int = Field(default=2, ge=0, le=23, description="Hour (UTC) for static load")
    
    # Delta (incremental) load schedule - runs frequently to keep data fresh
    # Prices: Update every 15 minutes (balance between freshness and API costs)
    # Trades: Update every 1 hour with 'since' timestamp (incremental only)
    # Orderbooks: Update every 1 hour (top 100 markets snapshot)
    delta_schedule_enabled: bool = Field(default=True)
    delta_schedule_interval_hours: int = Field(default=1, ge=1, le=24, description="Delta load interval in hours")
    
    # Price-specific update interval (in minutes, separate from delta)
    delta_price_interval_minutes: int = Field(default=15, ge=1, le=60, description="Price update interval in minutes (default: 15)")
    
    # TESTING: Delta interval in minutes (overrides hours if set > 0)
    delta_schedule_interval_minutes: int = Field(default=0, ge=0, le=1440, description="For testing: run delta every N minutes (0=use hours setting)")
    
    # Run delta immediately on scheduler startup (before waiting for first interval)
    run_delta_on_startup: bool = Field(default=True)
    
    # ==========================================================================
    # INGESTION PIPELINE CONFIGURATION
    # ==========================================================================
    
    # Volume-based market filtering (server-side via Dome API min_volume parameter)
    # This filters markets BEFORE fetching to reduce API calls significantly
    # Set to 0 to disable filtering and fetch all markets
    polymarket_min_volume_usd: int = Field(default=50000, ge=0, description="Polymarket: minimum 24h volume (USD) to fetch markets")
    kalshi_min_volume_usd: int = Field(default=10000, ge=0, description="Kalshi: minimum 24h volume (USD) to fetch markets") 
    limitless_min_volume_usd: int = Field(default=5000, ge=0, description="Limitless: minimum 24h volume (USD) to fetch markets")
    opiniontrade_min_volume_usd: int = Field(default=5000, ge=0, description="OpinionTrade: minimum 24h volume (USD) to fetch markets")
    
    # Max markets to fetch per platform (additional safety limit after volume filtering)
    polymarket_max_markets: int = Field(default=500, ge=0, description="Maximum markets to fetch from Polymarket (0=unlimited)")
    kalshi_max_markets: int = Field(default=500, ge=0, description="Maximum markets to fetch from Kalshi (0=unlimited)")
    limitless_max_markets: int = Field(default=100, ge=0, description="Maximum markets to fetch from Limitless (0=unlimited)")
    opiniontrade_max_markets: int = Field(default=100, ge=0, description="Maximum markets to fetch from OpinionTrade (0=unlimited)")
    
    # Price fetching concurrency (number of parallel API requests)
    price_fetch_batch_size: int = Field(default=75, ge=10, le=100, description="Number of concurrent price API requests")
    
    # Orderbook fetching limits (to reduce API usage)
    # NOTE: Set to 0 by default - Polymarket orderbook API requires token_id not condition_id
    orderbook_fetch_top_n: int = Field(default=0, ge=0, le=100, description="Fetch orderbooks for top N markets by volume (0=skip)")
    
    # Trades fetching configuration (filtered to reduce data volume)
    trades_top_n_markets: int = Field(default=100, ge=0, le=500, description="Fetch trades for top N Polymarket markets by volume (0=skip)")
    kalshi_trades_top_n_markets: int = Field(default=50, ge=0, le=500, description="Fetch trades for top N Kalshi markets by volume (0=skip, default:50 - Kalshi has fewer trades)")
    trades_since_hours: int = Field(default=24, ge=1, le=168, description="Fetch trades from last N hours")
    trades_min_usd: int = Field(default=1000, ge=0, description="Minimum trade value in USD (0=all trades)")
    trades_max_per_market: int = Field(default=1000, ge=100, le=10000, description="Maximum trades to fetch per market (limits API calls)")
    
    # Price history depth for delta loads
    price_history_hours: int = Field(default=6, ge=1, le=168, description="Hours of price history to fetch in delta loads)")
    
    # View refresh intervals
    hot_views_refresh_minutes: int = Field(default=5)
    daily_views_refresh_cron: str = Field(default="0 0 * * *")
    
    # ==========================================================================
    # FEATURE FLAGS
    # ==========================================================================
    enable_bronze_layer: bool = Field(default=True)
    enable_silver_layer: bool = Field(default=True)
    enable_gold_layer: bool = Field(default=True)
    
    enable_polymarket: bool = Field(default=True)
    enable_kalshi: bool = Field(default=True)
    enable_limitless: bool = Field(default=True)
    enable_opiniontrade: bool = Field(default=False)  # Phase 2
    
    # ==========================================================================
    # LOGGING
    # ==========================================================================
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = Field(default="INFO")
    log_format: Literal["json", "console"] = Field(default="json")
    structured_logging: bool = Field(default=True)
    debug: bool = Field(default=False)
    
    # ==========================================================================
    # DERIVED PROPERTIES
    # ==========================================================================
    
    @property
    def enabled_sources(self) -> list:
        """Get list of enabled data sources as DataSource enums."""
        from predictions_ingest.models import DataSource
        sources = []
        if self.enable_polymarket:
            sources.append(DataSource.POLYMARKET)
        if self.enable_kalshi:
            sources.append(DataSource.KALSHI)
        if self.enable_limitless:
            sources.append(DataSource.LIMITLESS)
        if self.enable_opiniontrade:
            sources.append(DataSource.OPINIONTRADE)
        return sources
    
    @property
    def async_database_url(self) -> str:
        """Async database URL for SQLAlchemy asyncpg."""
        password = f":{self.postgres_password}" if self.postgres_password else ""
        return (
            f"postgresql+asyncpg://{self.postgres_user}{password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
