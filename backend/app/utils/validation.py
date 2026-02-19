"""
Validation Utilities
Input validation for blockchain operations
"""
import re
from typing import Optional, Tuple
from decimal import Decimal, InvalidOperation
from web3 import Web3


class ValidationError(Exception):
    """Custom validation error"""
    pass


def validate_ethereum_address(address: str) -> Tuple[bool, Optional[str]]:
    """
    Validate Ethereum address
    
    Args:
        address: Address to validate
    
    Returns:
        Tuple of (is_valid, error_message)
    """
    if not address:
        return False, "Address is required"
    
    if not isinstance(address, str):
        return False, "Address must be a string"
    
    # Check if it's a valid checksum address
    if not Web3.is_address(address):
        return False, "Invalid Ethereum address format"
    
    # Convert to checksum address
    try:
        checksum_address = Web3.to_checksum_address(address)
        return True, None
    except Exception as e:
        return False, f"Invalid address checksum: {str(e)}"


def validate_amount(amount: str, min_amount: float = 0.0, max_amount: Optional[float] = None) -> Tuple[bool, Optional[str], Optional[Decimal]]:
    """
    Validate amount string
    
    Args:
        amount: Amount string to validate
        min_amount: Minimum allowed amount
        max_amount: Maximum allowed amount (optional)
    
    Returns:
        Tuple of (is_valid, error_message, decimal_amount)
    """
    if not amount:
        return False, "Amount is required", None
    
    try:
        decimal_amount = Decimal(str(amount))
    except (InvalidOperation, ValueError):
        return False, "Invalid amount format", None
    
    if decimal_amount <= 0:
        return False, "Amount must be greater than 0", None
    
    if decimal_amount < Decimal(str(min_amount)):
        return False, f"Amount must be at least {min_amount}", None
    
    if max_amount is not None and decimal_amount > Decimal(str(max_amount)):
        return False, f"Amount cannot exceed {max_amount}", None
    
    return True, None, decimal_amount


def validate_token_symbol(symbol: str, supported_tokens: list = None) -> Tuple[bool, Optional[str]]:
    """
    Validate token symbol
    
    Args:
        symbol: Token symbol to validate
        supported_tokens: List of supported token symbols
    
    Returns:
        Tuple of (is_valid, error_message)
    """
    if not symbol:
        return False, "Token symbol is required"
    
    if not isinstance(symbol, str):
        return False, "Token symbol must be a string"
    
    # Normalize to uppercase
    symbol = symbol.upper()
    
    # Check if token is supported
    if supported_tokens and symbol not in supported_tokens:
        return False, f"Token {symbol} not supported. Supported tokens: {', '.join(supported_tokens)}"
    
    return True, None


def validate_transaction_hash(tx_hash: str) -> Tuple[bool, Optional[str]]:
    """
    Validate transaction hash
    
    Args:
        tx_hash: Transaction hash to validate
    
    Returns:
        Tuple of (is_valid, error_message)
    """
    if not tx_hash:
        return False, "Transaction hash is required"
    
    if not isinstance(tx_hash, str):
        return False, "Transaction hash must be a string"
    
    # Check format (0x followed by 64 hex characters)
    if not re.match(r"^0x[a-fA-F0-9]{64}$", tx_hash):
        return False, "Invalid transaction hash format"
    
    return True, None


def check_sufficient_balance(
    current_balance: str,
    required_amount: str,
    gas_estimate: str = "0.001"  # Estimated gas in ETH
) -> Tuple[bool, Optional[str]]:
    """
    Check if balance is sufficient for transaction
    
    Args:
        current_balance: Current balance as string
        required_amount: Required amount as string
        gas_estimate: Estimated gas cost as string
    
    Returns:
        Tuple of (is_sufficient, error_message)
    """
    try:
        balance = Decimal(str(current_balance))
        amount = Decimal(str(required_amount))
        gas = Decimal(str(gas_estimate))
        
        total_required = amount + gas
        
        if balance < total_required:
            return False, f"Insufficient balance. Required: {total_required} (including gas), Available: {balance}"
        
        return True, None
        
    except (InvalidOperation, ValueError) as e:
        return False, f"Error checking balance: {str(e)}"


def sanitize_metadata(metadata: dict) -> dict:
    """
    Sanitize metadata dictionary to prevent injection attacks
    
    Args:
        metadata: Metadata dictionary
    
    Returns:
        Sanitized metadata dictionary
    """
    if not metadata or not isinstance(metadata, dict):
        return {}
    
    sanitized = {}
    for key, value in metadata.items():
        # Only allow basic types
        if isinstance(value, (str, int, float, bool, type(None))):
            # Limit string length
            if isinstance(value, str):
                sanitized[str(key)[:100]] = value[:1000]
            else:
                sanitized[str(key)[:100]] = value
    
    return sanitized


def validate_network(network: str, supported_networks: list = None) -> Tuple[bool, Optional[str]]:
    """
    Validate network name
    
    Args:
        network: Network name to validate
        supported_networks: List of supported networks
    
    Returns:
        Tuple of (is_valid, error_message)
    """
    if not network:
        return False, "Network is required"
    
    if not isinstance(network, str):
        return False, "Network must be a string"
    
    if supported_networks is None:
        supported_networks = ["base-sepolia", "base-mainnet", "ethereum", "polygon"]
    
    if network not in supported_networks:
        return False, f"Network {network} not supported. Supported networks: {', '.join(supported_networks)}"
    
    return True, None
