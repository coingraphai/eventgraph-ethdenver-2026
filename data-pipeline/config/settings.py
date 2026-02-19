"""
Application settings and configuration management.
"""
from functools import lru_cache
from pathlib import Path
from typing import Literal

import yaml
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )
    
    # Database
    database_url: str = Field(
        default="postgresql://postgres:password@localhost:5432/limitless_data",
        description="PostgreSQL connection string",
    )
    database_url_async: str = Field(
        default="postgresql+asyncpg://postgres:password@localhost:5432/limitless_data",
        description="Async PostgreSQL connection string",
    )
    db_pool_size: int = Field(default=10, ge=1, le=100)
    db_pool_max_overflow: int = Field(default=20, ge=0, le=100)
    
    # API
    limitless_api_base_url: str = Field(
        default="https://api.limitless.exchange",
        description="Limitless Exchange API base URL",
    )
    api_timeout_seconds: int = Field(default=30, ge=5, le=300)
    max_concurrency: int = Field(default=5, ge=1, le=50)
    rate_limit_rps: float = Field(default=10.0, ge=0.1, le=100.0)
    
    # Retry
    retry_max_attempts: int = Field(default=5, ge=1, le=20)
    backoff_base_seconds: float = Field(default=1.0, ge=0.1, le=10.0)
    backoff_max_seconds: float = Field(default=60.0, ge=1.0, le=300.0)
    backoff_jitter: float = Field(default=0.5, ge=0.0, le=1.0)
    
    # Ingestion
    default_page_size: int = Field(default=100, ge=10, le=1000)
    max_pages_per_endpoint: int = Field(default=0, ge=0)  # 0 = unlimited
    db_batch_size: int = Field(default=500, ge=10, le=10000)
    enable_schema_evolution: bool = Field(default=True)
    
    # Scheduling
    incremental_sync_interval: int = Field(default=300, ge=60)
    backfill_schedule: str = Field(default="0 2 * * *")
    scheduler_enabled: bool = Field(default=False)
    
    # Authentication (optional)
    wallet_private_key: str | None = Field(default=None)
    session_cookie: str | None = Field(default=None)
    
    # Logging
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] = Field(
        default="INFO"
    )
    log_format: Literal["json", "console"] = Field(default="json")
    structured_logging: bool = Field(default=True)
    metrics_port: int = Field(default=9090, ge=1024, le=65535)
    
    # Feature flags
    enable_bronze_layer: bool = Field(default=True)
    enable_silver_layer: bool = Field(default=True)
    enable_gold_layer: bool = Field(default=True)
    enable_orderbook_snapshots: bool = Field(default=True)
    orderbook_snapshot_interval: int = Field(default=60, ge=10)
    
    @property
    def config_dir(self) -> Path:
        """Get the config directory path."""
        return Path(__file__).parent
    
    @property
    def endpoints_config_path(self) -> Path:
        """Get the endpoints config file path."""
        return self.config_dir / "endpoints.yaml"


class EndpointConfig:
    """Endpoint configuration loader."""
    
    def __init__(self, config_path: Path):
        self.config_path = config_path
        self._config: dict | None = None
        
    def load(self) -> dict:
        """Load endpoint configuration from YAML file."""
        if self._config is None:
            with open(self.config_path) as f:
                self._config = yaml.safe_load(f)
        return self._config
    
    @property
    def endpoints(self) -> dict:
        """Get all endpoint definitions."""
        return self.load().get("endpoints", {})
    
    @property
    def entity_schemas(self) -> dict:
        """Get entity schema definitions."""
        return self.load().get("entity_schemas", {})
    
    @property
    def defaults(self) -> dict:
        """Get default settings."""
        return self.load().get("defaults", {})
    
    @property
    def source(self) -> str:
        """Get the data source name."""
        return self.load().get("source", "limitless_exchange")
    
    @property
    def base_url(self) -> str:
        """Get the API base URL."""
        return self.load().get("base_url", "https://api.limitless.exchange")


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()


@lru_cache
def get_endpoint_config() -> EndpointConfig:
    """Get cached endpoint config instance."""
    settings = get_settings()
    return EndpointConfig(settings.endpoints_config_path)
