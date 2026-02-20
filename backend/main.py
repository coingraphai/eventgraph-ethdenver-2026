"""
CoinGraph AI Backend - FastAPI Application with PostgreSQL Database
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import logging
import asyncio

from app.config import settings

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup and shutdown events"""
    logger.info("🚀 Starting CoinGraph AI API...")
    logger.info(f"📊 Environment: {settings.ENVIRONMENT}")
    
    # Initialize database connection
    try:
        from app.database.session import init_db, test_connection, get_async_pool
        init_db()
        if test_connection():
            logger.info("✅ Database connection established")
        else:
            logger.error("❌ Database connection failed")
    except Exception as e:
        logger.error(f"❌ Database initialization error: {e}")
    
    
    # Check MCP Client
    try:
        from app.services.prediction_mcp_client import prediction_mcp_client
        if prediction_mcp_client.dome_api_key:
            logger.info("✅ Prediction MCP client configured with Dome API")
        else:
            logger.warning("⚠️ DOME_API_KEY not set - prediction markets will be limited")
    except Exception as e:
        logger.warning(f"⚠️ Could not initialize MCP client: {e}")
    
    # Check Claude
    try:
        from app.services.claude_service import claude_service
        if claude_service.client:
            logger.info("✅ Claude AI service ready with MCP tools")
        else:
            logger.warning("⚠️ ANTHROPIC_API_KEY not set - AI responses will be limited")
    except Exception as e:
        logger.warning(f"⚠️ Could not initialize Claude service: {e}")
    
    logger.info("✅ API started successfully (database-only mode, no live API cache warming)")
    
    yield
    
    # Cleanup on shutdown
    # Close async database pool
    try:
        from app.database.session import close_async_pool
        await close_async_pool()
        logger.info("🛑 Async database pool closed")
    except Exception:
        pass
    
    logger.info("👋 Shutdown complete")


# Create FastAPI app
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.VERSION,
    description="CoinGraph AI - Cryptocurrency Analysis Chatbot with Database Backend",
    lifespan=lifespan
)

# Configure CORS — driven by CORS_ORIGINS env var (see app/config.py)
# Production: same-origin through DO App Platform routing, so this is
# only needed for direct API access (dev tools, staging, etc.)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Import and include routers
try:
    from app.api.chat import router as chat_router
    app.include_router(chat_router, prefix="")
    logger.info("✅ Chat router loaded")
except ImportError as e:
    logger.warning(f"⚠️ Could not load chat router: {e}")

try:
    from app.api.chat_v2_stream import router as chat_v2_stream_router
    app.include_router(chat_v2_stream_router, prefix="")
    logger.info("✅ Chat v2 stream router loaded")
except ImportError as e:
    logger.warning(f"⚠️ Could not load chat v2 stream router: {e}")

try:
    from app.api.predictions import router as predictions_router
    app.include_router(predictions_router, prefix="")
    logger.info("✅ Predictions router loaded")
except ImportError as e:
    logger.warning(f"⚠️ Could not load predictions router: {e}")

# Database-backed dashboard (new)
try:
    from app.api.dashboard_db import router as dashboard_db_router
    app.include_router(dashboard_db_router, prefix="/dashboard", tags=["dashboard-db"])
    logger.info("✅ Dashboard (database-backed) router loaded")
except ImportError as e:
    logger.warning(f"⚠️ Could not load dashboard_db router: {e}")

# Database-backed markets (new)
try:
    from app.api.markets_db import router as markets_db_router
    app.include_router(markets_db_router, prefix="/markets", tags=["markets-db"])
    logger.info("✅ Markets (database-backed) router loaded")
except ImportError as e:
    logger.warning(f"⚠️ Could not load markets_db router: {e}")

# Database-backed analytics (new)
try:
    from app.api.analytics_db import router as analytics_db_router
    app.include_router(analytics_db_router, prefix="/analytics", tags=["analytics-db"])
    logger.info("✅ Analytics (database-backed) router loaded")
except ImportError as e:
    logger.warning(f"⚠️ Could not load analytics_db router: {e}")

# Database-backed events (new)
try:
    from app.api.events_db import router as events_db_router
    app.include_router(events_db_router, prefix="/db", tags=["events-db"])
    logger.info("✅ Events (database-backed) router loaded")
