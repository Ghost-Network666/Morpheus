import shutil
import os
import zipfile
from datetime import datetime, timezone
from app.config import settings


def create_backup() -> str:
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup_dir = os.path.join(settings.data_dir, "backups")
    os.makedirs(backup_dir, exist_ok=True)

    backup_path = os.path.join(backup_dir, f"morpheus_backup_{timestamp}.zip")

    with zipfile.ZipFile(backup_path, "w", zipfile.ZIP_DEFLATED) as zf:
        # Backup database
        db_path = os.path.join(settings.data_dir, "app.db")
        if os.path.exists(db_path):
            zf.write(db_path, "app.db")

        # Backup uploads
        uploads_dir = os.path.join(settings.data_dir, "uploads")
        if os.path.exists(uploads_dir):
            for root, dirs, files in os.walk(uploads_dir):
                for file in files:
                    full_path = os.path.join(root, file)
                    rel_path = os.path.relpath(full_path, settings.data_dir)
                    zf.write(full_path, rel_path)

    return backup_path


def restore_backup(backup_path: str) -> bool:
    try:
        restore_dir = os.path.join(settings.data_dir, "_restore_tmp")
        with zipfile.ZipFile(backup_path, "r") as zf:
            zf.extractall(restore_dir)

        # Move files
        for item in os.listdir(restore_dir):
            src = os.path.join(restore_dir, item)
            dst = os.path.join(settings.data_dir, item)
            if os.path.isfile(dst):
                os.replace(src, dst)
            else:
                shutil.move(src, dst)

        shutil.rmtree(restore_dir, ignore_errors=True)
        return True
    except Exception:
        return False
