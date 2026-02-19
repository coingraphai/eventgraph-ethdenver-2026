"""
CLI for Limitless Exchange data ingestion.
"""
import asyncio
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import click
import structlog
from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich.progress import Progress, SpinnerColumn, TextColumn

from limitless_ingest.config import get_settings
from limitless_ingest.database import Database, init_database, close_database, run_migrations
from limitless_ingest.api.client import APIClient
from limitless_ingest.ingestion.bronze import BronzeWriter
from limitless_ingest.ingestion.silver import SilverNormalizer

console = Console()
logger = structlog.get_logger()


def async_command(f):
    """Decorator to run async functions in click commands."""
    import functools
    @functools.wraps(f)
    def wrapper(*args, **kwargs):
        return asyncio.run(f(*args, **kwargs))
    return wrapper


@click.group()
@click.option("--verbose", "-v", is_flag=True, help="Enable verbose logging")
def cli(verbose: bool):
    """Limitless Exchange data ingestion CLI."""
    import logging
    
    # Configure structlog
    structlog.configure(
        processors=[
            structlog.stdlib.filter_by_level,
            structlog.stdlib.add_logger_name,
            structlog.stdlib.add_log_level,
            structlog.stdlib.PositionalArgumentsFormatter(),
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.UnicodeDecoder(),
            structlog.dev.ConsoleRenderer() if verbose else structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.stdlib.BoundLogger,
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )
    
    logging.basicConfig(
        format="%(message)s",
        level=logging.DEBUG if verbose else logging.INFO,
        stream=sys.stderr,
    )


@cli.command()
@click.option("--directory", "-d", default="migrations", help="Migrations directory")
@async_command
async def migrate(directory: str):
    """Run database migrations."""
    console.print(Panel("Running database migrations", style="bold blue"))
    
    settings = get_settings()
    
    # Find migrations directory
    migrations_dir = Path(directory)
    if not migrations_dir.is_absolute():
        # Try relative to current directory
        if not migrations_dir.exists():
            # Try relative to package
            migrations_dir = Path(__file__).parent.parent.parent / directory
    
    if not migrations_dir.exists():
        console.print(f"[red]Migrations directory not found: {migrations_dir}[/red]")
        raise SystemExit(1)
    
    console.print(f"Using migrations from: {migrations_dir}")
    
    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        console=console,
    ) as progress:
        task = progress.add_task("Running migrations...", total=None)
        
        try:
            await run_migrations(
                database_url=settings.database_url,
                migrations_dir=migrations_dir,
            )
            progress.update(task, description="[green]Migrations completed!")
            console.print("[green]✓ All migrations applied successfully[/green]")
        except Exception as e:
            progress.update(task, description=f"[red]Migration failed: {e}")
            console.print(f"[red]✗ Migration failed: {e}[/red]")
            raise SystemExit(1)


@cli.command()
@click.option("--mode", "-m", type=click.Choice(["full", "incremental"]), default="full",
              help="Ingestion mode: full (backfill all) or incremental (recent only)")
