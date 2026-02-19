"""
Limitless Exchange Data Ingestion System

A production-grade data ingestion system for the Limitless Exchange REST API.
"""

__version__ = "1.0.0"
__author__ = "Data Engineering Team"

from limitless_ingest.api.client import APIClient
from limitless_ingest.ingestion.bronze import BronzeWriter
from limitless_ingest.ingestion.silver import SilverNormalizer
from limitless_ingest.database import Database

__all__ = [
    "APIClient",
    "BronzeWriter", 
    "SilverNormalizer",
    "Database",
    "__version__",
]
