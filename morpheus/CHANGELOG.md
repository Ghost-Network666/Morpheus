# Changelog

## [1.0.0] - 2025-01-01

### Added
- Core FastAPI backend with SQLite/SQLAlchemy
- Streaming chat with Ollama, OpenAI, and Anthropic providers
- ReAct agent framework with shell, web search, file I/O tools
- Local PTY terminal with xterm.js WebSocket integration
- SSH session manager with Paramiko — connect to remote servers
- Dual-mode operation: local and SSH server modes
- Model management (Cookbook): hardware detection, Ollama pull/delete
- RAG pipeline: ChromaDB + fastembed, PDF/DOCX/text upload and search
- Web research: SearXNG/Brave/Tavily search + BeautifulSoup page extraction
- Notes (Markdown), Tasks (priority/due date), Calendar (CalDAV/.ics export)
- Email: IMAP fetch, AI triage/summarise, reply drafting
- Document editor: file browser, inline editor, AI suggestions
- Encrypted Vault for secrets (AES-256 via Fernet)
- API token management with scopes
- Settings: per-module toggles, theme (dark/light), provider config
- Auth: bcrypt passwords, session cookies, TOTP 2FA, Bearer tokens
- Tailscale auto-detection and MagicDNS URL printing
- Launcher scripts: macOS (.sh), Windows (PowerShell + tkinter splash + pystray tray), Ubuntu systemd service
- Docker Compose stack: Morpheus + SearXNG + ChromaDB + ntfy
- PyInstaller build scripts for Windows .exe and macOS .app
- Backup/restore (zip export of data directory)
- Comprehensive pytest test suite
