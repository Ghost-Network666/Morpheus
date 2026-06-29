"use strict";
const { app } = require("electron");
const path = require("path");
const fs = require("fs");

const CONFIG_PATH = path.join(app.getPath("userData"), "morpheus-config.json");

const LOCAL_CONNECTION = {
  id: "local",
  name: "Local (this computer)",
  url: "http://127.0.0.1:7860",
  type: "local",
};

function _read() {
  try {
    if (fs.existsSync(CONFIG_PATH)) return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  } catch (_) {}
  return null;
}

function _write(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf8");
}

function _defaultConfig() {
  return { firstLaunch: true, lastConnectionId: null, connections: [] };
}

function getConfig() {
  return _read() || _defaultConfig();
}

function isFirstLaunch() {
  const c = _read();
  return !c || c.firstLaunch === true;
}

function markIntroSeen() {
  const c = getConfig();
  c.firstLaunch = false;
  _write(c);
}

function getConnections() {
  const c = getConfig();
  const saved = (c.connections || []).filter(x => x.id !== "local");
  return [LOCAL_CONNECTION, ...saved];
}

function getLastConnection() {
  const c = getConfig();
  if (!c.lastConnectionId) return null;
  if (c.lastConnectionId === "local") return LOCAL_CONNECTION;
  return (c.connections || []).find(x => x.id === c.lastConnectionId) || null;
}

function saveRemoteConnection(name, url) {
  const c = getConfig();
  const normalUrl = url.replace(/\/$/, "");
  const existing = (c.connections || []).find(x => x.url === normalUrl && x.type === "remote");
  if (existing) {
    existing.name = name;
    _write(c);
    return existing.id;
  }
  const id = "remote_" + Date.now();
  c.connections = [...(c.connections || []), { id, name, url: normalUrl, type: "remote" }];
  _write(c);
  return id;
}

function setLastConnection(id) {
  const c = getConfig();
  c.lastConnectionId = id;
  _write(c);
}

function deleteConnection(id) {
  if (id === "local") return;
  const c = getConfig();
  c.connections = (c.connections || []).filter(x => x.id !== id);
  if (c.lastConnectionId === id) c.lastConnectionId = null;
  _write(c);
}

module.exports = {
  isFirstLaunch,
  markIntroSeen,
  getConnections,
  getLastConnection,
  saveRemoteConnection,
  setLastConnection,
  deleteConnection,
  LOCAL_CONNECTION,
};
