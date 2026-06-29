# Morpheus — Self-Hosted AI Workspace

A powerful, privacy-first AI workspace that runs entirely on your own hardware. Chat with local or cloud AI models, manage notes, tasks, and calendar, browse and edit files, run a full terminal, and more — all from a single self-hosted web app.

Runs on **macOS**, **Windows**, and **Linux**. Works locally or connects to a remote Ubuntu server over SSH.

---

## Features

| Module | Description |
|---|---|
| **Chat** | Streaming chat with Ollama, OpenAI, and Anthropic — persistent sessions |
| **Agent** | ReAct agent with shell execution, web search, and file I/O tools |
| **Terminal** | Full PTY terminal (local or SSH remote) via xterm.js |
| **SSH** | Saved SSH profiles, one-click connect, remote terminal |
| **Models** | Hardware detection, Ollama model management, and recommendations |
| **RAG** | Upload PDFs and docs, semantic search via ChromaDB + fastembed |
| **Research** | Agentic web research — search → read → synthesise → report |
| **Notes** | Markdown notes with autosave and pinning |
| **Tasks** | Todo list with priority levels, due dates, filtering, and cron support |
| **Calendar** | Events, CalDAV sync, and .ics export |
| **Email** | IMAP fetch, AI triage, reply drafting |
| **Documents** | File browser, inline editor, AI suggestions |
| **Vault** | AES-256 encrypted secret storage |
| **Settings** | Per-module toggles, dark/light theme, provider configuration |

---

## Requirements

- Python 3.11+
- [Ollama](https://ollama.com) (optional, for local models)
- Docker (optional, for the full stack with SearXNG + ChromaDB)

---

## Quick Start

### macOS

```bash
git clone https://github.com/Ghost-Network666/Morpheus morpheus
cd morpheus/morpheus
cp .env.example .env
bash scripts/start-macos.sh
```

### Windows

```powershell
git clone https://github.com/Ghost-Network666/Morpheus morpheus
cd morpheus\morpheus
Copy-Item .env.example .env
.\scripts\launch-windows.ps1
```

### Linux / Ubuntu Server

```bash
git clone https://github.com/Ghost-Network666/Morpheus morpheus
cd morpheus/morpheus
cp .env.example .env
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python scripts/setup.py
uvicorn app.main:app --host 0.0.0.0 --port 7860
```

### Docker Compose

```bash
git clone https://github.com/Ghost-Network666/Morpheus morpheus
cd morpheus/morpheus/docker
docker compose up -d
# Open http://localhost:7860
```

---

## Configuration

Copy `.env.example` to `.env` and set your values:

```env
APP_HOST=127.0.0.1       # Use 0.0.0.0 to expose on the network
APP_PORT=7860
AUTH_ENABLED=false        # Enable for any network-accessible install
OLLAMA_URL=http://localhost:11434
DEFAULT_MODEL=llama3.2:3b

# Optional — for cloud AI providers
OPENAI_API_KEY=
ANTHROPIC_API_KEY=

# Optional — for web search
BRAVE_API_KEY=
TAVILY_API_KEY=
```

---

## Installing Ollama (local models)

```bash
# macOS / Linux
curl -fsSL https://ollama.com/install.sh | sh
ollama pull llama3.2:3b

# Windows — download from https://ollama.com
```

---

## Ubuntu Server Setup

```bash
# Install as a systemd service
sudo cp scripts/morpheus.service /etc/systemd/system/
sudo systemctl enable --now morpheus
sudo systemctl status morpheus
```

For server installs, enable auth in `.env`:

```env
AUTH_ENABLED=true
APP_HOST=0.0.0.0
```

---

## Secure Remote Access with Tailscale

Install [Tailscale](https://tailscale.com) on both your server and client. Morpheus auto-detects the MagicDNS URL and prints it at startup:

```
[✓] Tailscale URL: http://my-server.tail12345.ts.net:7860
```

No port forwarding or VPN configuration required.

---

## Building Portable Executables

**Windows (.exe)**
```powershell
.\scripts\build-windows-portable.ps1
# Output: dist\Morpheus.exe
```

**macOS (.app)**
```bash
bash scripts/build-macos-app.sh
# Output: dist/Morpheus.app
```

---

## Running Tests

```bash
cd morpheus
pip install -r requirements.txt
pytest tests/ -v
```

---

## Architecture

- **Backend**: FastAPI + Uvicorn + SQLAlchemy (SQLite) + asyncio
- **Frontend**: Vanilla JS ES modules — no build step, served directly by FastAPI
- **Terminal**: xterm.js ↔ WebSocket ↔ PTY (local or SSH via Paramiko)
- **Streaming**: Server-Sent Events (SSE) for chat and agent output
- **RAG**: ChromaDB + fastembed (ONNX — no external API required)
- **Search**: DuckDuckGo → SearXNG (self-hosted) → Brave → Tavily fallback chain

---

## Security

- Auth is disabled by default for `localhost`; always enable it for network-accessible installs
- Secrets are encrypted with AES-256 (Fernet) in the Vault module
- SSH credentials stored encrypted
- Session cookies are `HttpOnly` and `SameSite=Lax`
- No telemetry — zero data sent externally unless you configure external providers

---

## License

MIT — see [LICENSE](LICENSE)
