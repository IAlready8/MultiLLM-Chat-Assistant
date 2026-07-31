"""
Security and validation utilities for the LLM Manager
"""

import re
from typing import Union
import html

def sanitize_input(text: str) -> str:
    """
    Sanitize user input to prevent injection attacks
    """
    if not isinstance(text, str):
        raise ValueError("Input must be a string")
    
    # Remove potentially dangerous characters/sequences
    sanitized = text.replace('\0', '')  # Null byte removal
    sanitized = html.escape(sanitized)  # HTML escape
    
    # Remove potential command injection patterns
    sanitized = re.sub(r'[;&|$`]', '', sanitized)
    
    return sanitized


def validate_prompt(prompt: str, max_length: int = 10000) -> bool:
    """
    Validate prompt meets security and length requirements
    """
    if not prompt or not isinstance(prompt, str):
        return False
    
    if len(prompt) > max_length:
        return False
    
    # Check for potentially problematic patterns
    dangerous_patterns = [
        r'<script',  # XSS attempts
        r'eval\s*\(',  # Code execution
        r'exec\s*\(',  # Code execution
    ]
    
    for pattern in dangerous_patterns:
        if re.search(pattern, prompt, re.IGNORECASE):
            return False
    
    return True


def validate_model_name(model: str) -> bool:
    """
    Validate model name to prevent path traversal or command injection
    """
    if not model or not isinstance(model, str):
        return False
    
    # Only allow alphanumeric, hyphens, underscores, and dots
    if not re.match(r'^[a-zA-Z0-9._-]+$', model):
        return False
    
    # Prevent path traversal
    if '..' in model or '/' in model or '\\' in model:
        return False
    
    return True


def validate_temperature(temp: Union[float, int]) -> bool:
    """
    Validate temperature is within acceptable range
    """
    try:
        temp_val = float(temp)
        return 0.0 <= temp_val <= 2.0
    except (ValueError, TypeError):
        return False


def validate_max_tokens(max_tokens: Union[int, str]) -> bool:
    """
    Validate max_tokens is within acceptable range
    """
    try:
        tokens = int(max_tokens)
        return 1 <= tokens <= 4096  # Typical upper limit
    except (ValueError, TypeError):
        return False


def validate_provider_type(provider: str) -> bool:
    """
    Validate provider type is one of the allowed values
    """
    allowed_providers = {'openai', 'anthropic', 'google', 'cohere', 'kimi'}
    return provider.lower() in allowed_providers


def scrub_sensitive_info(error_msg: str) -> str:
    """
    Remove potentially sensitive information from error messages
    """
    # Remove potential API keys from error messages
    scrubbed = re.sub(r'sk-[a-zA-Z0-9_-]{32,}', '***REDACTED***', error_msg)
    scrubbed = re.sub(r'api_key=[^&\s]*', 'api_key=***REDACTED***', scrubbed)
    
    # Remove full URLs that might contain sensitive info
    scrubbed = re.sub(r'https?://[^\s\'"<>]*', '***REDACTED***', scrubbed)
    
    return scrubbed
