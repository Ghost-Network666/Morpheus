from pydantic_settings import BaseSettings
from pydantic import Field
from typing import Optional, Any
import secrets
import os


class Settings(BaseSettings):
    # Server
    app_host: str = Field("127.0.0.1", env="APP_HOST")
    app_port: int = Field(7860, env="APP_PORT")
    app_debug: bool = Field(False, env="APP_DEBUG")

    # Auth
    auth_enabled: bool = Field(False, env="AUTH_ENABLED")
    secret_key: str = Field(default_factory=lambda: secrets.token_hex(32), env="SECRET_KEY")
    session_expire_days: int = Field(30, env="SESSION_EXPIRE_DAYS")
    admin_username: str = Field("admin", env="ADMIN_USERNAME")
    admin_password: Optional[str] = Field(None, env="ADMIN_PASSWORD")
    trusted_lan: str = Field("127.0.0.1/8,::1", env="TRUSTED_LAN")

    # AI
    ollama_url: str = Field("http://localhost:11434", env="OLLAMA_URL")
    openai_api_key: Optional[str] = Field(None, env="OPENAI_API_KEY")
    anthropic_api_key: Optional[str] = Field(None, env="ANTHROPIC_API_KEY")
    openai_base_url: Optional[str] = Field(None, env="OPENAI_BASE_URL")
    default_model: str = Field("llama3.2:3b", env="DEFAULT_MODEL")
    default_provider: str = Field("ollama", env="DEFAULT_PROVIDER")

    # RAG
    chroma_host: str = Field("localhost", env="CHROMA_HOST")
    chroma_port: int = Field(8000, env="CHROMA_PORT")
    chroma_in_process: bool = Field(True, env="CHROMA_IN_PROCESS")

    # Search
    searxng_url: str = Field("http://localhost:8888", env="SEARXNG_URL")
    brave_api_key: Optional[str] = Field(None, env="BRAVE_API_KEY")
    tavily_api_key: Optional[str] = Field(None, env="TAVILY_API_KEY")
    google_pse_key: Optional[str] = Field(None, env="GOOGLE_PSE_KEY")
    google_pse_cx: Optional[str] = Field(None, env="GOOGLE_PSE_CX")

    # Notifications
    ntfy_url: str = Field("http://localhost:8080", env="NTFY_URL")
    ntfy_topic: str = Field("morpheus", env="NTFY_TOPIC")
    slack_webhook: Optional[str] = Field(None, env="SLACK_WEBHOOK")

    # Integrations
    github_token: Optional[str] = Field(None, env="GITHUB_TOKEN")
    notion_token: Optional[str] = Field(None, env="NOTION_TOKEN")
    linear_api_key: Optional[str] = Field(None, env="LINEAR_API_KEY")

    # Tailscale
    tailscale_detect: bool = Field(True, env="TAILSCALE_DETECT")

    # Encryption
    vault_key: Optional[str] = Field(None, env="VAULT_KEY")

    # Module toggles
    module_terminal: bool = Field(True, env="MODULE_TERMINAL")
    module_ssh: bool = Field(True, env="MODULE_SSH")
    module_agent: bool = Field(True, env="MODULE_AGENT")
    module_rag: bool = Field(True, env="MODULE_RAG")
    module_email: bool = Field(True, env="MODULE_EMAIL")
    module_calendar: bool = Field(True, env="MODULE_CALENDAR")
    module_notes: bool = Field(True, env="MODULE_NOTES")
    module_tasks: bool = Field(True, env="MODULE_TASKS")
    module_research: bool = Field(True, env="MODULE_RESEARCH")
    module_documents: bool = Field(True, env="MODULE_DOCUMENTS")
    module_cookbook: bool = Field(True, env="MODULE_COOKBOOK")
    module_connections: bool = Field(True, env="MODULE_CONNECTIONS")

    # Data directory
    data_dir: str = Field("data", env="DATA_DIR")

    @property
    def database_url(self) -> str:
        return f"sqlite+aiosqlite:///{self.data_dir}/app.db"

    @property
    def database_url_sync(self) -> str:
        return f"sqlite:///{self.data_dir}/app.db"

    @property
    def trusted_cidrs(self) -> list[str]:
        return [c.strip() for c in self.trusted_lan.split(",") if c.strip()]

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}


settings = Settings()

# ── Runtime overrides (loaded from DB on startup, updated on save) ────────────
# Keys here shadow the pydantic settings object without a restart.
_overrides: dict[str, Any] = {}


def get(key: str, default: Any = None) -> Any:
    """Read a setting — DB override first, then env/pydantic default."""
    if key in _overrides:
        return _overrides[key]
    return getattr(settings, key, default)


def set_override(key: str, value: Any):
    """Apply an in-memory override (call after writing to DB)."""
    _overrides[key] = value
    # Also patch the live settings object where possible so existing code
    # that reads settings.X directly gets the updated value
    if hasattr(settings, key):
        try:
            object.__setattr__(settings, key, value)
        except Exception:
            pass


def load_overrides(overrides: dict[str, Any]):
    """Bulk-load overrides (called on startup after DB is ready)."""
    for k, v in overrides.items():
        set_override(k, v)
