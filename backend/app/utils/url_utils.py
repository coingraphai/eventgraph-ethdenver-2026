"""
URL Utilities for Web Research
- Canonicalization for consistent caching
- Validation for security (SSRF prevention)
- Domain allowlist management
"""
import re
import hashlib
import ipaddress
import logging
from typing import Optional, List, Set, Tuple
from urllib.parse import urlparse, urlunparse, parse_qs, urlencode

logger = logging.getLogger(__name__)

# Tracking params to strip for canonicalization
TRACKING_PARAMS = {
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
    'gclid', 'fbclid', 'msclkid', 'dclid', 'twclid', 'li_fat_id',
    'mc_cid', 'mc_eid', 'ref', 'source', 'campaign', '_ga', '_gl',
    'yclid', 'affiliate', 'partner', 'tracking_id'
}

# Default blocked domains (scam, phishing, etc.)
BLOCKED_DOMAINS = {
    'localhost', '127.0.0.1', '0.0.0.0', '::1',
    'example.com', 'test.com', 'fake.com'
}

# Known official crypto project domains (curated allowlist)
# This will be extended dynamically from CoinGecko data
KNOWN_OFFICIAL_DOMAINS = {
    # Major projects
    'bitcoin.org', 'ethereum.org', 'solana.com', 'polygon.technology',
    'avalabs.org', 'avax.network', 'arbitrum.io', 'optimism.io',
    'bnbchain.org', 'binance.org', 'cardano.org', 'polkadot.network',
    'cosmos.network', 'near.org', 'aptos.dev', 'sui.io',
    
    # DeFi protocols
    'uniswap.org', 'aave.com', 'compound.finance', 'curve.fi',
    'makerdao.com', 'lido.fi', 'yearn.fi', 'balancer.fi',
    'sushi.com', 'pancakeswap.finance', '1inch.io', 'dydx.exchange',
    
    # Documentation sites
    'docs.ethereum.org', 'docs.solana.com', 'docs.polygon.technology',
    'docs.uniswap.org', 'docs.aave.com', 'docs.curve.fi',
    
    # Trusted sources
    'github.com', 'medium.com', 'mirror.xyz', 'notion.so',
    'gitbook.io', 'readthedocs.io', 'docs.google.com'
}


def canonicalize_url(url: str) -> str:
    """
    Normalize URL for consistent cache keys.
    
    Steps:
    1. Lowercase scheme and host
    2. Remove trailing slash (unless root)
    3. Remove tracking query params
    4. Sort remaining query params
    5. Remove URL fragments
    
    Args:
        url: Raw URL string
        
    Returns:
        Canonical URL string
    """
    try:
        parsed = urlparse(url.strip())
        
        # Lowercase scheme and netloc
        scheme = parsed.scheme.lower()
        netloc = parsed.netloc.lower()
        
        # Remove www. prefix
        if netloc.startswith('www.'):
            netloc = netloc[4:]
        
        # Normalize path
        path = parsed.path
        if path and path != '/':
            # Remove trailing slash
            path = path.rstrip('/')
        elif not path:
            path = '/'
        
        # Filter and sort query params
        if parsed.query:
            query_params = parse_qs(parsed.query, keep_blank_values=True)
            # Remove tracking params
            filtered_params = {
                k: v for k, v in query_params.items()
                if k.lower() not in TRACKING_PARAMS
            }
            # Sort and rebuild
            if filtered_params:
                sorted_params = sorted(filtered_params.items())
                query = urlencode(sorted_params, doseq=True)
            else:
                query = ''
        else:
            query = ''
        
        # Rebuild URL without fragment
        canonical = urlunparse((scheme, netloc, path, '', query, ''))
        
        return canonical
        
    except Exception as e:
        logger.warning(f"Failed to canonicalize URL '{url}': {e}")
        return url.strip().lower()


def url_hash(url: str) -> str:
    """Generate SHA256 hash of canonical URL for cache keys"""
    canonical = canonicalize_url(url)
    return hashlib.sha256(canonical.encode('utf-8')).hexdigest()


