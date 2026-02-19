"""
Utility functions for hashing and content deduplication.
"""
import hashlib
import json
from typing import Any


def compute_content_hash(
    endpoint_id: str,
    request_params: dict[str, Any],
    response_body: dict[str, Any] | list[Any],
    primary_keys: list[str] | None = None,
) -> str:
    """
    Compute a SHA-256 hash for content deduplication.
    
    The hash is based on:
    1. Endpoint ID
    2. Request parameters (sorted)
    3. Response primary keys if available, otherwise full body
    
    Args:
        endpoint_id: The endpoint identifier
        request_params: Request parameters used
        response_body: The response JSON body
        primary_keys: Optional list of primary key fields to extract
        
    Returns:
        64-character hex string (SHA-256 hash)
    """
    hash_input = {
        "endpoint_id": endpoint_id,
        "params": _sort_dict(request_params),
    }
    
    # If primary keys specified, extract only those for hashing
    if primary_keys and isinstance(response_body, dict):
        hash_input["keys"] = {k: response_body.get(k) for k in primary_keys}
    elif primary_keys and isinstance(response_body, list):
        # For list responses, extract keys from each item
        hash_input["keys"] = [
            {k: item.get(k) for k in primary_keys if isinstance(item, dict)}
            for item in response_body
        ]
    else:
        # Use full body if no primary keys
        hash_input["body"] = response_body
    
    # Create deterministic JSON string
    json_str = json.dumps(hash_input, sort_keys=True, default=str)
    
    # Compute SHA-256
    return hashlib.sha256(json_str.encode("utf-8")).hexdigest()


def compute_record_hash(record: dict[str, Any], key_fields: list[str] | None = None) -> str:
    """
    Compute a hash for a single record.
    
    Args:
        record: The record dictionary
        key_fields: Optional fields to use for hashing (default: all fields)
        
    Returns:
        64-character hex string (SHA-256 hash)
    """
    if key_fields:
        hash_input = {k: record.get(k) for k in key_fields}
    else:
        hash_input = record
    
    json_str = json.dumps(hash_input, sort_keys=True, default=str)
    return hashlib.sha256(json_str.encode("utf-8")).hexdigest()


def _sort_dict(d: dict[str, Any]) -> dict[str, Any]:
    """Recursively sort a dictionary by keys."""
    result = {}
    for key in sorted(d.keys()):
        value = d[key]
        if isinstance(value, dict):
            result[key] = _sort_dict(value)
        elif isinstance(value, list):
            result[key] = [
                _sort_dict(item) if isinstance(item, dict) else item
                for item in value
            ]
        else:
            result[key] = value
    return result


def generate_run_id() -> str:
    """Generate a unique run ID using UUID4."""
    import uuid
    return str(uuid.uuid4())


def sanitize_headers(headers: dict[str, str]) -> dict[str, str]:
    """
    Sanitize HTTP headers by removing sensitive values.
    
    Args:
        headers: Original headers dictionary
        
    Returns:
        Headers with sensitive values redacted
    """
    sensitive_keys = {
        "authorization",
        "cookie",
        "set-cookie",
        "x-api-key",
        "api-key",
        "bearer",
        "token",
        "secret",
        "password",
        "private",
    }
    
    sanitized = {}
    for key, value in headers.items():
        key_lower = key.lower()
        if any(sensitive in key_lower for sensitive in sensitive_keys):
            sanitized[key] = "[REDACTED]"
        else:
            sanitized[key] = value
    
    return sanitized
