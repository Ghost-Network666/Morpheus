"""Remote Morpheus instance management via SSH.

Probe whether a saved SSH profile has Morpheus running, install it via Docker,
and set up an SSH port-forward tunnel so the desktop can reach it.
"""
import asyncio
import socket
import threading
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.ssh import SSHProfile
from app.models.user import User
from app.api.auth import require_user
from app.core import ssh_client

router = APIRouter(prefix="/api/remote", tags=["remote"])

MORPHEUS_PORT = 7860
DOCKER_IMAGE = "ghcr.io/ghost-network666/morpheus:latest"

# Active tunnels: profile_id -> (local_port, thread, server_object)
_tunnels: dict[int, dict] = {}


def _probe_port(host: str, port: int, timeout: float = 3.0) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


@router.get("/{profile_id}/probe")
async def probe_server(
    profile_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_user),
):
    """SSH into a saved profile and check if Morpheus is reachable on port 7860."""
    result = await db.execute(select(SSHProfile).where(SSHProfile.id == profile_id, SSHProfile.user_id == user.id))
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(404, "Profile not found")

    conn = ssh_client.get_connection(profile_id)
    if not conn:
        try:
            conn = await ssh_client.connect_profile(profile)
        except Exception as e:
            raise HTTPException(500, f"SSH connection failed: {e}")

    # Check if Morpheus is running via curl on the remote
    stdout, stderr, rc = await ssh_client.execute_command(
        profile_id,
        f"curl -sf http://localhost:{MORPHEUS_PORT}/api/system/info 2>/dev/null && echo OK || echo NOTRUNNING",
    )
    morpheus_running = "OK" in stdout

    # Also check Docker status
    stdout2, _, _ = await ssh_client.execute_command(
        profile_id,
        "docker ps --filter name=morpheus --format '{{.Names}}' 2>/dev/null || echo NODOCK",
    )
    docker_running = "morpheus" in stdout2.lower()
    docker_available = "NODOCK" not in stdout2

    # Check if tunnel is already active
    tunnel = _tunnels.get(profile_id)
    tunnel_active = False
    local_port = None
    if tunnel:
        if _probe_port("127.0.0.1", tunnel["local_port"]):
            tunnel_active = True
            local_port = tunnel["local_port"]
        else:
            _tunnels.pop(profile_id, None)

    return {
        "profile_id": profile_id,
        "morpheus_running": morpheus_running,
        "docker_running": docker_running,
        "docker_available": docker_available,
        "tunnel_active": tunnel_active,
        "local_port": local_port,
    }


@router.post("/{profile_id}/install")
async def install_morpheus(
    profile_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_user),
):
    """Pull and run Morpheus on the remote server via Docker."""
    result = await db.execute(select(SSHProfile).where(SSHProfile.id == profile_id, SSHProfile.user_id == user.id))
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(404, "Profile not found")

    body = await request.json()
    port = int(body.get("port", MORPHEUS_PORT))
    data_dir = body.get("data_dir", "/opt/morpheus/data")

    conn = ssh_client.get_connection(profile_id)
    if not conn:
        try:
            conn = await ssh_client.connect_profile(profile)
        except Exception as e:
            raise HTTPException(500, f"SSH connection failed: {e}")

    # Stop existing container if any
    await ssh_client.execute_command(profile_id, "docker rm -f morpheus 2>/dev/null || true")

    # Pull image
    _, err, rc = await ssh_client.execute_command(profile_id, f"docker pull {DOCKER_IMAGE}")
    if rc != 0:
        raise HTTPException(500, f"Docker pull failed: {err[:300]}")

    # Run container
    run_cmd = (
        f"docker run -d --name morpheus --restart unless-stopped "
        f"-p {port}:{MORPHEUS_PORT} "
        f"-v {data_dir}:/app/data "
        f"{DOCKER_IMAGE}"
    )
    _, err, rc = await ssh_client.execute_command(profile_id, run_cmd)
    if rc != 0:
        raise HTTPException(500, f"Docker run failed: {err[:300]}")

    # Wait up to 15 s for Morpheus to respond
    for _ in range(15):
        stdout, _, _ = await ssh_client.execute_command(
            profile_id,
            f"curl -sf http://localhost:{port}/api/system/info 2>/dev/null && echo OK || true",
        )
        if "OK" in stdout:
            return {"ok": True, "port": port}
        await asyncio.sleep(1)

    return {"ok": True, "port": port, "note": "Container started; Morpheus may still be initializing"}


