"""
WebSocket broadcast manager for real-time multi-device sync.

Usage — from any API endpoint after a mutation:
    from app.core.sync import broadcast
    await broadcast(user_id, "notes_changed", {"id": note.id})
"""

import json
import logging
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any
from fastapi import WebSocket

log = logging.getLogger("morpheus.sync")

# user_id → set of active WebSocket connections
_connections: dict[int, set[WebSocket]] = defaultdict(set)

# Offline event queue: events emitted while no clients are connected, replayed on next connect
_offline_queue: dict[int, list[dict]] = defaultdict(list)
_OFFLINE_QUEUE_MAX = 200


async def connect(user_id: int, ws: WebSocket):
    await ws.accept()
    _connections[user_id].add(ws)
    # Drain queued events that arrived while disconnected
    if _offline_queue[user_id]:
        for event in list(_offline_queue[user_id]):
            try:
                await ws.send_text(json.dumps(event))
            except Exception:
                break
        _offline_queue[user_id].clear()
    log.debug("sync connect user=%s total=%s", user_id, len(_connections[user_id]))


def disconnect(user_id: int, ws: WebSocket):
    _connections[user_id].discard(ws)
    if not _connections[user_id]:
        _connections.pop(user_id, None)
    log.debug("sync disconnect user=%s", user_id)


async def broadcast(user_id: int, event_type: str, data: Any = None):
    """Send an event to all WebSocket clients connected as user_id."""
    payload_dict = {
        "type": event_type,
        "data": data or {},
        "ts": datetime.now(timezone.utc).isoformat(),
    }
    payload = json.dumps(payload_dict)
    dead: set[WebSocket] = set()
    for ws in list(_connections.get(user_id, [])):
        try:
            await ws.send_text(payload)
        except Exception:
            dead.add(ws)
    for ws in dead:
        _connections[user_id].discard(ws)

    # Queue for replay if no active connections
    if not _connections.get(user_id):
        _offline_queue[user_id].append(payload_dict)
        if len(_offline_queue[user_id]) > _OFFLINE_QUEUE_MAX:
            _offline_queue[user_id] = _offline_queue[user_id][-_OFFLINE_QUEUE_MAX:]


def connected_count(user_id: int) -> int:
    return len(_connections.get(user_id, []))
