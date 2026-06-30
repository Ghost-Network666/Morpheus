"use strict";
const { app } = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");

const PORT = 7860;
const READY_TIMEOUT_MS = 120_000;  // 2 min for first-run venv creation
const POLL_INTERVAL_MS = 500;

let serverProc = null;
let _state = { status: "idle", pid: null };

// ── Entry point ───────────────────────────────────────────────────────────────
async function startServer(onProgress) {
  const appDir  = _appDir();
  const dataDir = path.join(app.getPath("userData"), "data");
  const venvDir = path.join(app.getPath("userData"), "venv");
  const python  = await _resolvePython();

  onProgress?.("Checking environment…");

  if (!fs.existsSync(path.join(venvDir, "pyvenv.cfg"))) {
    onProgress?.("Creating Python environment (first run)…");
    await _runSetup(python, appDir, venvDir, dataDir, onProgress);
  } else {
    // Still reinstall in case requirements changed (fast when up to date)
    onProgress?.("Checking dependencies…");
    await _pip(venvDir, appDir);
  }

  onProgress?.("Starting Morpheus backend…");
  await _spawnServer(venvDir, appDir, dataDir);
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

async function _resolvePython() {
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

  if (process.platform === "win32") {
    await _tryInstallPythonWindows();
    for (const cmd of _windowsPythonCandidates()) {
      try {
        const ver = await _run(cmd, ["--version"]);
        const m = ver.match(/(\d+)\.(\d+)/);
        if (m && (parseInt(m[1]) > 3 || (parseInt(m[1]) === 3 && parseInt(m[2]) >= 10))) {
          return cmd;
        }
      } catch (_) {}
    }
  }

  throw new Error(
    "PYTHON_MISSING:Python 3.10+ is required but was not found on this machine.\n\nMorpheus will open the Python download page — install Python 3.11 or newer, then click Retry."
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

async function _tryInstallPythonWindows() {
  try {
    await _run("winget", [
      "install", "--id", "Python.Python.3.11", "-e",
      "--silent", "--scope", "machine", "--accept-package-agreements",
      "--accept-source-agreements",
    ]);
  } catch (_) {}
}

async function _runSetup(python, appDir, venvDir, dataDir, onProgress) {
  const { runSetup } = require("./setup");
  await runSetup({ python, appDir, venvDir, dataDir, onProgress });
}

async function _pip(venvDir, appDir) {
  const pip = _venvBin(venvDir, "pip");
  const req = path.join(appDir, "requirements.txt");
  if (!fs.existsSync(req)) return;
  await _run(pip, ["install", "-q", "-r", req]);
}

async function _spawnServer(venvDir, appDir, dataDir) {
  const uvicorn = _venvBin(venvDir, "uvicorn");
  const env = {
    ...process.env,
    DATA_DIR: dataDir,
    PORT: String(PORT),
    HOST: "127.0.0.1",
    // Disable colour codes so logs are clean
    NO_COLOR: "1",
  };

  fs.mkdirSync(dataDir, { recursive: true });

  serverProc = spawn(uvicorn, ["app.main:app", "--host", "127.0.0.1", "--port", String(PORT)], {
    cwd: appDir,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  _state = { status: "starting", pid: serverProc.pid };

  serverProc.stdout.on("data", d => process.stdout.write(`[backend] ${d}`));
  serverProc.stderr.on("data", d => process.stderr.write(`[backend] ${d}`));
  serverProc.on("exit", (code) => {
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

function _venvBin(venvDir, name) {
  return process.platform === "win32"
    ? path.join(venvDir, "Scripts", `${name}.exe`)
    : path.join(venvDir, "bin", name);
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
