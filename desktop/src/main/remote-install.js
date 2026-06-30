"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { Client } = require("ssh2");

const INSTALL_CMD =
  "curl -fsSL https://raw.githubusercontent.com/Ghost-Network666/Morpheus/main/scripts/easy-server-install.sh | bash";

const SSH_DIR = path.join(os.homedir(), ".ssh");
const KEY_NAMES = ["id_ed25519", "id_ecdsa", "id_rsa", "id_dsa"];

// Scans ~/.ssh for private keys that have a matching .pub file.
function listSshKeys() {
  let entries = [];
  try {
    entries = fs.readdirSync(SSH_DIR);
  } catch (_) {
    return [];
  }

  const pubs = new Set(entries.filter((f) => f.endsWith(".pub")));
  const keys = [];

  for (const name of KEY_NAMES) {
    if (entries.includes(name) && pubs.has(`${name}.pub`)) {
      keys.push({ path: path.join(SSH_DIR, name), name });
    }
  }
  for (const f of entries) {
    if (f.endsWith(".pub")) continue;
    const base = f;
    if (KEY_NAMES.includes(base)) continue; // already added above
    if (pubs.has(`${base}.pub`)) {
      keys.push({ path: path.join(SSH_DIR, base), name: base });
    }
  }

  return keys;
}

function remoteInstall({ host, port = 22, username, password, authType, keyPath, passphrase }, onProgress, onDone) {
  const conn = new Client();
  const connectOpts = { host, port: Number(port), username, readyTimeout: 20000 };

  if (authType === "agent") {
    const agentSock = process.env.SSH_AUTH_SOCK || (process.platform === "win32" ? "pageant" : undefined);
    if (!agentSock) {
      onDone("No SSH agent detected (SSH_AUTH_SOCK is not set).");
      return;
    }
    connectOpts.agent = agentSock;
  } else if (authType === "key") {
    if (!keyPath) {
      onDone("No SSH key selected.");
      return;
    }
    try {
      connectOpts.privateKey = fs.readFileSync(keyPath, "utf8");
    } catch (err) {
      onDone(`Could not read key file: ${err.message}`);
      return;
    }
    if (passphrase) connectOpts.passphrase = passphrase;
  } else {
    connectOpts.password = password;
  }

  conn
    .on("ready", () => {
      onProgress("[ssh] Connected — starting installation…\n");
      conn.exec(INSTALL_CMD, (err, stream) => {
        if (err) {
          conn.end();
          onDone("SSH exec error: " + err.message);
          return;
        }
        stream
          .on("close", (code) => {
            conn.end();
            onDone(code === 0 ? null : `Installation exited with code ${code}`);
          })
          .on("data", (data) => onProgress(data.toString()))
          .stderr.on("data", (data) => onProgress(data.toString()));
      });
    })
    .on("error", (err) => {
      onDone("SSH connection failed: " + err.message);
    })
    .connect(connectOpts);
}

module.exports = { remoteInstall, listSshKeys };
