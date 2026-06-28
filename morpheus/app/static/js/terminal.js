import API from "./api.js";
import { toast } from "./app.js";

// ── State ─────────────────────────────────────────────────────────────────────
let _term = null;
let _fitAddon = null;
let _ws = null;
let _sessionId = null;
let _mode = "local";   // "local" | "cloud"
let _inited = false;

// ── Init ──────────────────────────────────────────────────────────────────────
export async function initTerminal() {
  if (!_inited) {
    _inited = true;
    _buildXterm();
    _wireConnector();
  } else {
    _refit();
  }

  if (_mode === "local" && !_ws) {
    await _connectLocal();
  }
}

// ── xterm setup ───────────────────────────────────────────────────────────────
function _buildXterm() {
  const pane = document.getElementById("terminal-pane");
  if (!pane || typeof Terminal === "undefined") return;

  _term = new Terminal({
    theme: {
      background: "#1a1b1e",
      foreground: "#abb2bf",
      cursor: "#e06c75",
      selectionBackground: "rgba(224,108,117,0.25)",
      black: "#282c34", red: "#e06c75", green: "#98c379", yellow: "#e5c07b",
      blue: "#61afef", magenta: "#c678dd", cyan: "#56b6c2", white: "#abb2bf",
    },
    fontFamily: '"Fira Code", "Cascadia Code", Consolas, monospace',
    fontSize: 13, lineHeight: 1.35, cursorBlink: true,
    allowTransparency: true, scrollback: 5000,
  });

  if (typeof FitAddon !== "undefined") {
    _fitAddon = new FitAddon.FitAddon();
    _term.loadAddon(_fitAddon);
  }

  _term.open(pane);
  _refit();

  new ResizeObserver(() => _refit()).observe(pane);

  _term.onData((data) => {
    if (_ws?.readyState === WebSocket.OPEN)
      _ws.send(new TextEncoder().encode(data));
  });

  _term.onResize(({ cols, rows }) => {
    if (_ws?.readyState === WebSocket.OPEN)
      _ws.send(JSON.stringify({ type: "resize", cols, rows }));
  });
}

function _refit() {
  if (_fitAddon) setTimeout(() => _fitAddon.fit(), 30);
}

// ── Connector toggle wiring ───────────────────────────────────────────────────
function _wireConnector() {
  const btn     = document.getElementById("connector-toggle");
  const cancel  = document.getElementById("cloud-cancel-btn");
  const connect = document.getElementById("cloud-connect-btn");
  const authSel = document.getElementById("cloud-auth-method");
  const popover = document.getElementById("cloud-popover");

  btn?.addEventListener("click", () => {
    if (_mode === "local") {
      // Show popover to get cloud creds
      popover && (popover.style.display = popover.style.display === "none" ? "block" : "none");
    } else {
      // Switch back to local
      _disconnectCloud();
      _setMode("local");
      _connectLocal();
    }
  });

  cancel?.addEventListener("click", () => {
    popover && (popover.style.display = "none");
  });

  connect?.addEventListener("click", async () => {
    popover && (popover.style.display = "none");
    await _connectCloud();
  });

  authSel?.addEventListener("change", () => {
    const isKey = authSel.value === "key";
    const kf = document.getElementById("cloud-key-fields");
    const pf = document.getElementById("cloud-pw-fields");
    if (kf) kf.style.display = isKey ? "" : "none";
    if (pf) pf.style.display = isKey ? "none" : "";
  });

  // Close popover on outside click
  document.addEventListener("click", (e) => {
    if (!popover) return;
    if (!popover.contains(e.target) && e.target !== btn && !btn?.contains(e.target)) {
      popover.style.display = "none";
    }
  });
}

// ── Local connection ──────────────────────────────────────────────────────────
async function _connectLocal() {
  _setStatus("Connecting…");
  _term?.clear();
  _term?.writeln("\x1b[2m  Morpheus — Local Shell\x1b[0m\r\n");
  try {
    const { session_id } = await API.terminal.local(_term?.cols || 80, _term?.rows || 24);
    _sessionId = session_id;
    _openWs(session_id);
    _setStatus("Ready");
  } catch (e) {
    _setStatus("Error", "error");
    _term?.writeln(`\x1b[31m  ${e.message}\x1b[0m`);
  }
}

// ── Cloud connection ──────────────────────────────────────────────────────────
async function _connectCloud() {
  const host     = document.getElementById("cloud-host")?.value.trim();
  const port     = parseInt(document.getElementById("cloud-port")?.value) || 22;
  const username = document.getElementById("cloud-user")?.value.trim() || "root";
  const auth     = document.getElementById("cloud-auth-method")?.value;
  const password = document.getElementById("cloud-password")?.value;
  const key_path = document.getElementById("cloud-key-path")?.value.trim();

  if (!host) { toast("Host is required", "error"); return; }

  _setMode("connecting");
  _setStatus("Connecting…");
  _term?.clear();
  _term?.writeln(`\x1b[2m  Connecting to ${_esc(host)}…\x1b[0m\r\n`);

  try {
    const { session_id } = await API.ssh.quickConnect({
      host, port, username,
      ...(auth === "password" ? { password } : { key_path }),
      cols: _term?.cols || 80, rows: _term?.rows || 24,
    });
    _sessionId = session_id;
    _openWs(session_id);
    _setMode("cloud");
    _setStatus(`${username}@${host}`, "connected");
  } catch (e) {
    _setMode("local");
    _setStatus("Failed", "error");
    _term?.writeln(`\x1b[31m  SSH Error: ${e.message}\x1b[0m`);
    toast(e.message, "error");
  }
}

function _disconnectCloud() {
  _ws?.close();
  _ws = null;
  _sessionId = null;
  _term?.clear();
}

// ── WebSocket ─────────────────────────────────────────────────────────────────
function _openWs(sessionId) {
  if (_ws) { _ws.close(); _ws = null; }
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(`${proto}//${location.host}/api/terminal/ws/${sessionId}`);
  ws.binaryType = "arraybuffer";
  _ws = ws;

  ws.onopen = () => {
    ws.send(JSON.stringify({ type: "resize", cols: _term?.cols || 80, rows: _term?.rows || 24 }));
  };
  ws.onmessage = (e) => {
    const data = e.data instanceof ArrayBuffer ? new Uint8Array(e.data) : new TextEncoder().encode(e.data);
    _term?.write(data);
  };
  ws.onclose = () => {
    _term?.writeln("\r\n\x1b[2m[disconnected]\x1b[0m");
    if (_mode === "cloud") _setMode("local");
    _setStatus("Disconnected");
  };
  ws.onerror = () => _term?.writeln("\r\n\x1b[31m[connection error]\x1b[0m");
}

// ── UI helpers ────────────────────────────────────────────────────────────────
function _setMode(mode) {
  _mode = mode;
  const btn   = document.getElementById("connector-toggle");
  const local = document.getElementById("connector-local-label");
  const cloud = document.getElementById("connector-cloud-label");

  btn?.classList.remove("cloud", "connecting");
  if (mode === "cloud")      btn?.classList.add("cloud");
  if (mode === "connecting") btn?.classList.add("connecting");

  local?.classList.toggle("active", mode === "local");
  cloud?.classList.toggle("active", mode === "cloud" || mode === "connecting");
}

function _setStatus(text, cls = "") {
  const el = document.getElementById("connector-status");
  if (!el) return;
  el.textContent = text;
  el.className = "connector-status" + (cls ? ` ${cls}` : "");
}

function _esc(s) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}
