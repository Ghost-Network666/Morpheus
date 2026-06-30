"use strict";
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");

/**
 * Dev-mode first-run setup: create a venv and install requirements into it.
 * Never called in a packaged build — packaged builds ship a bundled runtime
 * with dependencies pre-installed via scripts/fetch-python-runtime.js.
 * @param {{ python, appDir, venvDir, dataDir, onProgress }} opts
 */
async function runSetup({ python, appDir, venvDir, dataDir, onProgress }) {
  // Create venv
  onProgress?.("Creating virtual environment…");
  await _run(python, ["-m", "venv", venvDir]);

  // Upgrade pip silently
  const pip = _venvBin(venvDir, "pip");
  onProgress?.("Upgrading pip…");
  await _run(pip, ["install", "-q", "--upgrade", "pip"]);

  // Install requirements
  const req = path.join(appDir, "requirements.txt");
  if (fs.existsSync(req)) {
    onProgress?.("Installing dependencies (this may take a minute)…");
    await _runWithProgress(pip, ["install", "-r", req], onProgress);
  }

  // Create data directory
  fs.mkdirSync(dataDir, { recursive: true });
  onProgress?.("Setup complete.");
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
      else reject(new Error(`Setup failed (${cmd} exited ${code}):\n${out.trim()}`));
    });
  });
}

function _runWithProgress(cmd, args, onProgress) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { shell: false });
    let last = "";
    const _emit = (line) => {
      line = line.trim();
      if (line && line !== last) {
        last = line;
        // Extract package name from pip output for friendly progress
        const m = line.match(/Successfully installed (.+)/);
        if (m) onProgress?.(`Installed: ${m[1].split(" ").slice(0, 3).join(", ")}…`);
        else if (line.startsWith("Collecting")) onProgress?.(`Downloading ${line.slice(11, 50)}…`);
      }
    };
    proc.stdout.on("data", d => d.toString().split("\n").forEach(_emit));
    proc.stderr.on("data", d => d.toString().split("\n").forEach(_emit));
    proc.on("error", reject);
    proc.on("close", code => {
      if (code === 0) resolve();
      else reject(new Error(`pip install failed (exit ${code})`));
    });
  });
}

module.exports = { runSetup };
