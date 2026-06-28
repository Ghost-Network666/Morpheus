import asyncio
import io
import uuid
from typing import Optional
from dataclasses import dataclass
import paramiko
from app.utils.vault import decrypt


@dataclass
class SSHConnection:
    id: str
    profile_id: int
    client: paramiko.SSHClient
    transport: paramiko.Transport


_connections: dict[int, SSHConnection] = {}  # profile_id -> connection


def _build_client(profile) -> paramiko.SSHClient:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

    connect_kwargs = {
        "hostname": profile.host,
        "port": profile.port,
        "username": profile.username,
        "timeout": 15,
        "banner_timeout": 15,
    }

    if profile.auth_type == "key" and profile.key_encrypted:
        key_data = decrypt(profile.key_encrypted)
        pkey = paramiko.RSAKey.from_private_key(io.StringIO(key_data))
        connect_kwargs["pkey"] = pkey
    elif profile.password_encrypted:
        connect_kwargs["password"] = decrypt(profile.password_encrypted)

    client.connect(**connect_kwargs)
    return client


async def connect_profile(profile) -> SSHConnection:
    loop = asyncio.get_event_loop()
    client = await loop.run_in_executor(None, _build_client, profile)
    conn = SSHConnection(
        id=str(uuid.uuid4()),
        profile_id=profile.id,
        client=client,
        transport=client.get_transport(),
    )
    _connections[profile.id] = conn
    return conn


def get_connection(profile_id: int) -> Optional[SSHConnection]:
    conn = _connections.get(profile_id)
    if conn and conn.transport and conn.transport.is_active():
        return conn
    _connections.pop(profile_id, None)
    return None


async def disconnect_profile(profile_id: int):
    conn = _connections.pop(profile_id, None)
    if conn:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, conn.client.close)


async def execute_command(profile_id: int, command: str) -> tuple[str, str, int]:
    conn = get_connection(profile_id)
    if not conn:
        return "", "Not connected", 1

    loop = asyncio.get_event_loop()

    def _run():
        _, stdout, stderr = conn.client.exec_command(command, timeout=30)
        out = stdout.read().decode("utf-8", errors="replace")
        err = stderr.read().decode("utf-8", errors="replace")
        rc = stdout.channel.recv_exit_status()
        return out, err, rc

    return await loop.run_in_executor(None, _run)


async def quick_connect_shell(
    host: str, port: int = 22, username: str = "root",
    password: str = None, key_path: str = None, key_passphrase: str = None,
    cols: int = 80, rows: int = 24,
) -> paramiko.Channel:
    """Connect ad-hoc (no saved profile) and return an interactive PTY channel."""
    import os

    def _connect():
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

        kwargs = {"hostname": host, "port": port, "username": username, "timeout": 15}

        if key_path:
            expanded = os.path.expanduser(key_path)
            if key_passphrase:
                kwargs["key_filename"] = expanded
                kwargs["passphrase"] = key_passphrase
            else:
                kwargs["key_filename"] = expanded
        elif password:
            kwargs["password"] = password

        client.connect(**kwargs)
        transport = client.get_transport()
        channel = transport.open_session()
        channel.get_pty(term="xterm-256color", width=cols, height=rows)
        channel.invoke_shell()
        # Keep client alive (store on channel so GC doesn't close it)
        channel._morpheus_client = client
        return channel

    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _connect)


async def open_shell_channel(profile_id: int, cols: int = 80, rows: int = 24) -> paramiko.Channel:
    conn = get_connection(profile_id)
    if not conn:
        raise RuntimeError("SSH not connected")

    loop = asyncio.get_event_loop()

    def _open():
        channel = conn.transport.open_session()
        channel.get_pty(term="xterm-256color", width=cols, height=rows)
        channel.invoke_shell()
        return channel

    return await loop.run_in_executor(None, _open)
