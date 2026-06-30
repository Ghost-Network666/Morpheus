"""
Obsidian vault integration — read/write markdown files from a local vault directory.

Configure the vault path via OBSIDIAN_VAULT_PATH in .env or Settings.
"""

import re
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query, Request
from sqlalchemy import select, or_

from app.config import settings
from app.database import AsyncSessionLocal
from app.models.obsidian import ObsidianNote
from app.core.sync import broadcast

router = APIRouter(prefix="/api/obsidian", tags=["obsidian"])


def _vault_root() -> Path | None:
    path = settings.obsidian_vault_path
    if not path:
        return None
    p = Path(path).expanduser().resolve()
    return p if p.is_dir() else None


def _safe_path(vault: Path, rel: str) -> Path:
    """Resolve a relative path inside the vault, raising 400 on path traversal."""
    target = (vault / rel).resolve()
    if not str(target).startswith(str(vault)):
        raise HTTPException(400, "Invalid path")
    return target


def _extract_title(content: str, filename: str) -> str:
    m = re.match(r"^#\s+(.+)$", content, re.MULTILINE)
    return m.group(1).strip() if m else Path(filename).stem


def _extract_tags(content: str) -> str | None:
    """Parse YAML frontmatter tags."""
    m = re.match(r"^---\n(.*?)\n---", content, re.DOTALL)
    if not m:
        return None
    fm = m.group(1)
    t = re.search(r"^tags:\s*\[?([^\]\n]+)\]?", fm, re.MULTILINE)
    if not t:
        return None
    return ",".join(tag.strip().strip('"').strip("'") for tag in t.group(1).split(","))


async def _index_vault(vault: Path):
    """Scan vault directory and upsert ObsidianNote rows."""
    async with AsyncSessionLocal() as db:
        md_files = list(vault.rglob("*.md"))
        existing = {
            n.rel_path: n
            for n in (await db.execute(select(ObsidianNote))).scalars().all()
        }
        seen: set[str] = set()

        for fpath in md_files:
            rel = str(fpath.relative_to(vault))
            seen.add(rel)
            try:
                content = fpath.read_text(encoding="utf-8", errors="replace")
                mtime = datetime.fromtimestamp(fpath.stat().st_mtime, tz=timezone.utc)
                title = _extract_title(content, fpath.name)
                tags = _extract_tags(content)
                if rel in existing:
                    note = existing[rel]
                    note.title = title
                    note.tags = tags
                    note.content = content
                    note.modified_at = mtime
                    note.indexed_at = datetime.now(timezone.utc)
                else:
                    db.add(ObsidianNote(
                        rel_path=rel, title=title, tags=tags,
                        content=content, modified_at=mtime,
                    ))
            except Exception:
                continue

        # Remove deleted files from index
        for rel, note in existing.items():
            if rel not in seen:
                await db.delete(note)

        await db.commit()


# ── API ───────────────────────────────────────────────────────────────────────

@router.get("/status")
async def vault_status():
    vault = _vault_root()
    if not vault:
        return {"configured": False, "path": None, "note_count": 0}
    count = sum(1 for _ in vault.rglob("*.md"))
    return {"configured": True, "path": str(vault), "note_count": count}


@router.post("/sync")
async def sync_vault():
    """Re-index the vault. Call after external changes."""
    vault = _vault_root()
    if not vault:
        raise HTTPException(400, "Vault not configured")
    await _index_vault(vault)
    return {"ok": True}


