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

    # Security
    trusted_proxy_hops: int = 0          # proxies in front of the API that append to X-Forwarded-For
    max_body_bytes: int = 64 * 1024      # no endpoint accepts files, so request bodies stay small
    sensitive_rate_limit_per_minute: int = 30
    login_max_failures: int = 5
    login_lock_minutes: int = 15
    allow_demo_seed: bool = False        # demo accounts use a published password, so seeding production needs an explicit yes

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
