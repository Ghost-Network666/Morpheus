"use strict";
const { Client } = require("ssh2");

const INSTALL_CMD =
  "curl -fsSL https://raw.githubusercontent.com/Ghost-Network666/Morpheus/main/scripts/easy-server-install.sh | bash";

function remoteInstall({ host, port = 22, username, password }, onProgress, onDone) {
  const conn = new Client();

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
    .connect({ host, port: Number(port), username, password });
}

module.exports = { remoteInstall };
