import json
from fastapi import APIRouter, Depends, Request, HTTPException
from fastapi.responses import StreamingResponse
from app.api.auth import require_user
from app.models.user import User
from app.core import model_manager

router = APIRouter(prefix="/api/cookbook", tags=["cookbook"])


@router.get("/hardware")
async def get_hardware(user: User = Depends(require_user)):
    return model_manager.detect_hardware()


@router.get("/recommendations")
async def get_recommendations(user: User = Depends(require_user)):
    hw = model_manager.detect_hardware()
    return {"hardware": hw, "recommendations": model_manager.recommend_models(hw)}


@router.get("/models")
async def list_models(user: User = Depends(require_user)):
    return await model_manager.list_models()


@router.post("/models/download")
async def download_model(request: Request, user: User = Depends(require_user)):
    body = await request.json()
    model_name = body.get("model", "")
    if not model_name:
        raise HTTPException(400, "model required")

    async def generate():
        async for line in model_manager.stream_pull_model(model_name):
            yield f"data: {json.dumps({'log': line})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


@router.delete("/models/{model_name:path}")
async def delete_model(model_name: str, user: User = Depends(require_user)):
    ok = await model_manager.delete_model(model_name)
    return {"ok": ok}
