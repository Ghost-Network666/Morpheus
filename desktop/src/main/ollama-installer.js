"use strict";
const { app, net } = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn, exec } = require("child_process");
const os = require("os");

const OLLAMA_API = "http://127.0.0.1:11434";

const DOWNLOAD_URLS = {
  darwin: "https://ollama.com/download/Ollama-darwin.zip",
  win32:  "https://ollama.com/download/OllamaSetup.exe",
};

async function checkOllamaStatus() {
  const installed = await _checkInstalled();
  const running   = await _checkRunning();
  let models = [];
  if (running) {
    try {
      const res = await _fetchOllamaJson("/api/tags");
      models = (res.models || []).map(m => m.name);
    } catch (_) {}
  }
  return { installed, running, models };
}

function _checkInstalled() {
  return new Promise((resolve) => {
    if (process.platform === "darwin") {
      if (fs.existsSync("/Applications/Ollama.app")) return resolve(true);
      exec("which ollama", (err) => resolve(!err));
    } else if (process.platform === "win32") {
      const p = path.join(os.homedir(), "AppData", "Local", "Programs", "Ollama", "ollama.exe");
      if (fs.existsSync(p)) return resolve(true);
      exec("where ollama", (err) => resolve(!err));
    } else {
      exec("which ollama", (err) => resolve(!err));
    }
  });
}

function _checkRunning() {
  return new Promise((resolve) => {
    try {
      const req = net.request({ url: `${OLLAMA_API}/api/tags`, method: "GET" });
      req.on("response", (res) => resolve(res.statusCode < 500));
      req.on("error", () => resolve(false));
      req.end();
      setTimeout(() => resolve(false), 4000);
    } catch (_) {
      resolve(false);
    }
  });
}

function _fetchOllamaJson(urlPath) {
  return new Promise((resolve, reject) => {
    const req = net.request({ url: `${OLLAMA_API}${urlPath}`, method: "GET" });
    let body = "";
    req.on("response", (res) => {
      res.on("data", (c) => { body += c; });
      res.on("end", () => { try { resolve(JSON.parse(body)); } catch { resolve({}); } });
    });
    req.on("error", reject);
    req.end();
  });
}

async function installOllama(onProgress) {
  const platform = process.platform;
  if (platform === "darwin") return _installMac(onProgress);
  if (platform === "win32")  return _installWindows(onProgress);
  return _installLinux(onProgress);
}

async function _installMac(onProgress) {
  const tmpDir  = app.getPath("temp");
  const zipPath = path.join(tmpDir, "Ollama-darwin.zip");

  onProgress({ stage: "download", message: "Downloading Ollama for macOS…", progress: 0 });
  await _downloadFile(DOWNLOAD_URLS.darwin, zipPath, (pct) =>
    onProgress({ stage: "download", message: `Downloading Ollama… ${pct}%`, progress: pct * 0.7 }),
  );

  onProgress({ stage: "install", message: "Extracting Ollama.app…", progress: 72 });
  await _run("unzip", ["-o", zipPath, "-d", tmpDir]);

  const appSrc = path.join(tmpDir, "Ollama.app");
  if (!fs.existsSync(appSrc)) throw new Error("Ollama.app not found in downloaded zip");

  onProgress({ stage: "install", message: "Copying to /Applications…", progress: 85 });
  await _run("cp", ["-R", appSrc, "/Applications/Ollama.app"]);
  try { fs.rmSync(zipPath, { force: true }); } catch (_) {}
  try { fs.rmSync(appSrc, { recursive: true, force: true }); } catch (_) {}

  onProgress({ stage: "starting", message: "Starting Ollama…", progress: 92 });
  await _launchAndWait();
  onProgress({ stage: "done", message: "Ollama is running!", progress: 100 });
}

