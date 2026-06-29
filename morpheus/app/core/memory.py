"""
Unified memory retrieval — query ChromaDB (local), Obsidian vault, or both.

Call retrieve() from tools or endpoints; it reads the active memory_source
from settings so callers don't need to know where memories live.
"""

from typing import Literal

MemorySource = Literal["local", "obsidian", "both"]


async def retrieve(query: str, source: MemorySource = "local", n: int = 5) -> list[str]:
    """Return up to n relevant text snippets from the configured source(s)."""
    results: list[str] = []

    if source in ("local", "both"):
        try:
            from app.core import rag_engine
            docs = await rag_engine.query(query, n_results=n)
            results.extend(d["content"] for d in docs if d.get("content"))
        except Exception:
            pass

    if source in ("obsidian", "both"):
        try:
            from app.database import AsyncSessionLocal
            from app.models.obsidian import ObsidianNote
            from sqlalchemy import select, or_
            async with AsyncSessionLocal() as db:
                stmt = (
                    select(ObsidianNote)
                    .where(
                        or_(
                            ObsidianNote.title.ilike(f"%{query}%"),
                            ObsidianNote.content.ilike(f"%{query}%"),
                        )
                    )
                    .limit(n)
                )
                notes = (await db.execute(stmt)).scalars().all()
                for note in notes:
                    preview = (note.content or "")[:800].strip()
                    results.append(f"[Vault note: {note.title}]\n{preview}")
        except Exception:
            pass

    return results[:n]


async def store(content: str, metadata: dict = None) -> bool:
    """Index a piece of text into local ChromaDB memory."""
    try:
        from app.core import rag_engine
        await rag_engine.add_document(content, metadata=metadata)
        return True
    except Exception:
        return False
