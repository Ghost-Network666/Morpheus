#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$ROOT_DIR"

# Load .env if present
[ -f .env ] && export $(grep -v '^#' .env | xargs)

APP_PORT="${APP_PORT:-7860}"
APP_HOST="${APP_HOST:-127.0.0.1}"

echo ""
echo "  ███╗   ███╗ ██████╗ ██████╗ ██████╗ ██╗  ██╗███████╗██╗   ██╗███████╗"
echo "  ████╗ ████║██╔═══██╗██╔══██╗██╔══██╗██║  ██║██╔════╝██║   ██║██╔════╝"
echo "  ██╔████╔██║██║   ██║██████╔╝██████╔╝███████║█████╗  ██║   ██║███████╗"
echo "  ██║╚██╔╝██║██║   ██║██╔══██╗██╔═══╝ ██╔══██║██╔══╝  ██║   ██║╚════██║"
echo "  ██║ ╚═╝ ██║╚██████╔╝██║  ██║██║     ██║  ██║███████╗╚██████╔╝███████║"
echo "  ╚═╝     ╚═╝ ╚═════╝ ╚═╝  ╚═╝╚═╝     ╚═╝  ╚═╝╚══════╝ ╚═════╝ ╚══════╝"
echo ""
echo "  Self-Hosted AI Workspace"
echo ""

# ── Check dependencies ────────────────────────────────────────────────────────
if ! command -v brew &>/dev/null; then
    echo "  [!] Homebrew not found. Install from https://brew.sh"
    exit 1
fi

if ! command -v python3 &>/dev/null || ! python3 -c "import sys; assert sys.version_info >= (3,11)" 2>/dev/null; then
    echo "  [*] Installing Python 3.11..."
    brew install python@3.11
fi

PYTHON=$(command -v python3.11 || command -v python3)

# ── Virtualenv ────────────────────────────────────────────────────────────────
if [ ! -d "venv" ]; then
    echo "  [*] Creating virtual environment..."
    $PYTHON -m venv venv
fi

source venv/bin/activate
echo "  [*] Installing dependencies..."
pip install -q -r requirements.txt

# ── First-run setup ───────────────────────────────────────────────────────────
if [ ! -f "data/app.db" ]; then
    echo "  [*] Running first-time setup..."
    python scripts/setup.py
fi

# ── Tailscale check ───────────────────────────────────────────────────────────
if command -v tailscale &>/dev/null; then
    TS_URL=$(python -c "from app.utils.tailscale import get_tailscale_url; u=get_tailscale_url($APP_PORT); print(u or '')" 2>/dev/null || echo "")
    if [ -n "$TS_URL" ]; then
        echo "  [✓] Tailscale URL: $TS_URL"
    fi
fi

# ── Start server ──────────────────────────────────────────────────────────────
echo "  [*] Starting Morpheus on http://${APP_HOST}:${APP_PORT}"
echo ""

# Open browser after short delay
(sleep 2 && open "http://localhost:${APP_PORT}") &

uvicorn app.main:app \
    --host "$APP_HOST" \
    --port "$APP_PORT" \
    --workers 1 \
    --log-level info
