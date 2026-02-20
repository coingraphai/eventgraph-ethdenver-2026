# =============================================================================
# Data Pipeline — Production Docker Image
# Runs the 5-min delta ingestion scheduler on DigitalOcean App Platform.
# =============================================================================

FROM python:3.12-slim

# Build deps for psycopg2 / asyncpg native extensions
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        libpq-dev \
        curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ── Install Python deps first (better layer caching) ─────────────────────────
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ── Install the predictions_ingest package itself ─────────────────────────────
# This registers the `predictions-ingest` console script defined in pyproject.toml.
COPY pyproject.toml .
COPY predictions_ingest/ ./predictions_ingest/
COPY limitless_ingest/   ./limitless_ingest/
COPY config/             ./config/

RUN pip install --no-cache-dir -e . --no-deps

# ── Non-root user for security ────────────────────────────────────────────────
RUN useradd --no-create-home --shell /bin/false appuser \
    && chown -R appuser:appuser /app
USER appuser

# ── Health probe (DO worker health check) ────────────────────────────────────
# Workers have no HTTP port; DO checks that the process is still running.
# Nothing extra needed — if the process exits, DO restarts it.

# ── Default: run the scheduler (overridden by the PRE_DEPLOY job) ─────────────
CMD ["predictions-ingest", "schedule"]
