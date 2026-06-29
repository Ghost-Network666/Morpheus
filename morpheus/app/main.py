import asyncio
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, WebSocket, Query
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings, load_overrides
from app.database import init_db
from app.core.sync import connect, disconnect


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    os.makedirs(settings.data_dir, exist_ok=True)
    os.makedirs(os.path.join(settings.data_dir, "uploads"), exist_ok=True)
    os.makedirs(os.path.join(settings.data_dir, "backups"), exist_ok=True)
    os.makedirs(os.path.join(settings.data_dir, "ssh"), exist_ok=True)
    await init_db()
    await _ensure_admin_user()
    await _load_system_settings()
    yield


async def _load_system_settings():
    """Pull system-level settings from DB and apply as runtime overrides."""
    import json as _json
    from app.database import AsyncSessionLocal
    from app.models.system_setting import SystemSetting
    from sqlalchemy import select
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(SystemSetting))
        overrides = {}
        for row in result.scalars().all():
            try:
                overrides[row.key] = _json.loads(row.value)
            except Exception:
                overrides[row.key] = row.value
        load_overrides(overrides)


async def _ensure_admin_user():
    from app.database import AsyncSessionLocal
    from app.models.user import User
    from app.api.auth import hash_password
    from sqlalchemy import select
    import secrets

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.username == settings.admin_username))
        user = result.scalar_one_or_none()
        if not user:
            password = settings.admin_password or secrets.token_urlsafe(16)
            user = User(
                username=settings.admin_username,
                password_hash=hash_password(password),
                is_admin=True,
            )
            db.add(user)
            await db.commit()


def create_app() -> FastAPI:
    app = FastAPI(
        title="Morpheus",
        description="Self-hosted AI workspace",
        version="1.0.0",
        lifespan=lifespan,
        docs_url="/api/docs" if settings.app_debug else None,
        redoc_url=None,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Register API routers
    from app.api.auth import router as auth_router
    from app.api.chat import router as chat_router
    from app.api.settings import router as settings_router
    from app.api.connections import router as connections_router

    app.include_router(auth_router)
    app.include_router(chat_router)
    app.include_router(settings_router)
    app.include_router(connections_router)

    if settings.module_terminal:
        from app.api.terminal import router as terminal_router
        app.include_router(terminal_router)

    if settings.module_ssh:
        from app.api.ssh import router as ssh_router
        app.include_router(ssh_router)

    if settings.module_cookbook:
        from app.api.cookbook import router as cookbook_router
        app.include_router(cookbook_router)

    if settings.module_rag:
        from app.api.rag import router as rag_router
        app.include_router(rag_router)

    if settings.module_research:
        from app.api.research import router as research_router
        app.include_router(research_router)

    if settings.module_documents:
        from app.api.documents import router as documents_router
        app.include_router(documents_router)

    if settings.module_email:
        from app.api.email import router as email_router
        app.include_router(email_router)

    if settings.module_notes or settings.module_tasks or settings.module_calendar:
        from app.api.notes_tasks_calendar import notes_router, tasks_router, calendar_router
        if settings.module_notes:
            app.include_router(notes_router)
        if settings.module_tasks:
            app.include_router(tasks_router)
        if settings.module_calendar:
            app.include_router(calendar_router)

    if settings.module_obsidian:
        from app.api.obsidian import router as obsidian_router
        app.include_router(obsidian_router)

    # WebSocket real-time sync
    @app.websocket("/ws/sync")
    async def ws_sync(ws: WebSocket, token: str = Query(default="")):
        user_id = 1  # default when auth is disabled
        if settings.auth_enabled:
            from app.database import AsyncSessionLocal
            from app.models.auth import ApiToken
            from app.api.auth import hash_token, SESSION_COOKIE
            from sqlalchemy import select

            raw_token = token
            if not raw_token:
                cookie = ws.headers.get("cookie", "")
                for part in cookie.split(";"):
                    k, _, v = part.strip().partition("=")
                    if k.strip() == SESSION_COOKIE:
                        raw_token = v.strip()
                        break

            if not raw_token:
                await ws.close(code=4401)
                return

            token_hash = hash_token(raw_token)
            async with AsyncSessionLocal() as db:
                result = await db.execute(
                    select(ApiToken).where(ApiToken.token_hash == token_hash)
                )
                tok = result.scalar_one_or_none()
                if not tok:
                    await ws.close(code=4401)
                    return
                user_id = tok.user_id

        await connect(user_id, ws)
        try:
            while True:
                data = await ws.receive_text()
                if data == "ping":
                    await ws.send_text('{"type":"pong"}')
        except Exception:
            disconnect(user_id, ws)

    # System info
    @app.get("/api/system/info")
    async def system_info():
        from app.utils.tailscale import get_tailscale_url
        tailscale_url = get_tailscale_url(settings.app_port) if settings.tailscale_detect else None
        return {
            "version": "1.0.0",
            "auth_enabled": settings.auth_enabled,
            "default_model": settings.default_model,
            "default_provider": settings.default_provider,
            "tailscale_url": tailscale_url,
            "modules": {
                "terminal": settings.module_terminal,
                "ssh": settings.module_ssh,
                "agent": settings.module_agent,
                "rag": settings.module_rag,
                "email": settings.module_email,
                "calendar": settings.module_calendar,
                "notes": settings.module_notes,
                "tasks": settings.module_tasks,
                "research": settings.module_research,
                "documents": settings.module_documents,
                "cookbook": settings.module_cookbook,
                "connections": settings.module_connections,
                "obsidian": settings.module_obsidian,
            },
        }

    # Serve frontend static files
    static_dir = os.path.join(os.path.dirname(__file__), "static")
    if os.path.isdir(static_dir):
        app.mount("/static", StaticFiles(directory=static_dir), name="static")

        @app.get("/", include_in_schema=False)
        @app.get("/{full_path:path}", include_in_schema=False)
        async def serve_spa(full_path: str = ""):
            if full_path.startswith("api/") or full_path.startswith("ws/"):
                return JSONResponse({"error": "Not found"}, status_code=404)
            index = os.path.join(static_dir, "index.html")
            if os.path.isfile(index):
                return FileResponse(index)
            return JSONResponse({"error": "Frontend not found"}, status_code=404)

    return app


app = create_app()