@click.option("--skip-normalize", is_flag=True, help="Skip silver layer normalization")
@click.option("--skip-gold", is_flag=True, help="Skip gold layer refresh")
@async_command
async def ingest(mode: str, skip_normalize: bool, skip_gold: bool):
    """Ingest data from Limitless Exchange API."""
    console.print(Panel(f"Starting {mode} ingestion", style="bold blue"))
    
    console.print("Endpoints: categories, tokens, markets, feed")
    
    db = await init_database()
    
    try:
        async with APIClient() as client:
            bronze = BronzeWriter(db, client)
            silver = SilverNormalizer(db)
            
            results = {
                "mode": mode,
                "started_at": datetime.now(timezone.utc).isoformat(),
                "bronze": {},
                "silver": {},
                "gold": {},
            }
            
            # Bronze layer ingestion
            with Progress(
                SpinnerColumn(),
                TextColumn("[progress.description]{task.description}"),
                console=console,
            ) as progress:
                
                task = progress.add_task("Ingesting categories...", total=None)
                results["bronze"]["categories"] = await bronze.ingest_categories()
                progress.update(task, description="[green]✓ Categories ingested")
                progress.stop_task(task)
                
                task = progress.add_task("Ingesting tokens...", total=None)
                results["bronze"]["tokens"] = await bronze.ingest_tokens()
                progress.update(task, description="[green]✓ Tokens ingested")
                progress.stop_task(task)
                
                task = progress.add_task("Ingesting markets...", total=None)
                results["bronze"]["markets"] = await bronze.ingest_all_markets()
                progress.update(task, description="[green]✓ Markets ingested")
                progress.stop_task(task)
                
                task = progress.add_task("Ingesting feed...", total=None)
                max_pages = 25 if mode == "incremental" else 50
                results["bronze"]["feed"] = await bronze.ingest_recent_feed(max_pages=max_pages)
                progress.update(task, description="[green]✓ Feed ingested")
                progress.stop_task(task)
            
            # Display bronze results
            console.print("\n[bold green]✓ Bronze layer ingestion complete![/bold green]")
            _display_bronze_results(results.get("bronze", {}))
            
            # Wait for user confirmation before proceeding
            if not skip_normalize:
                console.print("\n[bold yellow]Bronze data has been written to the database.[/bold yellow]")
                console.print("[dim]You can verify the data using: limitless-ingest status[/dim]")
                
                if not click.confirm("\nProceed to silver layer normalization?", default=True):
                    console.print("[yellow]Stopping after bronze layer. Run with --skip-normalize to automate this.[/yellow]")
                    results["completed_at"] = datetime.now(timezone.utc).isoformat()
                    return
            
            # Silver layer normalization
            if not skip_normalize:
                console.print("\n[bold]Normalizing to silver layer...[/bold]")
                
                with Progress(
                    SpinnerColumn(),
                    TextColumn("[progress.description]{task.description}"),
                    console=console,
                ) as progress:
                    
                    task = progress.add_task("Normalizing categories...", total=None)
                    results["silver"]["categories"] = await silver.normalize_categories()
                    progress.update(task, description="[green]✓ Categories normalized")
                    progress.stop_task(task)
                    
                    task = progress.add_task("Normalizing tokens...", total=None)
                    results["silver"]["tokens"] = await silver.normalize_tokens()
                    progress.update(task, description="[green]✓ Tokens normalized")
                    progress.stop_task(task)
                    
                    task = progress.add_task("Normalizing markets...", total=None)
                    results["silver"]["markets"] = await silver.normalize_markets()
                    progress.update(task, description="[green]✓ Markets normalized")
                    progress.stop_task(task)
                    
                    task = progress.add_task("Normalizing trades...", total=None)
                    results["silver"]["trades"] = await silver.normalize_trades()
                    progress.update(task, description="[green]✓ Trades normalized")
                    progress.stop_task(task)
            
            # Gold layer refresh
            if not skip_gold and not skip_normalize:
                console.print("\n[bold]Refreshing gold layer views...[/bold]")
                results["gold"] = await silver.refresh_gold_views()
            
            results["completed_at"] = datetime.now(timezone.utc).isoformat()
            
            # Display results
            console.print("\n")
            _display_results(results)
            
    finally:
        await close_database()


def _display_bronze_results(bronze_results: dict):
    """Display bronze layer ingestion results."""
    table = Table(title="Bronze Layer - Data Ingested")
    table.add_column("Endpoint", style="magenta")
    table.add_column("Status", style="green")
    table.add_column("Records", justify="right")
    table.add_column("New Data", justify="center")
    
    for endpoint, data in bronze_results.items():
        if isinstance(data, dict):
            is_new = data.get("is_new", data.get("new_pages", 0) > 0)
            status = "✓" if is_new else "○"
            count = data.get("count", data.get("total_trades", data.get("total_markets", "")))
            new_marker = "Yes" if is_new else "No"
            table.add_row(endpoint, status, str(count), new_marker)
    
    console.print(table)


def _display_results(results: dict):
    """Display ingestion results in a table."""
    table = Table(title="Ingestion Results")
    table.add_column("Layer", style="cyan")
    table.add_column("Endpoint", style="magenta")
    table.add_column("Status", style="green")
    table.add_column("Details")
    
    # Bronze results
    for endpoint, data in results.get("bronze", {}).items():
        if isinstance(data, dict):
            is_new = data.get("is_new", data.get("new_pages", 0) > 0)
            status = "✓ New data" if is_new else "○ No change"
            count = data.get("count", data.get("total_trades", data.get("total_markets", "")))
            table.add_row("Bronze", endpoint, status, f"Count: {count}")
    
    # Silver results
    for endpoint, data in results.get("silver", {}).items():
        if isinstance(data, dict):
            status = "✓" if data.get("status") == "success" else "○"
            inserted = data.get("inserted", 0)
            updated = data.get("updated", 0)
            table.add_row("Silver", endpoint, status, f"Inserted: {inserted}, Updated: {updated}")
    
    # Gold results
    gold = results.get("gold", {})
    if gold:
        status = "✓" if gold.get("status") == "success" else "✗"
        table.add_row("Gold", "materialized views", status, "")
    
    console.print(table)
    console.print(f"\n[dim]Started: {results.get('started_at')}[/dim]")
    console.print(f"[dim]Completed: {results.get('completed_at')}[/dim]")


