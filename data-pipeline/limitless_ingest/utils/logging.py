"""
Structured logging configuration using structlog.
"""
import logging
import sys
from typing import Any

import structlog
from structlog.types import Processor


def setup_logging(
    level: str = "INFO",
    format_type: str = "json",
    structured: bool = True,
) -> None:
    """
    Configure structured logging for the application.
    
    Args:
        level: Log level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
        format_type: Output format ('json' or 'console')
        structured: Whether to use structured logging
    """
    # Configure standard library logging
    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=getattr(logging, level.upper()),
    )
    
    # Shared processors
    shared_processors: list[Processor] = [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.stdlib.ExtraAdder(),
    ]
    
    if structured:
        shared_processors.extend([
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
        ])
    
    if format_type == "json":
        # JSON format for production
        processors: list[Processor] = [
            *shared_processors,
            structlog.processors.JSONRenderer(),
        ]
    else:
        # Console format for development
        processors = [
            *shared_processors,
            structlog.dev.ConsoleRenderer(colors=True),
        ]
    
    structlog.configure(
        processors=processors,
        wrapper_class=structlog.make_filtering_bound_logger(
            getattr(logging, level.upper())
        ),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )


def get_logger(name: str | None = None) -> structlog.stdlib.BoundLogger:
    """
    Get a structured logger instance.
    
    Args:
        name: Optional logger name (defaults to module name)
        
    Returns:
        Configured structlog logger
    """
    return structlog.get_logger(name)


class LogContext:
    """Context manager for adding temporary log context."""
    
    def __init__(self, **kwargs: Any):
        self.context = kwargs
        self._token = None
    
    def __enter__(self) -> "LogContext":
        self._token = structlog.contextvars.bind_contextvars(**self.context)
        return self
    
    def __exit__(self, *args: Any) -> None:
        if self._token:
            structlog.contextvars.unbind_contextvars(*self.context.keys())


def log_request(
    logger: structlog.stdlib.BoundLogger,
    endpoint_id: str,
    url: str,
    method: str = "GET",
    params: dict[str, Any] | None = None,
) -> None:
    """Log an API request."""
    logger.info(
        "api_request",
        endpoint_id=endpoint_id,
        url=url,
        method=method,
        params=params or {},
    )


def log_response(
    logger: structlog.stdlib.BoundLogger,
    endpoint_id: str,
    status_code: int,
    duration_ms: float,
    record_count: int | None = None,
) -> None:
    """Log an API response."""
    logger.info(
        "api_response",
        endpoint_id=endpoint_id,
        status_code=status_code,
        duration_ms=round(duration_ms, 2),
        record_count=record_count,
    )


def log_ingestion_event(
    logger: structlog.stdlib.BoundLogger,
    event: str,
    run_id: str,
    endpoint_id: str,
    **kwargs: Any,
) -> None:
    """Log an ingestion event."""
    logger.info(
        event,
        run_id=run_id,
        endpoint_id=endpoint_id,
        **kwargs,
    )


def log_error(
    logger: structlog.stdlib.BoundLogger,
    error: Exception,
    context: dict[str, Any] | None = None,
) -> None:
    """Log an error with context."""
    logger.error(
        "error",
        error_type=type(error).__name__,
        error_message=str(error),
        **(context or {}),
        exc_info=True,
    )