except ImportError as e:
    logger.warning(f"⚠️ Could not load events_db router: {e}")

# Legacy dashboard (API-based) - keep for fallback
try:
    from app.api.dashboard import router as dashboard_router
    app.include_router(dashboard_router, prefix="/dashboard-legacy", tags=["dashboard-legacy"])
    logger.info("✅ Dashboard (legacy API-based) router loaded")
except ImportError as e:
    logger.warning(f"⚠️ Could not load dashboard router: {e}")

try:
    from app.api.unified_markets import router as unified_markets_router
    app.include_router(unified_markets_router, prefix="/unified", tags=["unified-markets"])
    logger.info("✅ Unified markets router loaded")
except ImportError as e:
    logger.warning(f"⚠️ Could not load unified markets router: {e}")

try:
    from app.api.unified_events import router as unified_events_router
    app.include_router(unified_events_router, prefix="/unified", tags=["unified-events"])
    logger.info("✅ Unified events router loaded")
except ImportError as e:
    logger.warning(f"⚠️ Could not load unified events router: {e}")

try:
    from app.api.leaderboard import router as leaderboard_router
    app.include_router(leaderboard_router, prefix="", tags=["leaderboard"])
    logger.info("✅ Leaderboard router loaded")
except ImportError as e:
    logger.warning(f"⚠️ Could not load leaderboard router: {e}")

try:
    from app.api.leaderboard_db import router as leaderboard_db_router
    app.include_router(leaderboard_db_router, prefix="", tags=["leaderboard-db"])
    logger.info("✅ Leaderboard DB router loaded")
except ImportError as e:
    logger.warning(f"⚠️ Could not load leaderboard-db router: {e}")

try:
    from app.api.leaderboard_enriched import router as leaderboard_enriched_router
    app.include_router(leaderboard_enriched_router, prefix="", tags=["leaderboard-enriched"])
    logger.info("✅ Leaderboard Enriched router loaded")
except ImportError as e:
    logger.warning(f"⚠️ Could not load leaderboard-enriched router: {e}")

try:
    from app.api.arbitrage import router as arbitrage_router
    app.include_router(arbitrage_router, prefix="/arbitrage", tags=["arbitrage"])
    logger.info("✅ Arbitrage router loaded")
except ImportError as e:
    logger.warning(f"⚠️ Could not load arbitrage router: {e}")

try:
    from app.api.arbitrage_db import router as arbitrage_db_router
    app.include_router(arbitrage_db_router, prefix="/arbitrage", tags=["arbitrage-db"])
    logger.info("✅ Arbitrage DB router loaded")
except ImportError as e:
    logger.warning(f"⚠️ Could not load arbitrage-db router: {e}")

try:
    from app.api.cross_venue import router as cross_venue_router
    app.include_router(cross_venue_router, prefix="", tags=["cross-venue"])
    logger.info("✅ Cross-venue comparison router loaded")
except ImportError as e:
    logger.warning(f"⚠️ Could not load cross-venue router: {e}")

try:
    from app.api.cross_venue_events import router as cross_venue_events_router
    app.include_router(cross_venue_events_router, prefix="", tags=["cross-venue-events"])
    logger.info("✅ Cross-venue EVENTS router loaded")
except ImportError as e:
    logger.warning(f"⚠️ Could not load cross-venue-events router: {e}")

try:
    from app.api.cross_venue_db import router as cross_venue_db_router
    app.include_router(cross_venue_db_router, prefix="", tags=["cross-venue-db"])
    logger.info("✅ Cross-venue DB router loaded")
except ImportError as e:
    logger.warning(f"⚠️ Could not load cross-venue-db router: {e}")

try:
    from app.api.alerts import router as alerts_router
    app.include_router(alerts_router, prefix="/alerts", tags=["alerts"])
    logger.info("✅ Alerts router loaded")
except ImportError as e:
    logger.warning(f"⚠️ Could not load alerts router: {e}")

try:
    from app.api.market_test import router as market_test_router
    app.include_router(market_test_router, prefix="/market-test", tags=["market-test"])
    logger.info("✅ Market test router loaded")
except ImportError as e:
    logger.warning(f"⚠️ Could not load market test router: {e}")

