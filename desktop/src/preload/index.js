"use strict";
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  // ── Intro ──────────────────────────────────────────────────────────────────
  introDone: () => ipcRenderer.send("intro-done"),

  // ── Connection screen ──────────────────────────────────────────────────────
  onConnectionsData: (cb) => ipcRenderer.on("connections-data", (_e, data) => cb(data)),
  connectLocal:      () => ipcRenderer.send("connect-local"),
  connectRemote:     (name, url) => ipcRenderer.send("connect-remote", { name, url }),
  switchConnection:  (id) => ipcRenderer.send("switch-connection", id),
  deleteConnection:  (id) => ipcRenderer.send("delete-connection", id),
  testRemoteUrl:     (url) => ipcRenderer.invoke("test-remote-url", url),
  getConnections:    () => ipcRenderer.invoke("get-connections"),

  // ── Loading / error screen ─────────────────────────────────────────────────
  onSetupProgress: (cb) => ipcRenderer.on("setup-progress", (_e, msg) => cb(msg)),
  onSetupError:    (cb) => ipcRenderer.on("setup-error",    (_e, msg) => cb(msg)),
  onErrorMessage:  (cb) => ipcRenderer.on("error-message",  (_e, msg) => cb(msg)),
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

  // ── Main app (bundled native UI) ─────────────────────────────────────────────
  getApiBase: () => ipcRenderer.invoke("get-api-base"),
});
