import json
import logging
import os
import re

import httpx
from fastapi import APIRouter, Depends, Request, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

logger = logging.getLogger(__name__)

from app.database import get_db
from app.models.settings import UserSetting
from app.models.system_setting import SystemSetting
from app.models.user import User
from app.api.auth import require_user
from app.config import settings as app_settings, set_override

# Mapping from settings key → .env variable name
_ENV_MAP = {
    "ollama_url":         "OLLAMA_URL",
    "openai_api_key":     "OPENAI_API_KEY",
    "anthropic_api_key":  "ANTHROPIC_API_KEY",
    "openai_base_url":    "OPENAI_BASE_URL",
    "default_model":      "DEFAULT_MODEL",
    "default_provider":   "DEFAULT_PROVIDER",
    "searxng_url":        "SEARXNG_URL",
    "brave_api_key":      "BRAVE_API_KEY",
    "tavily_api_key":     "TAVILY_API_KEY",
    "google_pse_key":     "GOOGLE_PSE_KEY",
    "google_pse_cx":      "GOOGLE_PSE_CX",
    "ntfy_url":           "NTFY_URL",
    "ntfy_topic":         "NTFY_TOPIC",
    "slack_webhook":      "SLACK_WEBHOOK",
    "github_token":       "GITHUB_TOKEN",
    "notion_token":       "NOTION_TOKEN",
    "linear_api_key":     "LINEAR_API_KEY",
    "app_port":           "APP_PORT",
    "app_debug":          "APP_DEBUG",
    "chroma_host":        "CHROMA_HOST",
    "chroma_port":        "CHROMA_PORT",
    "chroma_in_process":  "CHROMA_IN_PROCESS",
    "tailscale_detect":   "TAILSCALE_DETECT",
    "module_terminal":    "MODULE_TERMINAL",
    "module_ssh":         "MODULE_SSH",
    "module_agent":       "MODULE_AGENT",
    "module_rag":         "MODULE_RAG",
    "module_email":       "MODULE_EMAIL",
    "module_calendar":    "MODULE_CALENDAR",
    "module_notes":       "MODULE_NOTES",
    "module_tasks":       "MODULE_TASKS",
    "module_research":    "MODULE_RESEARCH",
    "module_documents":   "MODULE_DOCUMENTS",
    "module_cookbook":    "MODULE_COOKBOOK",
    "module_connections": "MODULE_CONNECTIONS",
    "module_obsidian":    "MODULE_OBSIDIAN",
    "memory_source":      "MEMORY_SOURCE",
    "obsidian_vault_path": "OBSIDIAN_VAULT_PATH",
    "app_host":           "APP_HOST",
}


def _write_env(updates: dict):
    """Write updated values into .env, creating it from .env.example if needed."""
    env_path = ".env"
    example_path = ".env.example"

    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            lines = f.readlines()
    elif os.path.exists(example_path):
        with open(example_path, "r", encoding="utf-8") as f:
            lines = f.readlines()
    else:
        lines = []

    existing: dict[str, int] = {}
    for i, line in enumerate(lines):
        m = re.match(r'^([A-Z0-9_]+)\s*=', line)
        if m:
            existing[m.group(1)] = i

    for key, value in updates.items():
        env_var = _ENV_MAP.get(key)
        if not env_var:
            continue
        str_val = str(value).lower() if isinstance(value, bool) else str(value)
        new_line = f"{env_var}={str_val}\n"
        if env_var in existing:
            lines[existing[env_var]] = new_line
        else:
            lines.append(new_line)

    with open(env_path, "w", encoding="utf-8") as f:
        f.writelines(lines)

router = APIRouter(prefix="/api/settings", tags=["settings"])

# Keys that live in the per-user settings table (appearance / UI)
USER_KEYS = {
    "theme", "density", "bg_mode",
}

