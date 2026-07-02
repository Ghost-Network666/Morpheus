"use strict";
const fs = require("fs");
const os = require("os");
const net = require("net");
const path = require("path");
const { Client } = require("ssh2");

const INSTALL_CMD =
  "curl -fsSL https://raw.githubusercontent.com/Ghost-Network666/Morpheus/main/scripts/easy-server-install.sh | bash";

const DOCKER_INSTALL_CMD =
  "curl -fsSL https://raw.githubusercontent.com/Ghost-Network666/Morpheus/main/scripts/docker-server-install.sh | bash";

const STATUS_MARKER = "__MORPHEUS_STATUS__";

const SSH_DIR = path.join(os.homedir(), ".ssh");
const KEY_NAMES = ["id_ed25519", "id_ecdsa", "id_rsa", "id_dsa"];

function _buildConnectOpts({ host, port = 22, username, password, authType, keyPath, passphrase }) {
  const connectOpts = { host, port: Number(port), username, readyTimeout: 20000 };

  if (authType === "agent") {
    const agentSock = process.env.SSH_AUTH_SOCK || (process.platform === "win32" ? "pageant" : undefined);
    if (!agentSock) throw new Error("No SSH agent detected (SSH_AUTH_SOCK is not set).");
    connectOpts.agent = agentSock;
  } else if (authType === "key") {
    if (!keyPath) throw new Error("No SSH key selected.");
    connectOpts.privateKey = fs.readFileSync(keyPath, "utf8");
    if (passphrase) connectOpts.passphrase = passphrase;
  } else {
    connectOpts.password = password;
  }
  return connectOpts;
}

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

function _runInstall(sshOpts, installCmd, onProgress, onDone) {
  const conn = new Client();
  let connectOpts;
  try {
    connectOpts = _buildConnectOpts(sshOpts);
  } catch (err) {
    onDone(err.message);
    return;
  }

  conn
    .on("ready", () => {
      onProgress("[ssh] Connected — starting installation…\n");
      conn.exec(installCmd, (err, stream) => {
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

function remoteInstall(sshOpts, onProgress, onDone) {
  _runInstall(sshOpts, INSTALL_CMD, onProgress, onDone);
}

function dockerInstall(sshOpts, onProgress, onDone) {
  _runInstall(sshOpts, DOCKER_INSTALL_CMD, onProgress, onDone);
}

// SSHes in, checks whether Docker is available and whether Morpheus is
// already reachable on the remote's loopback interface.
function checkRemoteStatus(sshOpts, remotePort, onDone) {
  const conn = new Client();
  let connectOpts;
  try {
    connectOpts = _buildConnectOpts(sshOpts);
  } catch (err) {
    onDone({ ok: false, error: err.message });
    return;
  }

  const cmd = [
    "DOCKER=no",
    "command -v docker >/dev/null 2>&1 && DOCKER=yes",
    `RUNNING=no`,
    `curl -fsS -o /dev/null -m 3 http://127.0.0.1:${remotePort}/api/system/info && RUNNING=yes`,
    `echo ${STATUS_MARKER} DOCKER=$DOCKER RUNNING=$RUNNING`,
  ].join("; ");

  conn
    .on("ready", () => {
      conn.exec(cmd, (err, stream) => {
        if (err) {
          conn.end();
          onDone({ ok: false, error: "SSH exec error: " + err.message });
          return;
        }
        let out = "";
        stream
          .on("close", () => {
            conn.end();
            const line = out.split("\n").find((l) => l.includes(STATUS_MARKER));
            if (!line) {
              onDone({ ok: false, error: "Could not determine remote status." });
              return;
            }
            const dockerInstalled = /DOCKER=yes/.test(line);
            const morpheusRunning = /RUNNING=yes/.test(line);
            onDone({ ok: true, dockerInstalled, morpheusRunning });
          })
          .on("data", (data) => {
            out += data.toString();
          })
          .stderr.on("data", () => {});
      });
    })
    .on("error", (err) => {
      onDone({ ok: false, error: "SSH connection failed: " + err.message });
    })
    .connect(connectOpts);
}

// Opens an SSH local port-forward: 127.0.0.1:<localPort> -> remote 127.0.0.1:<remotePort>.
// Calls onReady(localPort, handle) once the tunnel is listening; handle.close() tears it down.
function openTunnel(sshOpts, remotePort, onReady, onError, onClose) {
  const conn = new Client();
  let connectOpts;
  try {
    connectOpts = _buildConnectOpts(sshOpts);
  } catch (err) {
    onError(err.message);
    return;
  }

  const server = net.createServer((socket) => {
    conn.forwardOut("127.0.0.1", socket.remotePort, "127.0.0.1", Number(remotePort), (err, stream) => {
      if (err) {
        socket.end();
        return;
      }
      socket.pipe(stream).pipe(socket);
      stream.on("error", () => socket.destroy());
      socket.on("error", () => stream.destroy());
    });
  });

  const close = () => {
    try { server.close(); } catch (_) {}
    try { conn.end(); } catch (_) {}
  };

  conn
    .on("ready", () => {
      server.listen(0, "127.0.0.1", () => {
        onReady(server.address().port, { close });
      });
    })
    .on("error", (err) => {
      onError("SSH connection failed: " + err.message);
    })
    .on("close", () => {
      try { server.close(); } catch (_) {}
      if (onClose) onClose();
    })
    .connect(connectOpts);
}

module.exports = { remoteInstall, dockerInstall, checkRemoteStatus, openTunnel, listSshKeys };
