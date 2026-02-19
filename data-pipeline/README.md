# Data Pipeline

This directory contains the complete data ingestion and processing pipeline for prediction markets.

## Structure

```
data-pipeline/
├── limitless_ingest/       # Limitless prediction market data ingestion
├── predictions_ingest/     # Main predictions data ingestion system
├── config/                 # Configuration files
├── scripts/               # Utility scripts
├── migrations/            # Database schema migrations
├── requirements.txt       # Python dependencies
├── pyproject.toml        # Project configuration
├── alembic.ini           # Database migration configuration
└── .env.example          # Environment variables template
```

## Setup

1. Copy `.env.example` to `.env` and configure your environment variables
2. Install dependencies: `pip install -r requirements.txt`
3. Run database migrations: `alembic upgrade head`

## Usage

### Limitless Ingest
```bash
# Run the limitless ingestion CLI
python -m limitless_ingest.cli
```

### Predictions Ingest
```bash
# Run the predictions ingestion CLI
python -m predictions_ingest.cli

# Run the scheduler
python -m predictions_ingest.scheduler
```

### Scripts
- `scripts/fetch_all_prices.py` - Fetch price data for all markets
- `scripts/populate_slugs_fast.py` - Populate slug fields for markets

## Integration

This pipeline can be integrated into your webapp project by:
1. Moving this entire folder into your webapp codebase
2. Ensuring database connection strings match your webapp's database
3. Running the schedulers as background services
4. Using the ingestion modules to keep your data fresh
