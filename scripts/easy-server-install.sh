#!/usr/bin/env bash
# Morpheus one-command server installer for Ubuntu/Debian
# Usage: curl -fsSL https://raw.githubusercontent.com/ghost-network666/morpheus/main/scripts/easy-server-install.sh | bash

set -euo pipefail

REPO_URL="https://github.com/ghost-network666/morpheus"
INSTALL_DIR="$HOME/morpheus"
SERVICE_NAME="morpheus"
PORT="${PORT:-7860}"
PYTHON="${PYTHON:-python3}"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

info()  { echo -e "${CYAN}[morpheus]${NC} $*"; }
ok()    { echo -e "${GREEN}[ok]${NC} $*"; }
warn()  { echo -e "${YELLOW}[warn]${NC} $*"; }
die()   { echo -e "${RED}[error]${NC} $*" >&2; exit 1; }

check_os() {
  if [[ ! -f /etc/os-release ]]; then
    die "Cannot detect OS. This script supports Ubuntu/Debian."
  fi
  . /etc/os-release
  if [[ "$ID" != "ubuntu" && "$ID" != "debian" ]]; then
    warn "OS detected: $PRETTY_NAME — this script is tested on Ubuntu/Debian."
    warn "Continuing anyway…"
  else
    info "OS: $PRETTY_NAME"
  fi
}

install_deps() {
  info "Installing system dependencies…"
  sudo apt-get update -qq
  sudo apt-get install -y -qq \
    git python3 python3-pip python3-venv \
    build-essential libssl-dev libffi-dev \
    curl wget ca-certificates
  ok "System dependencies installed"
}

install_ollama() {
  if command -v ollama &>/dev/null; then
    ok "Ollama already installed: $(ollama --version 2>/dev/null || true)"
    return
  fi
  info "Installing Ollama…"
  curl -fsSL https://ollama.com/install.sh | sh
  ok "Ollama installed"
}

clone_or_update() {
  if [[ -d "$INSTALL_DIR/.git" ]]; then
    info "Updating existing install at $INSTALL_DIR…"
    git -C "$INSTALL_DIR" pull --ff-only
  else
    info "Cloning Morpheus to $INSTALL_DIR…"
    git clone "$REPO_URL" "$INSTALL_DIR"
  fi
  ok "Source ready at $INSTALL_DIR"
}

setup_venv() {
  info "Setting up Python virtual environment…"
  $PYTHON -m venv "$INSTALL_DIR/venv"
  "$INSTALL_DIR/venv/bin/pip" install --quiet --upgrade pip
  "$INSTALL_DIR/venv/bin/pip" install --quiet -r "$INSTALL_DIR/morpheus/requirements.txt"
  ok "Python environment ready"
}

setup_env() {
  local env_file="$INSTALL_DIR/morpheus/.env"
  if [[ -f "$env_file" ]]; then
    info ".env already exists — skipping"
    return
  fi
  info "Creating .env from template…"
  cp "$INSTALL_DIR/morpheus/.env.example" "$env_file"
  SECRET=$(python3 -c "import secrets; print(secrets.token_hex(32))")
  sed -i "s|SECRET_KEY=.*|SECRET_KEY=$SECRET|" "$env_file"
  sed -i "s|APP_PORT=.*|APP_PORT=$PORT|" "$env_file"
  ok ".env created at $env_file"
  echo ""
  warn "IMPORTANT: Edit $env_file to set ADMIN_PASSWORD and other settings before first run."
}

install_systemd() {
  local service_file="/etc/systemd/system/${SERVICE_NAME}.service"
  if [[ -f "$service_file" ]]; then
    info "systemd service already exists — skipping"
    return
  fi
  info "Installing systemd service…"
  sudo tee "$service_file" > /dev/null <<EOF
[Unit]
Description=Morpheus AI Workspace
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$INSTALL_DIR/morpheus
ExecStart=$INSTALL_DIR/venv/bin/uvicorn app.main:app --host 0.0.0.0 --port $PORT
Restart=on-failure
RestartSec=5s
Environment=PYTHONUNBUFFERED=1

[Install]
WantedBy=multi-user.target
EOF
  sudo systemctl daemon-reload
  sudo systemctl enable "$SERVICE_NAME"
  ok "systemd service installed and enabled"
}

start_service() {
  info "Starting Morpheus…"
  sudo systemctl start "$SERVICE_NAME"
  sleep 2
  if sudo systemctl is-active --quiet "$SERVICE_NAME"; then
    ok "Morpheus is running!"
  else
    warn "Service may have failed to start. Check: sudo journalctl -u $SERVICE_NAME -n 50"
  fi
}

print_summary() {
  local ip
  ip=$(hostname -I | awk '{print $1}')
  echo ""
  echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${GREEN}  Morpheus installed successfully!${NC}"
  echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
  echo -e "  Local:   ${CYAN}http://localhost:$PORT${NC}"
  echo -e "  Network: ${CYAN}http://$ip:$PORT${NC}"
  echo ""
  echo -e "  Manage:  ${YELLOW}sudo systemctl {start|stop|restart|status} $SERVICE_NAME${NC}"
  echo -e "  Logs:    ${YELLOW}sudo journalctl -u $SERVICE_NAME -f${NC}"
  echo -e "  Config:  ${YELLOW}$INSTALL_DIR/morpheus/.env${NC}"
  echo ""
  echo -e "  Pull a model to get started:"
  echo -e "  ${CYAN}ollama pull llama3.2:3b${NC}"
  echo ""
}

main() {
  echo -e "${CYAN}"
  echo "  ███╗   ███╗ ██████╗ ██████╗ ██████╗ ██╗  ██╗███████╗██╗   ██╗███████╗"
  echo "  ████╗ ████║██╔═══██╗██╔══██╗██╔══██╗██║  ██║██╔════╝██║   ██║██╔════╝"
  echo "  ██╔████╔██║██║   ██║██████╔╝██████╔╝███████║█████╗  ██║   ██║███████╗"
  echo "  ██║╚██╔╝██║██║   ██║██╔══██╗██╔═══╝ ██╔══██║██╔══╝  ██║   ██║╚════██║"
  echo "  ██║ ╚═╝ ██║╚██████╔╝██║  ██║██║     ██║  ██║███████╗╚██████╔╝███████║"
  echo "  ╚═╝     ╚═╝ ╚═════╝ ╚═╝  ╚═╝╚═╝     ╚═╝  ╚═╝╚══════╝ ╚═════╝ ╚══════╝"
  echo -e "${NC}"
  echo -e "  Self-hosted AI workspace installer"
  echo ""

  check_os
  install_deps
  install_ollama
  clone_or_update
  setup_venv
  setup_env
  install_systemd
  start_service
  print_summary
}

main "$@"
