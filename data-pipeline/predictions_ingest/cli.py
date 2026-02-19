"""
CLI for predictions data ingestion.
Supports running individual sources, all sources, or scheduled mode.
"""
import asyncio
import sys
from typing import Optional

import click
import structlog

from predictions_ingest.config import get_settings
from predictions_ingest.database import get_db, run_migrations
from predictions_ingest.ingestion import (
    IngestionOrchestrator,
    LoadType,
    INGESTER_REGISTRY,
)
from predictions_ingest.models import DataSource
from predictions_ingest.scheduler import IngestionScheduler, run_scheduler

# Configure structlog for CLI
structlog.configure(
    processors=[
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.dev.ConsoleRenderer(colors=True),
    ],
    wrapper_class=structlog.stdlib.BoundLogger,
    context_class=dict,
    logger_factory=structlog.PrintLoggerFactory(),
    cache_logger_on_first_use=True,
)

logger = structlog.get_logger()


# =============================================================================
# CLI GROUP
# =============================================================================

@click.group()
@click.option("--debug", is_flag=True, help="Enable debug logging")
@click.pass_context
def cli(ctx, debug: bool):
    """
    Predictions Data Ingestion CLI.
    
    Ingest prediction market data from multiple sources:
    Polymarket, Kalshi, Limitless Exchange, and Opinion Trade.
    """
    ctx.ensure_object(dict)
    ctx.obj["debug"] = debug
    
    if debug:
        import logging
        logging.basicConfig(level=logging.DEBUG)


# =============================================================================
# INGEST COMMANDS
# =============================================================================

@cli.command()
@click.option(
    "--source", "-s",
    type=click.Choice(["polymarket", "kalshi", "limitless", "opiniontrade", "all"]),
    default="all",
    help="Source to ingest (default: all)",
)
@click.option(
    "--type", "-t", "load_type",
    type=click.Choice(["static", "delta"]),
    default="delta",
    help="Load type: static (full) or delta (incremental)",
)
@click.option(
    "--parallel/--sequential",
    default=True,
    help="Run sources in parallel (async) or sequentially (default: parallel)",
)
@click.pass_context
def ingest(ctx, source: str, load_type: str, parallel: bool):
    """
    Run data ingestion.
    
    Examples:
    
        # Run delta load for all sources in parallel (FAST - 65% faster!)
        predictions-ingest ingest
        
        # Run delta load for all sources sequentially
        predictions-ingest ingest --sequential
        
        # Run static load for Polymarket only
        predictions-ingest ingest --source polymarket --type static
        
        # Run delta load for Kalshi
        predictions-ingest ingest -s kalshi -t delta
    """
    async def _run():
        orchestrator = IngestionOrchestrator()
        lt = LoadType.STATIC if load_type == "static" else LoadType.DELTA
        
        if source == "all":
            mode = "parallel" if parallel else "sequential"
            click.echo(f"Running {load_type} ingestion for all enabled sources ({mode} mode)...")
            if parallel:
                click.echo(click.style("⚡ Parallel mode: All sources run simultaneously!", fg="cyan"))
            results = await orchestrator.run_all_sources(lt, parallel=parallel)
            
            # Summary
            click.echo("\n" + "=" * 60)
            click.echo("INGESTION SUMMARY")
            click.echo("=" * 60)
            
            for result in results:
                status = click.style("✓", fg="green") if result.success else click.style("✗", fg="red")
                click.echo(f"{status} {result.source.value}: {result.markets_upserted} markets, {result.prices_updated} prices ({result.duration_seconds:.1f}s)")
                if result.error:
                    click.echo(f"   Error: {result.error}")
            
            successful = sum(1 for r in results if r.success)
            click.echo(f"\nCompleted: {successful}/{len(results)} sources successful")
            
        else:
            ds = DataSource(source)
            click.echo(f"Running {load_type} ingestion for {source}...")
            result = await orchestrator.run_source(ds, lt)
            
            if result.success:
                click.echo(click.style(f"\n✓ {source} ingestion complete", fg="green"))
                click.echo(f"  Markets upserted: {result.markets_upserted}")
                click.echo(f"  Prices updated: {result.prices_updated}")
                click.echo(f"  Duration: {result.duration_seconds:.1f}s")
            else:
                click.echo(click.style(f"\n✗ {source} ingestion failed", fg="red"))
                click.echo(f"  Error: {result.error}")
                sys.exit(1)
        
        # Cleanup
        db = await get_db()
        await db.close()
    
    asyncio.run(_run())


