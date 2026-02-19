"""
Endpoint definitions and discovery.
"""
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any

import yaml


class PaginationType(Enum):
    """Types of pagination supported."""
    
    NONE = "none"
    PAGE_LIMIT = "page_limit"
    CURSOR = "cursor"
    OFFSET = "offset"


class BackfillStrategy(Enum):
    """Backfill strategies for endpoints."""
    
    NONE = "none"
    SNAPSHOT = "snapshot"
    EXHAUST_PAGES = "exhaust_pages"
    TIME_WINDOWS = "time_windows"
    ITERATE_PARENT = "iterate_parent"


class IncrementalStrategy(Enum):
    """Incremental sync strategies."""
    
    NONE = "none"
    SNAPSHOT = "snapshot"
    TIME_BASED = "time_based"
    CURSOR = "cursor"
    DIFF = "diff"


@dataclass
class PaginationConfig:
    """Pagination configuration for an endpoint."""
    
    type: PaginationType = PaginationType.NONE
    page_param: str = "page"
    limit_param: str = "limit"
    cursor_param: str = "cursor"
    offset_param: str = "offset"
    default_limit: int = 100
    response_data_key: str | None = "data"
    has_more_key: str | None = None
    next_cursor_key: str | None = None
    total_count_key: str | None = None


@dataclass
class EndpointDefinition:
    """Definition of an API endpoint."""
    
    id: str
    path: str
    method: str = "GET"
    description: str = ""
    
    # Authentication
    auth_required: bool = False
    
    # Pagination
    pagination: PaginationConfig = field(default_factory=PaginationConfig)
    
    # Path parameters (for templated paths like /markets/{slug})
    path_params: dict[str, dict[str, Any]] = field(default_factory=dict)
    
    # Query parameters
    query_params: dict[str, dict[str, Any]] = field(default_factory=dict)
    
    # Backfill configuration
    backfill_strategy: BackfillStrategy = BackfillStrategy.SNAPSHOT
    parent_endpoint: str | None = None
    
    # Incremental configuration
    incremental_strategy: IncrementalStrategy = IncrementalStrategy.SNAPSHOT
    incremental_field: str | None = None
    snapshot_interval_seconds: int = 300
    
    # Priority (higher = more important)
    priority: int = 1
    
    # Entity mapping
    entity_type: str = "generic"
    entity_meta: dict[str, Any] = field(default_factory=dict)
    extract_nested: list[str] = field(default_factory=list)
    
    # Flags
    high_frequency: bool = False
    
    def build_url(self, base_url: str, path_values: dict[str, str] | None = None) -> str:
        """
        Build the full URL for this endpoint.
        
        Args:
            base_url: API base URL
            path_values: Values to substitute in path template
            
        Returns:
            Complete URL
        """
        path = self.path
        if path_values:
            for key, value in path_values.items():
                path = path.replace(f"{{{key}}}", str(value))
        
        return f"{base_url.rstrip('/')}{path}"
    
    def requires_parent_data(self) -> bool:
        """Check if this endpoint requires data from a parent endpoint."""
        return bool(self.path_params) or self.backfill_strategy == BackfillStrategy.ITERATE_PARENT