@router.get("/notes")
async def list_notes(q: str = Query(default="", alias="q")):
    vault = _vault_root()
    if not vault:
        raise HTTPException(400, "Vault not configured — set OBSIDIAN_VAULT_PATH")

    async with AsyncSessionLocal() as db:
        if q:
            stmt = select(ObsidianNote).where(
                or_(
                    ObsidianNote.title.ilike(f"%{q}%"),
                    ObsidianNote.content.ilike(f"%{q}%"),
                    ObsidianNote.tags.ilike(f"%{q}%"),
                )
            ).order_by(ObsidianNote.modified_at.desc())
        else:
            stmt = select(ObsidianNote).order_by(ObsidianNote.modified_at.desc())

        notes = (await db.execute(stmt)).scalars().all()

        if not notes:
            # Index on first request if empty
            await _index_vault(vault)
            notes = (await db.execute(stmt)).scalars().all()

    return [
        {
            "path": n.rel_path,
            "title": n.title,
            "tags": n.tags.split(",") if n.tags else [],
            "modified_at": n.modified_at.isoformat() if n.modified_at else None,
        }
        for n in notes
    ]


@router.get("/notes/{path:path}")
async def read_note(path: str):
    vault = _vault_root()
    if not vault:
        raise HTTPException(400, "Vault not configured")
    fpath = _safe_path(vault, path)
    if not fpath.exists() or not fpath.suffix == ".md":
        raise HTTPException(404, "Note not found")
    content = fpath.read_text(encoding="utf-8", errors="replace")
    return {"path": path, "content": content}


@router.put("/notes/{path:path}")
async def write_note(path: str, request: Request):
    vault = _vault_root()
    if not vault:
        raise HTTPException(400, "Vault not configured")
    body = await request.json()
    content = body.get("content", "")
    fpath = _safe_path(vault, path)
    fpath.parent.mkdir(parents=True, exist_ok=True)
    fpath.write_text(content, encoding="utf-8")

    # Update index
    title = _extract_title(content, fpath.name)
    tags = _extract_tags(content)
    mtime = datetime.fromtimestamp(fpath.stat().st_mtime, tz=timezone.utc)
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(ObsidianNote).where(ObsidianNote.rel_path == path))
        note = result.scalar_one_or_none()
        if note:
            note.title = title
            note.tags = tags
            note.content = content
            note.modified_at = mtime
        else:
            db.add(ObsidianNote(rel_path=path, title=title, tags=tags, content=content, modified_at=mtime))
        await db.commit()

    await broadcast(1, "obsidian_changed", {"action": "update", "path": path})
    return {"ok": True, "path": path}


@router.delete("/notes/{path:path}")
async def delete_note(path: str):
    vault = _vault_root()
    if not vault:
        raise HTTPException(400, "Vault not configured")
    fpath = _safe_path(vault, path)
    if not fpath.exists():
        raise HTTPException(404, "Note not found")
    fpath.unlink()

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(ObsidianNote).where(ObsidianNote.rel_path == path))
        note = result.scalar_one_or_none()
        if note:
            await db.delete(note)
            await db.commit()

    await broadcast(1, "obsidian_changed", {"action": "delete", "path": path})
    return {"ok": True}


@router.post("/notes")
async def create_note(request: Request):
    vault = _vault_root()
    if not vault:
        raise HTTPException(400, "Vault not configured")
    body = await request.json()
    title = body.get("title", "Untitled").strip()
    content = body.get("content", f"# {title}\n\n")
    safe_title = re.sub(r'[<>:"/\\|?*]', "-", title)
    rel = f"{safe_title}.md"
    fpath = _safe_path(vault, rel)
    if fpath.exists():
        base = Path(safe_title)
        for i in range(1, 100):
            rel = f"{base} {i}.md"
            fpath = vault / rel
            if not fpath.exists():
                break
    fpath.write_text(content, encoding="utf-8")

    mtime = datetime.fromtimestamp(fpath.stat().st_mtime, tz=timezone.utc)
    async with AsyncSessionLocal() as db:
        note = ObsidianNote(rel_path=rel, title=title, content=content, modified_at=mtime)
        db.add(note)
        await db.commit()

    await broadcast(1, "obsidian_changed", {"action": "create", "path": rel})
    return {"ok": True, "path": rel, "title": title}