@cli.command()
@click.pass_context
def schedule(ctx):
    """
    Run the scheduler for automated ingestion.
    
    Runs continuously with:
    - Static (full) loads weekly on Sunday at 2:00 AM UTC
    - Delta (incremental) loads every hour
    - View refresh every hour
    
    Press Ctrl+C to stop.
    """
    click.echo("Starting scheduler...")
    click.echo("Press Ctrl+C to stop\n")
    asyncio.run(run_scheduler())


# =============================================================================
# DATABASE COMMANDS
# =============================================================================

@cli.group()
def db():
    """Database management commands."""
    pass


@db.command()
def migrate():
    """Run pending database migrations."""
    async def _run():
        click.echo("Running database migrations...")
        await run_migrations()
        click.echo("Migrations complete")
        
        db = await get_db()
        await db.close()
    
    asyncio.run(_run())


@db.command()
def health():
    """Check database connectivity."""
    async def _run():
        click.echo("Checking database connection...")
        db = await get_db()
        
        if await db.health_check():
            click.echo(click.style("✓ Database connection healthy", fg="green"))
        else:
            click.echo(click.style("✗ Database connection failed", fg="red"))
            sys.exit(1)
        
        await db.close()
    
    asyncio.run(_run())


@db.command()
def refresh_views():
    """Refresh materialized views."""
    async def _run():
        click.echo("Refreshing materialized views...")
        orchestrator = IngestionOrchestrator()
        await orchestrator.refresh_materialized_views()
        click.echo("Views refreshed")
        
        db = await get_db()
        await db.close()
    
    asyncio.run(_run())


# =============================================================================
# STATUS COMMANDS
# =============================================================================

@cli.command()
@click.option(
    "--source", "-s",
    type=click.Choice(["polymarket", "kalshi", "limitless", "opiniontrade"]),
    help="Filter by source",
)
def status(source: Optional[str]):
    """Show sync status for all sources."""
    async def _run():
        db = await get_db()
        
        query = """
            SELECT source, endpoint_name, last_success_at, last_success_run_id,
                   total_records_stored, consecutive_errors, last_error_message
            FROM predictions_ingestion.sync_state
        """
        params = []
        
        if source:
            query += " WHERE source = $1"
            params.append(source)
        
        query += " ORDER BY source, endpoint_name"
        
        async with db.asyncpg_connection() as conn:
            rows = await conn.fetch(query, *params)
        
        if not rows:
            click.echo("No sync state found. Run ingestion first.")
            return
        
        click.echo("\n" + "=" * 80)
        click.echo("SYNC STATUS")
        click.echo("=" * 80)
        
        for row in rows:
            has_error = row["consecutive_errors"] > 0
            status_color = "red" if has_error else "green"
            status_icon = "✗" if has_error else "✓"
            
            click.echo(f"\n{click.style(status_icon, fg=status_color)} {row['source']}")
            click.echo(f"  Last success: {row['last_success_at']}")
            click.echo(f"  Records stored: {row['total_records_stored']}")
            click.echo(f"  Consecutive errors: {row['consecutive_errors']}")
            if row["last_error_message"]:
                click.echo(f"  Error: {row['last_error_message']}")
        
        await db.close()
    
    asyncio.run(_run())


