#!/usr/bin/env python3
"""First-run setup: create data directories, initialise DB, create admin user."""
import os
import sys
import asyncio
import secrets

# Ensure project root is on path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()


async def main():
    from app.config import settings
    from app.database import init_db, AsyncSessionLocal
    from app.models.user import User
    from app.api.auth import hash_password
    from sqlalchemy import select

    # Create data dirs
    for d in ["", "uploads", "backups", "ssh", "chroma"]:
        path = os.path.join(settings.data_dir, d)
        os.makedirs(path, exist_ok=True)

    print(f"[setup] Data directory: {os.path.abspath(settings.data_dir)}")

    # Init DB
    await init_db()
    print("[setup] Database initialised.")

    # Create admin user
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.username == settings.admin_username))
        existing = result.scalar_one_or_none()
        if not existing:
            password = settings.admin_password or secrets.token_urlsafe(16)
            user = User(
                username=settings.admin_username,
                password_hash=hash_password(password),
                is_admin=True,
            )
            db.add(user)
            await db.commit()

            print(f"\n{'='*50}")
            print(f"  Admin user created!")
            print(f"  Username: {settings.admin_username}")
            if not settings.admin_password:
                print(f"  Password: {password}")
                print(f"  (save this password — it won't be shown again)")
            print(f"{'='*50}\n")
        else:
            print(f"[setup] Admin user '{settings.admin_username}' already exists.")

    print(f"[setup] Setup complete. Run 'uvicorn app.main:app --host {settings.app_host} --port {settings.app_port}' to start.")


if __name__ == "__main__":
    asyncio.run(main())
