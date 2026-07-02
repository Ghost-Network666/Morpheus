import json
import logging
from typing import AsyncIterator, Optional

import httpx
from anthropic import AsyncAnthropic
from anthropic import APIConnectionError as AnthropicConnectionError
from anthropic import APIStatusError as AnthropicStatusError
from openai import AsyncOpenAI
from openai import APIConnectionError as OpenAIConnectionError
from openai import APIStatusError as OpenAIStatusError

from app.config import settings

logger = logging.getLogger(__name__)

PROVIDERS = {
    "ollama": "ollama",
    "openai": "openai",
    "anthropic": "anthropic",
}

# SDK clients are cheap to construct (no connection is opened until a request
# is made) but we still cache one per provider so keep-alive connections are
# reused across requests instead of reconnecting every message.
_openai_client: Optional[AsyncOpenAI] = None
_openai_client_key: Optional[tuple[str, str]] = None
_anthropic_client: Optional[AsyncAnthropic] = None
_anthropic_client_key: Optional[str] = None


def _get_openai_client() -> Optional[AsyncOpenAI]:
    global _openai_client, _openai_client_key
    if not settings.openai_api_key:
        return None
    base_url = settings.openai_base_url or None
    key = (settings.openai_api_key, base_url or "")
    if _openai_client is None or _openai_client_key != key:
        _openai_client = AsyncOpenAI(api_key=settings.openai_api_key, base_url=base_url)
        _openai_client_key = key
    return _openai_client


def _get_anthropic_client() -> Optional[AsyncAnthropic]:
    global _anthropic_client, _anthropic_client_key
    if not settings.anthropic_api_key:
        return None
    if _anthropic_client is None or _anthropic_client_key != settings.anthropic_api_key:
        _anthropic_client = AsyncAnthropic(api_key=settings.anthropic_api_key)
        _anthropic_client_key = settings.anthropic_api_key
    return _anthropic_client


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
        yield f"[Error: Unknown provider: {provider}]"


async def _stream_ollama(messages, model, temperature, max_tokens) -> AsyncIterator[str]:
    # Ollama's native /api/chat endpoint (not an OpenAI/Anthropic API — no
    # official Ollama Python SDK is used elsewhere in this codebase either,
    # so this stays on httpx for consistency with model_manager.py).
    url = f"{settings.ollama_url}/api/chat"
    payload = {
        "model": model,
        "messages": messages,
        "stream": True,
        "options": {"temperature": temperature, "num_predict": max_tokens},
    }
    try:
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
                    except json.JSONDecodeError:
                        continue
                    content = data.get("message", {}).get("content", "")
                    if content:
                        yield content
                    if data.get("done"):
                        break
    except httpx.RequestError as e:
        logger.error("Ollama request failed: %s", e)
        yield f"[Error: could not reach Ollama at {settings.ollama_url}]"


async def _stream_openai(messages, model, temperature, max_tokens) -> AsyncIterator[str]:
    client = _get_openai_client()
    if client is None:
        yield "[Error: OpenAI API key not configured]"
        return

    try:
        stream = await client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
            stream=True,
        )
        async for chunk in stream:
            if not chunk.choices:
                continue
            delta = chunk.choices[0].delta
            if delta and delta.content:
                yield delta.content
    except OpenAIStatusError as e:
        logger.error("OpenAI API error: %s", e)
        yield f"[Error: OpenAI returned {e.status_code}]"
    except OpenAIConnectionError as e:
        logger.error("OpenAI connection failed: %s", e)
        yield "[Error: could not reach OpenAI]"


async def _stream_anthropic(messages, model, temperature, max_tokens) -> AsyncIterator[str]:
    client = _get_anthropic_client()
    if client is None:
        yield "[Error: Anthropic API key not configured]"
        return

    system_msg = ""
    filtered = []
    for m in messages:
        if m["role"] == "system":
            system_msg = m["content"]
        else:
            filtered.append(m)

    try:
        async with client.messages.stream(
            model=model,
            messages=filtered,
            system=system_msg or None,
            max_tokens=max_tokens,
            temperature=temperature,
        ) as stream:
            async for text in stream.text_stream:
                yield text
    except AnthropicStatusError as e:
        logger.error("Anthropic API error: %s", e)
        yield f"[Error: Anthropic returned {e.status_code}]"
    except AnthropicConnectionError as e:
        logger.error("Anthropic connection failed: %s", e)
        yield "[Error: could not reach Anthropic]"


async def list_ollama_models() -> list[dict]:
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(f"{settings.ollama_url}/api/tags")
            if r.status_code == 200:
                return r.json().get("models", [])
    except httpx.RequestError as e:
        logger.warning("Could not list Ollama models: %s", e)
    return []
