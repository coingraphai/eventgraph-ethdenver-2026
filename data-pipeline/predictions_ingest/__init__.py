"""
Predictions Ingest package.
Multi-source prediction market data ingestion system.
"""
from predictions_ingest.config import get_settings, Settings
from predictions_ingest.models import DataSource

__version__ = "2.0.0"
__all__ = ["get_settings", "Settings", "DataSource"]