# Keys that are system-global (stored in system_settings table)
SYSTEM_KEYS = {
    # AI
    "ollama_url":        "ollama_url",
    "openai_api_key":    "openai_api_key",
    "anthropic_api_key": "anthropic_api_key",
    "openai_base_url":   "openai_base_url",
    "default_model":     "default_model",
    "default_provider":  "default_provider",
    # Search
    "searxng_url":       "searxng_url",
    "brave_api_key":     "brave_api_key",
    "tavily_api_key":    "tavily_api_key",
    "google_pse_key":    "google_pse_key",
    "google_pse_cx":     "google_pse_cx",
    # Notifications
    "ntfy_url":          "ntfy_url",
    "ntfy_topic":        "ntfy_topic",
    "slack_webhook":     "slack_webhook",
    # Integrations
    "github_token":      "github_token",
    "notion_token":      "notion_token",
    "linear_api_key":    "linear_api_key",
    # Server
    "app_port":          "app_port",
    "app_debug":         "app_debug",
    # RAG
    "chroma_host":       "chroma_host",
    "chroma_port":       "chroma_port",
    "chroma_in_process": "chroma_in_process",
    # Tailscale
    "tailscale_detect":  "tailscale_detect",
    # Modules
    "module_terminal":   "module_terminal",
    "module_ssh":        "module_ssh",
    "module_agent":      "module_agent",
    "module_rag":        "module_rag",
    "module_email":      "module_email",
    "module_calendar":   "module_calendar",
    "module_notes":      "module_notes",
    "module_tasks":      "module_tasks",
    "module_research":   "module_research",
    "module_documents":  "module_documents",
    "module_cookbook":   "module_cookbook",
    "module_connections": "module_connections",
    "module_obsidian":   "module_obsidian",
    # Memory
    "memory_source":     "memory_source",
    # Obsidian
    "obsidian_vault_path": "obsidian_vault_path",
    # Server host
    "app_host":          "app_host",
}

# Keys whose values are masked in GET responses
SECRET_KEYS = {
    "openai_api_key", "anthropic_api_key", "brave_api_key", "tavily_api_key", "google_pse_key",
    "github_token", "notion_token", "linear_api_key", "slack_webhook",
}


@router.get("")
async def get_settings(db: AsyncSession = Depends(get_db), user: User = Depends(require_user)):
    sys_result = await db.execute(select(SystemSetting))
    sys_db = {r.key: _parse(r.value) for r in sys_result.scalars().all()}

    usr_result = await db.execute(select(UserSetting).where(UserSetting.user_id == user.id))
    usr_db = {r.key: _parse(r.value) for r in usr_result.scalars().all()}

    out = {}
    for key, attr in SYSTEM_KEYS.items():
        val = sys_db.get(key, getattr(app_settings, attr, None))
        if key in SECRET_KEYS and val:
            out[key] = "••••••••"
        else:
            out[key] = val

    for key in USER_KEYS:
        out[key] = usr_db.get(key)

    return out


@router.put("")
async def update_settings(request: Request, db: AsyncSession = Depends(get_db), user: User = Depends(require_user)):
    body = await request.json()

    for key, value in body.items():
        if value == "__clear__":
            if key in SYSTEM_KEYS:
                row = await db.execute(select(SystemSetting).where(SystemSetting.key == key))
                r = row.scalar_one_or_none()
                if r:
                    await db.delete(r)
                set_override(SYSTEM_KEYS[key], None)
            continue

        if value == "" or value is None:
            continue

        if isinstance(value, str) and value.startswith("••"):
            continue

        if key in SYSTEM_KEYS:
            await _upsert_system(db, key, value)
            set_override(SYSTEM_KEYS[key], value)
        elif key in USER_KEYS:
            await _upsert_user(db, user.id, key, value)

    await db.commit()
    sys_updates = {k: v for k, v in body.items() if k in SYSTEM_KEYS and not (isinstance(v, str) and v.startswith("••"))}
    if sys_updates:
        try:
            _write_env(sys_updates)
        except Exception:
            pass
        if any(k in sys_updates for k in ("chroma_host", "chroma_port", "chroma_in_process")):
            from app.core import rag_engine
            rag_engine.reset_client()
    return {"ok": True, "env_written": bool(sys_updates)}


@router.post("/toggle/{module}")
async def toggle_module(module: str, db: AsyncSession = Depends(get_db), user: User = Depends(require_user)):
    key = f"module_{module}" if not module.startswith("module_") else module
    if key not in SYSTEM_KEYS:
        raise HTTPException(400, f"Unknown module: {module}")

    attr = SYSTEM_KEYS[key]
    sys_result = await db.execute(select(SystemSetting).where(SystemSetting.key == key))
    row = sys_result.scalar_one_or_none()
    current = _parse(row.value) if row else getattr(app_settings, attr, True)
    new_val = not current

    await _upsert_system(db, key, new_val)
    set_override(attr, new_val)
    await db.commit()
    return {"module": key, "enabled": new_val}


INTEGRATIONS = {"github", "notion", "linear", "slack"}


