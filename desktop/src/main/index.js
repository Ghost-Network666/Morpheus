"use strict";
const { app, BrowserWindow, Tray, Menu, shell, ipcMain, net } = require("electron");
const path = require("path");
const {
  isFirstLaunch, markIntroSeen,
  getConnections, getLastConnection,
  saveRemoteConnection, setLastConnection, deleteConnection,
  LOCAL_CONNECTION,
} = require("./connections");
const { startServer, stopServer } = require("./server");

const IS_DEV = process.argv.includes("--dev");

let mainWindow    = null;
let introWindow   = null;
let connectWindow = null;
let loadingWindow = null;
let tray          = null;
let activeConn    = null;  // currently active connection object

// ── Boot ──────────────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
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

// ── Window helpers ────────────────────────────────────────────────────────────
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
}

function _openLoading() {
  loadingWindow = new BrowserWindow({
    width: 420, height: 320,
    frame: false, transparent: true, resizable: false, center: true,
    webPreferences: { preload: _preload(), contextIsolation: true, nodeIntegration: false },
  });
  loadingWindow.loadFile(path.join(__dirname, "../renderer/loading.html"));
  return loadingWindow;
}

function _openMain(url) {
  _closeWindow("loading");
  mainWindow = new BrowserWindow({
    width: 1280, height: 820,
    minWidth: 900, minHeight: 600,
    title: "Morpheus",
    show: false,
    webPreferences: {
      preload: _preload(),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadURL(url);
  mainWindow.once("ready-to-show", () => mainWindow.show());
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

// ── Connection logic ──────────────────────────────────────────────────────────
async function _connect(connection) {
  _closeWindow("connect");
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
    // Remote: load the server's UI directly
    _openMain(connection.url);
  }
}

// ── Tray ──────────────────────────────────────────────────────────────────────
function _createTray() {
  if (tray) return;
  const assetsDir = app.isPackaged
    ? path.join(process.resourcesPath, "assets")
    : path.join(__dirname, "../../assets");
  const icon = process.platform === "win32"
    ? path.join(assetsDir, "icon.ico")
    : path.join(assetsDir, "icon.png");
  tray = new Tray(icon);
  tray.setToolTip("Morpheus");
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
      ? { label: `Connected: ${activeConn.name}`, enabled: false }
      : { label: "Not connected", enabled: false },
    {
      label: "Switch Connection…",
      click: () => {
        if (mainWindow) { mainWindow.close(); mainWindow = null; }
        _openConnect();
      },
    },
    {
      label: "Open in Browser",
      click: () => activeConn && shell.openExternal(activeConn.url),
      enabled: !!activeConn,
    },
    { type: "separator" },
    { label: "Quit Morpheus", click: _quit },
  ]));
}

function _quit() {
  stopServer();
  app.quit();
}

// ── IPC ───────────────────────────────────────────────────────────────────────
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

ipcMain.on("switch-connection", (_e, id) => {
  const conn = getConnections().find(c => c.id === id);
  if (conn) _connect(conn);
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
  if (activeConn) _connect(activeConn);
});

ipcMain.on("go-to-connect", () => {
  if (mainWindow) { mainWindow.close(); mainWindow = null; }
  stopServer();
  activeConn = null;
  _openConnect();
});

ipcMain.on("quit-app", () => _quit());

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