@cli.command()
@async_command
async def status():
    """Show current database status and statistics."""
    console.print(Panel("Database Status", style="bold blue"))
    
    db = await init_database()
    
    try:
        # Get counts from each layer
        stats = {}
        
        # Bronze stats
        bronze_count = await db.fetchval(
            "SELECT COUNT(*) FROM limitless_bronze.api_responses"
        )
        stats["bronze_responses"] = bronze_count or 0
        
        # Silver stats
        for table in ["categories", "tokens", "markets", "trades"]:
            try:
                count = await db.fetchval(f"SELECT COUNT(*) FROM limitless_silver.{table}")
                stats[f"silver_{table}"] = count or 0
            except Exception:
                stats[f"silver_{table}"] = "N/A"
        
        # Display
        table = Table(title="Record Counts")
        table.add_column("Layer", style="cyan")
        table.add_column("Table", style="magenta")
        table.add_column("Count", justify="right", style="green")
        
        table.add_row("Bronze", "api_responses", str(stats["bronze_responses"]))
        table.add_row("Silver", "categories", str(stats["silver_categories"]))
        table.add_row("Silver", "tokens", str(stats["silver_tokens"]))
        table.add_row("Silver", "markets", str(stats["silver_markets"]))
        table.add_row("Silver", "trades", str(stats["silver_trades"]))
        
        console.print(table)
        
        # Show latest ingestion
        latest = await db.fetchrow("""
            SELECT endpoint_name, fetched_at 
            FROM limitless_bronze.api_responses 
            ORDER BY fetched_at DESC 
            LIMIT 1
        """)
        
        if latest:
            console.print(f"\n[dim]Last ingestion: {latest['endpoint_name']} at {latest['fetched_at']}[/dim]")
        
    finally:
        await close_database()


@cli.command()
@click.option("--interval", "-i", default=300, help="Poll interval in seconds")
@async_command
async def watch(interval: int):
    """Continuously poll for new data."""
    
    console.print(Panel(
        f"Starting continuous ingestion\n"
        f"Endpoints: categories, tokens, markets, feed\n"
        f"Interval: {interval}s",
        style="bold blue"
    ))
    
    db = await init_database()
    
    try:
        async with APIClient() as client:
            bronze = BronzeWriter(db, client)
            silver = SilverNormalizer(db)
            
            iteration = 0
            while True:
                iteration += 1
                console.print(f"\n[bold]Iteration {iteration}[/bold] - {datetime.now(timezone.utc).isoformat()}")
                
                try:
                    # Ingest categories (quick snapshot)
                    cat_result = await bronze.ingest_categories()
                    if cat_result.get("is_new"):
                        await silver.normalize_categories()
                        console.print(f"  [green]Categories: {cat_result['count']} categories[/green]")
                    
                    # Ingest tokens (quick snapshot)
                    tok_result = await bronze.ingest_tokens()
                    if tok_result.get("is_new"):
                        await silver.normalize_tokens()
                        console.print(f"  [green]Tokens: {tok_result['count']} tokens[/green]")
                    
                    # Ingest markets
                    result = await bronze.ingest_all_markets()
                    if result.get("new_pages", 0) > 0:
                        await silver.normalize_markets()
                        console.print(f"  [green]Markets: {result['total_markets']} markets[/green]")
                    else:
                        console.print("  [dim]No new market data[/dim]")
                    
                    # Ingest feed
                    feed_result = await bronze.ingest_recent_feed(max_pages=10)
                    if feed_result.get("new_pages", 0) > 0:
                        await silver.normalize_trades()
                        console.print(f"  [green]Feed: {feed_result['total_trades']} trades[/green]")
                    
                except Exception as e:
                    console.print(f"  [red]Error: {e}[/red]")
                    logger.exception("Watch iteration failed")
                
                console.print(f"  [dim]Sleeping {interval}s...[/dim]")
                await asyncio.sleep(interval)
                
    except KeyboardInterrupt:
        console.print("\n[yellow]Stopping watch...[/yellow]")
    finally:
        await close_database()


@cli.command()
@async_command
async def test_connection():
    """Test database and API connections."""
    console.print(Panel("Testing Connections", style="bold blue"))
    
    settings = get_settings()
    
    # Test database
    console.print("\n[bold]Database Connection[/bold]")
    try:
        db = await init_database()
        version = await db.fetchval("SELECT version()")
        console.print(f"  [green]✓ Connected to PostgreSQL[/green]")
        console.print(f"  [dim]{version[:60]}...[/dim]")
        await close_database()
    except Exception as e:
        console.print(f"  [red]✗ Database connection failed: {e}[/red]")
        return
    
    # Test API
    console.print("\n[bold]API Connection[/bold]")
    try:
        async with APIClient() as client:
            categories = await client.fetch_categories()
            console.print(f"  [green]✓ API accessible[/green]")
            console.print(f"  [dim]Categories: {len(categories)}[/dim]")
    except Exception as e:
        console.print(f"  [red]✗ API connection failed: {e}[/red]")


def main():
    """Entry point."""
    cli()


if __name__ == "__main__":
    main()
