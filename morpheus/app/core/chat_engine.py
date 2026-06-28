import json
from typing import AsyncIterator, Optional
import httpx
from app.config import settings


PROVIDERS = {
    "ollama": "ollama",
    "openai": "openai",
    "anthropic": "anthropic",
}


async def stream_chat(
    messages: list[dict],
    model: str,
    provider: str = "ollama",
    system_prompt: Optional[str] = None,
    temperature: float = 0.7,
    max_tokens: int = 4096,
) -> AsyncIterator[str]:
    if system_prompt:
        messages = [{"role": "system", "content": system_prompt}] + messages

    if provider == "ollama":
        async for chunk in _stream_ollama(messages, model, temperature, max_tokens):
            yield chunk
    elif provider == "openai":
        async for chunk in _stream_openai(messages, model, temperature, max_tokens):
            yield chunk
    elif provider == "anthropic":
        async for chunk in _stream_anthropic(messages, model, temperature, max_tokens):
            yield chunk
    else:
        yield f"Unknown provider: {provider}"


async def _stream_ollama(messages, model, temperature, max_tokens) -> AsyncIterator[str]:
    url = f"{settings.ollama_url}/api/chat"
    payload = {
        "model": model,
        "messages": messages,
        "stream": True,
        "options": {"temperature": temperature, "num_predict": max_tokens},
    }
    async with httpx.AsyncClient(timeout=120) as client:
        async with client.stream("POST", url, json=payload) as response:
            if response.status_code != 200:
                yield f"[Error: Ollama returned {response.status_code}]"
                return
            async for line in response.aiter_lines():
                if not line:
                    continue
                try:
                    data = json.loads(line)
                    content = data.get("message", {}).get("content", "")
                    if content:
                        yield content
                    if data.get("done"):
                        break
                except json.JSONDecodeError:
                    continue


async def _stream_openai(messages, model, temperature, max_tokens) -> AsyncIterator[str]:
    if not settings.openai_api_key:
        yield "[Error: OpenAI API key not configured]"
        return

    base_url = settings.openai_base_url or "https://api.openai.com/v1"
    headers = {
        "Authorization": f"Bearer {settings.openai_api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model,
        "messages": messages,
        "stream": True,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    async with httpx.AsyncClient(timeout=120) as client:
        async with client.stream("POST", f"{base_url}/chat/completions", json=payload, headers=headers) as response:
            if response.status_code != 200:
                yield f"[Error: OpenAI returned {response.status_code}]"
                return
            async for line in response.aiter_lines():
                if line.startswith("data: "):
                    data_str = line[6:]
                    if data_str == "[DONE]":
                        break
                    try:
                        data = json.loads(data_str)
                        content = data["choices"][0]["delta"].get("content", "")
                        if content:
                            yield content
                    except (json.JSONDecodeError, KeyError, IndexError):
                        continue


async def _stream_anthropic(messages, model, temperature, max_tokens) -> AsyncIterator[str]:
    if not settings.anthropic_api_key:
        yield "[Error: Anthropic API key not configured]"
        return

    system_msg = ""
    filtered = []
    for m in messages:
        if m["role"] == "system":
            system_msg = m["content"]
        else:
            filtered.append(m)

    headers = {
        "x-api-key": settings.anthropic_api_key,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model,
        "messages": filtered,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "stream": True,
    }
    if system_msg:
        payload["system"] = system_msg

    async with httpx.AsyncClient(timeout=120) as client:
        async with client.stream("POST", "https://api.anthropic.com/v1/messages", json=payload, headers=headers) as response:
            if response.status_code != 200:
                yield f"[Error: Anthropic returned {response.status_code}]"
                return
            async for line in response.aiter_lines():
                if line.startswith("data: "):
                    try:
                        data = json.loads(line[6:])
                        if data.get("type") == "content_block_delta":
                            yield data["delta"].get("text", "")
                    except (json.JSONDecodeError, KeyError):
                        continue


async def list_ollama_models() -> list[dict]:
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(f"{settings.ollama_url}/api/tags")
            if r.status_code == 200:
                return r.json().get("models", [])
    except Exception:
        pass
    return []
