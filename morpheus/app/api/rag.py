import os
import uuid
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.api.auth import require_user
from app.models.user import User
from app.core import rag_engine
from app.config import settings

router = APIRouter(prefix="/api/rag", tags=["rag"])

_documents: dict = {}  # in-memory index: doc_id -> metadata


@router.post("/documents")
async def upload_document(file: UploadFile = File(...), user: User = Depends(require_user)):
    upload_dir = os.path.join(settings.data_dir, "uploads")
    os.makedirs(upload_dir, exist_ok=True)

    doc_id = str(uuid.uuid4())
    filename = file.filename or "document"
    save_path = os.path.join(upload_dir, f"{doc_id}_{filename}")

    content_bytes = await file.read()
    with open(save_path, "wb") as f:
        f.write(content_bytes)

    # Extract text
    text = _extract_text(save_path, filename, content_bytes)

    # Index
    chunks = await rag_engine.add_document(text, metadata={"filename": filename, "user_id": user.id}, doc_id=doc_id)

    _documents[doc_id] = {
        "id": doc_id,
        "filename": filename,
        "size": len(content_bytes),
        "chunks": chunks,
        "user_id": user.id,
    }
    return _documents[doc_id]


@router.get("/documents")
async def list_documents(user: User = Depends(require_user)):
    return [d for d in _documents.values() if d.get("user_id") == user.id]


@router.delete("/documents/{doc_id}")
async def delete_document(doc_id: str, user: User = Depends(require_user)):
    if doc_id not in _documents or _documents[doc_id].get("user_id") != user.id:
        raise HTTPException(404, "Document not found")
    await rag_engine.delete_document(doc_id)
    del _documents[doc_id]
    return {"ok": True}


@router.post("/query")
async def query_documents(request: Request, user: User = Depends(require_user)):
    body = await request.json()
    query = body.get("query", "")
    n = body.get("n_results", 5)
    if not query:
        raise HTTPException(400, "query required")

    results = await rag_engine.query(query, n_results=n, filter_metadata={"user_id": user.id})
    return {"results": results}


def _extract_text(path: str, filename: str, content: bytes) -> str:
    ext = os.path.splitext(filename)[1].lower()
    try:
        if ext == ".pdf":
            from pypdf import PdfReader
            import io
            reader = PdfReader(io.BytesIO(content))
            return "\n".join(page.extract_text() or "" for page in reader.pages)
        elif ext in (".docx",):
            from docx import Document
            import io
            doc = Document(io.BytesIO(content))
            return "\n".join(p.text for p in doc.paragraphs)
        else:
            return content.decode("utf-8", errors="replace")
    except Exception as e:
        return content.decode("utf-8", errors="replace")
