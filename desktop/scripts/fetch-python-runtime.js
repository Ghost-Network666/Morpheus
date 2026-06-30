#!/usr/bin/env node
"use strict";
/**
 * Downloads a pinned, checksum-verified Python standalone runtime
 * (python-build-standalone) and pre-installs the backend's
 * requirements.txt into it. The result ships inside the packaged app
 * as desktop/python-runtime/, so installers are fully self-contained —
 * no system Python, pip, or venv is required on the user's machine.
 *
 * Usage: node fetch-python-runtime.js <mac-x64|mac-arm64|win-x64>
 */
const https = require("https");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

const RUNTIMES = {
  "mac-x64": {
    url: "https://github.com/astral-sh/python-build-standalone/releases/download/20260623/cpython-3.11.15%2B20260623-x86_64-apple-darwin-install_only.tar.gz",
    sha256: "38f3c18a4ccbd6faa09243c45c85d8e09b5a7b345e02f174346cf72ebf901f87",
    pythonBin: "bin/python3",
  },
  "mac-arm64": {
    url: "https://github.com/astral-sh/python-build-standalone/releases/download/20260623/cpython-3.11.15%2B20260623-aarch64-apple-darwin-install_only.tar.gz",
    sha256: "d2324bfd1a7b9fc44ccd884c3a2505bcab6691dbfd4f8270e10c50aaa4e19506",
    pythonBin: "bin/python3",
  },
  "win-x64": {
    url: "https://github.com/astral-sh/python-build-standalone/releases/download/20260623/cpython-3.11.15%2B20260623-x86_64-pc-windows-msvc-install_only.tar.gz",
    sha256: "7e0a8abfee952efc63dff290022a73f0185b586f522678ae7a757a56f23c289b",
    pythonBin: "python.exe",
  },
};

const OUT_DIR = path.join(__dirname, "..", "python-runtime");
const REQUIREMENTS = path.join(__dirname, "..", "..", "morpheus", "requirements.txt");

async function main() {
  const target = process.argv[2];
  const runtime = RUNTIMES[target];
  if (!runtime) {
    console.error(`Unknown target "${target}". Expected one of: ${Object.keys(RUNTIMES).join(", ")}`);
    process.exit(1);
  }

  const tmpTar = path.join(os.tmpdir(), `morpheus-python-runtime-${target}.tar.gz`);

  console.log(`[python-runtime] Downloading runtime for ${target}...`);
  await download(runtime.url, tmpTar);

  console.log("[python-runtime] Verifying checksum...");
  const actual = await sha256File(tmpTar);
  if (actual !== runtime.sha256) {
    throw new Error(`Checksum mismatch for ${target}\n  expected: ${runtime.sha256}\n  actual:   ${actual}`);
  }

  console.log("[python-runtime] Extracting...");
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });
  execFileSync("tar", ["-xzf", tmpTar, "-C", OUT_DIR, "--strip-components=1"], { stdio: "inherit" });
  fs.rmSync(tmpTar, { force: true });

  const pythonBin = path.join(OUT_DIR, ...runtime.pythonBin.split("/"));
  if (!fs.existsSync(pythonBin)) {
    throw new Error(`Expected python binary not found at ${pythonBin}`);
  }

  console.log("[python-runtime] Installing backend dependencies into runtime...");
  execFileSync(pythonBin, ["-m", "pip", "install", "--no-cache-dir", "--prefer-binary", "-r", REQUIREMENTS], { stdio: "inherit" });

  console.log("[python-runtime] Stripping __pycache__...");
  stripPycache(OUT_DIR);

  console.log(`[python-runtime] Done. Runtime ready at ${OUT_DIR}`);
}

function download(url, dest, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https
      .get(url, { headers: { "User-Agent": "morpheus-build" } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          file.close();
          fs.rmSync(dest, { force: true });
          if (redirectsLeft <= 0) return reject(new Error("Too many redirects"));
          return resolve(download(res.headers.location, dest, redirectsLeft - 1));
        }
        if (res.statusCode !== 200) {
          file.close();
          fs.rmSync(dest, { force: true });
          return reject(new Error(`Download failed: HTTP ${res.statusCode} for ${url}`));
        }
        res.pipe(file);
        file.on("finish", () => file.close(resolve));
        file.on("error", reject);
      })
      .on("error", (err) => {
        fs.rmSync(dest, { force: true });
        reject(err);
      });
  });
}

function sha256File(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(file);
    stream.on("data", (d) => hash.update(d));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

function stripPycache(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__pycache__") {
        fs.rmSync(full, { recursive: true, force: true });
      } else {
        stripPycache(full);
      }
    }
  }
}

main().catch((err) => {
  console.error("[python-runtime] FAILED:", err.message);
  process.exit(1);
});
