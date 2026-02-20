FROM python:3.12-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better layer caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Non-root user for security
RUN useradd --no-create-home --shell /bin/false appuser \
    && chown -R appuser:appuser /app
USER appuser

# DO App Platform injects $PORT; default to 8001 to match http_port in app.yaml
EXPOSE 8001

# PRODUCTION: Health check (DO also does this internally via http_path: /health)
HEALTHCHECK --interval=15s --timeout=10s --start-period=120s --retries=5 \
    CMD curl -f http://localhost:${PORT:-8001}/health || exit 1

# PRODUCTION: gunicorn + UvicornWorker
# - 2 workers: safe for 1 GB RAM (each worker ~200-300 MB)
# - WEB_CONCURRENCY env var lets DO scale workers without a rebuild
# - 120s timeout: covers slow AI/DB calls
# - preload: shares memory between workers (faster startup)
CMD ["sh", "-c", "exec gunicorn main:app -k uvicorn.workers.UvicornWorker -w ${WEB_CONCURRENCY:-2} -b 0.0.0.0:${PORT:-8001} --timeout 120 --graceful-timeout 30 --keep-alive 65 --preload --access-logfile - --error-logfile -"]
