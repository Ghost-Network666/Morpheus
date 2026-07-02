"use strict";
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  // ── Intro ──────────────────────────────────────────────────────────────────
  introDone: () => ipcRenderer.send("intro-done"),

  // ── Connection screen ──────────────────────────────────────────────────────
  onConnectionsData: (cb) => ipcRenderer.on("connections-data", (_e, data) => cb(data)),
  connectLocal:      () => ipcRenderer.send("connect-local"),
  connectRemote:     (name, url) => ipcRenderer.send("connect-remote", { name, url }),
  deleteConnection:  (id) => ipcRenderer.send("delete-connection", id),
  testRemoteUrl:     (url) => ipcRenderer.invoke("test-remote-url", url),
  getConnections:    () => ipcRenderer.invoke("get-connections"),

  // ── Loading screen ──────────────────────────────────────────────────────────
  onSetupProgress: (cb) => ipcRenderer.on("setup-progress", (_e, msg) => cb(msg)),
  onSetupError:    (cb) => ipcRenderer.on("setup-error",    (_e, msg) => cb(msg)),
  retrySetup:      () => ipcRenderer.send("retry-setup"),

  // ── Global / tray ─────────────────────────────────────────────────────────
  goToConnect:   () => ipcRenderer.send("go-to-connect"),
  quitApp:       () => ipcRenderer.send("quit-app"),
  getVersion:    () => ipcRenderer.invoke("get-version"),
  openExternal:  (url) => ipcRenderer.send("open-external", url),

  // ── Remote server install ──────────────────────────────────────────────────
  remoteInstall:          (creds) => ipcRenderer.invoke("remote-install", creds),
  onRemoteInstallProgress:(cb)    => ipcRenderer.on("remote-install-progress", (_e, msg) => cb(msg)),
  listSshKeys:             ()    => ipcRenderer.invoke("list-ssh-keys"),
  browseSshKey:            ()    => ipcRenderer.invoke("browse-ssh-key"),

  // ── SSH-first remote connect (check → install → tunnel) ─────────────────────
  sshCheckStatus:  (sshOpts, remotePort) => ipcRenderer.invoke("ssh-check-status", { sshOpts, remotePort }),
  sshDockerInstall:(sshOpts)             => ipcRenderer.invoke("ssh-docker-install", { sshOpts }),
  onSshInstallProgress: (cb) => ipcRenderer.on("ssh-install-progress", (_e, msg) => cb(msg)),
  sshOpenTunnel:   (sshOpts, remotePort) => ipcRenderer.invoke("ssh-open-tunnel", { sshOpts, remotePort }),
  onSshTunnelClosed: (cb) => ipcRenderer.on("ssh-tunnel-closed", () => cb()),
  connectSsh: (name, sshOpts, remotePort, url) => ipcRenderer.send("connect-ssh", { name, sshOpts, remotePort, url }),

  // ── Updates ──────────────────────────────────────────────────────────────────
  checkForUpdates:     () => ipcRenderer.send("check-for-updates"),
  installUpdate:       () => ipcRenderer.send("install-update"),
  onUpdateAvailable:   (cb) => {
    const fn = (_e, info) => cb(info);
    ipcRenderer.on("update-available", fn);
    return () => ipcRenderer.removeListener("update-available", fn);
  },
  onUpdateDownloaded:  (cb) => {
    const fn = (_e, info) => cb(info);
    ipcRenderer.on("update-downloaded", fn);
    return () => ipcRenderer.removeListener("update-downloaded", fn);
  },
  onUpdateNotAvailable:(cb) => {
    const fn = () => cb();
    ipcRenderer.on("update-not-available", fn);
    return () => ipcRenderer.removeListener("update-not-available", fn);
  },
  onUpdateError:       (cb) => {
    const fn = () => cb();
    ipcRenderer.on("update-error", fn);
    return () => ipcRenderer.removeListener("update-error", fn);
  },

  // ── Main app (bundled native UI) ─────────────────────────────────────────────
  getApiBase: () => ipcRenderer.invoke("get-api-base"),

  // ── Setup wizard ──────────────────────────────────────────────────────────────
  checkOllama:        ()           => ipcRenderer.invoke("check-ollama"),
  installOllama:      ()           => ipcRenderer.invoke("install-ollama"),
  pullOllamaModel:    (model)      => ipcRenderer.invoke("pull-ollama-model", model),
  onOllamaProgress:   (cb)         => {
    const listener = (_e, data) => cb(data);
    ipcRenderer.on("ollama-progress", listener);
    return () => ipcRenderer.removeListener("ollama-progress", listener);
  },
  wizardConnectLocal:  (settings)      => ipcRenderer.send("wizard-connect-local",  settings),
  wizardConnectRemote: (name, url)     => ipcRenderer.send("wizard-connect-remote", { name, url }),
});
