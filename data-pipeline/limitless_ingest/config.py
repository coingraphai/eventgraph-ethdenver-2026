"""
Configuration settings using Pydantic Settings.
"""
from functools import lru_cache
from typing import Literal

from pydantic import Field, PostgresDsn, field_validator
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
    postgres_host: str = Field(default="localhost", description="PostgreSQL host")
    postgres_port: int = Field(default=5432, description="PostgreSQL port")
    postgres_db: str = Field(default="limitless_data", description="Database name")
    postgres_user: str = Field(default="postgres", description="Database user")
    postgres_password: str = Field(default="", description="Database password")
    postgres_sslmode: str = Field(default="prefer", description="SSL mode")
    
    db_pool_size: int = Field(default=10, description="Connection pool size")
    db_pool_max_overflow: int = Field(default=20, description="Max pool overflow")
    
    # API
    limitless_api_base_url: str = Field(
        default="https://api.limitless.exchange",
        description="Limitless Exchange API base URL"
    )
    api_timeout_seconds: int = Field(default=30, description="Request timeout")
    max_concurrency: int = Field(default=5, description="Max concurrent requests")
    rate_limit_rps: float = Field(default=10.0, description="Rate limit (requests/second)")
    
    # Retry
    retry_max_attempts: int = Field(default=5, description="Max retry attempts")
    backoff_base_seconds: float = Field(default=1.0, description="Base backoff time")
    backoff_max_seconds: float = Field(default=60.0, description="Max backoff time")
    backoff_jitter: float = Field(default=0.5, description="Backoff jitter factor")
    
    # Ingestion
    markets_page_limit: int = Field(default=25, description="Markets per page (max 25)")
    feed_page_limit: int = Field(default=100, description="Feed items per page (max 100)")
    feed_poll_interval_seconds: int = Field(default=30, description="Feed polling interval")
    markets_refresh_interval_seconds: int = Field(default=60, description="Markets refresh interval")
    
    # Logging
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = Field(default="INFO")
    log_json: bool = Field(default=False, description="Output logs as JSON")
    
    @property
    def database_url(self) -> str:
        """Get the database URL for synchronous connections."""
        password_part = f":{self.postgres_password}" if self.postgres_password else ""
        return (
            f"postgresql://{self.postgres_user}{password_part}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
            f"?sslmode={self.postgres_sslmode}"
        )
    
    @property
    def database_url_async(self) -> str:
        """Get the database URL for async connections (asyncpg)."""
        password_part = f":{self.postgres_password}" if self.postgres_password else ""
        return (
            f"postgresql+asyncpg://{self.postgres_user}{password_part}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
