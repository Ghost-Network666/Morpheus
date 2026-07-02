#!/usr/bin/env bash
# Morpheus one-command Docker installer for Ubuntu/Debian
# Usage: curl -fsSL https://raw.githubusercontent.com/Ghost-Network666/Morpheus/main/scripts/docker-server-install.sh | bash

set -euo pipefail

REPO_URL="https://github.com/Ghost-Network666/Morpheus"
INSTALL_DIR="$HOME/morpheus"
PORT="${PORT:-7860}"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

info()  { echo -e "${CYAN}[morpheus]${NC} $*"; }
ok()    { echo -e "${GREEN}[ok]${NC} $*"; }
warn()  { echo -e "${YELLOW}[warn]${NC} $*"; }
die()   { echo -e "${RED}[error]${NC} $*" >&2; exit 1; }

install_docker() {
  if command -v docker &>/dev/null; then
    ok "Docker already installed: $(docker --version)"
  else
    info "Installing Docker…"
    curl -fsSL https://get.docker.com | sudo sh
    sudo usermod -aG docker "$USER" || true
    ok "Docker installed"
  fi

  if ! docker compose version &>/dev/null; then
    die "Docker Compose plugin not found. Please install docker-compose-plugin and re-run."
  fi
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

start_stack() {
  info "Building and starting Morpheus containers…"
  local compose_dir="$INSTALL_DIR/morpheus/docker"
  local run_docker="docker"
  if ! docker info &>/dev/null; then
    run_docker="sudo docker"
  fi
  (cd "$compose_dir" && PORT="$PORT" $run_docker compose up -d --build)
  ok "Morpheus containers are up"
}

print_summary() {
  local ip
  ip=$(hostname -I | awk '{print $1}')
  echo ""
  echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${GREEN}  Morpheus is running in Docker!${NC}"
  echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
  echo -e "  Local:   ${CYAN}http://localhost:$PORT${NC}"
  echo -e "  Network: ${CYAN}http://$ip:$PORT${NC}"
  echo ""
  echo -e "  Manage:  ${YELLOW}cd $INSTALL_DIR/morpheus/docker && docker compose {ps|logs -f|down}${NC}"
  echo ""
}

main() {
  echo -e "${CYAN}Morpheus — Docker install${NC}"
  install_docker
  clone_or_update
  start_stack
  print_summary
}

main "$@"
