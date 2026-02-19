"""
Configuration for CoinGraph AI API with PostgreSQL database support
"""
from pydantic_settings import BaseSettings
import os
from dotenv import load_dotenv
from urllib.parse import quote_plus

load_dotenv()


def build_database_url() -> str:
    """Build DATABASE_URL from individual POSTGRES_* env vars or use DATABASE_URL if set"""
    # If DATABASE_URL is explicitly set, use it
    if os.getenv("DATABASE_URL"):
        return os.getenv("DATABASE_URL")
    
    # Otherwise build from individual components
    host = os.getenv("POSTGRES_HOST", "localhost")
    port = os.getenv("POSTGRES_PORT", "5432")
    db = os.getenv("POSTGRES_DB", "defaultdb")
    user = os.getenv("POSTGRES_USER", "postgres")
    password = os.getenv("POSTGRES_PASSWORD", "")
    sslmode = os.getenv("POSTGRES_SSLMODE", "require")
    
    # URL-encode the password in case it has special characters
    encoded_password = quote_plus(password) if password else ""
    
    return f"postgresql://{user}:{encoded_password}@{host}:{port}/{db}?sslmode={sslmode}"


class Settings(BaseSettings):
    # App
    APP_NAME: str = "CoinGraph AI API"
    VERSION: str = "1.0.0"
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")
    
    # Database (PostgreSQL on DigitalOcean)
    DATABASE_URL: str = build_database_url()
    # Database pool settings
    DB_POOL_SIZE: int = int(os.getenv("DB_POOL_SIZE", "10"))
    DB_MAX_OVERFLOW: int = int(os.getenv("DB_MAX_OVERFLOW", "20"))
    DB_POOL_TIMEOUT: int = int(os.getenv("DB_POOL_TIMEOUT", "30"))
    DB_POOL_RECYCLE: int = int(os.getenv("DB_POOL_RECYCLE", "3600"))
    
    # Anthropic Claude (Main AI)
    ANTHROPIC_API_KEY: str = os.getenv("ANTHROPIC_API_KEY", "")
    CLAUDE_MODEL: str = os.getenv("CLAUDE_MODEL", "claude-sonnet-4-20250514")
    CLAUDE_MAX_TOKENS: int = int(os.getenv("CLAUDE_MAX_TOKENS", "4096"))
    
    # DomeAPI (Prediction markets)
    DOME_API_KEY: str = os.getenv("DOME_API_KEY", "")
    
    # Optional: OpenAI (fallback)
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    
    # CORS
    CORS_ORIGINS: list = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost",
        "*"
    ]
    
    class Config:
        env_file = ".env"
        extra = "ignore"  # Ignore extra fields from .env


settings = Settings()
