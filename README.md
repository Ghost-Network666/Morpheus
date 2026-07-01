# Morpheus

A privacy-first AI workspace that runs entirely on your own hardware. No accounts. No cloud. No data leaves your machine.

Chat with local or cloud AI, manage notes, tasks, and calendar, run a full terminal, search the web, and more — all from a native desktop app.

---

## Download

> **Latest release: [v1.0.0](https://github.com/Ghost-Network666/Morpheus/releases/latest)**

| Platform | Download |
|---|---|
| Windows (x64, installer) | [morpheus-setup.exe](https://github.com/Ghost-Network666/Morpheus/releases/latest/download/morpheus-setup.exe) |
| Windows (x64, portable) | [morpheus-portable.exe](https://github.com/Ghost-Network666/Morpheus/releases/latest/download/morpheus-portable.exe) |
| macOS (Apple Silicon) | [morpheus-arm64.dmg](https://github.com/Ghost-Network666/Morpheus/releases/latest/download/morpheus-arm64.dmg) |
| macOS (Intel x64) | [morpheus-x64.dmg](https://github.com/Ghost-Network666/Morpheus/releases/latest/download/morpheus-x64.dmg) |
| Linux (AppImage, x64) | [morpheus-x64.AppImage](https://github.com/Ghost-Network666/Morpheus/releases/latest/download/morpheus-x64.AppImage) |
| Linux (.deb, x64) | [morpheus-amd64.deb](https://github.com/Ghost-Network666/Morpheus/releases/latest/download/morpheus-amd64.deb) |

---

## Getting Started

Download and install Morpheus for your platform. On first launch, the **setup wizard** walks you through everything — no terminal required.

### Local Setup

Run AI on this computer. The wizard lets you choose from:

- **Ollama** — Local AI that runs entirely on your machine. Morpheus installs Ollama automatically.
- **OpenAI** — Enter your API key to use GPT-4o and other OpenAI models.
- **Anthropic** — Enter your API key to use Claude models.
- **LM Studio** — Connect to a locally-running LM Studio instance on your network.

You can configure multiple providers and switch between them in Settings at any time.

### Remote Server Setup

Connect the desktop app to a backend running on another machine — a Linux server, NAS, or homelab. Choose **Connect to My Server** in the wizard, enter your server's address, and sign in over SSH.

The app checks whether the Morpheus backend is installed on the server. If not, a single click installs and starts it — no terminal commands needed.

Once connected, the full Morpheus interface runs on your desktop while the AI and data stay on your server.

---

## Features

| Module | Description |
|---|---|
| **Chat** | Stream responses from any configured AI provider with markdown rendering |
| **Terminal** | Full xterm.js terminal with multiple tabs, connected to the backend host |
| **SSH** | Manage SSH connections and open remote terminals directly in the app |
| **Research** | AI-powered web research with configurable depth and streaming output |
| **Notes** | Markdown notes with auto-save, pinning, and tagging |
| **Tasks** | Task management with priorities, status, and filters |
| **Calendar** | Event scheduling and management |
| **Documents** | File browser and viewer for the backend host's filesystem |
| **Obsidian** | Browse and read your Obsidian vault |
| **Vault** | Encrypted local storage for API keys, tokens, and secrets |
| **RAG** | Upload documents and run semantic search over them |
| **Cookbook** | Manage Ollama models — browse, download, and delete |
| **Email** | Read email from configured accounts |
| **Settings** | Configure providers, integrations, and toggle modules |

---

## Development

```bash
# Install frontend dependencies
cd desktop/app && npm install

# Build the renderer
npm run build

# Run frontend tests
npm test

# Start Electron in dev mode (requires a built renderer)
cd desktop && npm install && npm run dev

# Run the Python backend separately
cd morpheus && pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 7860 --reload

# Run backend tests
cd morpheus && pytest
```

---

## License

MIT
