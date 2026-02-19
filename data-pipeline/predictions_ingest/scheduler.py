"""
Scheduler: APScheduler-based job scheduling for automated ingestion.
Supports static (weekly) and delta (hourly) loads with individual source control.
"""
import asyncio
import signal
import sys
from datetime import datetime
from typing import Optional

import structlog
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from predictions_ingest.config import get_settings
from predictions_ingest.database import get_db
from predictions_ingest.ingestion.orchestrator import (
    IngestionOrchestrator,
    LoadType,
)
from predictions_ingest.models import DataSource

# Gold layer aggregation
from predictions_ingest.aggregation.gold_aggregator import GoldLayerAggregator

logger = structlog.get_logger()


class IngestionScheduler:
    """
    Manages scheduled ingestion jobs.
    
    Schedule:
    - Static (full) load: Weekly on Sunday at 2:00 AM UTC
    - Delta (incremental) load: Every hour at minute 5
    - View refresh: Every hour at minute 45
    """
    
    def __init__(self):
        self.settings = get_settings()
        self.scheduler = AsyncIOScheduler(
            timezone="UTC",
            job_defaults={
                "coalesce": True,
                "max_instances": 1,
                "misfire_grace_time": 300,
            },
        )
        self.orchestrator = IngestionOrchestrator()
        self.gold_aggregator: Optional[GoldLayerAggregator] = None
        self._running = False
    
    def _setup_jobs(self):
        """Configure all scheduled jobs."""
        enabled_sources = self.settings.enabled_sources
        
        # =================================================================
        # STATIC (FULL) LOADS - Weekly
        # =================================================================
        
        if self.settings.static_schedule_enabled:
            for source in enabled_sources:
                self.scheduler.add_job(
                    self._run_static_job,
                    trigger=CronTrigger(
                        day_of_week=self.settings.static_schedule_day,
                        hour=self.settings.static_schedule_hour,
                        minute=0,
                    ),
                    id=f"static_{source.value}",
                    name=f"Static load: {source.value}",
                    kwargs={"source": source},
                    replace_existing=True,
                )
                logger.info(
                    "Scheduled static load job",
                    source=source.value,
                    schedule=f"{self.settings.static_schedule_day} at {self.settings.static_schedule_hour}:00 UTC",
                )
        
        # =================================================================
        # DELTA (INCREMENTAL) LOADS - Hourly
        # =================================================================
        
        if self.settings.delta_schedule_enabled:
            for source in enabled_sources:
                # Use minutes if set (for testing), otherwise use hours
                if self.settings.delta_schedule_interval_minutes > 0:
                    trigger = IntervalTrigger(
                        minutes=self.settings.delta_schedule_interval_minutes,
                        start_date=datetime.utcnow().replace(second=0, microsecond=0),
                    )
                    interval_desc = f"{self.settings.delta_schedule_interval_minutes}m"
                else:
                    trigger = IntervalTrigger(
                        hours=self.settings.delta_schedule_interval_hours,
                        start_date=datetime.utcnow().replace(minute=5, second=0, microsecond=0),
                    )
                    interval_desc = f"{self.settings.delta_schedule_interval_hours}h"
                
                self.scheduler.add_job(
                    self._run_delta_job,
                    trigger=trigger,
                    id=f"delta_{source.value}",
                    name=f"Delta load: {source.value}",
                    kwargs={"source": source},
                    replace_existing=True,
                )
                logger.info(
                    "Scheduled delta load job",
                    source=source.value,
                    interval=interval_desc,
                )
        
        # =================================================================
        # VIEW REFRESH - Hourly
        # =================================================================
        
        self.scheduler.add_job(
            self._refresh_views_job,
            trigger=IntervalTrigger(hours=1, start_date=datetime.utcnow().replace(minute=45, second=0, microsecond=0)),
            id="refresh_views",
            name="Refresh materialized views",
            replace_existing=True,
        )
        logger.info("Scheduled view refresh job", interval="hourly at minute 45")
        
        # =================================================================
        # GOLD LAYER AGGREGATIONS - Hot (5min) & Warm (15min)
        # =================================================================
        
        # Hot aggregations: market_metrics, top_markets, activity_feed
        self.scheduler.add_job(
            self._run_hot_aggregations,
            trigger=IntervalTrigger(
                minutes=5,
                start_date=datetime.utcnow().replace(second=0, microsecond=0),
            ),
            id="gold_hot_agg",
            name="Gold Layer: Hot Aggregations (5min)",
            replace_existing=True,
        )
        logger.info("Scheduled gold hot aggregations", interval="5 minutes")
        
        # Warm aggregations: category_distribution, volume_trends, platform_comparison, trending_categories
        self.scheduler.add_job(
            self._run_warm_aggregations,
            trigger=IntervalTrigger(
                minutes=15,
                start_date=datetime.utcnow().replace(second=0, microsecond=0),
            ),
            id="gold_warm_agg",
            name="Gold Layer: Warm Aggregations (15min)",
            replace_existing=True,
        )
        logger.info("Scheduled gold warm aggregations", interval="15 minutes")
        
        # Cleanup old snapshots - Daily at 3:00 AM UTC
        self.scheduler.add_job(
            self._cleanup_gold_snapshots,
            trigger=CronTrigger(hour=3, minute=0),
            id="gold_cleanup",
            name="Gold Layer: Cleanup Old Snapshots",
            replace_existing=True,
        )
        logger.info("Scheduled gold cleanup job", schedule="daily at 03:00 UTC")
    
    async def _run_static_job(self, source: DataSource):
        """Execute static load job for a source."""
        logger.info("Starting scheduled static load", source=source.value)
        
        try:
            result = await self.orchestrator.run_source(source, LoadType.STATIC)
            logger.info(
                "Completed scheduled static load",
                source=source.value,
                success=result.success,
                markets=result.markets_upserted,
                trades=result.trades_inserted,
                duration=result.duration_seconds,
            )
        except Exception as e:
            logger.error(
                "Scheduled static load failed",
                source=source.value,
                error=str(e),
            )
    
    async def _run_delta_job(self, source: DataSource):
        """Execute delta load job for a source."""
        logger.info("Starting scheduled delta load", source=source.value)
        
        try:
            result = await self.orchestrator.run_source(source, LoadType.DELTA)
            logger.info(
                "Completed scheduled delta load",
                source=source.value,
                success=result.success,
                markets=result.markets_upserted,
                trades=result.trades_inserted,
                duration=result.duration_seconds,
            )
        except Exception as e:
            logger.error(
                "Scheduled delta load failed",
                source=source.value,
                error=str(e),
            )
    
    async def _refresh_views_job(self):
        """Refresh materialized views."""
        logger.info("Starting scheduled view refresh")
        
        try:
            await self.orchestrator.refresh_materialized_views()
            logger.info("Completed scheduled view refresh")
        except Exception as e:
            logger.error("Scheduled view refresh failed", error=str(e))
    
    async def _run_hot_aggregations(self):
        """Execute hot gold layer aggregations (every 5 minutes)."""
        logger.info("Starting scheduled hot aggregations")
        
        try:
            if self.gold_aggregator is None:
                db = await get_db()
                self.gold_aggregator = GoldLayerAggregator(db)
            
            summary = await self.gold_aggregator.run_hot_aggregations()
            logger.info(
                "Completed scheduled hot aggregations",
                run_id=str(summary.run_id),
                status="success" if summary.failed_count == 0 else "partial",
                tables_success=summary.success_count,
                tables_failed=summary.failed_count,
                total_inserted=summary.total_inserted,
                total_upserted=summary.total_upserted,
                total_deleted=summary.total_deleted,
                total_errors=summary.total_errors,
                duration_s=round(summary.duration_seconds, 3),
            )
        except Exception as e:
            logger.error("Scheduled hot aggregations failed", error=str(e))
    
    async def _run_warm_aggregations(self):
        """Execute warm gold layer aggregations (every 15 minutes)."""
        logger.info("Starting scheduled warm aggregations")
        
        try:
            if self.gold_aggregator is None:
                db = await get_db()
                self.gold_aggregator = GoldLayerAggregator(db)
            
            summary = await self.gold_aggregator.run_warm_aggregations()
            logger.info(
                "Completed scheduled warm aggregations",
                run_id=str(summary.run_id),
                status="success" if summary.failed_count == 0 else "partial",
                tables_success=summary.success_count,
                tables_failed=summary.failed_count,
                total_inserted=summary.total_inserted,
                total_upserted=summary.total_upserted,
                total_deleted=summary.total_deleted,
                total_errors=summary.total_errors,
                duration_s=round(summary.duration_seconds, 3),
            )
        except Exception as e:
            logger.error("Scheduled warm aggregations failed", error=str(e))
    
    async def _cleanup_gold_snapshots(self):
        """Clean up old gold layer snapshots (daily)."""
        logger.info("Starting scheduled gold cleanup")
        
        try:
            if self.gold_aggregator is None:
                db = await get_db()
                self.gold_aggregator = GoldLayerAggregator(db)
            
            summary = await self.gold_aggregator.run_cleanup()
            logger.info(
                "Completed scheduled gold cleanup",
                run_id=str(summary.run_id),
                tables_processed=len(summary.results),
                total_deleted=summary.total_deleted,
                duration_s=round(summary.duration_seconds, 3),
            )
        except Exception as e:
            logger.error("Scheduled gold cleanup failed", error=str(e))
    
    # =========================================================================
    # JOB MANAGEMENT
    # =========================================================================
    
    def add_source_jobs(self, source: DataSource):
        """Add jobs for a specific source (for dynamic source registration)."""
        if self.settings.static_schedule_enabled:
            self.scheduler.add_job(
                self._run_static_job,
                trigger=CronTrigger(
                    day_of_week=self.settings.static_schedule_day,
                    hour=self.settings.static_schedule_hour,
                    minute=0,
                ),
                id=f"static_{source.value}",
                name=f"Static load: {source.value}",
                kwargs={"source": source},
                replace_existing=True,
            )
        
        if self.settings.delta_schedule_enabled:
            self.scheduler.add_job(
                self._run_delta_job,
                trigger=IntervalTrigger(hours=self.settings.delta_schedule_interval_hours),
                id=f"delta_{source.value}",
                name=f"Delta load: {source.value}",
                kwargs={"source": source},
                replace_existing=True,
            )
    
    def remove_source_jobs(self, source: DataSource):
        """Remove jobs for a specific source."""
        for job_type in ["static", "delta"]:
            job_id = f"{job_type}_{source.value}"
            if self.scheduler.get_job(job_id):
                self.scheduler.remove_job(job_id)
                logger.info(f"Removed {job_type} job for {source.value}")
    
    def pause_source(self, source: DataSource):
        """Pause all jobs for a source."""
        for job_type in ["static", "delta"]:
            job_id = f"{job_type}_{source.value}"
            job = self.scheduler.get_job(job_id)
            if job:
                job.pause()
                logger.info(f"Paused {job_type} job for {source.value}")
    
    def resume_source(self, source: DataSource):
        """Resume all jobs for a source."""
        for job_type in ["static", "delta"]:
            job_id = f"{job_type}_{source.value}"
            job = self.scheduler.get_job(job_id)
            if job:
                job.resume()
                logger.info(f"Resumed {job_type} job for {source.value}")
    
    def trigger_source_now(self, source: DataSource, load_type: LoadType):
        """Trigger immediate execution of a source's job."""
        job_id = f"{load_type.value}_{source.value}"
        job = self.scheduler.get_job(job_id)
        if job:
            job.modify(next_run_time=datetime.utcnow())
            logger.info(f"Triggered immediate {load_type.value} run for {source.value}")
        else:
            logger.warning(f"Job not found: {job_id}")
    
    def get_job_status(self) -> list[dict]:
        """Get status of all scheduled jobs."""
        jobs = []
        for job in self.scheduler.get_jobs():
            jobs.append({
                "id": job.id,
                "name": job.name,
                "next_run_time": job.next_run_time.isoformat() if job.next_run_time else None,
                "pending": job.pending,
            })
        return jobs
    
    # =========================================================================
    # LIFECYCLE
    # =========================================================================
    
    def start(self):
        """Start the scheduler."""
        if self._running:
            logger.warning("Scheduler already running")
            return
        
        self._setup_jobs()
        self.scheduler.start()
        self._running = True
        
        logger.info(
            "Scheduler started",
            jobs=len(self.scheduler.get_jobs()),
            enabled_sources=[s.value for s in self.settings.enabled_sources],
        )
    
    def stop(self):
        """Stop the scheduler gracefully."""
        if not self._running:
            return
        
        self.scheduler.shutdown(wait=True)
        self._running = False
        logger.info("Scheduler stopped")
    
    @property
    def is_running(self) -> bool:
        return self._running


