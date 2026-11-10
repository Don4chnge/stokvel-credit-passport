"""Application settings. Every secret comes from the environment."""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./stokvel_dev.db"
    secret_key: str = "dev-only-change-me-dev-only-change-me"  # override in every real environment
    access_token_minutes: int = 60 * 8
    cookie_name: str = "scp_session"
    cookie_secure: bool = False
    cors_origins: str = "http://localhost:3000"
    frontend_url: str = "http://localhost:3000"

    # Payments. TEST MODE is the only implemented provider.
    payment_provider: str = "test"
    payment_test_mode: bool = True

    rate_limit_enabled: bool = True
    rate_limit_per_minute: int = 240
    auth_rate_limit_per_minute: int = 20

    environment: str = "development"
    bcrypt_rounds: int = 12
    terms_version: str = "2026-11-draft"

    @property
    def sqlalchemy_url(self) -> str:
        url = self.database_url
        if url.startswith("postgres://"):
            url = "postgresql://" + url[len("postgres://"):]
        if url.startswith("postgresql://"):
            url = "postgresql+psycopg://" + url[len("postgresql://"):]
        return url


@lru_cache
def get_settings() -> Settings:
    return Settings()
