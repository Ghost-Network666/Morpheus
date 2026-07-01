"use strict";
const { app } = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn, execFileSync } = require("child_process");

const PORT = 7860;
const READY_TIMEOUT_MS = 120_000;  // 2 min for first-run venv creation (dev mode only)
const POLL_INTERVAL_MS = 500;

let serverProc = null;
let _state = { status: "idle", pid: null };

// ── Entry point ───────────────────────────────────────────────────────────────
// Packaged builds ship a self-contained Python runtime (desktop/python-runtime/,
// produced by scripts/fetch-python-runtime.js) with all backend dependencies
// pre-installed, so there is nothing to download or install at runtime — the
// backend just starts. Dev mode (`npm start --dev`) falls back to a system
// Python + local venv since no bundled runtime exists when running from source.
async function startServer(onProgress) {
  const appDir  = _appDir();
  const dataDir = path.join(app.getPath("userData"), "data");

  onProgress?.("Checking environment…");

  const python = app.isPackaged
    ? _bundledPython()
    : await _devPython(appDir, onProgress);

  onProgress?.("Starting Morpheus backend…");
  await _spawnServer(python, appDir, dataDir);
  onProgress?.("Waiting for server…");
  await _waitReady();
  _state = { status: "running", pid: serverProc.pid };
}

function stopServer() {
  if (!serverProc) return;
  try { serverProc.kill(); } catch (_) {}
  serverProc = null;
  _state = { status: "stopped", pid: null };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function _appDir() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "app")
    : path.join(__dirname, "../../../morpheus");
}

function _bundledPython() {
  const runtimeDir = path.join(process.resourcesPath, "python-runtime");
  const bin = process.platform === "win32"
    ? path.join(runtimeDir, "python.exe")
    : path.join(runtimeDir, "bin", "python3");

  if (!fs.existsSync(bin)) {
    throw new Error(
      "This Morpheus build is missing its bundled Python runtime. Please reinstall the latest version from the Morpheus releases page."
    );
  }

  if (process.platform === "darwin") {
    try { fs.chmodSync(bin, 0o755); } catch (_) {}
    try {
      execFileSync("xattr", ["-r", "-d", "com.apple.quarantine", runtimeDir], { stdio: "ignore" });
    } catch (_) {}
  }

  return bin;
}

// ── Dev-mode only (never reached in a packaged install) ────────────────────────
async function _devPython(appDir, onProgress) {
  const dataDirParent = app.getPath("userData");
  const venvDir = path.join(dataDirParent, "venv");
  const python = await _resolveSystemPython();

  if (!fs.existsSync(path.join(venvDir, "pyvenv.cfg"))) {
    onProgress?.("Creating Python environment (first run, dev mode)…");
    const { runSetup } = require("./setup");
    await runSetup({ python, appDir, venvDir, dataDir: path.join(dataDirParent, "data"), onProgress });
  } else {
    onProgress?.("Checking dependencies…");
    await _pip(venvDir, appDir);
  }
  return _venvBin(venvDir, "python");
}

async function _resolveSystemPython() {
  const candidates = process.platform === "win32"
    ? _windowsPythonCandidates()
    : ["python3", "python"];

  for (const cmd of candidates) {
    try {
      const ver = await _run(cmd, ["--version"]);
      const m = ver.match(/(\d+)\.(\d+)/);
      if (m && (parseInt(m[1]) > 3 || (parseInt(m[1]) === 3 && parseInt(m[2]) >= 10))) {
        return cmd;
      }
    } catch (_) {}
  }

  throw new Error(
    "Python 3.10+ is required to run Morpheus in development mode. Install it from https://www.python.org/downloads/, then retry."
  );
}

function _windowsPythonCandidates() {
  const base = [];
  const localApp = process.env.LOCALAPPDATA || "";
  for (const ver of ["311", "312", "310", "313"]) {
    base.push(
      path.join(localApp, `Programs\\Python\\Python${ver}\\python.exe`),
      `C:\\Python${ver}\\python.exe`,
      `C:\\Program Files\\Python${ver}\\python.exe`,
      `C:\\Program Files (x86)\\Python${ver}\\python.exe`,
    );
  }
  return ["python", "python3", "py", ...base];
}

async function _pip(venvDir, appDir) {
  const python = _venvBin(venvDir, "python");
  const req = path.join(appDir, "requirements.txt");
  if (!fs.existsSync(req)) return;
  await _run(python, ["-m", "pip", "install", "-q", "-r", req]);
}

function _venvBin(venvDir, name) {
  return process.platform === "win32"
    ? path.join(venvDir, "Scripts", `${name}.exe`)
    : path.join(venvDir, "bin", name);
}

// ── Shared ────────────────────────────────────────────────────────────────────
async function _spawnServer(python, appDir, dataDir) {
  const env = {
    ...process.env,
    DATA_DIR: dataDir,
    PORT: String(PORT),
    HOST: "127.0.0.1",
    NO_COLOR: "1",
  };

  fs.mkdirSync(dataDir, { recursive: true });

  serverProc = spawn(python, ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", String(PORT)], {
    cwd: appDir,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  _state = { status: "starting", pid: serverProc.pid };

  serverProc.stdout.on("data", d => process.stdout.write(`[backend] ${d}`));
  serverProc.stderr.on("data", d => process.stderr.write(`[backend] ${d}`));
  serverProc.on("exit", () => {
    _state = { status: "stopped", pid: null };
  });
}

async function _waitReady() {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/api/system/info`);
      if (res.ok) return;
    } catch (_) {}
    await _sleep(POLL_INTERVAL_MS);
  }
  throw new Error("Backend did not respond within 2 minutes. Check logs for details.");
}

function _run(cmd, args) {
  return new Promise((resolve, reject) => {
    let out = "";
    const proc = spawn(cmd, args, { shell: false });
    proc.stdout.on("data", d => { out += d; });
    proc.stderr.on("data", d => { out += d; });
    proc.on("error", reject);
    proc.on("close", code => {
      if (code === 0) resolve(out.trim());
      else reject(new Error(`${cmd} exited ${code}: ${out.trim()}`));
    });
  });
}

function _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

module.exports = { startServer, stopServer };
