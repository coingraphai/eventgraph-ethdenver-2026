"""
Database connection and session management.
"""
import asyncio
from contextlib import asynccontextmanager
from typing import AsyncGenerator

import asyncpg
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from limitless_ingest.config import get_settings


class Database:
    """Database connection manager."""
    
    def __init__(self):
        self._settings = get_settings()
        self._engine = None
        self._session_factory = None
        self._pool: asyncpg.Pool | None = None
    
    async def connect(self) -> None:
        """Initialize database connections."""
        settings = self._settings
        
        # Create async engine for SQLAlchemy
        self._engine = create_async_engine(
            settings.database_url_async,
            pool_size=settings.db_pool_size,
            max_overflow=settings.db_pool_max_overflow,
            echo=settings.log_level == "DEBUG",
        )
        
        self._session_factory = async_sessionmaker(
            self._engine,
            class_=AsyncSession,
            expire_on_commit=False,
        )
        
        # Create direct asyncpg pool for raw queries
        self._pool = await asyncpg.create_pool(
            host=settings.postgres_host,
            port=settings.postgres_port,
            database=settings.postgres_db,
            user=settings.postgres_user,
            password=settings.postgres_password,
            min_size=2,
            max_size=settings.db_pool_size,
            ssl="require" if settings.postgres_sslmode == "require" else None,
        )
    
    async def disconnect(self) -> None:
        """Close database connections."""
        if self._pool:
            await self._pool.close()
            self._pool = None
        
        if self._engine:
            await self._engine.dispose()
            self._engine = None
    
    @asynccontextmanager
    async def session(self) -> AsyncGenerator[AsyncSession, None]:
        """Get a database session."""
        if not self._session_factory:
            raise RuntimeError("Database not connected. Call connect() first.")
        
        async with self._session_factory() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise
    
    @asynccontextmanager
    async def connection(self) -> AsyncGenerator[asyncpg.Connection, None]:
        """Get a raw database connection."""
        if not self._pool:
            raise RuntimeError("Database not connected. Call connect() first.")
        
        async with self._pool.acquire() as conn:
            yield conn
    
    async def execute(self, query: str, *args) -> str:
        """Execute a query and return status."""
        async with self.connection() as conn:
            return await conn.execute(query, *args)
    
    async def fetch(self, query: str, *args) -> list[asyncpg.Record]:
        """Fetch multiple rows."""
        async with self.connection() as conn:
            return await conn.fetch(query, *args)
    
    async def fetchrow(self, query: str, *args) -> asyncpg.Record | None:
        """Fetch a single row."""
        async with self.connection() as conn:
            return await conn.fetchrow(query, *args)
    
    async def fetchval(self, query: str, *args):
        """Fetch a single value."""
        async with self.connection() as conn:
            return await conn.fetchval(query, *args)
    
    async def run_migrations(self, migrations_dir: str = "migrations") -> None:
        """Run SQL migration files."""
        import os
        from pathlib import Path
        
        migrations_path = Path(migrations_dir)
        if not migrations_path.exists():
            raise FileNotFoundError(f"Migrations directory not found: {migrations_dir}")
        
        # Get all SQL files sorted by name
        sql_files = sorted(migrations_path.glob("*.sql"))
        
        async with self.connection() as conn:
            for sql_file in sql_files:
                print(f"Running migration: {sql_file.name}")
                sql = sql_file.read_text()
                await conn.execute(sql)
                print(f"  ✓ Completed: {sql_file.name}")


# Global database instance
_db: Database | None = None


def get_database() -> Database:
    """Get the global database instance."""
    global _db
    if _db is None:
        _db = Database()
    return _db


async def init_database() -> Database:
    """Initialize and connect the database."""
    db = get_database()
    await db.connect()
    return db


async def close_database() -> None:
    """Close the database connection."""
    global _db
    if _db:
        await _db.disconnect()
        _db = None


async def run_migrations(database_url: str, migrations_dir) -> None:
    """Run migrations using a direct connection."""
    from pathlib import Path
    import asyncpg
    
    settings = get_settings()
    
    # Connect directly with asyncpg
    conn = await asyncpg.connect(
        host=settings.postgres_host,
        port=settings.postgres_port,
        database=settings.postgres_db,
        user=settings.postgres_user,
        password=settings.postgres_password,
        ssl="require" if settings.postgres_sslmode == "require" else None,
    )
    
    try:
        migrations_path = Path(migrations_dir)
        sql_files = sorted(migrations_path.glob("*.sql"))
        
        for sql_file in sql_files:
            print(f"Running migration: {sql_file.name}")
            sql = sql_file.read_text()
            await conn.execute(sql)
            print(f"  ✓ Completed: {sql_file.name}")
    finally:
        await conn.close()