async function _installWindows(onProgress) {
  const tmpDir  = app.getPath("temp");
  const exePath = path.join(tmpDir, "OllamaSetup.exe");

  onProgress({ stage: "download", message: "Downloading Ollama for Windows…", progress: 0 });
  await _downloadFile(DOWNLOAD_URLS.win32, exePath, (pct) =>
    onProgress({ stage: "download", message: `Downloading Ollama… ${pct}%`, progress: pct * 0.7 }),
  );

  onProgress({ stage: "install", message: "Installing Ollama (may take a moment)…", progress: 72 });
  await _run(exePath, ["/silent", "/install", "/norestart"]);
  try { fs.unlinkSync(exePath); } catch (_) {}

  onProgress({ stage: "starting", message: "Starting Ollama…", progress: 92 });
  await _launchAndWait();
  onProgress({ stage: "done", message: "Ollama is running!", progress: 100 });
}

async function _installLinux(onProgress) {
  onProgress({ stage: "install", message: "Installing Ollama on Linux…", progress: 5 });
  await new Promise((resolve, reject) => {
    const proc = spawn("sh", ["-c", "curl -fsSL https://ollama.com/install.sh | sh"], { shell: false });
    proc.stdout.on("data", (d) =>
      onProgress({ stage: "install", message: d.toString().trim().slice(0, 80), progress: 50 }),
    );
    proc.stderr.on("data", (d) =>
      onProgress({ stage: "install", message: d.toString().trim().slice(0, 80), progress: 50 }),
    );
    proc.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`install.sh exited ${code}`))));
    proc.on("error", reject);
  });
  onProgress({ stage: "starting", message: "Starting Ollama…", progress: 90 });
  await _launchAndWait();
  onProgress({ stage: "done", message: "Ollama is running!", progress: 100 });
}

async function _launchAndWait() {
  try {
    if (process.platform === "darwin") {
      spawn("open", ["-a", "Ollama"], { detached: true, stdio: "ignore" }).unref();
    } else if (process.platform === "win32") {
      const ollamaExe = path.join(os.homedir(), "AppData", "Local", "Programs", "Ollama", "ollama.exe");
      if (fs.existsSync(ollamaExe)) {
        spawn(ollamaExe, ["serve"], { detached: true, stdio: "ignore" }).unref();
      }
    } else {
      spawn("ollama", ["serve"], { detached: true, stdio: "ignore" }).unref();
    }
  } catch (_) {}

  // Wait up to 30 seconds for API to respond
  for (let i = 0; i < 30; i++) {
    await _sleep(1000);
    if (await _checkRunning()) return;
  }
}

async function pullModel(modelName, onProgress) {
  return new Promise((resolve, reject) => {
    const req = net.request({ url: `${OLLAMA_API}/api/pull`, method: "POST" });
    req.setHeader("Content-Type", "application/json");

    let buffer = "";
    req.on("response", (res) => {
      res.on("data", (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);
            const pct = data.total && data.completed
              ? Math.round((data.completed / data.total) * 100)
              : null;
            onProgress({ message: data.status || "", progress: pct });
            if (data.status === "success") return resolve();
          } catch (_) {}
        }
      });
      res.on("end", () => resolve());
      res.on("error", reject);
    });
    req.on("error", reject);
    req.write(JSON.stringify({ name: modelName, stream: true }));
    req.end();
  });
}

function _downloadFile(url, dest, onProgress) {
  return new Promise((resolve, reject) => {
    const req = net.request({ url, method: "GET" });
    let total = 0;
    let downloaded = 0;

    req.on("response", (res) => {
      const cl = res.headers["content-length"];
      if (cl) total = parseInt(cl);

      const ws = fs.createWriteStream(dest);
      res.on("data", (chunk) => {
        ws.write(chunk);
        downloaded += chunk.length;
        if (total > 0) onProgress(Math.round((downloaded / total) * 100));
      });
      res.on("end", () => { ws.end(); resolve(); });
      res.on("error", (err) => { ws.destroy(); reject(err); });
    });
    req.on("error", reject);
    req.end();
  });
}

function _run(cmd, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { shell: false });
    let stderr = "";
    proc.stderr?.on("data", (d) => { stderr += d; });
    proc.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`${path.basename(cmd)} exited ${code}: ${stderr.trim()}`)),
    );
    proc.on("error", reject);
  });
}

function _sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

module.exports = { checkOllamaStatus, installOllama, pullModel };
