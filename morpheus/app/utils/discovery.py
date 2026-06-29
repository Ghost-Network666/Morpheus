"""
Auto-discovery of Morpheus server instances.

Sources (in order, all best-effort):
  1. Tailscale local API — devices on the same tailnet
  2. mDNS/Bonjour — LAN scan for _morpheus._tcp.local.
  3. Saved SSH profiles — already have host info
"""

import asyncio
import json
import logging
import socket
import httpx

log = logging.getLogger("morpheus.discovery")


async def discover_servers(timeout: float = 5.0) -> list[dict]:
    """Return a merged, deduplicated list of discovered Morpheus instances."""
    results: list[dict] = []
    seen: set[str] = set()

    async def _add(entries):
        for e in entries:
            key = f"{e.get('host')}:{e.get('port', 7860)}"
            if key not in seen:
                seen.add(key)
                results.append(e)

    tasks = [
        _tailscale_discover(timeout),
        _mdns_discover(timeout),
    ]
    for coro in asyncio.as_completed(tasks):
        try:
            entries = await coro
            await _add(entries)
        except Exception as exc:
            log.debug("discovery source failed: %s", exc)

    return results


# ── Tailscale ──────────────────────────────────────────────────────────────────

async def _tailscale_discover(timeout: float) -> list[dict]:
    """Query Tailscale local daemon for peers, then probe each for Morpheus."""
    results: list[dict] = []
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            # Tailscale local API (available on all platforms)
            r = await client.get(
                "http://localhost/localapi/v0/status",
                headers={"Tailscale-Cap": "66"},
            )
            if r.status_code != 200:
                return results
            data = r.json()
    except Exception:
        try:
            # Fallback: read Tailscale socket on Linux
            async with httpx.AsyncClient(
                transport=httpx.AsyncHTTPTransport(uds="/var/run/tailscale/tailscaled.sock"),
                timeout=timeout,
            ) as client:
                r = await client.get("http://local-tailscaled.sock/localapi/v0/status")
                data = r.json()
        except Exception:
            return results

    peers = data.get("Peer", {})
    probe_tasks = [
        _probe_morpheus(info.get("DNSName", "").rstrip("."), source="tailscale")
        for info in peers.values()
        if info.get("Online")
    ]
    probed = await asyncio.gather(*probe_tasks, return_exceptions=True)
    return [p for p in probed if isinstance(p, dict)]


# ── mDNS ───────────────────────────────────────────────────────────────────────

async def _mdns_discover(timeout: float) -> list[dict]:
    """Browse LAN for _morpheus._tcp.local. services."""
    results: list[dict] = []
    try:
        from zeroconf import ServiceBrowser, Zeroconf
        from zeroconf.asyncio import AsyncZeroconf

        found: list[dict] = []

        class _Handler:
            def add_service(self, zc, type_, name):
                info = zc.get_service_info(type_, name)
                if info:
                    host = socket.inet_ntoa(info.addresses[0]) if info.addresses else None
                    if host:
                        found.append({"host": host, "port": info.port or 7860, "name": name, "source": "mdns"})

            def remove_service(self, *_): pass
            def update_service(self, *_): pass

        azc = AsyncZeroconf()
        browser = ServiceBrowser(azc.zeroconf, "_morpheus._tcp.local.", _Handler())
        await asyncio.sleep(min(timeout, 3))
        await azc.async_close()
        results = found
    except ImportError:
        log.debug("zeroconf not installed — mDNS discovery skipped")
    except Exception as exc:
        log.debug("mDNS error: %s", exc)
    return results


# ── Probe ─────────────────────────────────────────────────────────────────────

async def _probe_morpheus(host: str, port: int = 7860, source: str = "unknown") -> dict | None:
    """Return server info dict if host:port responds as a Morpheus instance."""
    if not host:
        return None
    try:
        async with httpx.AsyncClient(timeout=3) as client:
            r = await client.get(f"http://{host}:{port}/api/system/info")
            if r.status_code == 200:
                info = r.json()
                return {
                    "host": host,
                    "port": port,
                    "source": source,
                    "version": info.get("version", "?"),
                    "url": f"http://{host}:{port}",
                }
    except Exception:
        pass
    return None
