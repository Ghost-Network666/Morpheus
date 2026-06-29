import asyncio
import logging
from pathlib import Path

log = logging.getLogger("morpheus.vault_watcher")

_observer = None


async def start_vault_watcher(vault_path: str):
    global _observer
    try:
        from watchdog.observers import Observer
        from watchdog.events import FileSystemEventHandler
    except ImportError:
        log.warning("watchdog not installed — Obsidian vault auto-sync disabled")
        return

    vault = Path(vault_path).expanduser().resolve()
    if not vault.is_dir():
        log.warning("Obsidian vault path not found: %s", vault)
        return

    loop = asyncio.get_event_loop()

    class _Handler(FileSystemEventHandler):
        def _schedule(self, path: str):
            if path.endswith(".md"):
                asyncio.run_coroutine_threadsafe(_reindex(vault), loop)

        def on_modified(self, event):
            if not event.is_directory:
                self._schedule(event.src_path)

        def on_created(self, event):
            if not event.is_directory:
                self._schedule(event.src_path)

        def on_deleted(self, event):
            if not event.is_directory:
                self._schedule(event.src_path)

        def on_moved(self, event):
            if not event.is_directory:
                self._schedule(event.dest_path)

    observer = Observer()
    observer.schedule(_Handler(), str(vault), recursive=True)
    observer.start()
    _observer = observer
    log.info("Obsidian vault watcher started: %s", vault)


async def _reindex(vault: Path):
    from app.api.obsidian import _index_vault
    from app.core.sync import broadcast
    try:
        await _index_vault(vault)
        await broadcast(1, "obsidian_changed", {"action": "sync"})
        log.debug("Vault reindexed: %s", vault)
    except Exception as e:
        log.warning("Vault reindex error: %s", e)


def stop_vault_watcher():
    global _observer
    if _observer:
        try:
            _observer.stop()
            _observer.join(timeout=5)
        except Exception:
            pass
        _observer = None
        log.info("Obsidian vault watcher stopped")
