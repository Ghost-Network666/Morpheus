"use strict";
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  // Called from loading/error screens
  onSetupProgress: (cb) => ipcRenderer.on("setup-progress", (_e, msg) => cb(msg)),
  onSetupError:    (cb) => ipcRenderer.on("setup-error",    (_e, msg) => cb(msg)),
  onErrorMessage:  (cb) => ipcRenderer.on("error-message",  (_e, msg) => cb(msg)),

  // Actions
  retrySetup: () => ipcRenderer.send("retry-setup"),
  quitApp:    () => ipcRenderer.send("quit-app"),

  // Status
  getServerState: () => ipcRenderer.invoke("get-server-state"),
});
