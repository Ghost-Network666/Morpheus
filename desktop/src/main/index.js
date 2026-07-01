"use strict";
const { app, BrowserWindow, Tray, Menu, shell, ipcMain, net, dialog } = require("electron");
const path = require("path");
const {
  isFirstLaunch, markIntroSeen,
  getConnections, getLastConnection,
  saveRemoteConnection, setLastConnection, deleteConnection,
  LOCAL_CONNECTION,
} = require("./connections");
const { startServer, stopServer } = require("./server");

const IS_DEV = process.argv.includes("--dev");
const VERSION = app.getVersion();

let mainWindow    = null;
let introWindow   = null;
let connectWindow = null;
let loadingWindow = null;
let tray          = null;
let activeConn    = null;
let apiBase       = null;

// ── Auto-updater ──────────────────────────────────────────────────────────
let _autoUpdater = null;

function _initUpdater() {
  if (IS_DEV) return;
  try {
    const { autoUpdater } = require("electron-updater");
    _autoUpdater = autoUpdater;
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on("update-downloaded", (info) => {
      const choice = dialog.showMessageBoxSync({
        type: "info",
        title: "Update ready",
        message: `Morpheus ${info.version} has been downloaded.`,
        detail: "Restart now to install the update, or it will install automatically when you quit.",
        buttons: ["Restart Now", "Later"],
        defaultId: 0,
      });
      if (choice === 0) autoUpdater.quitAndInstall();
    });

    autoUpdater.on("update-not-available", () => {
      if (_updateCheckManual) {
        _updateCheckManual = false;
        dialog.showMessageBox({
          type: "info",
          title: "Up to date",
          message: `Morpheus v${VERSION} is the latest version.`,
          buttons: ["OK"],
        });
      }
    });

    autoUpdater.on("error", () => {
      if (_updateCheckManual) {
        _updateCheckManual = false;
        dialog.showMessageBox({
          type: "warning",
          title: "Update check failed",
          message: "Could not check for updates. Verify your internet connection and try again.",
          buttons: ["OK"],
        });
      }
    });

    // Automatic check after a short delay so the main window is visible first
    setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 8000);
  } catch (_) {}
}

let _updateCheckManual = false;

function _checkForUpdatesManually() {
  if (!_autoUpdater) {
    dialog.showMessageBox({
      type: "info",
      title: "Update check unavailable",
      message: "Automatic updates are only available in the packaged app.",
      buttons: ["OK"],
    });
    return;
  }
  _updateCheckManual = true;
  _autoUpdater.checkForUpdates().catch(() => {
    _updateCheckManual = false;
  });
}

// ── Boot ───────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  _buildAppMenu();
  _initUpdater();

  if (isFirstLaunch()) {
    _openIntro();
  } else {
    const last = getLastConnection();
    if (last) {
      await _connect(last);
    } else {
      _openConnect();
    }
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") _quit();
});

app.on("activate", () => {
  if (mainWindow) mainWindow.show();
  else if (activeConn) _openMain(activeConn.url);
});

app.on("before-quit", () => stopServer());

