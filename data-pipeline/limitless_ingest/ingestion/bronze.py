"""
Bronze layer: Raw JSON storage with deduplication.
"""
import json
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

import structlog

from limitless_ingest.api.client import APIClient
from limitless_ingest.database import Database

logger = structlog.get_logger()


class BronzeWriter:
    """Writes raw API responses to bronze layer with deduplication."""
    
    def __init__(self, db: Database, client: APIClient):
        self.db = db
        self.client = client
    
    async def store_response(
        self,
        endpoint_name: str,
        url_path: str,
        response_data: dict[str, Any],
        query_params: dict[str, Any] | None = None,
        run_id: str | None = None,
    ) -> tuple[str, bool]:
        """
        Store a raw API response in bronze layer.
        
        Returns:
            Tuple of (body_hash, is_new) where is_new indicates if this was a new record
        """
        body_hash = APIClient.compute_content_hash(response_data)
        fetched_at = datetime.now(timezone.utc)
        
        # Use INSERT ... ON CONFLICT DO NOTHING to handle deduplication
        query = """
            INSERT INTO limitless_bronze.api_responses 
                (id, endpoint_name, url_path, query_params, body_json, body_hash, fetched_at)
            VALUES 
                ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (body_hash) DO NOTHING
            RETURNING id
        """
        
        result = await self.db.fetchval(
            query,
            str(uuid4()),
            endpoint_name,
            url_path,
            json.dumps(query_params) if query_params else None,
            json.dumps(response_data),
            body_hash,
            fetched_at,
        )
        
        is_new = result is not None
        
        if is_new:
            logger.debug(
                "Stored new bronze record",
                endpoint=endpoint_name,
                body_hash=body_hash,
            )
        else:
            logger.debug(
                "Duplicate response skipped",
                endpoint=endpoint_name,
                body_hash=body_hash,
            )
        
        return body_hash, is_new
    
    async def ingest_categories(self, run_id: str | None = None) -> dict[str, Any]:
        """Ingest categories endpoint."""
        logger.info("Ingesting categories")
        
        response = await self.client.fetch_categories()
        body_hash, is_new = await self.store_response(
            endpoint_name="categories",
            url_path="/categories",
            response_data=response,
            run_id=run_id,
        )
        
        return {
            "endpoint": "categories",
            "body_hash": body_hash,
            "is_new": is_new,
            "count": len(response) if isinstance(response, list) else 1,
        }
    
    async def ingest_tokens(self, run_id: str | None = None) -> dict[str, Any]:
        """Ingest tokens endpoint."""
        logger.info("Ingesting tokens")
        
        response = await self.client.fetch_tokens()
        body_hash, is_new = await self.store_response(
            endpoint_name="tokens",
            url_path="/tokens",
            response_data=response,
            run_id=run_id,
        )
        
        return {
            "endpoint": "tokens",
            "body_hash": body_hash,
            "is_new": is_new,
            "count": len(response) if isinstance(response, list) else 1,
        }
    
    async def ingest_markets_page(
        self,
        page: int = 1,
        run_id: str | None = None,
    ) -> dict[str, Any]:
        """Ingest a single page of markets."""
        response = await self.client.fetch_markets_page(page=page)
        
        body_hash, is_new = await self.store_response(
            endpoint_name="markets_active",
            url_path="/markets/active",
            response_data=response,
            query_params={"page": page, "limit": 25},
            run_id=run_id,
        )
        
        markets = response.get("data", [])
        total = response.get("totalMarketsCount", 0)
        
        return {
            "endpoint": "markets_active",
            "page": page,
            "body_hash": body_hash,
            "is_new": is_new,
            "count": len(markets),
            "total_available": total,
        }
    
    async def ingest_all_markets(self, run_id: str | None = None) -> dict[str, Any]:
        """Ingest all pages of active markets."""
        logger.info("Ingesting all active markets")
        
        pages_ingested = 0
        new_pages = 0
        total_markets = 0
        page = 1
        
        while True:
            result = await self.ingest_markets_page(page=page, run_id=run_id)
            pages_ingested += 1
            
            if result["is_new"]:
                new_pages += 1
            
            total_markets = result["total_available"]
            markets_fetched = result["count"]
            
            if markets_fetched == 0 or page * 25 >= total_markets:
                break
            
            page += 1
        
        logger.info(
            "Completed markets ingestion",
            pages=pages_ingested,
            new_pages=new_pages,
            total_markets=total_markets,
        )
        
        return {
            "endpoint": "markets_active",
            "pages_ingested": pages_ingested,
            "new_pages": new_pages,
            "total_markets": total_markets,
        }
    
    async def ingest_feed_page(
        self,
        page: int = 1,
        run_id: str | None = None,
    ) -> dict[str, Any] | None:
        """Ingest a single page of feed. Returns None if page not accessible."""
        response = await self.client.fetch_feed_page(page=page, limit=100)
        
        # API returns None for pages beyond limit (400 error)
        if response is None:
            return None
        
        body_hash, is_new = await self.store_response(
            endpoint_name="feed",
            url_path="/feed",
            response_data=response,
            query_params={"page": page, "limit": 100},
            run_id=run_id,
        )
        
        trades = response.get("data", [])
        
        return {
            "endpoint": "feed",
            "page": page,
            "body_hash": body_hash,
            "is_new": is_new,
            "count": len(trades),
        }
    
    async def ingest_recent_feed(
        self,
        max_pages: int = 25,
        run_id: str | None = None,
    ) -> dict[str, Any]:
        """Ingest recent feed pages (API only exposes ~25 pages)."""
        logger.info("Ingesting recent feed", max_pages=max_pages)
        
        pages_ingested = 0
        new_pages = 0
        total_trades = 0
        
        for page in range(1, max_pages + 1):
            result = await self.ingest_feed_page(page=page, run_id=run_id)
            
            # Stop if we hit the API page limit
            if result is None:
                logger.info("Feed page limit reached", last_page=page - 1)
                break
            
            pages_ingested += 1
            total_trades += result["count"]
            
            if result["is_new"]:
                new_pages += 1
            
            if result["count"] == 0:
                logger.info("Feed exhausted", last_page=page)
                break
        
        logger.info(
            "Completed feed ingestion",
            pages=pages_ingested,
            new_pages=new_pages,
            total_trades=total_trades,
        )
        
        return {
            "endpoint": "feed",
            "pages_ingested": pages_ingested,
            "new_pages": new_pages,
            "total_trades": total_trades,
        }
    
    async def ingest_all(self, run_id: str | None = None) -> dict[str, Any]:
        """Run full ingestion of all endpoints."""
        run_id = run_id or str(uuid4())
        
        logger.info("Starting full ingestion", run_id=run_id)
        
        results = {
            "run_id": run_id,
            "started_at": datetime.now(timezone.utc).isoformat(),
            "endpoints": {},
        }
        
        # Ingest categories
        results["endpoints"]["categories"] = await self.ingest_categories(run_id)
        
        # Ingest tokens
        results["endpoints"]["tokens"] = await self.ingest_tokens(run_id)
        
        # Ingest markets
        results["endpoints"]["markets"] = await self.ingest_all_markets(run_id)
        
        # Ingest feed
        results["endpoints"]["feed"] = await self.ingest_recent_feed(run_id=run_id)
        
        results["completed_at"] = datetime.now(timezone.utc).isoformat()
        
        logger.info("Full ingestion completed", run_id=run_id, results=results)
        
        return results
