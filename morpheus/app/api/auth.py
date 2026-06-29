import secrets
import hashlib
import json
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import bcrypt
import pyotp

from app.database import get_db
from app.models.user import User
from app.models.auth import ApiToken
from app.config import settings

router = APIRouter(prefix="/api/auth", tags=["auth"])

SESSION_COOKIE = "morpheus_session"


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_session_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


async def get_current_user(request: Request, db: AsyncSession = Depends(get_db)) -> Optional[User]:
    if not settings.auth_enabled:
        result = await db.execute(select(User).where(User.username == settings.admin_username))
        user = result.scalar_one_or_none()
        return user

    # Check session cookie
    session_token = request.cookies.get(SESSION_COOKIE)
    if session_token:
        token_hash = hash_token(session_token)
        result = await db.execute(select(ApiToken).where(ApiToken.token_hash == token_hash))
        token_obj = result.scalar_one_or_none()
        if token_obj and (not token_obj.expires_at or token_obj.expires_at > datetime.now(timezone.utc)):
            result = await db.execute(select(User).where(User.id == token_obj.user_id))
            return result.scalar_one_or_none()

    # Check Bearer token
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        bearer = auth_header[7:]
        token_hash = hash_token(bearer)
        result = await db.execute(select(ApiToken).where(ApiToken.token_hash == token_hash))
        token_obj = result.scalar_one_or_none()
        if token_obj and (not token_obj.expires_at or token_obj.expires_at > datetime.now(timezone.utc)):
            result = await db.execute(select(User).where(User.id == token_obj.user_id))
            return result.scalar_one_or_none()

    return None


async def require_user(request: Request, db: AsyncSession = Depends(get_db)) -> User:
    user = await get_current_user(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


@router.post("/login")
async def login(request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    body = await request.json()
    username = body.get("username", "")
    password = body.get("password", "")
    totp_code = body.get("totp_code")

    result = await db.execute(select(User).where(User.username == username))
    user = result.scalar_one_or_none()

    if not user or not user.password_hash or not verify_password(password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if user.totp_secret and not totp_code:
        raise HTTPException(status_code=428, detail="TOTP required")

    if user.totp_secret and totp_code:
        totp = pyotp.TOTP(user.totp_secret)
        if not totp.verify(totp_code):
            raise HTTPException(status_code=401, detail="Invalid TOTP code")

    token = create_session_token()
    token_hash = hash_token(token)
    expires = datetime.now(timezone.utc) + timedelta(days=settings.session_expire_days)

    api_token = ApiToken(
        user_id=user.id,
        name="session",
        token_hash=token_hash,
        scopes=json.dumps(["*"]),
        expires_at=expires,
    )
    db.add(api_token)
    user.last_login = datetime.now(timezone.utc)
    await db.commit()

    response.set_cookie(
        SESSION_COOKIE, token,
        httponly=True, samesite="lax",
        max_age=settings.session_expire_days * 86400,
    )
    return {"ok": True, "username": user.username, "is_admin": user.is_admin}


@router.post("/logout")
async def logout(request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        token_hash = hash_token(token)
        result = await db.execute(select(ApiToken).where(ApiToken.token_hash == token_hash))
        obj = result.scalar_one_or_none()
        if obj:
            await db.delete(obj)
            await db.commit()
    response.delete_cookie(SESSION_COOKIE)
    return {"ok": True}


@router.get("/me")
async def me(user: User = Depends(require_user)):
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "is_admin": user.is_admin,
        "totp_enabled": bool(user.totp_secret),
    }


@router.post("/register")
async def register(request: Request, db: AsyncSession = Depends(get_db)):
    if not settings.auth_enabled:
        raise HTTPException(400, "Auth not enabled")
    body = await request.json()
    username = body.get("username", "").strip()
    password = body.get("password", "")
    if not username or not password:
        raise HTTPException(400, "Username and password required")

    result = await db.execute(select(User).where(User.username == username))
    if result.scalar_one_or_none():
        raise HTTPException(400, "Username taken")

    user = User(username=username, password_hash=hash_password(password))
    db.add(user)
    await db.commit()
    return {"ok": True}


@router.post("/tokens")
async def create_token(request: Request, db: AsyncSession = Depends(get_db), user: User = Depends(require_user)):
    body = await request.json()
    name = body.get("name", "api-token")
    scopes = body.get("scopes", ["*"])
    expires_days = body.get("expires_days")

    raw_token = secrets.token_urlsafe(32)
    token_hash = hash_token(raw_token)
    expires = None
    if expires_days:
        expires = datetime.now(timezone.utc) + timedelta(days=expires_days)

    api_token = ApiToken(
        user_id=user.id,
        name=name,
        token_hash=token_hash,
        scopes=json.dumps(scopes),
        expires_at=expires,
    )
    db.add(api_token)
    await db.commit()
    await db.refresh(api_token)
    return {"id": api_token.id, "token": raw_token, "name": name, "scopes": scopes}


@router.get("/tokens")
async def list_tokens(db: AsyncSession = Depends(get_db), user: User = Depends(require_user)):
    result = await db.execute(select(ApiToken).where(ApiToken.user_id == user.id))
    tokens = result.scalars().all()
    return [{"id": t.id, "name": t.name, "scopes": json.loads(t.scopes), "created_at": t.created_at, "expires_at": t.expires_at} for t in tokens if t.name != "session"]


@router.delete("/tokens/{token_id}")
async def revoke_token(token_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(require_user)):
    result = await db.execute(select(ApiToken).where(ApiToken.id == token_id, ApiToken.user_id == user.id))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(404, "Token not found")
    await db.delete(obj)
    await db.commit()
    return {"ok": True}
