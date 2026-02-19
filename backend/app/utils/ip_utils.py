"""
IP Address Extraction Utilities

Security utilities for extracting client IP addresses from requests,
handling proxy scenarios (DigitalOcean App Platform, Cloudflare, nginx)
"""
from fastapi import Request
import logging

logger = logging.getLogger(__name__)


def get_client_ip(request: Request) -> str:
    """
    Extract the real client IP address from a FastAPI request.
    
    Handles proxy scenarios common in production deployments:
    - DigitalOcean App Platform: X-Forwarded-For
    - Cloudflare: CF-Connecting-IP
    - nginx: X-Real-IP
    - Direct connections: request.client.host
    
    Security Notes:
    - X-Forwarded-For can contain multiple IPs: "client, proxy1, proxy2"
    - We take the leftmost (original client) IP
    - Private IPs (10.x, 172.16.x, 192.168.x) are skipped
    - If no valid IP found, falls back to request.client.host
    
    Args:
        request: FastAPI Request object
        
    Returns:
        Client IP address as string (IPv4 or IPv6)
        
    Examples:
        >>> # Direct connection
        >>> ip = get_client_ip(request)
        >>> # "203.0.113.45"
        
        >>> # Behind DigitalOcean proxy
        >>> # X-Forwarded-For: "203.0.113.45, 10.0.0.1"
        >>> ip = get_client_ip(request)
        >>> # "203.0.113.45" (skips private IP)
    """
    # Priority order for IP headers (based on common proxy setups)
    
    # 1. Cloudflare (if behind Cloudflare CDN)
    if cf_ip := request.headers.get("cf-connecting-ip"):
        logger.debug(f"IP from CF-Connecting-IP: {cf_ip}")
        return cf_ip.strip()
    
    # 2. X-Forwarded-For (most common, used by DigitalOcean App Platform)
    if forwarded_for := request.headers.get("x-forwarded-for"):
        # X-Forwarded-For: "client, proxy1, proxy2"
        # Take the leftmost (original client) IP
        ips = [ip.strip() for ip in forwarded_for.split(",")]
        
        # Skip private IPs (10.x, 172.16.x-172.31.x, 192.168.x, 127.x)
        for ip in ips:
            if ip and not _is_private_ip(ip):
                logger.debug(f"IP from X-Forwarded-For (first public): {ip}")
                return ip
        
        # If all IPs are private, use the first one
        if ips:
            logger.debug(f"IP from X-Forwarded-For (first, all private): {ips[0]}")
            return ips[0]
    
    # 3. X-Real-IP (used by some nginx configurations)
    if real_ip := request.headers.get("x-real-ip"):
        logger.debug(f"IP from X-Real-IP: {real_ip}")
        return real_ip.strip()
    
    # 4. Fallback to direct connection IP
    if request.client and request.client.host:
        logger.debug(f"IP from request.client.host: {request.client.host}")
        return request.client.host
    
    # 5. Last resort fallback (should never happen)
    logger.warning("⚠️ Could not extract client IP from request!")
    return "0.0.0.0"


def _is_private_ip(ip: str) -> bool:
    """
    Check if an IP address is private/internal.
    
    Private IP ranges (RFC 1918):
    - 10.0.0.0/8
    - 172.16.0.0/12
    - 192.168.0.0/16
    - 127.0.0.0/8 (loopback)
    
    Args:
        ip: IP address string
        
    Returns:
        True if IP is private, False if public
    """
    try:
        parts = ip.split(".")
        if len(parts) != 4:
            return False  # Not IPv4, assume public
        
        first = int(parts[0])
        second = int(parts[1])
        
        # 10.x.x.x
        if first == 10:
            return True
        
        # 172.16.x.x - 172.31.x.x
        if first == 172 and 16 <= second <= 31:
            return True
        
        # 192.168.x.x
        if first == 192 and second == 168:
            return True
        
        # 127.x.x.x (loopback)
        if first == 127:
            return True
        
        return False
    except (ValueError, IndexError):
        return False  # Invalid IP format, assume public