# Legacy events (API-based) - moved to /events-legacy
try:
    from app.api.events import router as events_router
    app.include_router(events_router, prefix="/events-legacy", tags=["events-legacy"])
    logger.info("✅ Events (legacy API-based) router loaded")
except ImportError as e:
    logger.warning(f"⚠️ Could not load events router: {e}")

try:
    from app.api.event_analytics import router as event_analytics_router
    app.include_router(event_analytics_router, prefix="", tags=["event-analytics"])
    logger.info("✅ Event analytics router loaded")
except ImportError as e:
    logger.warning(f"⚠️ Could not load event analytics router: {e}")

# Admin endpoints for batch operations
try:
    from app.api.admin import router as admin_router
    app.include_router(admin_router, prefix="", tags=["admin"])
    logger.info("✅ Admin router loaded")
except ImportError as e:
    logger.warning(f"⚠️ Could not load admin router: {e}")

# Event intelligence endpoints (trades, orderbooks, signals)
try:
    from app.api.event_intelligence import router as event_intelligence_router
    app.include_router(event_intelligence_router, tags=["event-intelligence"])
    logger.info("✅ Event intelligence router loaded")
except ImportError as e:
    logger.warning(f"⚠️ Could not load event intelligence router: {e}")

# Real-time data endpoints (on-demand Dome API)
try:
    from app.api.realtime_data import router as realtime_router
    app.include_router(realtime_router, tags=["realtime"])
    logger.info("✅ Real-time data router loaded (on-demand Dome API)")
except ImportError as e:
    logger.warning(f"⚠️ Could not load real-time data router: {e}")

# Market Intelligence endpoints (on-demand analytics from Dome API)
try:
    from app.api.market_intelligence import router as market_intelligence_router
    app.include_router(market_intelligence_router, tags=["market-intelligence"])
    logger.info("✅ Market Intelligence router loaded (on-demand analytics)")
except ImportError as e:
    logger.warning(f"⚠️ Could not load market intelligence router: {e}")

# Intelligence Dashboard (Direct API aggregation for YC demo)
try:
    from app.api.intelligence_dashboard import router as intelligence_dashboard_router
    app.include_router(intelligence_dashboard_router, prefix="/intelligence", tags=["intelligence"])
    logger.info("✅ Intelligence Dashboard router loaded (Direct API aggregation)")
except ImportError as e:
    logger.warning(f"⚠️ Could not load intelligence dashboard router: {e}")

# Data freshness status (used by header badge on every page)
try:
    from app.api.data_status import router as data_status_router
    app.include_router(data_status_router, prefix="", tags=["system"])
    logger.info("✅ Data status router loaded")
except ImportError as e:
    logger.warning(f"⚠️ Could not load data status router: {e}")


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "name": settings.APP_NAME,
        "version": settings.VERSION,
        "status": "running",
        "mode": "simplified"
    }


@app.get("/health")
async def health_check():
    """
    Production-grade health check endpoint.
    Returns healthy if:
    1. App is running
    2. Database is reachable (optional degraded mode)
    """
    health_status = {
        "status": "healthy",
        "service": settings.APP_NAME,
        "version": settings.VERSION,
        "checks": {}
    }
    
    # Check database connectivity
    try:
        from app.database.session import test_connection
        if test_connection():
            health_status["checks"]["database"] = "healthy"
        else:
            health_status["checks"]["database"] = "degraded"
            health_status["status"] = "degraded"
    except Exception as e:
        health_status["checks"]["database"] = f"error: {str(e)[:50]}"
        health_status["status"] = "degraded"
    
    # Always return 200 unless critical failure
    # This prevents unnecessary restarts during temporary issues
    return health_status


@app.get("/health/ready")
async def readiness_check():
    """
    Readiness probe - returns 200 when DB is reachable.
    """
    try:
        from app.database.session import test_connection
        if test_connection():
            return {"ready": True, "database": "ok"}
        from fastapi import Response
        return Response(status_code=503, content='{"ready": false}')
    except Exception as e:
        from fastapi import Response
        return Response(status_code=503, content=f'{{"ready": false, "error": "{str(e)[:50]}"}}')


@app.get("/health/live")
async def liveness_check():
    """
    Liveness probe - simple check that app is running.
    Returns 200 if the process is alive.
    """
    return {"alive": True}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8001,
        reload=True
    )
