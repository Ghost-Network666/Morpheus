"""
WebSocket broadcast manager for real-time multi-device sync.

Usage — from any API endpoint after a mutation:
    from app.core.sync import broadcast
    await broadcast(user_id, "notes_changed", {"id": note.id})
"""

import json
import asyncio
import logging
from collections import defaultdict
from typing import Any
from fastapi import WebSocket

log = logging.getLogger("morpheus.sync")

# user_id → set of active WebSocket connections
_connections: dict[int, set[WebSocket]] = defaultdict(set)


async def connect(user_id: int, ws: WebSocket):
    await ws.accept()
    _connections[user_id].add(ws)
    log.debug("sync connect user=%s total=%s", user_id, len(_connections[user_id]))


def disconnect(user_id: int, ws: WebSocket):
    _connections[user_id].discard(ws)
    if not _connections[user_id]:
        del _connections[user_id]
    log.debug("sync disconnect user=%s", user_id)


async def broadcast(user_id: int, event_type: str, data: Any = None):
    """Send an event to all WebSocket clients connected as user_id."""
    payload = json.dumps({"type": event_type, "data": data or {}})
    dead: set[WebSocket] = set()
    for ws in list(_connections.get(user_id, [])):
        try:
            await ws.send_text(payload)
        except Exception:
            dead.add(ws)
    for ws in dead:
        _connections[user_id].discard(ws)


def connected_count(user_id: int) -> int:
    return len(_connections.get(user_id, []))
