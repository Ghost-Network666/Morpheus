import asyncio
import os
import sys
import uuid
from typing import Optional
from dataclasses import dataclass


@dataclass
class TerminalSession:
    id: str
    mode: str          # local | ssh
    ssh_profile_id: Optional[int] = None
    process: Optional[object] = None   # winpty.PtyProcess | asyncio.Process
    pty_proc: Optional[object] = None  # winpty.PtyProcess on Windows
    ssh_channel: Optional[object] = None
    cols: int = 80
    rows: int = 24
    active: bool = True


_sessions: dict[str, TerminalSession] = {}


async def create_local_session(cols: int = 80, rows: int = 24) -> str:
    session_id = str(uuid.uuid4())

    if sys.platform == "win32":
        session = await _create_win_session(session_id, cols, rows)
    else:
        session = await _create_unix_session(session_id, cols, rows)

    _sessions[session_id] = session
    return session_id


async def _create_win_session(session_id: str, cols: int, rows: int) -> TerminalSession:
    """Use winpty (ConPTY) for a real interactive terminal on Windows."""
    try:
        from winpty import PtyProcess
        shell = os.environ.get("COMSPEC", "powershell.exe")
        # Prefer PowerShell if available
        import shutil
        if shutil.which("powershell.exe"):
            shell = "powershell.exe"
        pty_proc = PtyProcess.spawn(shell, dimensions=(rows, cols))
        return TerminalSession(
            id=session_id, mode="local",
            pty_proc=pty_proc, cols=cols, rows=rows,
        )
    except ImportError:
        # Fallback: plain subprocess with pipes (limited interactivity)
        shell = os.environ.get("COMSPEC", "cmd.exe")
        proc = await asyncio.create_subprocess_exec(
            shell,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        return TerminalSession(
            id=session_id, mode="local",
            process=proc, cols=cols, rows=rows,
        )


async def _create_unix_session(session_id: str, cols: int, rows: int) -> TerminalSession:
    import pty, fcntl, termios, struct
    master_fd, slave_fd = pty.openpty()
    winsize = struct.pack("HHHH", rows, cols, 0, 0)
    fcntl.ioctl(slave_fd, termios.TIOCSWINSZ, winsize)
    shell = os.environ.get("SHELL", "/bin/bash")
    proc = await asyncio.create_subprocess_exec(
        shell,
        stdin=slave_fd, stdout=slave_fd, stderr=slave_fd,
        close_fds=True,
        env={**os.environ, "TERM": "xterm-256color"},
    )
    os.close(slave_fd)
    # Wrap master fd as async stream
    loop = asyncio.get_event_loop()
    reader = asyncio.StreamReader()
    protocol = asyncio.StreamReaderProtocol(reader)
    await loop.connect_read_pipe(lambda: protocol, os.fdopen(master_fd, "rb", 0))
    session = TerminalSession(
        id=session_id, mode="local",
        process=proc, cols=cols, rows=rows,
    )
    session._master_fd = master_fd  # keep ref for resize
    return session


def get_session(session_id: str) -> Optional[TerminalSession]:
    return _sessions.get(session_id)


async def resize_session(session_id: str, cols: int, rows: int):
    session = _sessions.get(session_id)
    if not session:
        return
    session.cols = cols
    session.rows = rows

    if session.pty_proc:
        try:
            session.pty_proc.setwinsize(rows, cols)
        except Exception:
            pass
    elif sys.platform != "win32" and session.process:
        try:
            import fcntl, termios, struct
            master_fd = getattr(session, "_master_fd", None)
            if master_fd:
                winsize = struct.pack("HHHH", rows, cols, 0, 0)
                fcntl.ioctl(master_fd, termios.TIOCSWINSZ, winsize)
        except Exception:
            pass


async def close_session(session_id: str):
    session = _sessions.pop(session_id, None)
    if not session:
        return
    if session.ssh_channel:
        try:
            session.ssh_channel.close()
        except Exception:
            pass
    if session.pty_proc:
        try:
            session.pty_proc.close()
        except Exception:
            pass
    elif session.process:
        try:
            session.process.terminate()
        except Exception:
            pass