// ── Native app menu ─────────────────────────────────────────────────────
function _buildAppMenu() {
  const isMac = process.platform === "darwin";

  const template = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        {
          label: `About Morpheus`,
          click: _showAbout,
        },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { label: "Quit Morpheus", accelerator: "Cmd+Q", click: _quit },
      ],
    }] : []),
    {
      label: "Edit",
      submenu: [
        { role: "undo" }, { role: "redo" },
        { type: "separator" },
        { role: "cut" }, { role: "copy" }, { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "toggleDevTools", visible: IS_DEV },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Connection",
      submenu: [
        {
          label: "Switch Connection…",
          accelerator: isMac ? "Cmd+Shift+C" : "Ctrl+Shift+C",
          click: () => {
            if (mainWindow) { mainWindow.close(); mainWindow = null; }
            _closeWindow("loading");
            stopServer();
            activeConn = null;
            _openConnect();
          },
        },
      ],
    },
    {
      label: "Help",
      submenu: [
        {
          label: "Check for Updates…",
          click: _checkForUpdatesManually,
        },
        { type: "separator" },
        {
          label: "GitHub Repository",
          click: () => shell.openExternal("https://github.com/Ghost-Network666/Morpheus"),
        },
        {
          label: "Report an Issue",
          click: () => shell.openExternal("https://github.com/Ghost-Network666/Morpheus/issues"),
        },
        { type: "separator" },
        ...(!isMac ? [{ label: `About Morpheus v${VERSION}`, click: _showAbout }] : []),
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function _showAbout() {
  dialog.showMessageBox({
    type: "info",
    title: "Morpheus",
    message: `Morpheus v${VERSION}`,
    detail: "Self-hosted AI workspace\n\nLocal AI chat, agent mode, notes, tasks, calendar, SSH, RAG memory, and more.\n\nhttps://github.com/Ghost-Network666/Morpheus",
    buttons: ["OK"],
  });
}

// ── Window helpers ───────────────────────────────────────────────────────
function _preload() {
  return path.join(__dirname, "../preload/index.js");
}

function _openIntro() {
  introWindow = new BrowserWindow({
    width: 740, height: 540,
    frame: false, resizable: false, center: true,
    webPreferences: { preload: _preload(), contextIsolation: true, nodeIntegration: false },
  });
  introWindow.loadFile(path.join(__dirname, "../renderer/intro.html"));
  if (IS_DEV) introWindow.webContents.openDevTools({ mode: "detach" });
}

function _openConnect(fromIntro = false) {
  _closeWindow("intro");
  connectWindow = new BrowserWindow({
    width: 580, height: 640,
    frame: false, resizable: false, center: true,
    webPreferences: { preload: _preload(), contextIsolation: true, nodeIntegration: false },
  });
  connectWindow.loadFile(path.join(__dirname, "../renderer/connect.html"));
  connectWindow.webContents.once("did-finish-load", () => {
    if (!connectWindow.isDestroyed()) {
      connectWindow.webContents.send("connections-data", {
        connections: getConnections(),
        last: getLastConnection(),
      });
    }
  });
  if (IS_DEV) connectWindow.webContents.openDevTools({ mode: "detach" });
}

function _openLoading() {
  const isMac = process.platform === "darwin";
  loadingWindow = new BrowserWindow({
    width: 420, height: 320,
    frame: false,
    transparent: isMac,
    backgroundColor: isMac ? undefined : "#1e1e2e",
    resizable: false, center: true,
    webPreferences: { preload: _preload(), contextIsolation: true, nodeIntegration: false },
  });
  loadingWindow.loadFile(path.join(__dirname, "../renderer/loading.html"));
  return loadingWindow;
}

function _openMain(url) {
  _closeWindow("loading");
  apiBase = url.replace(/\/$/, "");

  mainWindow = new BrowserWindow({
    width: 1280, height: 820,
    minWidth: 900, minHeight: 600,
    title: "Morpheus",
    show: false,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    webPreferences: {
      preload: _preload(),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "../../app/dist/index.html"));
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    _refreshTrayMenu();
  });
  mainWindow.on("closed", () => { mainWindow = null; });

  mainWindow.webContents.setWindowOpenHandler(({ url: openUrl }) => {
    shell.openExternal(openUrl);
    return { action: "deny" };
  });

  if (IS_DEV) mainWindow.webContents.openDevTools();
  _createTray();
}

function _closeWindow(which) {
  const wins = { intro: introWindow, connect: connectWindow, loading: loadingWindow };
  const win = wins[which];
  if (win && !win.isDestroyed()) { win.close(); }
  if (which === "intro") introWindow = null;
  if (which === "connect") connectWindow = null;
  if (which === "loading") loadingWindow = null;
}

// ── Connection logic ─────────────────────────────────────────────────────
async function _connect(connection) {
  _closeWindow("connect");
  _closeWindow("loading");
  activeConn = connection;
  setLastConnection(connection.id);

  if (connection.type === "local") {
    const lwin = _openLoading();
    try {
      await startServer((msg) => {
        if (!lwin.isDestroyed()) lwin.webContents.send("setup-progress", msg);
      });
      _openMain("http://127.0.0.1:7860");
    } catch (err) {
      if (!lwin.isDestroyed()) lwin.webContents.send("setup-error", err.message || String(err));
    }
  } else {
    _openMain(connection.url);
  }
}

// ── Tray ───────────────────────────────────────────────────────────────
function _createTray() {
  if (tray) return;
  const assetsDir = app.isPackaged
    ? path.join(process.resourcesPath, "assets")
    : path.join(__dirname, "../../assets");
  const icon = process.platform === "win32"
    ? path.join(assetsDir, "icon.ico")
    : path.join(assetsDir, "icon.png");
  tray = new Tray(icon);
  tray.setToolTip(`Morpheus v${VERSION}`);
  _refreshTrayMenu();
  tray.on("click", () => {
    if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
    else if (activeConn) _openMain(activeConn.url);
  });
}

function _refreshTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: "Open Morpheus",
      click: () => {
        if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
        else if (activeConn) _openMain(activeConn.url);
      },
    },
    activeConn
      ? { label: `${activeConn.name}`, enabled: false }
      : { label: "Not connected", enabled: false },
    { type: "separator" },
    {
      label: "Switch Connection…",
      click: () => {
        if (mainWindow) { mainWindow.close(); mainWindow = null; }
        _closeWindow("loading");
        stopServer();
        activeConn = null;
        _openConnect();
      },
    },
    { type: "separator" },
    { label: "Check for Updates…", click: _checkForUpdatesManually },
    { label: `v${VERSION}`, enabled: false },
    { label: "Quit Morpheus", click: _quit },
  ]));
}

