import logging
import os
import shutil
import zipfile
from datetime import datetime, timezone

from app.config import settings

logger = logging.getLogger(__name__)


class BackupError(Exception):
    """Raised for any backup/restore failure; message is safe to show to the caller."""


def _backups_dir() -> str:
    backup_dir = os.path.join(settings.data_dir, "backups")
    os.makedirs(backup_dir, exist_ok=True)
    return backup_dir


def create_backup() -> str:
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup_dir = _backups_dir()
    backup_path = os.path.join(backup_dir, f"morpheus_backup_{timestamp}.zip")

    try:
        with zipfile.ZipFile(backup_path, "w", zipfile.ZIP_DEFLATED) as zf:
            db_path = os.path.join(settings.data_dir, "app.db")
            if os.path.exists(db_path):
                zf.write(db_path, "app.db")

            uploads_dir = os.path.join(settings.data_dir, "uploads")
            if os.path.exists(uploads_dir):
                for root, _dirs, files in os.walk(uploads_dir):
                    for file in files:
                        full_path = os.path.join(root, file)
                        rel_path = os.path.relpath(full_path, settings.data_dir)
                        zf.write(full_path, rel_path)
    except OSError as e:
        logger.exception("Backup creation failed")
        raise BackupError(f"Could not create backup: {e}") from e

    logger.info("Backup created at %s", backup_path)
    return backup_path


def _resolve_within(base_dir: str, path: str) -> str:
    """Resolves `path` and raises BackupError if it escapes `base_dir` (blocks path traversal)."""
    base_real = os.path.realpath(base_dir)
    target_real = os.path.realpath(path)
    if target_real != base_real and not target_real.startswith(base_real + os.sep):
        raise BackupError("Path is outside the backups directory")
    return target_real


def _safe_extract(zf: zipfile.ZipFile, dest_dir: str) -> None:
    """Extracts a zip while rejecting entries that would escape dest_dir ("zip slip")."""
    dest_real = os.path.realpath(dest_dir)
    for member in zf.infolist():
        member_path = os.path.realpath(os.path.join(dest_dir, member.filename))
        if member_path != dest_real and not member_path.startswith(dest_real + os.sep):
            raise BackupError(f"Refusing to extract unsafe zip entry: {member.filename}")
    zf.extractall(dest_dir)


def restore_backup(backup_path: str) -> None:
    """Restores a backup zip. Raises BackupError with a safe-to-display message on failure."""
    if not backup_path:
        raise BackupError("No backup path provided")

    backups_dir = _backups_dir()
    try:
        safe_path = _resolve_within(backups_dir, backup_path)
    except BackupError:
        raise
    if not os.path.isfile(safe_path):
        raise BackupError("Backup file not found")

    restore_dir = os.path.join(settings.data_dir, "_restore_tmp")
    try:
        with zipfile.ZipFile(safe_path, "r") as zf:
            _safe_extract(zf, restore_dir)

        for item in os.listdir(restore_dir):
            src = os.path.join(restore_dir, item)
            dst = os.path.join(settings.data_dir, item)
            if os.path.isfile(src):
                os.replace(src, dst)
            else:
                if os.path.isdir(dst):
                    shutil.rmtree(dst)
                shutil.move(src, dst)
    except (zipfile.BadZipFile, OSError, BackupError) as e:
        logger.exception("Restore failed for %s", safe_path)
        raise BackupError(f"Could not restore backup: {e}") from e
    finally:
        shutil.rmtree(restore_dir, ignore_errors=True)

    logger.info("Restore completed from %s", safe_path)
