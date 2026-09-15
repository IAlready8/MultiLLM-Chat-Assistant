from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import SecretStr
from typing import Optional

class Settings(BaseSettings):
    """
    Manages all environment variables for the Python service using Pydantic.
    """
    
    # Model Config
    model_config = SettingsConfigDict(
        env_file=".env.local", env_file_encoding="utf-8", extra="ignore"
    )

    # Service
    NODE_ENV: str = "development"
    LOG_LEVEL: str = "INFO"

    # Services
    REDIS_URL: Optional[str] = "redis://localhost:6379"

    # LLM API Keys
    OPENAI_API_KEY: Optional[SecretStr] = None
    ANTHROPIC_API_KEY: Optional[SecretStr] = None
    COHERE_API_KEY: Optional[SecretStr] = None
    GOOGLE_AI_API_KEY: Optional[SecretStr] = None
    MOONSHOT_API_KEY: Optional[SecretStr] = None
    # Add other provider keys as needed

# Load settings once and export
settings = Settings()

print(f"Python Core settings loaded. NODE_ENV: {settings.NODE_ENV}")