function _quit() {
  stopServer();
  app.quit();
}

// ── IPC ───────────────────────────────────────────────────────────────
ipcMain.on("intro-done", () => {
  markIntroSeen();
  _openConnect(true);
});

ipcMain.on("connect-local", () => _connect(LOCAL_CONNECTION));

ipcMain.on("connect-remote", (_e, { name, url }) => {
  const id = saveRemoteConnection(name, url);
  const conn = getConnections().find(c => c.id === id)
    || { id, name, url: url.replace(/\/$/, ""), type: "remote" };
  _connect(conn);
});

ipcMain.on("delete-connection", (_e, id) => {
  deleteConnection(id);
  if (connectWindow && !connectWindow.isDestroyed()) {
    connectWindow.webContents.send("connections-data", {
      connections: getConnections(),
      last: getLastConnection(),
    });
  }
});

ipcMain.on("retry-setup", () => {
  if (activeConn) {
    stopServer();
    _connect(activeConn);
  }
});

ipcMain.on("go-to-connect", () => {
  if (mainWindow) { mainWindow.close(); mainWindow = null; }
  _closeWindow("loading");
  stopServer();
  activeConn = null;
  _openConnect();
});

ipcMain.on("quit-app", () => _quit());

ipcMain.on("open-external", (_e, url) => shell.openExternal(url));

ipcMain.handle("test-remote-url", async (_e, url) => {
  try {
    const checkUrl = `${url.replace(/\/$/, "")}/api/system/info`;
    const res = await net.fetch(checkUrl, { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      return { ok: true, data };
    }
    return { ok: false, error: `Server returned HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, error: err.message || "Connection failed" };
  }
});

ipcMain.handle("get-connections", () => ({
  connections: getConnections(),
  last: getLastConnection(),
}));

ipcMain.handle("get-version", () => VERSION);

ipcMain.handle("get-api-base", () => apiBase);

ipcMain.on("check-for-updates", () => _checkForUpdatesManually());

ipcMain.handle("remote-install", (event, { host, port, username, password, authType, keyPath, passphrase }) => {
  const { remoteInstall } = require("./remote-install");
  return new Promise((resolve) => {
    remoteInstall(
      { host, port, username, password, authType, keyPath, passphrase },
      (msg) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send("remote-install-progress", msg);
        }
      },
      (err) => {
        const result = { ok: !err, error: err || null };

        if (!event.sender.isDestroyed()) {
          event.sender.send("remote-install-completed", result);
        }

        resolve(result);

        if (!err) {
          setTimeout(() => {
            try {
              try { stopServer(); } catch (_) {}
              app.relaunch();
              app.exit(0);
            } catch (e) {
              console.error("Failed to relaunch after remote install:", e);
            }
          }, 2000);
        }
      },
    );
  });
});

ipcMain.handle("list-ssh-keys", () => {
  const { listSshKeys } = require("./remote-install");
  return listSshKeys();
});

ipcMain.handle("browse-ssh-key", async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showOpenDialog(win, {
    title: "Select SSH Private Key",
    properties: ["openFile"],
  });
  if (result.canceled || !result.filePaths.length) return null;
  const keyPath = result.filePaths[0];
  return { path: keyPath, name: path.basename(keyPath) };
});
