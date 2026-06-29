# Morpheus — Self-Hosted AI Workspace

A privacy-first AI workspace that runs entirely on your own hardware. No accounts. No cloud. No data leaves your machine.

Chat with local or cloud AI, manage notes, tasks, and calendar, run a full terminal, search the web, and more — all from a single self-hosted app.

---

## Download

Get the desktop app for your platform. No account needed — just download and run.

| Platform | Download |
|---|---|
| **Windows** (x64, installer) | [⬇ morpheus-setup.exe](https://github.com/Ghost-Network666/Morpheus/releases/latest/download/morpheus-1.0.0-setup.exe) |
| **Windows** (x64, portable) | [⬇ morpheus-portable.exe](https://github.com/Ghost-Network666/Morpheus/releases/latest/download/morpheus-1.0.0-x64.exe) |
| **macOS** (Apple Silicon) | [⬇ morpheus-arm64.dmg](https://github.com/Ghost-Network666/Morpheus/releases/latest/download/morpheus-1.0.0-arm64.dmg) |
| **macOS** (Intel x64) | [⬇ morpheus-x64.dmg](https://github.com/Ghost-Network666/Morpheus/releases/latest/download/morpheus-1.0.0-x64.dmg) |
| **Linux** (AppImage) | [⬇ morpheus-x64.AppImage](https://github.com/Ghost-Network666/Morpheus/releases/latest/download/morpheus-1.0.0-x64.AppImage) |
| **Linux** (deb — Ubuntu/Debian) | [⬇ morpheus-x64.deb](https://github.com/Ghost-Network666/Morpheus/releases/latest/download/morpheus-1.0.0-x64.deb) |
| **Linux** (rpm — Fedora/RHEL) | [⬇ morpheus-x64.rpm](https://github.com/Ghost-Network666/Morpheus/releases/latest/download/morpheus-1.0.0-x64.rpm) |

> **macOS note:** The app is not code-signed. On first launch, right-click → Open → Open to bypass Gatekeeper.
>
> **Windows note:** SmartScreen may warn about an unknown publisher — click "More info → Run anyway".

All releases: [github.com/Ghost-Network666/Morpheus/releases](https://github.com/Ghost-Network666/Morpheus/releases)

---

## Two Ways to Run

### Desktop App (recommended)
Download above. On first launch, choose **Local** (runs Python on your machine) or **Remote** (connects to your server). Updates automatically.

### Self-Hosted Server (headless / Docker)
Run Morpheus on a server and connect from the desktop app or any browser. See [Server Setup](#server-setup) below.

---

## Features

| Module | What it does |
|---|---|
| **Chat** | Streaming chat with Ollama, OpenAI, Anthropic — persistent sessions |
| **Agent** | ReAct agent with shell, web search, and file tools |
| **Terminal** | Full PTY terminal via xterm.js |
| **SSH** | Saved profiles, one-click remote terminal |
| **Research** | Agentic web research — search → read → synthesise → report |
| **RAG** | Upload PDFs, semantic search via ChromaDB |
| **Notes** | Markdown notes, pinning, tags |
| **Tasks** | Priority, due dates, cron triggers |
| **Calendar** | Events and .ics export |
| **Email** | IMAP fetch, AI triage, reply drafting |
| **Documents** | File browser and inline editor |
| **Vault** | AES-256 encrypted secrets |
| **Obsidian** | Sync and search your Obsidian vault |
| **Cookbook** | Ollama model management |
| **Connections** | Integrations: GitHub, Notion, Linear, Slack, ntfy |

---

## Server Setup

### Linux / Ubuntu

```bash
git clone https://github.com/Ghost-Network666/Morpheus morpheus
cd morpheus/morpheus
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 7860
```

### Docker Compose

```bash
git clone https://github.com/Ghost-Network666/Morpheus morpheus
cd morpheus/morpheus/docker
docker compose up -d
# Open http://your-server:7860
```

### macOS / Windows (server mode)

```bash
# macOS
bash scripts/start-macos.sh

# Windows
.\scripts\launch-windows.ps1
```

### Run as a systemd service

```bash
sudo cp scripts/morpheus.service /etc/systemd/system/
sudo systemctl enable --now morpheus
```

---

## Secure Remote Access

Install [Tailscale](https://tailscale.com) on your server. Morpheus auto-detects the Tailscale MagicDNS URL:

```
Tailscale URL: http://my-server.tail12345.ts.net:7860
```

Then open the desktop app and connect to that URL — no port forwarding, no VPN config.

---

## Configuration

Copy `.env.example` to `.env`:

```env
APP_HOST=0.0.0.0        # expose on the network
APP_PORT=7860
OLLAMA_URL=http://localhost:11434
DEFAULT_MODEL=llama3.2:3b

# Cloud AI (optional)
OPENAI_API_KEY=
ANTHROPIC_API_KEY=

# Web search (optional)
BRAVE_API_KEY=
TAVILY_API_KEY=
```

---

## Local Models via Ollama

```bash
# macOS / Linux
curl -fsSL https://ollama.com/install.sh | sh
ollama pull llama3.2:3b

# Windows — download from https://ollama.com
```

---

## Architecture

- **Backend**: FastAPI + SQLAlchemy (async SQLite) + Uvicorn
- **Frontend**: Vanilla JS — no build step, served by FastAPI
- **Desktop**: Electron 33 wrapping the backend; local or remote mode
- **Terminal**: xterm.js ↔ WebSocket ↔ PTY (local or SSH via Paramiko)
- **Streaming**: Server-Sent Events for chat and agent output
- **RAG**: ChromaDB + fastembed (ONNX — no external API required)
- **Search**: DuckDuckGo → SearXNG → Brave → Tavily fallback chain

---

## Privacy

- No accounts, no logins, no passwords
- Zero telemetry — nothing is sent externally unless you configure a cloud AI provider
- All data stored locally in SQLite; secrets encrypted with AES-256 (Fernet)
- Access is controlled at the network level (Tailscale, LAN, reverse proxy)

---

## Building from Source

```bash
cd desktop
npm install
npm run build:mac    # or build:win / build:linux
```

Output goes to `desktop/dist/`.

---

## Tests

```bash
cd morpheus
pip install -r requirements.txt
pytest tests/ -v
```

---

## License

MIT — see [LICENSE](LICENSE)