@cli.command()
@click.option(
    "--source", "-s",
    type=click.Choice(["polymarket", "kalshi", "limitless", "opiniontrade"]),
    help="Filter by source",
)
def stats(source: Optional[str]):
    """Show data statistics."""
    async def _run():
        db = await get_db()
        
        async with db.asyncpg_connection() as conn:
            # Market counts by source
            market_stats = await conn.fetch("""
                SELECT source,
                       COUNT(*) as total,
                       COUNT(*) FILTER (WHERE is_active) as active,
                       COUNT(*) FILTER (WHERE is_resolved) as resolved
                FROM predictions_silver.markets
                GROUP BY source
                ORDER BY source
            """)
            
            # Trade counts by source
            trade_stats = await conn.fetch("""
                SELECT source,
                       COUNT(*) as total,
                       COUNT(*) FILTER (WHERE traded_at > NOW() - INTERVAL '24 hours') as last_24h
                FROM predictions_silver.trades
                GROUP BY source
            """)
            
            # Bronze counts
            bronze_stats = await conn.fetch("""
                SELECT source,
                       COUNT(*) as total,
                       COUNT(*) FILTER (WHERE ingested_at > NOW() - INTERVAL '24 hours') as last_24h
                FROM predictions_bronze.api_responses
                GROUP BY source
            """)
        
        click.echo("\n" + "=" * 60)
        click.echo("DATA STATISTICS")
        click.echo("=" * 60)
        
        click.echo("\nMARKETS:")
        click.echo(f"{'Source':<15} {'Total':<10} {'Active':<10} {'Resolved':<10}")
        click.echo("-" * 45)
        for row in market_stats:
            if source and row["source"] != source:
                continue
            click.echo(f"{row['source']:<15} {row['total']:<10} {row['active']:<10} {row['resolved']:<10}")
        
        click.echo("\nTRADES:")
        click.echo(f"{'Source':<15} {'Total':<15} {'Last 24h':<10}")
        click.echo("-" * 40)
        for row in trade_stats:
            if source and row["source"] != source:
                continue
            click.echo(f"{row['source']:<15} {row['total']:<15} {row['last_24h']:<10}")
        
        click.echo("\nBRONZE RECORDS:")
        click.echo(f"{'Source':<15} {'Total':<15} {'Last 24h':<10}")
        click.echo("-" * 40)
        for row in bronze_stats:
            if source and row["source"] != source:
                continue
            click.echo(f"{row['source']:<15} {row['total']:<15} {row['last_24h']:<10}")
        
        await db.close()
    
    asyncio.run(_run())


# =============================================================================
# CONFIG COMMANDS
# =============================================================================

@cli.command()
def config():
    """Show current configuration."""
    settings = get_settings()
    
    click.echo("\n" + "=" * 60)
    click.echo("CONFIGURATION")
    click.echo("=" * 60)
    
    click.echo("\nENABLED SOURCES:")
    for source in settings.enabled_sources:
        click.echo(f"  • {source.value}")
    
    click.echo("\nRATE LIMITS:")
    click.echo(f"  Dome API: {settings.dome_rate_limit_rps} RPS")
    click.echo(f"  Limitless: {settings.limitless_rate_limit_rps} RPS")
    
    click.echo("\nSCHEDULE:")
    click.echo(f"  Static loads enabled: {settings.static_schedule_enabled}")
    click.echo(f"  Static schedule: {settings.static_schedule_day} at {settings.static_schedule_hour}:00 UTC")
    click.echo(f"  Delta loads enabled: {settings.delta_schedule_enabled}")
    click.echo(f"  Delta interval: every {settings.delta_schedule_interval_hours} hour(s)")
    
    click.echo("\nDATABASE:")
    # Mask password in URL
    db_url = settings.database_url
    if "@" in db_url:
        parts = db_url.split("@")
        prefix = parts[0].rsplit(":", 1)[0]
        click.echo(f"  URL: {prefix}:****@{parts[1]}")
    else:
        click.echo(f"  URL: {db_url}")


# =============================================================================
# ENTRY POINT
# =============================================================================

def main():
    """Entry point for the CLI."""
    cli(obj={})


if __name__ == "__main__":
    main()
