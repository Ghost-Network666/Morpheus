import asyncio
import json
from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect, Request
from app.api.auth import require_user
from app.models.user import User
from app.core import terminal_manager

router = APIRouter(prefix="/api/terminal", tags=["terminal"])


@router.get("/local")
async def start_local_terminal(
    cols: int = 80, rows: int = 24,
    user: User = Depends(require_user),
):
    session_id = await terminal_manager.create_local_session(cols=cols, rows=rows)
    return {"session_id": session_id}


@router.post("/{session_id}/resize")
async def resize_terminal(session_id: str, request: Request, user: User = Depends(require_user)):
    body = await request.json()
    await terminal_manager.resize_session(session_id, body.get("cols", 80), body.get("rows", 24))
    return {"ok": True}


@router.delete("/{session_id}")
async def close_terminal(session_id: str, user: User = Depends(require_user)):
    await terminal_manager.close_session(session_id)
    return {"ok": True}


@router.websocket("/ws/{session_id}")
async def terminal_websocket(websocket: WebSocket, session_id: str):
    await websocket.accept()

    session = terminal_manager.get_session(session_id)
    if not session:
        await websocket.send_text(json.dumps({"error": "Session not found"}))
        await websocket.close()
        return

    if session.ssh_channel:
        await _handle_ssh_ws(websocket, session)
    elif session.pty_proc:
        await _handle_winpty_ws(websocket, session)
    else:
        await _handle_pipe_ws(websocket, session)


# ── Windows ConPTY (winpty) ───────────────────────────────────────────────────

async def _handle_winpty_ws(websocket: WebSocket, session):
    pty = session.pty_proc
    loop = asyncio.get_event_loop()

    async def read_loop():
        """Read from winpty in executor thread, send to browser."""
        while True:
            try:
                data = await loop.run_in_executor(None, _winpty_read, pty)
                if data:
                    await websocket.send_bytes(data)
                else:
                    await asyncio.sleep(0.02)
                if not pty.isalive():
                    break
            except Exception:
                break

    async def write_loop():
        """Receive from browser, write to winpty."""
        while True:
            try:
                msg = await asyncio.wait_for(websocket.receive(), timeout=0.1)
                if "bytes" in msg:
                    await loop.run_in_executor(None, pty.write, msg["bytes"].decode("utf-8", errors="replace"))
                elif "text" in msg:
                    try:
                        obj = json.loads(msg["text"])
                        if obj.get("type") == "resize":
                            await terminal_manager.resize_session(
                                session.id, obj.get("cols", 80), obj.get("rows", 24)
                            )
                        else:
                            await loop.run_in_executor(None, pty.write, msg["text"])
                    except (json.JSONDecodeError, TypeError):
                        await loop.run_in_executor(None, pty.write, msg["text"])
            except asyncio.TimeoutError:
                if not pty.isalive():
                    break
            except WebSocketDisconnect:
                break
            except Exception:
                break

    read_task = asyncio.create_task(read_loop())
    write_task = asyncio.create_task(write_loop())
    done, pending = await asyncio.wait(
        [read_task, write_task], return_when=asyncio.FIRST_COMPLETED
    )
    for t in pending:
        t.cancel()


def _winpty_read(pty) -> bytes:
    """Blocking winpty read — runs in executor."""
    try:
        data = pty.read(4096)
        if data:
            return data.encode("utf-8", errors="replace")
    except EOFError:
        pass
    except Exception:
        pass
    return b""


# ── Unix PTY / Windows pipe fallback ─────────────────────────────────────────

async def _handle_pipe_ws(websocket: WebSocket, session):
    proc = session.process
    if not proc:
        await websocket.close()
        return

    async def read_output():
        try:
            data = await asyncio.wait_for(proc.stdout.read(4096), timeout=0.05)
            if data:
                await websocket.send_bytes(data)
        except asyncio.TimeoutError:
            pass
        except Exception:
            pass

    try:
        while True:
            try:
                msg = await asyncio.wait_for(websocket.receive(), timeout=0.05)
            except asyncio.TimeoutError:
                await read_output()
                if proc.returncode is not None:
                    break
                continue

            if "bytes" in msg:
                if proc.stdin:
                    proc.stdin.write(msg["bytes"])
                    await proc.stdin.drain()
            elif "text" in msg:
                try:
                    obj = json.loads(msg["text"])
                    if obj.get("type") == "resize":
                        await terminal_manager.resize_session(
                            session.id, obj.get("cols", 80), obj.get("rows", 24)
                        )
                except Exception:
                    pass

            await read_output()

    except (WebSocketDisconnect, Exception):
        pass


# ── SSH channel ───────────────────────────────────────────────────────────────

async def _handle_ssh_ws(websocket: WebSocket, session):
    channel = session.ssh_channel
    loop = asyncio.get_event_loop()

    async def read_ssh():
        while channel.recv_ready():
            data = await loop.run_in_executor(None, channel.recv, 4096)
            if data:
                await websocket.send_bytes(data)

    try:
        while True:
            try:
                msg = await asyncio.wait_for(websocket.receive(), timeout=0.05)
            except asyncio.TimeoutError:
                await read_ssh()
                if channel.closed:
                    break
                continue

            if "bytes" in msg:
                await loop.run_in_executor(None, channel.send, msg["bytes"])
            elif "text" in msg:
                try:
                    obj = json.loads(msg["text"])
                    if obj.get("type") == "resize":
                        channel.resize_pty(
                            width=obj.get("cols", 80), height=obj.get("rows", 24)
                        )
                except Exception:
                    pass

            await read_ssh()

    except (WebSocketDisconnect, Exception):
        pass