def validate_url(url: str) -> Tuple[bool, str]:
    """
    Validate URL for security (SSRF prevention).
    
    Checks:
    - HTTPS only (no HTTP, file://, ftp://, etc.)
    - No localhost or private IP ranges
    - No blocked domains
    - Valid hostname format
    
    Args:
        url: URL to validate
        
    Returns:
        Tuple of (is_valid, error_message)
    """
    try:
        parsed = urlparse(url.strip())
        
        # Must be HTTPS
        if parsed.scheme.lower() != 'https':
            return False, f"Only HTTPS URLs allowed, got: {parsed.scheme}"
        
        # Must have netloc
        if not parsed.netloc:
            return False, "URL missing hostname"
        
        hostname = parsed.netloc.lower()
        
        # Remove port if present
        if ':' in hostname:
            hostname = hostname.split(':')[0]
        
        # Remove www.
        if hostname.startswith('www.'):
            hostname = hostname[4:]
        
        # Check for blocked domains
        if hostname in BLOCKED_DOMAINS:
            return False, f"Domain '{hostname}' is blocked"
        
        # Check for private IP addresses
        try:
            ip = ipaddress.ip_address(hostname)
            if ip.is_private or ip.is_loopback or ip.is_reserved:
                return False, f"Private/reserved IP addresses not allowed: {hostname}"
        except ValueError:
            # Not an IP address, that's fine
            pass
        
        # Check for suspicious patterns
        if re.search(r'\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}', hostname):
            return False, "IP addresses in URLs not allowed for security"
        
        # Validate hostname format
        if not re.match(r'^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$', hostname):
            return False, f"Invalid hostname format: {hostname}"
        
        return True, ""
        
    except Exception as e:
        return False, f"URL validation error: {str(e)}"


def extract_domain(url: str) -> str:
    """Extract domain from URL"""
    try:
        parsed = urlparse(url.strip())
        hostname = parsed.netloc.lower()
        if ':' in hostname:
            hostname = hostname.split(':')[0]
        if hostname.startswith('www.'):
            hostname = hostname[4:]
        return hostname
    except Exception:
        return ""


def is_official_domain(domain: str, token_domains: Optional[Set[str]] = None) -> bool:
    """
    Check if domain is in allowlist (known official or token-specific).
    
    Args:
        domain: Domain to check
        token_domains: Optional set of token-specific official domains
        
    Returns:
        True if domain is allowed
    """
    domain = domain.lower()
    if domain.startswith('www.'):
        domain = domain[4:]
    
    # Check known official domains
    if domain in KNOWN_OFFICIAL_DOMAINS:
        return True
    
    # Check if subdomain of known domain (e.g., docs.uniswap.org)
    for known in KNOWN_OFFICIAL_DOMAINS:
        if domain.endswith('.' + known):
            return True
    
    # Check token-specific domains
    if token_domains and domain in token_domains:
        return True
    
    return False


def is_docs_url(url: str) -> bool:
    """Check if URL is likely a documentation page"""
    url_lower = url.lower()
    patterns = [
        r'/docs/?', r'/documentation/?', r'/whitepaper',
        r'docs\.', r'developer\.', r'learn\.',
        r'/guides?/?', r'/tutorials?/?', r'/api/?',
        r'/getting-started', r'/overview', r'/introduction'
    ]
    return any(re.search(pattern, url_lower) for pattern in patterns)


def is_tokenomics_url(url: str) -> bool:
    """Check if URL is likely a tokenomics page"""
    url_lower = url.lower()
    patterns = [
        r'/tokenomics', r'/token-economics', r'/economics',
        r'/distribution', r'/allocation', r'/vesting',
        r'/supply', r'/emissions', r'/staking',
        r'/governance', r'/treasury'
    ]
    return any(re.search(pattern, url_lower) for pattern in patterns)


def prioritize_urls(urls: List[str], preferred_types: Optional[List[str]] = None) -> List[str]:
    """
    Sort URLs by priority for scraping.
    
    Priority order:
    1. Tokenomics pages
    2. Documentation pages
    3. Main website
    4. Other pages
    
    Args:
        urls: List of URLs
        preferred_types: Optional list of preferred URL types
        
    Returns:
        Sorted list of URLs
    """
    def priority(url: str) -> int:
        if is_tokenomics_url(url):
            return 0
        if is_docs_url(url):
            return 1
        if re.search(r'/$|/home|/about', url.lower()):
            return 2
        return 3
    
    return sorted(urls, key=priority)


def build_search_urls(token_name: str, token_symbol: str, base_domain: str) -> List[str]:
    """
    Build candidate URLs to search for tokenomics info.
    
    Args:
        token_name: Token name (e.g., "Ethereum")
        token_symbol: Token symbol (e.g., "ETH")
        base_domain: Base domain (e.g., "ethereum.org")
        
    Returns:
        List of candidate URLs to try
    """
    candidates = []
    
    # Clean inputs
    base = base_domain.lower().strip('/')
    if not base.startswith('https://'):
        base = f"https://{base}"
    
    # Common tokenomics page patterns
    paths = [
        '/tokenomics',
        '/token',
        '/economics',
        '/docs/tokenomics',
        '/docs/token-economics',
        '/docs/economics',
        '/whitepaper',
        '/token-economics',
        '/allocation',
        '/distribution',
        '/vesting',
        '/docs',
        '/'
    ]
    
    for path in paths:
        url = f"{base}{path}"
        is_valid, _ = validate_url(url)
        if is_valid:
            candidates.append(url)
    
    return candidates