@router.post("/{profile_id}/tunnel")
async def start_tunnel(
    profile_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_user),
):
    """Open an SSH local-forward tunnel: 127.0.0.1:<local_port> → remote:7860."""
    if profile_id in _tunnels:
        t = _tunnels[profile_id]
        if _probe_port("127.0.0.1", t["local_port"]):
            return {"ok": True, "local_port": t["local_port"]}
        _tunnels.pop(profile_id, None)

    result = await db.execute(select(SSHProfile).where(SSHProfile.id == profile_id, SSHProfile.user_id == user.id))
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(404, "Profile not found")

    body = await request.json()
    remote_port = int(body.get("remote_port", MORPHEUS_PORT))

    conn = ssh_client.get_connection(profile_id)
    if not conn:
        try:
            conn = await ssh_client.connect_profile(profile)
        except Exception as e:
            raise HTTPException(500, f"SSH connection failed: {e}")

    local_port = _free_local_port()

    try:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, _start_tunnel_thread, conn, local_port, remote_port, profile_id)
    except Exception as e:
        raise HTTPException(500, f"Tunnel setup failed: {e}")

    return {"ok": True, "local_port": local_port, "url": f"http://127.0.0.1:{local_port}"}


@router.delete("/{profile_id}/tunnel")
async def stop_tunnel(profile_id: int, user: User = Depends(require_user)):
    """Close an active SSH tunnel for this profile."""
    entry = _tunnels.pop(profile_id, None)
    if entry and entry.get("server"):
        try:
            entry["server"].shutdown()
        except Exception:
            pass
    return {"ok": True}


@router.get("/tunnels")
async def list_tunnels(user: User = Depends(require_user)):
    """Return all active tunnels for this session."""
    active = []
    for pid, t in list(_tunnels.items()):
        alive = _probe_port("127.0.0.1", t["local_port"])
        if alive:
            active.append({"profile_id": pid, "local_port": t["local_port"], "url": f"http://127.0.0.1:{t['local_port']}"})
        else:
            _tunnels.pop(pid, None)
    return active


# ── Helpers ───────────────────────────────────────────────────────────────────

def _free_local_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def _start_tunnel_thread(conn, local_port: int, remote_port: int, profile_id: int):
    """Start a paramiko TCP-over-SSH forward in a background thread."""
    import socketserver

    transport = conn.transport

    class _Handler(socketserver.BaseRequestHandler):
        def handle(self):
            try:
                chan = transport.open_channel(
                    "direct-tcpip",
                    ("127.0.0.1", remote_port),
                    self.request.getpeername(),
                )
            except Exception:
                return
            if chan is None:
                return
            _forward_io(self.request, chan)

    class _Server(socketserver.ThreadingTCPServer):
        allow_reuse_address = True
        daemon_threads = True

    server = _Server(("127.0.0.1", local_port), _Handler)
    _tunnels[profile_id] = {"local_port": local_port, "server": server}
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()


def _forward_io(sock, chan):
    import select as _sel
    while True:
        r, _, _ = _sel.select([sock, chan], [], [], 1)
        if sock in r:
            data = sock.recv(1024)
            if not data:
                break
            chan.send(data)
        if chan in r:
            data = chan.recv(1024)
            if not data:
                break
            sock.send(data)
    chan.close()
    sock.close()
