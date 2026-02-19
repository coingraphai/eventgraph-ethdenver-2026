"""
Bronze layer: Raw API response storage.
Stores raw JSON responses for full data lineage and replay capability.
"""
import hashlib
import json
from datetime import datetime
from typing import Any, Optional

import structlog

from predictions_ingest.database import get_db
from predictions_ingest.models import DataSource

logger = structlog.get_logger()


class BronzeWriter:
    """
    Writes raw API responses to bronze layer tables.
    Handles deduplication via content hashing.
    """
    
    def __init__(self):
        self._pending_records: list[tuple] = []
        self._batch_size = 1000
    
    @staticmethod
    def compute_body_hash(body: dict[str, Any]) -> str:
        """Compute SHA-256 hash of JSON body for deduplication."""
        # Normalize JSON for consistent hashing
        normalized = json.dumps(body, sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(normalized.encode()).hexdigest()
    
    async def write_response(
        self,
        source: DataSource,
        endpoint: str,
        body: dict[str, Any],
        request_params: Optional[dict[str, Any]] = None,
        response_status: int = 200,
        request_id: Optional[str] = None,
        run_id: Optional[str] = None,
        ingestion_type: str = "delta",
    ) -> Optional[str]:
        """
        Write a single API response to bronze layer.
        
        Returns:
            Record ID if inserted, None if duplicate
        """
        import uuid as uuid_module
        body_hash = self.compute_body_hash(body)
        body_str = json.dumps(body)
        
        db = await get_db()
        
        query = """
            INSERT INTO predictions_bronze.api_responses (
                id, source, endpoint_name, url_path, body_json, body_hash,
                query_params, http_status, ingestion_type, run_id, fetched_at
            )
            VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7::jsonb, $8, $9, $10, NOW())
            ON CONFLICT (body_hash, source) DO NOTHING
            RETURNING id
        """
        
        async with db.asyncpg_connection() as conn:
            result = await conn.fetchval(
                query,
                uuid_module.uuid4(),
                source.value,
                endpoint,
                endpoint,  # url_path = endpoint
                body_str,
                body_hash,
                json.dumps(request_params) if request_params else None,
                response_status,
                ingestion_type,
                uuid_module.UUID(run_id) if run_id else None,
            )
            
            if result:
                logger.debug(
                    "Stored bronze record",
                    source=source.value,
                    endpoint=endpoint,
                    record_id=str(result),
                )
            else:
                logger.debug(
                    "Duplicate record skipped",
                    source=source.value,
                    endpoint=endpoint,
                    body_hash=body_hash[:16],
                )
            
            return str(result) if result else None
    
    def add_to_batch(
        self,
        source: DataSource,
        endpoint: str,
        body: dict[str, Any],
        request_params: Optional[dict[str, Any]] = None,
        response_status: int = 200,
        request_id: Optional[str] = None,
        run_id: Optional[str] = None,
        ingestion_type: str = "delta",
    ):
        """Add a record to the pending batch."""
        import uuid as uuid_module
        body_hash = self.compute_body_hash(body)
        
        self._pending_records.append((
            str(uuid_module.uuid4()),  # id
            source.value,
            endpoint,  # endpoint_name
            endpoint,  # url_path
            json.dumps(body),
            body_hash,
            json.dumps(request_params) if request_params else None,
            response_status,
            ingestion_type,
            run_id,
            datetime.utcnow(),
        ))
    
    async def flush_batch(self) -> tuple[int, int]:
        """
        Flush pending records to database.
        
        Returns:
            Tuple of (inserted_count, duplicate_count)
        """
        if not self._pending_records:
            return 0, 0
        
        records = self._pending_records.copy()
        self._pending_records.clear()
        
        db = await get_db()
        
        async with db.asyncpg_connection() as conn:
            # Use explicit transaction to keep temp table alive
            async with conn.transaction():
                temp_table = f"_temp_bronze_{id(records)}"
                
                try:
                    # Create temp table matching the target schema
                    await conn.execute(f"""
                        CREATE TEMP TABLE {temp_table} (
                            id TEXT,
                            source TEXT,
                            endpoint_name TEXT,
                            url_path TEXT,
                            body_json JSONB,
                            body_hash TEXT,
                            query_params JSONB,
                            http_status INTEGER,
                            ingestion_type TEXT,
                            run_id TEXT,
                            fetched_at TIMESTAMPTZ
                        )
                    """)
                    
                    # COPY to temp table
                    await conn.copy_records_to_table(
                        temp_table,
                        records=records,
                        columns=[
                            "id", "source", "endpoint_name", "url_path", "body_json", "body_hash",
                            "query_params", "http_status", "ingestion_type", "run_id", "fetched_at",
                        ],
                    )
                    
                    # Count before insert
                    before_count = await conn.fetchval(
                        "SELECT COUNT(*) FROM predictions_bronze.api_responses"
                    )
                    
                    # Insert with conflict handling
                    await conn.execute(f"""
                        INSERT INTO predictions_bronze.api_responses (
                            id, source, endpoint_name, url_path, body_json, body_hash,
                            query_params, http_status, ingestion_type, run_id, fetched_at
                        )
                        SELECT id::uuid, source, endpoint_name, url_path, body_json, body_hash,
                               query_params, http_status, ingestion_type, run_id::uuid, fetched_at
                        FROM {temp_table}
                        ON CONFLICT (body_hash, source) DO NOTHING
                    """)
                    
                    # Count after insert
                    after_count = await conn.fetchval(
                        "SELECT COUNT(*) FROM predictions_bronze.api_responses"
                    )
                    
                    inserted = after_count - before_count
                    duplicates = len(records) - inserted
                    
                    # Drop temp table explicitly
                    await conn.execute(f"DROP TABLE IF EXISTS {temp_table}")
                    
                    logger.info(
                        "Flushed bronze batch",
                        total=len(records),
                        inserted=inserted,
                        duplicates=duplicates,
                    )
                    
                    return inserted, duplicates
                    
                except Exception as e:
                    logger.error("Bronze batch flush failed", error=str(e))
                    raise
    
    async def write_batch(
        self,
        records: list[dict[str, Any]],
        source: DataSource,
        endpoint: str,
        run_id: Optional[str] = None,
    ) -> tuple[int, int]:
        """
        Write a batch of records to bronze layer.
        
        Each item in records is stored as a separate row.
        
        Returns:
            Tuple of (inserted_count, duplicate_count)
        """
        for record in records:
            self.add_to_batch(
                source=source,
                endpoint=endpoint,
                body=record,
                run_id=run_id,
            )
        
        return await self.flush_batch()
    
    @property
    def pending_count(self) -> int:
        """Number of records pending flush."""
        return len(self._pending_records)


class BronzeReader:
    """
    Reads raw data from bronze layer for silver processing.
    """
    
    async def get_unprocessed_records(
        self,
        source: DataSource,
        endpoint: str,
        limit: int = 1000,
        since: Optional[datetime] = None,
    ) -> list[dict[str, Any]]:
        """
        Fetch bronze records.
        
        Args:
            source: Data source filter
            endpoint: API endpoint filter
            limit: Max records to fetch
            since: Only fetch records after this time
        """
        db = await get_db()
        
        query = """
            SELECT id, source, endpoint_name, body_json, fetched_at
            FROM predictions_bronze.api_responses
            WHERE source = $1
              AND endpoint_name = $2
              AND ($3::timestamptz IS NULL OR fetched_at > $3)
            ORDER BY fetched_at ASC
            LIMIT $4
        """
        
        async with db.asyncpg_connection() as conn:
            rows = await conn.fetch(query, source.value, endpoint, since, limit)
            
            return [
                {
                    "id": str(row["id"]),
                    "source": row["source"],
                    "endpoint": row["endpoint_name"],
                    "body": json.loads(row["body_json"]) if isinstance(row["body_json"], str) else row["body_json"],
                    "fetched_at": row["fetched_at"],
                }
                for row in rows
            ]
    
    async def get_latest_ingestion_time(
        self,
        source: DataSource,
        endpoint: str,
    ) -> Optional[datetime]:
        """Get the latest ingestion time for a source/endpoint."""
        db = await get_db()
        
        async with db.asyncpg_connection() as conn:
            return await conn.fetchval("""
                SELECT MAX(fetched_at)
                FROM predictions_bronze.api_responses
                WHERE source = $1 AND endpoint_name = $2
            """, source.value, endpoint)
    
    async def get_record_count(
        self,
        source: DataSource,
        endpoint: Optional[str] = None,
        since: Optional[datetime] = None,
    ) -> int:
        """Get count of bronze records."""
        db = await get_db()
        
        conditions = ["source = $1"]
        params = [source.value]
        
        if endpoint:
            conditions.append(f"endpoint_name = ${len(params) + 1}")
            params.append(endpoint)
        
        if since:
            conditions.append(f"fetched_at > ${len(params) + 1}")
            params.append(since)
        
        query = f"""
            SELECT COUNT(*)
            FROM predictions_bronze.api_responses
            WHERE {' AND '.join(conditions)}
        """
        
        async with db.asyncpg_connection() as conn:
            return await conn.fetchval(query, *params)
