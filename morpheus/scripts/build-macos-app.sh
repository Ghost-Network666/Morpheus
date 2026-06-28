#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$ROOT_DIR"

echo "[build] Morpheus macOS .app builder"

source venv/bin/activate

pip install pyinstaller pillow pystray -q

pyinstaller \
    --name "Morpheus" \
    --windowed \
    --osx-bundle-identifier "com.morpheus.app" \
    --add-data "app/static:app/static" \
    --add-data ".env.example:." \
    --hidden-import "uvicorn.logging" \
    --hidden-import "uvicorn.loops.auto" \
    --hidden-import "uvicorn.protocols.http.auto" \
    --hidden-import "uvicorn.protocols.websockets.auto" \
    --hidden-import "uvicorn.lifespan.on" \
    --hidden-import "sqlalchemy.dialects.sqlite" \
    --hidden-import "aiosqlite" \
    --collect-all "fastapi" \
    scripts/launcher.py

echo "[build] Done: dist/Morpheus.app"
