import os
from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    app_name: str = "Atlas Smart Class Scheduler"
    app_env: str = "development"
    log_level: str = "INFO"
    DEBUG: bool = True

    @property
    def debug(self) -> bool:
        """Backward compatibility property."""
        return self.DEBUG

    database_url: str = "postgresql+asyncpg://atlas:atlas_secret@db:5432/atlas_db"

    @model_validator(mode="after")
    def override_db_url_in_docker(self) -> "Settings":
        # If we are running inside a Docker container, we MUST connect to the 'db' service,
        # ignoring any 'localhost' values passed in accidentally from the host's .env file.
        if os.path.exists("/.dockerenv") and "localhost" in self.database_url:
            self.database_url = self.database_url.replace("localhost", "db")
            self.database_url = self.database_url.replace("127.0.0.1", "db")
        return self

    secret_key: str = "change-me-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30

    storage_backend: str = "local"
    gcs_bucket_name: str = ""

    gemini_api_key: str | None = None
    ai_model: str = "gemini-2.5-flash-lite"

    approved_email_domains: str = "atlasuniversity.edu.in"

    keycloak_server_url: str = ""
    keycloak_realm: str = "atlas"
    keycloak_client_id: str = "atlas-backend"
    keycloak_client_secret: str = ""

    # Comma-separated origins for CORS (e.g. http://localhost:3000,https://app.example.com)
    cors_origins: str = "http://localhost:3000,http://localhost:3001,http://127.0.0.1:3000,http://127.0.0.1:3001,http://127.0.0.1:3002,http://127.0.0.1:3003,http://localhost:3002,http://localhost:3003"


settings = Settings()