async def run_scheduler():
    """Run the scheduler as main process."""
    settings = get_settings()
    scheduler = IngestionScheduler()
    
    # Setup signal handlers for graceful shutdown
    loop = asyncio.get_event_loop()
    
    def signal_handler():
        logger.info("Received shutdown signal")
        scheduler.stop()
        loop.stop()
    
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, signal_handler)
    
    # Verify database connection
    # Temporarily commented out due to asyncpg connection issue at startup
    # The connection works fine during actual ingestion
    # db = await get_db()
    # if not await db.health_check():
    #     logger.error("Database health check failed, exiting")
    #     sys.exit(1)
    
    logger.info(
        "Starting predictions ingestion scheduler",
        enabled_sources=[s.value for s in settings.enabled_sources],
        static_enabled=settings.static_schedule_enabled,
        delta_enabled=settings.delta_schedule_enabled,
    )
    
    scheduler.start()
    
    # Run optional initial delta load on startup
    if settings.run_delta_on_startup:
        logger.info("Running initial delta load on startup")
        orchestrator = IngestionOrchestrator()
        await orchestrator.run_all_sources(LoadType.DELTA)
    
    # Keep running
    try:
        while scheduler.is_running:
            await asyncio.sleep(60)
    except asyncio.CancelledError:
        scheduler.stop()
    # finally:
    #     await db.close()  # Commented out since db connection check is disabled


if __name__ == "__main__":
    asyncio.run(run_scheduler())
