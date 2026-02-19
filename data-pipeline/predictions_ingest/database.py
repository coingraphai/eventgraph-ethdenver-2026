"""
Database connection and session management.
Supports both sync and async operations with connection pooling.
"""
import asyncio
from contextlib import asynccontextmanager, contextmanager
from typing import AsyncIterator, Iterator, Optional

import asyncpg
import structlog
from sqlalchemy import create_engine, event, text
from sqlalchemy.engine import Engine
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import Session, sessionmaker

from predictions_ingest.config import get_settings

logger = structlog.get_logger()


class DatabaseManager:
    """
    Manages database connections with connection pooling.
    Supports both SQLAlchemy (async/sync) and raw asyncpg connections.
    """
    
    _instance: Optional["DatabaseManager"] = None
    _lock = asyncio.Lock()
    
    def __init__(self):
        self.settings = get_settings()
        
        # Sync engine (for migrations, CLI operations)
        self._sync_engine: Optional[Engine] = None
        self._sync_session_factory: Optional[sessionmaker] = None
        
        # Async engine (for ingestion)
        self._async_engine = None
        self._async_session_factory: Optional[async_sessionmaker] = None
        
        # Raw asyncpg pool (for bulk operations)
        self._asyncpg_pool: Optional[asyncpg.Pool] = None
    
    @classmethod
    async def get_instance(cls) -> "DatabaseManager":
        """Get or create singleton instance."""
        if cls._instance is None:
            async with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance
    
    @classmethod
    def get_sync_instance(cls) -> "DatabaseManager":
        """Get or create singleton instance (sync version)."""
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance
    
    # =========================================================================
    # SYNC ENGINE (SQLAlchemy)
    # =========================================================================
    
    @property
    def sync_engine(self) -> Engine:
        """Lazy-create sync SQLAlchemy engine."""
        if self._sync_engine is None:
            self._sync_engine = create_engine(
                self.settings.database_url,
                pool_size=5,
                max_overflow=10,
                pool_timeout=30,
                pool_recycle=1800,
                pool_pre_ping=True,
                echo=self.settings.debug,
            )
            
            # Set statement timeout on connection checkout
            @event.listens_for(self._sync_engine, "connect")
            def set_pg_settings(dbapi_conn, connection_record):
                cursor = dbapi_conn.cursor()
                cursor.execute("SET statement_timeout = '300s'")
                cursor.close()
            
            logger.info("Created sync SQLAlchemy engine")
        
        return self._sync_engine
    
    @property
    def sync_session_factory(self) -> sessionmaker:
        """Lazy-create sync session factory."""
        if self._sync_session_factory is None:
            self._sync_session_factory = sessionmaker(
                bind=self.sync_engine,
                autocommit=False,
                autoflush=False,
            )
        return self._sync_session_factory
    
    @contextmanager
    def sync_session(self) -> Iterator[Session]:
        """Context manager for sync database sessions."""
        session = self.sync_session_factory()
        try:
            yield session
            session.commit()
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()
    
    # =========================================================================
    # ASYNC ENGINE (SQLAlchemy)
    # =========================================================================
    
    @property
    def async_engine(self):
        """Lazy-create async SQLAlchemy engine."""
        if self._async_engine is None:
            self._async_engine = create_async_engine(
                self.settings.async_database_url,
                pool_size=10,
                max_overflow=20,
                pool_timeout=30,
                pool_recycle=1800,
                pool_pre_ping=True,
                echo=self.settings.debug,
            )
            logger.info("Created async SQLAlchemy engine")
        
        return self._async_engine
    
    @property
    def async_session_factory(self) -> async_sessionmaker:
        """Lazy-create async session factory."""
        if self._async_session_factory is None:
            self._async_session_factory = async_sessionmaker(
                bind=self.async_engine,
                class_=AsyncSession,
                autocommit=False,
                autoflush=False,
                expire_on_commit=False,
            )
        return self._async_session_factory
    
    @asynccontextmanager
    async def async_session(self) -> AsyncIterator[AsyncSession]:
        """Context manager for async database sessions."""
        session = self.async_session_factory()
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
    
    # =========================================================================
    # RAW ASYNCPG POOL (for bulk operations)
    # =========================================================================
    
    async def get_asyncpg_pool(self) -> asyncpg.Pool:
        """Get or create asyncpg connection pool for bulk operations."""
        if self._asyncpg_pool is None:
            # Use SSL context for secure connections
            ssl_context = None
            if self.settings.postgres_sslmode == "require":
                import ssl
                ssl_context = ssl.create_default_context()
                ssl_context.check_hostname = False
                ssl_context.verify_mode = ssl.CERT_NONE
            
            self._asyncpg_pool = await asyncpg.create_pool(
                host=self.settings.postgres_host,
                port=self.settings.postgres_port,
                database=self.settings.postgres_db,
                user=self.settings.postgres_user,
                password=self.settings.postgres_password,
                ssl=ssl_context,
                min_size=1,  # Reduced from 5 to avoid connection storm
                max_size=10,  # Reduced from 20
                max_inactive_connection_lifetime=300,
                command_timeout=300,
                statement_cache_size=100,
                timeout=60,  # Connection timeout
            )
            logger.info("Created asyncpg connection pool")
        
        return self._asyncpg_pool
    
    @asynccontextmanager
    async def asyncpg_connection(self) -> AsyncIterator[asyncpg.Connection]:
        """Context manager for raw asyncpg connections."""
        pool = await self.get_asyncpg_pool()
        async with pool.acquire() as conn:
            yield conn
    
    # =========================================================================
    # BULK OPERATIONS
    # =========================================================================
    
    async def bulk_insert(
        self,
        table: str,
        columns: list[str],
        records: list[tuple],
        on_conflict: Optional[str] = None,
    ) -> int:
        """
        Bulk insert records using COPY protocol.
        
        Args:
            table: Table name
            columns: Column names
            records: List of tuples (values)
            on_conflict: ON CONFLICT clause (e.g., "DO NOTHING")
            
        Returns:
            Number of records inserted
        """
        if not records:
            return 0
        
        pool = await self.get_asyncpg_pool()
        
        async with pool.acquire() as conn:
            # Use COPY for maximum performance
            if on_conflict:
                # COPY doesn't support ON CONFLICT, use temp table
                temp_table = f"_temp_{table}_{id(records)}"
                
                try:
                    # Create temp table
                    await conn.execute(f"""
                        CREATE TEMP TABLE {temp_table} (LIKE {table} INCLUDING DEFAULTS)
                        ON COMMIT DROP
                    """)
                    
                    # COPY to temp table
                    await conn.copy_records_to_table(
                        temp_table,
                        records=records,
                        columns=columns,
                    )
                    
                    # Insert with conflict handling
                    col_list = ", ".join(columns)
                    result = await conn.execute(f"""
                        INSERT INTO {table} ({col_list})
                        SELECT {col_list} FROM {temp_table}
                        ON CONFLICT {on_conflict}
                    """)
                    
                    return int(result.split()[-1])
                    
                except Exception as e:
                    logger.error("Bulk insert failed", table=table, error=str(e))
                    raise
            else:
                # Direct COPY
                result = await conn.copy_records_to_table(
                    table,
                    records=records,
                    columns=columns,
                )
                return len(records)
    
    async def execute_raw(self, query: str, *args) -> list:
        """Execute raw SQL query with asyncpg."""
        pool = await self.get_asyncpg_pool()
        async with pool.acquire() as conn:
            return await conn.fetch(query, *args)
    
    # =========================================================================
    # HEALTH & CLEANUP
    # =========================================================================
    
    async def health_check(self) -> bool:
        """Check database connectivity."""
        try:
            pool = await self.get_asyncpg_pool()
            async with pool.acquire() as conn:
                result = await conn.fetchval("SELECT 1")
                return result == 1
        except Exception as e:
            logger.error("Database health check failed", error=str(e))
            return False
    
    async def close(self):
        """Close all connections."""
        if self._asyncpg_pool:
            await self._asyncpg_pool.close()
            self._asyncpg_pool = None
            logger.info("Closed asyncpg pool")
        
        if self._async_engine:
            await self._async_engine.dispose()
            self._async_engine = None
            logger.info("Closed async SQLAlchemy engine")
        
        if self._sync_engine:
            self._sync_engine.dispose()
            self._sync_engine = None
            logger.info("Closed sync SQLAlchemy engine")
    
    def close_sync(self):
        """Close sync connections (for CLI cleanup)."""
        if self._sync_engine:
            self._sync_engine.dispose()
            self._sync_engine = None
            logger.info("Closed sync SQLAlchemy engine")


