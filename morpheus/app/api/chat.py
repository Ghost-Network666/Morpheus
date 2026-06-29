import json
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from app.database import get_db
from app.models.chat import ChatSession, ChatMessage
from app.models.user import User
from app.api.auth import require_user
from app.core.chat_engine import stream_chat
from app.core.agent_executor import run_agent
from app.config import settings

router = APIRouter(prefix="/api/chat", tags=["chat"])


@router.post("/sessions")
async def create_session(request: Request, db: AsyncSession = Depends(get_db), user: User = Depends(require_user)):
    body = await request.json()
    session = ChatSession(
        user_id=user.id,
        title=body.get("title", "New Chat"),
        mode=body.get("mode", "local"),
        ssh_profile_id=body.get("ssh_profile_id"),
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return {"id": session.id, "title": session.title, "mode": session.mode, "created_at": session.created_at}


@router.get("/sessions")
async def list_sessions(db: AsyncSession = Depends(get_db), user: User = Depends(require_user)):
    result = await db.execute(
        select(ChatSession).where(ChatSession.user_id == user.id).order_by(desc(ChatSession.updated_at)).limit(100)
    )
    sessions = result.scalars().all()
    return [{"id": s.id, "title": s.title, "mode": s.mode, "created_at": s.created_at, "updated_at": s.updated_at} for s in sessions]


@router.get("/sessions/{session_id}")
async def get_session(session_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(require_user)):
    result = await db.execute(select(ChatSession).where(ChatSession.id == session_id, ChatSession.user_id == user.id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(404, "Session not found")

    result = await db.execute(select(ChatMessage).where(ChatMessage.session_id == session_id))
    messages = result.scalars().all()
    return {
        "id": session.id,
        "title": session.title,
        "mode": session.mode,
        "messages": [{"id": m.id, "role": m.role, "content": m.content, "created_at": m.created_at, "model_used": m.model_used} for m in messages],
    }


@router.get("/sessions/{session_id}/messages")
async def list_messages(session_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(require_user)):
    result = await db.execute(select(ChatSession).where(ChatSession.id == session_id, ChatSession.user_id == user.id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(404, "Session not found")
    result = await db.execute(select(ChatMessage).where(ChatMessage.session_id == session_id))
    messages = result.scalars().all()
    return [{"id": m.id, "role": m.role, "content": m.content, "created_at": m.created_at, "model_used": m.model_used} for m in messages]


@router.delete("/sessions/{session_id}")
async def delete_session(session_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(require_user)):
    result = await db.execute(select(ChatSession).where(ChatSession.id == session_id, ChatSession.user_id == user.id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(404, "Session not found")
    await db.delete(session)
    await db.commit()
    return {"ok": True}


@router.post("/sessions/{session_id}/messages")
async def send_message(session_id: int, request: Request, db: AsyncSession = Depends(get_db), user: User = Depends(require_user)):
    result = await db.execute(select(ChatSession).where(ChatSession.id == session_id, ChatSession.user_id == user.id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(404, "Session not found")

    body = await request.json()
    content = body.get("content", "")
    model = body.get("model", settings.default_model)
    provider = body.get("provider", settings.default_provider)
    system_prompt = body.get("system_prompt")

    # Load history
    res = await db.execute(select(ChatMessage).where(ChatMessage.session_id == session_id))
    history = [{"role": m.role, "content": m.content} for m in res.scalars().all()]

    # Save user message
    user_msg = ChatMessage(session_id=session_id, role="user", content=content)
    db.add(user_msg)
    await db.commit()

    # Update session title if first message
    if not history:
        session.title = content[:60]
        await db.commit()

    messages = history + [{"role": "user", "content": content}]

    async def generate():
        full = ""
        async for chunk in stream_chat(messages, model, provider, system_prompt=system_prompt):
            full += chunk
            yield f"data: {json.dumps({'content': chunk})}\n\n"

        # Save assistant message
        from app.database import AsyncSessionLocal
        async with AsyncSessionLocal() as new_db:
            asst_msg = ChatMessage(session_id=session_id, role="assistant", content=full, model_used=model)
            new_db.add(asst_msg)
            sess = await new_db.get(ChatSession, session_id)
            if sess:
                sess.updated_at = datetime.now(timezone.utc)
            await new_db.commit()

        yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


@router.post("/agent")
async def run_agent_endpoint(request: Request, db: AsyncSession = Depends(get_db), user: User = Depends(require_user)):
    body = await request.json()
    message = body.get("message", "")
    model = body.get("model", settings.default_model)
    provider = body.get("provider", settings.default_provider)
    tools = body.get("tools")
    ssh_profile_id = body.get("ssh_profile_id")
    memory_source = body.get("memory_source")

    async def generate():
        async for chunk in run_agent(
            message, model=model, provider=provider, tools=tools,
            ssh_profile_id=ssh_profile_id, memory_source=memory_source
        ):
            yield f"data: {json.dumps({'content': chunk})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


@router.post("/incognito")
async def incognito_chat(request: Request, user: User = Depends(require_user)):
    body = await request.json()
    messages = body.get("messages", [])
    model = body.get("model", settings.default_model)
    provider = body.get("provider", settings.default_provider)
    system_prompt = body.get("system_prompt")

    async def generate():
        async for chunk in stream_chat(messages, model, provider, system_prompt=system_prompt):
            yield f"data: {json.dumps({'content': chunk})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")
