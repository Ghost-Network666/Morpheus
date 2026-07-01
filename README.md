# Morpheus — Self-Hosted AI Workspace

A privacy-first AI workspace that runs entirely on your own hardware. No accounts. No cloud. No data leaves your machine.

Chat with local or cloud AI, manage notes, tasks, and calendar, run a full terminal, search the web, and more — all from a native desktop app.

---

## Download

| Platform | Download |
|---|---|
| **Windows** (x64, installer) | [⬇ morpheus-setup.exe](https://github.com/Ghost-Network666/Morpheus/releases/latest/download/morpheus-setup.exe) |
| **Windows** (x64, portable) | [⬇ morpheus-portable.exe](https://github.com/Ghost-Network666/Morpheus/releases/latest/download/morpheus-portable.exe) |
| **macOS** (Apple Silicon) | [⬇ morpheus-arm64.dmg](https://github.com/Ghost-Network666/Morpheus/releases/latest/download/morpheus-arm64.dmg) |
| **macOS** (Intel x64) | [⬇ morpheus-x64.dmg](https://github.com/Ghost-Network666/Morpheus/releases/latest/download/morpheus-x64.dmg) |

> **macOS note:** The app is not code-signed. On first launch, right-click → Open → Open to bypass Gatekeeper.
>
> **Windows note:** SmartScreen may warn about an unknown publisher — click "More info → Run anyway".

All releases: [github.com/Ghost-Network666/Morpheus/releases](https://github.com/Ghost-Network666/Morpheus/releases)

The installer bundles a complete Python runtime — no Python installation required on your machine.

---

## Getting Started

1. Download the installer for your platform above.
2. Run the installer (Windows) or open the DMG and drag to Applications (macOS).
3. On first launch, choose **Local** to run the AI backend on your machine, or **Remote** to connect to a Morpheus instance running on another machine via SSH.
4. For local mode, [install Ollama](https://ollama.com) and pull a model:
   ```bash
   ollama pull llama3.2:3b
   ```

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

## Remote Connections

Morpheus supports connecting the desktop app to a backend running on another machine (Linux server, NAS, homelab). On the connect screen, choose **Remote** and enter the server address.

To install the Morpheus backend on a Linux server from within the app, use **Remote Install** on the connect screen — it connects over SSH and sets up everything automatically.

Or install manually on the server:

```bash
git clone https://github.com/Ghost-Network666/Morpheus morpheus
cd morpheus/morpheus
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 7860
```

Then open the desktop app, choose Remote, and enter `http://your-server:7860`.

For zero-config secure access without port forwarding, install [Tailscale](https://tailscale.com) on your server and connect using the MagicDNS hostname (`http://my-server.tail12345.ts.net:7860`).

---

## Configuration

The backend reads settings from a `.env` file in the `morpheus/` directory (or from the in-app Settings panel):

```env
APP_HOST=127.0.0.1    # 0.0.0.0 to expose on the network for remote connections
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

## Architecture

- **Backend**: FastAPI + SQLAlchemy (async SQLite) + Uvicorn
- **Frontend**: React + Vite + TypeScript + Tailwind, bundled inside Electron
- **Desktop**: Electron 33 — UI loads from disk, API calls go to the local or remote backend
- **Terminal**: xterm.js ↔ WebSocket ↔ PTY (local or SSH via asyncssh)
- **Streaming**: Server-Sent Events for chat and agent output
- **RAG**: ChromaDB + fastembed (ONNX — no external API required)
- **Search**: DuckDuckGo → SearXNG → Brave → Tavily fallback chain

---

## Privacy

- No accounts, no logins, no passwords
- Zero telemetry — nothing is sent externally unless you configure a cloud AI provider
- All data stored locally in SQLite; secrets encrypted with AES-256 (Fernet)
- For remote access, control is at the network level (Tailscale, LAN, reverse proxy)

---

## Building from Source

```bash
# Install desktop and renderer dependencies
cd desktop
npm install
cd app && npm install && cd ..

# Build the React renderer
cd app && npm run build && cd ..

# Build the desktop app (bundles Python runtime automatically)
npm run build:mac:arm64   # macOS Apple Silicon
npm run build:mac:x64     # macOS Intel
npm run build:win         # Windows
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
