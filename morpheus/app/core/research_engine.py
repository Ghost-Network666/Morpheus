import asyncio
from typing import AsyncIterator
from app.core import search_engine
from app.core.chat_engine import stream_chat
from app.config import settings


async def run_research(
    topic: str,
    depth: int = 3,
    model: str = None,
    provider: str = None,
) -> AsyncIterator[str]:
    model = model or settings.default_model
    provider = provider or settings.default_provider

    yield f"## Research: {topic}\n\n"
    yield "**Searching the web...**\n\n"

    results = await search_engine.search(topic, num_results=depth * 2)
    if not results:
        yield "> No search results found. DuckDuckGo is used by default — check your internet connection, or connect a search provider in the Connections page.\n"
        return

    yield f"Found **{len(results)}** sources. Reading content...\n\n"

    # Show snippets immediately so the user sees something fast
    yield "### Sources found\n\n"
    for r in results[:depth]:
        title = r.get("title") or r.get("url", "")
        snippet = r.get("snippet", "")
        url = r.get("url", "")
        if snippet:
            yield f"- **[{title}]({url})** — {snippet[:120]}{'…' if len(snippet) > 120 else ''}\n"
        else:
            yield f"- **[{title}]({url})**\n"

    yield "\n---\n\n**Fetching full content...**\n\n"

    pages = []
    for r in results[:depth]:
        url = r.get("url", "")
        title = r.get("title") or url
        snippet = r.get("snippet", "")
        yield f"- Reading: {title}\n"
        content = await search_engine.fetch_page(url, max_chars=4000)
        if content and not content.startswith("Error"):
            pages.append({"title": title, "url": url, "content": content})
        elif snippet:
            # Fall back to snippet if page fetch failed
            pages.append({"title": title, "url": url, "content": snippet})
        await asyncio.sleep(0.1)

    if not pages:
        yield "\n> Could not fetch any page content. Synthesising from snippets...\n\n"
        pages = [
            {"title": r.get("title", ""), "url": r.get("url", ""), "content": r.get("snippet", "")}
            for r in results[:depth]
            if r.get("snippet")
        ]

    yield f"\n---\n\n**Synthesising {len(pages)} sources...**\n\n"

    context = "\n\n---\n\n".join(
        f"Source: {p['title']} ({p['url']})\n\n{p['content']}" for p in pages
    )

    synthesis_prompt = f"""You are a research assistant. Based on the following sources, write a comprehensive, well-structured research report about: {topic}

Include:
1. Executive summary (2-3 sentences)
2. Key findings
3. Important details and data points
4. Different perspectives if applicable
5. Conclusion

Sources:
{context}

Write in well-formatted Markdown. Be thorough but concise."""

    messages = [{"role": "user", "content": synthesis_prompt}]

    yield "---\n\n"

    async for chunk in stream_chat(messages, model, provider):
        yield chunk

    # Source list footer
    source_links = " · ".join(
        f"[{p['title'][:40]}]({p['url']})" for p in pages[:5]
    )
    yield f"\n\n---\n\n*Sources: {source_links}*\n"
