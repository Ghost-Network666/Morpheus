"use strict";
const { app, BrowserWindow, Tray, Menu, shell, ipcMain, dialog, nativeImage } = require("electron");
const path = require("path");
const { startServer, stopServer, getServerUrl, getServerState } = require("./server");

const IS_DEV = process.argv.includes("--dev");
const BACKEND_URL = "http://127.0.0.1:7860";

let mainWindow = null;
let loadingWindow = null;
let tray = null;
let serverReady = false;

// ── App lifecycle ──────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  _createLoadingWindow();
  try {
    await startServer(_onSetupProgress);
    serverReady = true;
    _createMainWindow();
    _createTray();
  } catch (err) {
    _showError(err.message || String(err));
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") _quit();
});

app.on("activate", () => {
  if (mainWindow) {
    mainWindow.show();
  } else if (serverReady) {
    _createMainWindow();
  }
});

app.on("before-quit", () => stopServer());

// ── Windows ───────────────────────────────────────────────────────────────────
function _createLoadingWindow() {
  loadingWindow = new BrowserWindow({
    width: 420,
    height: 320,
    frame: false,
    transparent: true,
    resizable: false,
    center: true,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  loadingWindow.loadFile(path.join(__dirname, "../renderer/loading.html"));
}

function _createMainWindow() {
  if (loadingWindow && !loadingWindow.isDestroyed()) {
    loadingWindow.close();
    loadingWindow = null;
  }

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: "Morpheus",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadURL(BACKEND_URL);

  mainWindow.once("ready-to-show", () => mainWindow.show());

  mainWindow.on("closed", () => { mainWindow = null; });

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (IS_DEV) mainWindow.webContents.openDevTools();
}

function _showError(message) {
  if (loadingWindow && !loadingWindow.isDestroyed()) {
    loadingWindow.webContents.send("setup-error", message);
    return;
  }
  // Fallback: open error window
  const errWin = new BrowserWindow({
    width: 500,
    height: 400,
    frame: false,
    resizable: false,
    center: true,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  errWin.loadFile(path.join(__dirname, "../renderer/error.html"));
  errWin.webContents.once("did-finish-load", () => {
    errWin.webContents.send("error-message", message);
  });
}

// ── Setup progress → loading window ──────────────────────────────────────────
function _onSetupProgress(msg) {
  if (loadingWindow && !loadingWindow.isDestroyed()) {
    loadingWindow.webContents.send("setup-progress", msg);
  }
}

// ── Tray ──────────────────────────────────────────────────────────────────────
function _createTray() {
  const iconPath = _trayIconPath();
  tray = new Tray(iconPath);
  tray.setToolTip("Morpheus");
  tray.setContextMenu(_trayMenu());
  tray.on("click", () => {
    if (mainWindow) mainWindow.show();
    else if (serverReady) _createMainWindow();
  });
}

function _trayMenu() {
  return Menu.buildFromTemplate([
    {
      label: "Open Morpheus",
      click: () => {
        if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
        else if (serverReady) _createMainWindow();
      },
    },
    {
      label: "Open in Browser",
      click: () => shell.openExternal(BACKEND_URL),
    },
    { type: "separator" },
    { label: "Quit", click: _quit },
  ]);
}

function _trayIconPath() {
  const assetsDir = app.isPackaged
    ? path.join(process.resourcesPath, "assets")
    : path.join(__dirname, "../../assets");

  if (process.platform === "win32") return path.join(assetsDir, "icon.ico");
  if (process.platform === "darwin") return path.join(assetsDir, "icon.png");
  return path.join(assetsDir, "icon.png");
}

function _quit() {
  stopServer();
  app.quit();
}

// ── IPC ───────────────────────────────────────────────────────────────────────
ipcMain.handle("get-server-state", () => getServerState());

ipcMain.on("retry-setup", async () => {
  try {
    await startServer(_onSetupProgress);
    serverReady = true;
    _createMainWindow();
    _createTray();
  } catch (err) {
    _showError(err.message || String(err));
  }
});

ipcMain.on("quit-app", () => _quit());
