"""
PostgreSQL database session management for CoinGraph AI
Uses SQLAlchemy with connection pooling
"""
from typing import Generator
from contextlib import contextmanager
import logging

from sqlalchemy import create_engine, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import QueuePool

from app.config import settings

logger = logging.getLogger(__name__)

# SQLAlchemy Base
Base = declarative_base()

# Create database engine with connection pooling
engine = create_engine(
    settings.DATABASE_URL,
    poolclass=QueuePool,
    pool_size=settings.DB_POOL_SIZE,
    max_overflow=settings.DB_MAX_OVERFLOW,
    pool_timeout=settings.DB_POOL_TIMEOUT,
    pool_recycle=settings.DB_POOL_RECYCLE,
    pool_pre_ping=True,  # Verify connections before using
    echo=False,  # Set to True for SQL debug logging
    connect_args={
        "sslmode": "require",
        "connect_timeout": 10,
    }
)

# Session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Generator[Session, None, None]:
    """
    Database dependency for FastAPI
    Yields a SQLAlchemy session and closes it after use
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_session_factory():
    """Return session factory"""
    return SessionLocal


def init_db():
    """Initialize database connection"""
    try:
        # Test connection
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        logger.info(f"✅ Connected to PostgreSQL database")
        logger.info(f"Database: {settings.DATABASE_URL.split('@')[1].split('/')[1] if '@' in settings.DATABASE_URL else 'defaultdb'}")
    except Exception as e:
        logger.error(f"❌ Failed to connect to database: {e}")
        raise


def test_connection() -> bool:
    """Test database connection"""
    try:
        with engine.connect() as conn:
            result = conn.execute(text("SELECT 1"))
            return result.scalar() == 1
    except Exception as e:
        logger.error(f"Database connection test failed: {e}")
        return False


def get_engine():
    """Return SQLAlchemy engine"""
    return engine


# Async pool for production cache service
_async_pool = None


async def get_async_pool():
    """
    Get or create async connection pool for production cache.
    Uses asyncpg for async PostgreSQL operations.
    """
    global _async_pool
    
    if _async_pool is None:
        try:
            import asyncpg
            
            # Build connection URL for asyncpg
            db_url = settings.DATABASE_URL
            
            # Convert postgresql:// to postgresql+asyncpg:// format if needed
            # asyncpg expects: postgres://user:pass@host:port/db
            if db_url.startswith("postgresql://"):
                async_url = db_url.replace("postgresql://", "postgres://")
            elif db_url.startswith("postgresql+psycopg2://"):
                async_url = db_url.replace("postgresql+psycopg2://", "postgres://")
            else:
                async_url = db_url
            
            _async_pool = await asyncpg.create_pool(
                async_url,
                min_size=2,
                max_size=10,
                command_timeout=30,
                ssl="require"
            )
            logger.info("✅ Async connection pool created")
        except Exception as e:
            logger.error(f"❌ Failed to create async pool: {e}")
            raise
    
    return _async_pool


async def close_async_pool():
    """Close async connection pool on shutdown"""
    global _async_pool
    if _async_pool:
        await _async_pool.close()
        _async_pool = None
        logger.info("✅ Async connection pool closed")


# Legacy in-memory storage for backward compatibility
# (Can be removed once all endpoints use database)
_chat_sessions = {}
_chat_messages = {}
_session_counter = 0


class MockSession:
    """Mock database session for backward compatibility - DEPRECATED"""
    
    def __init__(self):
        self._pending_objects = []
        logger.warning("Using deprecated MockSession - migrate to real database")
    
    def add(self, obj):
        self._pending_objects.append(obj)
    
    def commit(self):
        pass
    
    def refresh(self, obj):
        pass
    
    def query(self, model_class):
        return MockQuery(model_class)
    
    def close(self):
        pass
    
    def rollback(self):
        self._pending_objects = []


class MockQuery:
    """Mock query object for backward compatibility - DEPRECATED"""
    
    def __init__(self, model_class):
        self.model_class = model_class
        self._filters = []
    
    def filter(self, *args, **kwargs):
        return self
    
    def filter_by(self, **kwargs):
        return self
    
    def first(self):
        return None
    
    def all(self):
        return []
    
    def order_by(self, *args):
        return self
    
    def limit(self, n):
        return self


# Note: SessionLocal is already defined above as sessionmaker(bind=engine)
# Don't override it with MockSession!

