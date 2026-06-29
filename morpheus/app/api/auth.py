"""
No authentication — Morpheus is single-owner, access-controlled at the
network level (Tailscale, local LAN, reverse proxy).

This module exists only so other files can keep their `require_user` import.
`require_user` always returns the single owner row from the DB.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.user import User

router = APIRouter()  # no routes


async def get_current_user(db: AsyncSession = Depends(get_db)) -> User:
    result = await db.execute(select(User).limit(1))
    return result.scalar_one_or_none()


async def require_user(db: AsyncSession = Depends(get_db)) -> User:
    return await get_current_user(db)