# =========================================================================
# CONVENIENCE FUNCTIONS
# =========================================================================

async def get_db() -> DatabaseManager:
    """Get database manager instance (async)."""
    return await DatabaseManager.get_instance()


def get_db_sync() -> DatabaseManager:
    """Get database manager instance (sync)."""
    return DatabaseManager.get_sync_instance()


@asynccontextmanager
async def get_session() -> AsyncIterator[AsyncSession]:
    """Get an async database session."""
    db = await get_db()
    async with db.async_session() as session:
        yield session


@contextmanager
def get_sync_session() -> Iterator[Session]:
    """Get a sync database session."""
    db = get_db_sync()
    with db.sync_session() as session:
        yield session


async def run_migrations():
    """Run pending database migrations."""
    from pathlib import Path
    
    db = await get_db()
    migrations_dir = Path(__file__).parent.parent / "migrations"
    
    async with db.asyncpg_connection() as conn:
        # Create migrations tracking table
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS _migrations (
                id SERIAL PRIMARY KEY,
                filename TEXT UNIQUE NOT NULL,
                applied_at TIMESTAMPTZ DEFAULT NOW()
            )
        """)
        
        # Get applied migrations
        applied = await conn.fetch("SELECT filename FROM _migrations")
        applied_set = {row["filename"] for row in applied}
        
        # Find and apply pending migrations
        migration_files = sorted(migrations_dir.glob("*.sql"))
        
        for migration_file in migration_files:
            if migration_file.name in applied_set:
                continue
            
            logger.info("Applying migration", filename=migration_file.name)
            
            sql = migration_file.read_text()
            await conn.execute(sql)
            
            await conn.execute(
                "INSERT INTO _migrations (filename) VALUES ($1)",
                migration_file.name,
            )
            
            logger.info("Applied migration", filename=migration_file.name)
