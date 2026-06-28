from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.vault import VaultItem
from app.models.user import User
from app.api.auth import require_user
from app.utils.vault import encrypt, decrypt
from app.utils.backup import create_backup, restore_backup

router = APIRouter(prefix="/api/connections", tags=["connections"])


# ── Vault ────────────────────────────────────────────────────────────────────

@router.get("/vault")
async def list_vault(db: AsyncSession = Depends(get_db), user: User = Depends(require_user)):
    result = await db.execute(select(VaultItem).where(VaultItem.user_id == user.id))
    return [{"id": v.id, "key": v.key, "category": v.category, "updated_at": v.updated_at} for v in result.scalars().all()]


@router.post("/vault")
async def set_vault_item(request: Request, db: AsyncSession = Depends(get_db), user: User = Depends(require_user)):
    body = await request.json()
    key = body["key"]
    value = body["value"]
    category = body.get("category", "general")

    result = await db.execute(select(VaultItem).where(VaultItem.user_id == user.id, VaultItem.key == key))
    item = result.scalar_one_or_none()
    if item:
        item.value_encrypted = encrypt(value)
        item.category = category
    else:
        item = VaultItem(user_id=user.id, key=key, value_encrypted=encrypt(value), category=category)
        db.add(item)
    await db.commit()
    return {"ok": True, "key": key}


@router.get("/vault/{key}")
async def get_vault_item(key: str, db: AsyncSession = Depends(get_db), user: User = Depends(require_user)):
    result = await db.execute(select(VaultItem).where(VaultItem.user_id == user.id, VaultItem.key == key))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(404, "Key not found")
    return {"key": key, "value": decrypt(item.value_encrypted)}


@router.delete("/vault/{key}")
async def delete_vault_item(key: str, db: AsyncSession = Depends(get_db), user: User = Depends(require_user)):
    result = await db.execute(select(VaultItem).where(VaultItem.user_id == user.id, VaultItem.key == key))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(404, "Key not found")
    await db.delete(item)
    await db.commit()
    return {"ok": True}


# ── Backup ───────────────────────────────────────────────────────────────────

@router.post("/backup")
async def backup(user: User = Depends(require_user)):
    if not user.is_admin:
        raise HTTPException(403, "Admin only")
    path = create_backup()
    return {"path": path, "ok": True}


@router.post("/restore")
async def restore(request: Request, user: User = Depends(require_user)):
    if not user.is_admin:
        raise HTTPException(403, "Admin only")
    body = await request.json()
    backup_path = body.get("path", "")
    ok = restore_backup(backup_path)
    return {"ok": ok}
