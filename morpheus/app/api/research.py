import json
from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from app.api.auth import require_user
from app.models.user import User
from app.core import research_engine
from app.config import settings

router = APIRouter(prefix="/api/research", tags=["research"])


@router.post("/run")
async def run_research(request: Request, user: User = Depends(require_user)):
    body = await request.json()
    topic = body.get("topic", "")
    depth = min(body.get("depth", 3), 10)
    model = body.get("model", settings.default_model)
    provider = body.get("provider", settings.default_provider)

    if not topic:
        from fastapi import HTTPException
        raise HTTPException(400, "topic required")

    async def generate():
        async for chunk in research_engine.run_research(topic, depth, model, provider):
            yield f"data: {json.dumps({'content': chunk})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")
