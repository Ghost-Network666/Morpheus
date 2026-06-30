#!/usr/bin/env python3
"""First-run setup: create data directories and initialise the database."""
import os
import sys
import asyncio

# Ensure project root is on path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()


async def main():
    from app.config import settings
    from app.database import init_db

    # Create data dirs
    for d in ["", "uploads", "backups", "ssh", "chroma"]:
        path = os.path.join(settings.data_dir, d)
        os.makedirs(path, exist_ok=True)

    print(f"[setup] Data directory: {os.path.abspath(settings.data_dir)}")

    # Init DB — the owner user is created automatically on first app startup
    await init_db()
    print("[setup] Database initialised.")

    print(f"[setup] Setup complete. Run 'uvicorn app.main:app --host {settings.app_host} --port {settings.app_port}' to start.")


if __name__ == "__main__":
    asyncio.run(main())