class EndpointRegistry:
    """Registry of all discovered endpoints."""
    
    def __init__(self) -> None:
        self._endpoints: dict[str, EndpointDefinition] = {}
        self._by_entity: dict[str, list[str]] = {}
        self._by_priority: list[str] = []
    
    def register(self, endpoint: EndpointDefinition) -> None:
        """Register an endpoint."""
        self._endpoints[endpoint.id] = endpoint
        
        # Index by entity type
        if endpoint.entity_type not in self._by_entity:
            self._by_entity[endpoint.entity_type] = []
        self._by_entity[endpoint.entity_type].append(endpoint.id)
        
        # Rebuild priority list
        self._by_priority = sorted(
            self._endpoints.keys(),
            key=lambda x: self._endpoints[x].priority,
            reverse=True,
        )
    
    def get(self, endpoint_id: str) -> EndpointDefinition | None:
        """Get an endpoint by ID."""
        return self._endpoints.get(endpoint_id)
    
    def get_all(self) -> list[EndpointDefinition]:
        """Get all endpoints."""
        return list(self._endpoints.values())
    
    def get_by_priority(self) -> list[EndpointDefinition]:
        """Get endpoints sorted by priority (highest first)."""
        return [self._endpoints[eid] for eid in self._by_priority]
    
    def get_by_entity(self, entity_type: str) -> list[EndpointDefinition]:
        """Get endpoints for a specific entity type."""
        return [
            self._endpoints[eid]
            for eid in self._by_entity.get(entity_type, [])
        ]
    
    def get_public_endpoints(self) -> list[EndpointDefinition]:
        """Get all public (non-authenticated) endpoints."""
        return [e for e in self._endpoints.values() if not e.auth_required]
    
    def get_backfillable(self) -> list[EndpointDefinition]:
        """Get endpoints that support backfill."""
        return [
            e for e in self.get_by_priority()
            if e.backfill_strategy != BackfillStrategy.NONE
            and not e.requires_parent_data()
        ]
    
    def get_dependent_endpoints(self, parent_id: str) -> list[EndpointDefinition]:
        """Get endpoints that depend on a parent endpoint."""
        return [
            e for e in self._endpoints.values()
            if e.parent_endpoint == parent_id
        ]


def load_endpoints_from_yaml(config_path: Path) -> EndpointRegistry:
    """
    Load endpoint definitions from YAML configuration.
    
    Args:
        config_path: Path to endpoints.yaml
        
    Returns:
        Populated endpoint registry
    """
    with open(config_path) as f:
        config = yaml.safe_load(f)
    
    registry = EndpointRegistry()
    
    for endpoint_id, endpoint_config in config.get("endpoints", {}).items():
        # Parse pagination config
        pagination_raw = endpoint_config.get("pagination", "none")
        if isinstance(pagination_raw, str):
            pagination = PaginationConfig(type=PaginationType(pagination_raw))
        elif isinstance(pagination_raw, dict):
            pagination = PaginationConfig(
                type=PaginationType(pagination_raw.get("type", "none")),
                page_param=pagination_raw.get("page_param", "page"),
                limit_param=pagination_raw.get("limit_param", "limit"),
                cursor_param=pagination_raw.get("cursor_param", "cursor"),
                default_limit=pagination_raw.get("default_limit", 100),
                response_data_key=pagination_raw.get("response_data_key", "data"),
                has_more_key=pagination_raw.get("has_more_key"),
                next_cursor_key=pagination_raw.get("next_cursor_key"),
            )
        else:
            pagination = PaginationConfig()
        
        # Parse strategies
        backfill_str = endpoint_config.get("backfill_strategy", "snapshot")
        incremental_str = endpoint_config.get("incremental_strategy", "snapshot")
        
        endpoint = EndpointDefinition(
            id=endpoint_id,
            path=endpoint_config.get("path", f"/{endpoint_id}"),
            method=endpoint_config.get("method", "GET"),
            description=endpoint_config.get("description", ""),
            auth_required=endpoint_config.get("auth_required", False),
            pagination=pagination,
            path_params=endpoint_config.get("path_params", {}),
            query_params=endpoint_config.get("params", {}),
            backfill_strategy=BackfillStrategy(backfill_str),
            parent_endpoint=endpoint_config.get("parent_endpoint"),
            incremental_strategy=IncrementalStrategy(incremental_str),
            incremental_field=endpoint_config.get("incremental_field"),
            snapshot_interval_seconds=endpoint_config.get("snapshot_interval_seconds", 300),
            priority=endpoint_config.get("priority", 1),
            entity_type=endpoint_config.get("entity_type", "generic"),
            entity_meta=endpoint_config.get("entity_meta", {}),
            extract_nested=endpoint_config.get("extract_nested", []),
            high_frequency=endpoint_config.get("high_frequency", False),
        )
        
        registry.register(endpoint)
    
    return registry
