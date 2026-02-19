"""
Client package initialization.
Exports all API clients and client registry.
"""
from predictions_ingest.clients.base import BaseAPIClient, RateLimiter
from predictions_ingest.clients.dome import DomeClient
from predictions_ingest.clients.limitless import LimitlessClient
from predictions_ingest.clients.opiniontrade import OpinionTradeClient
from predictions_ingest.models import DataSource

__all__ = [
    "BaseAPIClient",
    "RateLimiter",
    "DomeClient",
    "LimitlessClient",
    "OpinionTradeClient",
    "get_client",
    "CLIENT_REGISTRY",
]

# Registry mapping data sources to their client classes
CLIENT_REGISTRY: dict[DataSource, type[BaseAPIClient]] = {
    DataSource.POLYMARKET: DomeClient,
    DataSource.KALSHI: DomeClient,
    DataSource.LIMITLESS: LimitlessClient,
    DataSource.OPINIONTRADE: OpinionTradeClient,
}


def get_client(source: DataSource) -> BaseAPIClient:
    """
    Factory function to get the appropriate client for a data source.
    
    Args:
        source: The data source to get a client for
        
    Returns:
        An initialized client instance
        
    Raises:
        ValueError: If no client is registered for the source
    """
    client_class = CLIENT_REGISTRY.get(source)
    if not client_class:
        raise ValueError(f"No client registered for source: {source}")
    
    return client_class()
