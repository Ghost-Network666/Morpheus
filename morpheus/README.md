# Morpheus — Self-Hosted AI Workspace

A powerful self-hosted AI workspace that runs locally on macOS, Windows, and Linux, with seamless **dual-mode** operation — run everything locally or connect to a remote Ubuntu server via SSH.

---

## Features

| Module | Description |
|---|---|
| **Chat** | Streaming chat with Ollama, OpenAI, Anthropic — saved sessions |
| **Agent** | ReAct agent with shell, web search, file I/O tools |
| **Terminal** | Full PTY terminal (local or SSH remote) via xterm.js |
| **SSH** | Saved SSH profiles, one-click connect, remote terminal |
| **Models** | Hardware detection, Ollama model management, recommendations |
| **RAG** | Upload PDFs/docs, semantic search via ChromaDB + fastembed |
| **Research** | Agentic web research — search → read → synthesise → report |
| **Notes** | Markdown notes with autosave |
| **Tasks** | Todo list with priority, due dates, cron support |
| **Calendar** | Events, CalDAV sync, .ics export |
| **Email** | IMAP/SMTP, AI triage and reply drafting |
| **Documents** | File browser, inline editor, AI suggestions |
| **Vault** | AES-encrypted secret storage |
| **Settings** | Per-module toggles, theme, provider config |

---

## Quick Start

### macOS
```bash
git clone https://github.com/Ghost-Network666/Morpheus morpheus && cd morpheus/morpheus
cp .env.example .env
bash scripts/start-macos.sh
```

### Windows
```powershell
git clone https://github.com/Ghost-Network666/Morpheus morpheus; cd morpheus\morpheus
Copy-Item .env.example .env
.\scripts\launch-windows.ps1
```

### Linux / Ubuntu Server
```bash
git clone https://github.com/Ghost-Network666/Morpheus morpheus && cd morpheus/morpheus
cp .env.example .env
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python scripts/setup.py
uvicorn app.main:app --host 0.0.0.0 --port 7860
```

### Docker Compose
```bash
cd docker
docker compose up -d
# Access at http://localhost:7860
```

---

## Configuration

Copy `.env.example` to `.env` and adjust:

```env
APP_HOST=127.0.0.1      # Use 0.0.0.0 for server installs
APP_PORT=7860
OLLAMA_URL=http://localhost:11434
DEFAULT_MODEL=llama3.2:3b
```

---

## Installing Ollama (for local models)

```bash
# macOS / Linux
curl -fsSL https://ollama.com/install.sh | sh
ollama pull llama3.2:3b

# Windows — download from https://ollama.com
```

---

## Ubuntu Server Setup

```bash
# Install as systemd service
sudo cp scripts/morpheus.service /etc/systemd/system/
sudo systemctl enable --now morpheus
sudo systemctl status morpheus
```

For network-accessible installs, set in `.env`:
```env
APP_HOST=0.0.0.0
```

---

## Tailscale (Secure Remote Access)

Install Tailscale on both machines. Morpheus auto-detects the MagicDNS URL and prints it on startup:

```
[✓] Tailscale URL: http://my-server.tail12345.ts.net:7860
```

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
pip install -r requirements.txt
pytest tests/ -v
```

---

## Architecture

- **Backend**: FastAPI + Uvicorn + SQLAlchemy (SQLite) + asyncio
- **Frontend**: Vanilla JS ES modules, no build step, served from FastAPI
- **Terminal**: xterm.js ↔ WebSocket ↔ PTY (local or SSH via Paramiko)
- **Streaming**: Server-Sent Events (SSE) for chat and agent output
- **RAG**: ChromaDB + fastembed (ONNX, no API key)
- **Search**: SearXNG (self-hosted) → Brave → Tavily fallback chain

---

## Security

- No accounts, no logins — Morpheus is single-owner and access is controlled at the network level (Tailscale, LAN, reverse proxy)
- Secrets encrypted with AES-256 (Fernet) in the Vault
- SSH credentials stored encrypted
- No telemetry — zero data sent externally unless you configure external providers

---

## License

MIT
