import asyncio
import httpx
from app.config import settings


async def search(query: str, num_results: int = 5) -> list[dict]:
    # DuckDuckGo first — free, no key required
    results = await _duckduckgo_search(query, num_results)
    if results:
        return results

    # SearXNG (self-hosted)
    results = await _searxng_search(query, num_results)
    if results:
        return results

    # Brave
    if settings.brave_api_key:
        results = await _brave_search(query, num_results)
        if results:
            return results

    # Tavily
    if settings.tavily_api_key:
        results = await _tavily_search(query, num_results)
        if results:
            return results

    return []


async def _duckduckgo_search(query: str, num_results: int) -> list[dict]:
    try:
        from duckduckgo_search import DDGS

        def _sync():
            with DDGS() as ddgs:
                return list(ddgs.text(query, max_results=num_results))

        raw = await asyncio.to_thread(_sync)
        return [
            {
                "title": r.get("title", ""),
                "url": r.get("href", ""),
                "snippet": r.get("body", ""),
            }
            for r in raw
        ]
    except Exception:
        pass
    return []


async def _searxng_search(query: str, num_results: int) -> list[dict]:
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(
                f"{settings.searxng_url}/search",
                params={"q": query, "format": "json", "language": "en"},
            )
            if r.status_code == 200:
                data = r.json()
                return [
                    {
                        "title": item.get("title", ""),
                        "url": item.get("url", ""),
                        "snippet": item.get("content", ""),
                    }
                    for item in data.get("results", [])[:num_results]
                ]
    except Exception:
        pass
    return []


async def _brave_search(query: str, num_results: int) -> list[dict]:
    try:
        headers = {"Accept": "application/json", "X-Subscription-Token": settings.brave_api_key}
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(
                "https://api.search.brave.com/res/v1/web/search",
                params={"q": query, "count": num_results},
                headers=headers,
            )
            if r.status_code == 200:
                data = r.json()
                return [
                    {
                        "title": item.get("title", ""),
                        "url": item.get("url", ""),
                        "snippet": item.get("description", ""),
                    }
                    for item in data.get("web", {}).get("results", [])[:num_results]
                ]
    except Exception:
        pass
    return []


async def _tavily_search(query: str, num_results: int) -> list[dict]:
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(
                "https://api.tavily.com/search",
                json={"api_key": settings.tavily_api_key, "query": query, "max_results": num_results},
            )
            if r.status_code == 200:
                data = r.json()
                return [
                    {
                        "title": item.get("title", ""),
                        "url": item.get("url", ""),
                        "snippet": item.get("content", ""),
                    }
                    for item in data.get("results", [])[:num_results]
                ]
    except Exception:
        pass
    return []


async def fetch_page(url: str, max_chars: int = 8000) -> str:
    try:
        from bs4 import BeautifulSoup
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            r = await client.get(url, headers={"User-Agent": "Mozilla/5.0 Morpheus/1.0"})
            if r.status_code == 200:
                soup = BeautifulSoup(r.text, "html.parser")
                for tag in soup(["script", "style", "nav", "footer", "header"]):
                    tag.decompose()
                text = soup.get_text(separator="\n", strip=True)
                return text[:max_chars]
    except Exception as e:
        return f"Error: {e}"
    return ""