@router.post("/integrations/test/{provider}")
async def test_integration(provider: str, user: User = Depends(require_user)):
    """
    Pings the real provider API with the currently-saved credential and
    reports back whether it works. This is a lightweight verification step
    (personal access token / webhook URL), not an OAuth connection — Morpheus
    is a self-hosted single-user app, so there's no OAuth app/redirect URI to
    register these providers against.
    """
    if provider not in INTEGRATIONS:
        raise HTTPException(404, f"Unknown integration: {provider}")

    try:
        if provider == "github":
            return await _test_github()
        if provider == "notion":
            return await _test_notion()
        if provider == "linear":
            return await _test_linear()
        if provider == "slack":
            return await _test_slack()
    except httpx.RequestError as e:
        logger.warning("Integration test failed for %s: %s", provider, e)
        return {"ok": False, "detail": f"Could not reach {provider}: {e}"}


async def _test_github():
    token = app_settings.github_token
    if not token:
        return {"ok": False, "detail": "No GitHub token configured"}
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(
            "https://api.github.com/user",
            headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"},
        )
    if r.status_code == 200:
        data = r.json()
        return {"ok": True, "detail": f"Connected as {data.get('login', 'unknown')}"}
    return {"ok": False, "detail": f"GitHub returned {r.status_code}: {_error_message(r)}"}


async def _test_notion():
    token = app_settings.notion_token
    if not token:
        return {"ok": False, "detail": "No Notion token configured"}
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(
            "https://api.notion.com/v1/users/me",
            headers={"Authorization": f"Bearer {token}", "Notion-Version": "2022-06-28"},
        )
    if r.status_code == 200:
        data = r.json()
        name = data.get("name") or data.get("bot", {}).get("owner", {}).get("type", "workspace")
        return {"ok": True, "detail": f"Connected as {name}"}
    return {"ok": False, "detail": f"Notion returned {r.status_code}: {_error_message(r)}"}


async def _test_linear():
    key = app_settings.linear_api_key
    if not key:
        return {"ok": False, "detail": "No Linear API key configured"}
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.post(
            "https://api.linear.app/graphql",
            headers={"Authorization": key, "Content-Type": "application/json"},
            json={"query": "{ viewer { name email } }"},
        )
    if r.status_code == 200:
        data = r.json()
        if "errors" in data:
            return {"ok": False, "detail": data["errors"][0].get("message", "Linear API error")}
        viewer = data.get("data", {}).get("viewer", {})
        return {"ok": True, "detail": f"Connected as {viewer.get('name', 'unknown')}"}
    return {"ok": False, "detail": f"Linear returned {r.status_code}: {_error_message(r)}"}


async def _test_slack():
    webhook = app_settings.slack_webhook
    if not webhook:
        return {"ok": False, "detail": "No Slack webhook configured"}
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.post(webhook, json={"text": "✅ Morpheus test message — your Slack integration is working."})
    if r.status_code == 200:
        return {"ok": True, "detail": "Test message sent to Slack"}
    return {"ok": False, "detail": f"Slack returned {r.status_code}: {r.text[:200]}"}


def _error_message(response: httpx.Response) -> str:
    try:
        return response.json().get("message", response.text[:200])
    except Exception:
        return response.text[:200]


@router.get("/env-status")
async def env_status(user: User = Depends(require_user)):
    has_env = os.path.exists(".env")
    has_example = os.path.exists(".env.example")
    return {"has_env": has_env, "has_example": has_example}


@router.get("/setup-status")
async def setup_status(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SystemSetting).where(SystemSetting.key == "setup_complete"))
    row = result.scalar_one_or_none()
    done = row and _parse(row.value) is True
    return {"needs_setup": not done}


@router.post("/complete-setup")
async def complete_setup(request: Request, db: AsyncSession = Depends(get_db)):
    body = await request.json()
    saveable = {k: v for k, v in body.items() if k in SYSTEM_KEYS and v not in (None, "", [])}
    for key, value in saveable.items():
        await _upsert_system(db, key, value)
        set_override(SYSTEM_KEYS[key], value)
    await _upsert_system(db, "setup_complete", True)
    await db.commit()
    if saveable:
        try:
            _write_env(saveable)
        except Exception:
            pass
    return {"ok": True}


# ── Helpers ───────────────────────────────────────────────────────────────────
def _parse(v):
    try:
        return json.loads(v)
    except Exception:
        return v


async def _upsert_system(db, key: str, value):
    result = await db.execute(select(SystemSetting).where(SystemSetting.key == key))
    row = result.scalar_one_or_none()
    enc = json.dumps(value)
    if row:
        row.value = enc
    else:
        db.add(SystemSetting(key=key, value=enc))


async def _upsert_user(db, user_id: int, key: str, value):
    result = await db.execute(select(UserSetting).where(UserSetting.user_id == user_id, UserSetting.key == key))
    row = result.scalar_one_or_none()
    enc = json.dumps(value)
    if row:
        row.value = enc
    else:
        db.add(UserSetting(user_id=user_id, key=key, value=enc))
