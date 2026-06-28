import os
import json
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File
from fastapi.responses import FileResponse, StreamingResponse
from app.api.auth import require_user
from app.models.user import User
from app.core.chat_engine import stream_chat
from app.config import settings

router = APIRouter(prefix="/api/documents", tags=["documents"])


def _uploads_dir(user_id: int) -> str:
    d = os.path.join(settings.data_dir, "uploads", str(user_id))
    os.makedirs(d, exist_ok=True)
    return d


@router.get("")
async def list_files(path: str = "", user: User = Depends(require_user)):
    base = _uploads_dir(user.id)
    target = os.path.join(base, path.lstrip("/\\")) if path else base
    if not os.path.exists(target) or not os.path.isdir(target):
        raise HTTPException(404, "Path not found")

    items = []
    for name in sorted(os.listdir(target)):
        full = os.path.join(target, name)
        items.append({
            "name": name,
            "path": os.path.relpath(full, base).replace("\\", "/"),
            "is_dir": os.path.isdir(full),
            "size": os.path.getsize(full) if os.path.isfile(full) else 0,
        })
    return items


@router.post("/upload")
async def upload_file(file: UploadFile = File(...), path: str = "", user: User = Depends(require_user)):
    base = _uploads_dir(user.id)
    target_dir = os.path.join(base, path.lstrip("/\\")) if path else base
    os.makedirs(target_dir, exist_ok=True)

    save_path = os.path.join(target_dir, file.filename)
    content = await file.read()
    with open(save_path, "wb") as f:
        f.write(content)
    return {"name": file.filename, "size": len(content)}


@router.get("/file")
async def get_file(path: str, user: User = Depends(require_user)):
    base = _uploads_dir(user.id)
    full = os.path.join(base, path.lstrip("/\\"))
    if not os.path.isfile(full):
        raise HTTPException(404, "File not found")
    return FileResponse(full)


@router.put("/file")
async def save_file(request: Request, path: str, user: User = Depends(require_user)):
    base = _uploads_dir(user.id)
    full = os.path.join(base, path.lstrip("/\\"))
    body = await request.json()
    content = body.get("content", "")
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "w", encoding="utf-8") as f:
        f.write(content)
    return {"ok": True}


@router.delete("/file")
async def delete_file(path: str, user: User = Depends(require_user)):
    base = _uploads_dir(user.id)
    full = os.path.join(base, path.lstrip("/\\"))
    if not os.path.exists(full):
        raise HTTPException(404, "File not found")
    if os.path.isdir(full):
        import shutil
        shutil.rmtree(full)
    else:
        os.remove(full)
    return {"ok": True}


@router.post("/mkdir")
async def make_dir(request: Request, user: User = Depends(require_user)):
    body = await request.json()
    path = body.get("path", "")
    base = _uploads_dir(user.id)
    full = os.path.join(base, path.lstrip("/\\"))
    os.makedirs(full, exist_ok=True)
    return {"ok": True}


@router.post("/ai-suggest")
async def ai_suggest(request: Request, user: User = Depends(require_user)):
    body = await request.json()
    content = body.get("content", "")
    instruction = body.get("instruction", "Improve this text")
    model = body.get("model", settings.default_model)
    provider = body.get("provider", settings.default_provider)

    messages = [{"role": "user", "content": f"{instruction}:\n\n{content}"}]

    async def generate():
        async for chunk in stream_chat(messages, model, provider):
            yield f"data: {json.dumps({'content': chunk})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")
