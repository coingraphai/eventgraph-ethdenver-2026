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

# Expose port
EXPOSE 8001

# PRODUCTION: Health check with proper timeout
HEALTHCHECK --interval=15s --timeout=10s --start-period=120s --retries=5 \
    CMD curl -f http://localhost:8001/health || exit 1

# PRODUCTION: Run with gunicorn + uvicorn workers for better stability
# - 4 workers for parallelism
# - 120s timeout for slow external API calls  
# - graceful timeout for connection draining
# - access logs for debugging
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001", "--workers", "4", "--timeout-keep-alive", "65", "--limit-concurrency", "100", "--backlog", "2048"]
