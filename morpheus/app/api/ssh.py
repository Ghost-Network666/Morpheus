from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.ssh import SSHProfile
from app.models.user import User
from app.api.auth import require_user
from app.core import ssh_client
from app.core import terminal_manager
from app.utils.vault import encrypt, decrypt

router = APIRouter(prefix="/api/ssh", tags=["ssh"])

_active_profile: dict[int, int] = {}  # user_id -> profile_id


@router.get("/profiles")
async def list_profiles(db: AsyncSession = Depends(get_db), user: User = Depends(require_user)):
    result = await db.execute(select(SSHProfile).where(SSHProfile.user_id == user.id))
    profiles = result.scalars().all()
    return [_profile_out(p) for p in profiles]


@router.post("/profiles")
async def create_profile(request: Request, db: AsyncSession = Depends(get_db), user: User = Depends(require_user)):
    body = await request.json()
    profile = SSHProfile(
        user_id=user.id,
        label=body.get("label") or body.get("name", ""),
        host=body["host"],
        port=body.get("port", 22),
        username=body["username"],
        auth_type=body.get("auth_type", "password"),
        key_encrypted=encrypt(body["key"]) if body.get("key") else None,
        password_encrypted=encrypt(body["password"]) if body.get("password") else None,
        jump_host=body.get("jump_host"),
    )
    db.add(profile)
    await db.commit()
    await db.refresh(profile)
    return _profile_out(profile)


@router.put("/profiles/{profile_id}")
async def update_profile(profile_id: int, request: Request, db: AsyncSession = Depends(get_db), user: User = Depends(require_user)):
    result = await db.execute(select(SSHProfile).where(SSHProfile.id == profile_id, SSHProfile.user_id == user.id))
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(404, "Profile not found")

    body = await request.json()
    for field in ["label", "host", "username", "auth_type"]:
        if field in body:
            setattr(profile, field, body[field])
    if "port" in body:
        profile.port = int(body["port"])
    if body.get("password"):
        profile.password_encrypted = encrypt(body["password"])
    if body.get("key"):
        profile.key_encrypted = encrypt(body["key"])

    await db.commit()
    return _profile_out(profile)


@router.delete("/profiles/{profile_id}")
async def delete_profile(profile_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(require_user)):
    result = await db.execute(select(SSHProfile).where(SSHProfile.id == profile_id, SSHProfile.user_id == user.id))
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(404, "Profile not found")
    await db.delete(profile)
    await db.commit()
    return {"ok": True}


@router.post("/profiles/{profile_id}/connect")
async def connect_profile(profile_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(require_user)):
    result = await db.execute(select(SSHProfile).where(SSHProfile.id == profile_id, SSHProfile.user_id == user.id))
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(404, "Profile not found")

    try:
        conn = await ssh_client.connect_profile(profile)
        _active_profile[user.id] = profile_id
    except Exception as e:
        raise HTTPException(500, f"Connection failed: {e}")

    return {"ok": True, "connection_id": conn.id}


@router.post("/profiles/{profile_id}/disconnect")
async def disconnect_profile(profile_id: int, user: User = Depends(require_user)):
    await ssh_client.disconnect_profile(profile_id)
    if _active_profile.get(user.id) == profile_id:
        del _active_profile[user.id]
    return {"ok": True}


@router.post("/profiles/{profile_id}/terminal")
async def open_ssh_terminal(profile_id: int, request: Request, db: AsyncSession = Depends(get_db), user: User = Depends(require_user)):
    body = await request.json()
    cols = body.get("cols", 80)
    rows = body.get("rows", 24)

    conn = ssh_client.get_connection(profile_id)
    if not conn:
        result = await db.execute(select(SSHProfile).where(SSHProfile.id == profile_id, SSHProfile.user_id == user.id))
        profile = result.scalar_one_or_none()
        if not profile:
            raise HTTPException(404, "Profile not found")
        try:
            conn = await ssh_client.connect_profile(profile)
        except Exception as e:
            raise HTTPException(500, f"Connection failed: {e}")

    import uuid
    channel = await ssh_client.open_shell_channel(profile_id, cols, rows)
    session_id = str(uuid.uuid4())

    from app.core.terminal_manager import TerminalSession, _sessions
    session = TerminalSession(id=session_id, mode="ssh", ssh_profile_id=profile_id, ssh_channel=channel, cols=cols, rows=rows)
    _sessions[session_id] = session

    return {"session_id": session_id}


@router.post("/quick-connect")
async def quick_connect(request: Request, user: User = Depends(require_user)):
    """Open an SSH terminal session without a saved profile."""
    import uuid
    body = await request.json()
    host     = body.get("host", "")
    port     = int(body.get("port", 22))
    username = body.get("username", "root")
    password = body.get("password")
    key_path = body.get("key_path")
    key_passphrase = body.get("key_passphrase")
    cols     = int(body.get("cols", 80))
    rows     = int(body.get("rows", 24))

    if not host:
        raise HTTPException(400, "host is required")

    try:
        channel = await ssh_client.quick_connect_shell(
            host=host, port=port, username=username,
            password=password, key_path=key_path, key_passphrase=key_passphrase,
            cols=cols, rows=rows,
        )
    except Exception as e:
        raise HTTPException(500, f"SSH connection failed: {e}")

    session_id = str(uuid.uuid4())
    from app.core.terminal_manager import TerminalSession, _sessions
    session = TerminalSession(id=session_id, mode="ssh", ssh_channel=channel, cols=cols, rows=rows)
    _sessions[session_id] = session
    return {"session_id": session_id}


@router.get("/active")
async def get_active(user: User = Depends(require_user)):
    profile_id = _active_profile.get(user.id)
    if not profile_id:
        return {"active": None}
    conn = ssh_client.get_connection(profile_id)
    return {"active": profile_id, "connected": conn is not None}


def _profile_out(p: SSHProfile) -> dict:
    return {
        "id": p.id,
        "label": p.label,
        "host": p.host,
        "port": p.port,
        "username": p.username,
        "auth_type": p.auth_type,
        "jump_host": p.jump_host,
        "created_at": p.created_at,
    }
