import API from "./api.js";
import { toast } from "./app.js";
import { setMode, getModes, getCurrentMode } from "./modules/background.js";

let _settings = {};

const THEMES = [
  { id: "one-dark",    label: "One Dark",    color: "#e06c75" },
  { id: "catppuccin",  label: "Catppuccin",  color: "#cba6f7" },
  { id: "tokyo-night", label: "Tokyo Night", color: "#7aa2f7" },
  { id: "dracula",     label: "Dracula",     color: "#ff79c6" },
  { id: "nord",        label: "Nord",        color: "#88c0d0" },
  { id: "solarized",   label: "Solarized",   color: "#268bd2" },
  { id: "light",       label: "Light",       color: "#0d6efd" },
];

const BG_ICONS = { dots: "✦", constellation: "✧", rain: "⌨", flow: "〰", none: "○" };

const MODULES = ["terminal","ssh","agent","rag","email","calendar","notes","tasks","research","documents","cookbook","connections"];

export async function initSettings() {
  try {
    _settings = await API.settings.get();
  } catch (e) {
    toast(e.message, "error");
    _settings = {};
  }
  _render();
  _checkEnvBanner();
}

async function _checkEnvBanner() {
  const banner = document.getElementById("env-banner");
  if (!banner) return;
  try {
    const { has_env } = await API.settings.envStatus();
    if (!has_env) {
      banner.style.display = "flex";
      document.getElementById("env-banner-dismiss")?.addEventListener("click", () => {
        banner.style.display = "none";
      });
    }
  } catch { /* non-fatal */ }
}

function _render() {
  _renderThemePicker();
  _renderBgPicker();
  _renderDensityPicker();
  _renderFields();
  _renderModules();
  _wireButtons();
}

// ── Appearance ────────────────────────────────────────────────────────────────
function _renderThemePicker() {
  const container = document.getElementById("theme-picker");
  if (!container) return;
  const current = localStorage.getItem("morpheus_theme") || "one-dark";
  container.className = "theme-grid";
  container.innerHTML = "";
  for (const t of THEMES) {
    const card = document.createElement("div");
    card.className = "theme-card" + (t.id === current ? " active" : "");
    card.innerHTML = `<div class="theme-swatch" style="background:${t.color}"></div><div class="theme-name">${t.label}</div>`;
    card.addEventListener("click", () => {
      applyTheme(t.id);
      container.querySelectorAll(".theme-card").forEach(c => c.classList.remove("active"));
      card.classList.add("active");
    });
    container.appendChild(card);
  }
}

function _renderBgPicker() {
  const container = document.getElementById("bg-picker");
  if (!container) return;
  const current = getCurrentMode();
  container.className = "bg-pattern-grid";
  container.innerHTML = "";
  for (const mode of getModes()) {
    const btn = document.createElement("button");
    btn.className = "bg-pattern-btn" + (mode === current ? " active" : "");
    btn.title = mode.charAt(0).toUpperCase() + mode.slice(1);
    btn.textContent = BG_ICONS[mode] || mode;
    btn.addEventListener("click", () => {
      setMode(mode);
      container.querySelectorAll(".bg-pattern-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
    });
    container.appendChild(btn);
  }
}

function _renderDensityPicker() {
  const sel = document.getElementById("density-select");
  if (!sel) return;
  sel.value = localStorage.getItem("morpheus_density") || "comfortable";
  sel.addEventListener("change", () => applyDensity(sel.value));
}

// ── All text / select / checkbox fields ──────────────────────────────────────
function _renderFields() {
  const s = _settings;

  // AI Providers
  _set("setting-default-model",    s.default_model    || "");
  _set("setting-default-provider", s.default_provider || "ollama");
  _set("setting-ollama-url",       s.ollama_url       || "");
  _set("setting-openai-key",       s.openai_api_key && s.openai_api_key.startsWith("••") ? "" : (s.openai_api_key || ""), "placeholder", s.openai_api_key ? "••••••••" : "sk-…");
  _set("setting-openai-base-url",  s.openai_base_url  || "");
  _set("setting-anthropic-key",    s.anthropic_api_key && s.anthropic_api_key.startsWith("••") ? "" : (s.anthropic_api_key || ""), "placeholder", s.anthropic_api_key ? "••••••••" : "sk-ant-…");

  // Search
  _set("setting-searxng-url",   s.searxng_url  || "");
  _set("setting-brave-key",     "", "placeholder", s.brave_api_key   ? "••••••••" : "BSA…");
  _set("setting-tavily-key",    "", "placeholder", s.tavily_api_key  ? "••••••••" : "tvly-…");
  _set("setting-google-pse-key","", "placeholder", s.google_pse_key  ? "••••••••" : "AIza…");
  _set("setting-google-pse-cx", s.google_pse_cx || "");

  // Notifications
  _set("setting-ntfy-url",   s.ntfy_url   || "");
  _set("setting-ntfy-topic", s.ntfy_topic || "");

  // Auth
  _check("setting-auth-enabled", !!s.auth_enabled);
  _set("setting-session-days", s.session_expire_days != null ? String(s.session_expire_days) : "30");
  _set("setting-trusted-lan",  s.trusted_lan || "127.0.0.1/8,::1");

  // Server
  _set("setting-app-port",  s.app_port != null ? String(s.app_port) : "7860");
  _check("setting-app-debug", !!s.app_debug);

  // RAG
  _check("setting-chroma-in-process", s.chroma_in_process !== false);
  _set("setting-chroma-host", s.chroma_host || "localhost");
  _set("setting-chroma-port", s.chroma_port != null ? String(s.chroma_port) : "8000");
}

function _set(id, value, attr = "value", attrVal) {
  const el = document.getElementById(id);
  if (!el) return;
  el[attr] = value !== undefined ? value : "";
  if (attrVal !== undefined) el.setAttribute(attr === "value" ? "placeholder" : attr, attrVal);
  if (attr === "placeholder" && attrVal) el.setAttribute("placeholder", attrVal);
}

function _check(id, checked) {
  const el = document.getElementById(id);
  if (el) el.checked = checked;
}

// ── Module toggles ────────────────────────────────────────────────────────────
function _renderModules() {
  for (const mod of MODULES) {
    const el = document.getElementById(`toggle-${mod}`);
    if (!el) continue;
    el.checked = _settings[`module_${mod}`] !== false;
    el.addEventListener("change", () => _toggleModule(mod, el));
  }
}

async function _toggleModule(mod, checkbox) {
  try {
    const res = await API.settings.toggle(mod);
    checkbox.checked = res.enabled;
    _settings[`module_${mod}`] = res.enabled;
  } catch (e) {
    toast(e.message, "error");
    checkbox.checked = !checkbox.checked;
  }
}

// ── Buttons ───────────────────────────────────────────────────────────────────
function _wireButtons() {
  document.getElementById("settings-save-btn")?.addEventListener("click", _save);
  document.getElementById("settings-pw-btn")?.addEventListener("click", _changePassword);
}

async function _save() {
  const updates = {};

  const fields = {
    "setting-default-model":    "default_model",
    "setting-default-provider": "default_provider",
    "setting-ollama-url":       "ollama_url",
    "setting-openai-key":       "openai_api_key",
    "setting-openai-base-url":  "openai_base_url",
    "setting-anthropic-key":    "anthropic_api_key",
    "setting-searxng-url":      "searxng_url",
    "setting-brave-key":        "brave_api_key",
    "setting-tavily-key":       "tavily_api_key",
    "setting-google-pse-key":   "google_pse_key",
    "setting-google-pse-cx":    "google_pse_cx",
    "setting-ntfy-url":         "ntfy_url",
    "setting-ntfy-topic":       "ntfy_topic",
    "setting-trusted-lan":      "trusted_lan",
    "setting-chroma-host":      "chroma_host",
  };

  for (const [id, key] of Object.entries(fields)) {
    const val = document.getElementById(id)?.value?.trim();
    if (val) updates[key] = val;
  }

  // Numbers
  const port = parseInt(document.getElementById("setting-app-port")?.value);
  if (!isNaN(port)) updates.app_port = port;
  const days = parseInt(document.getElementById("setting-session-days")?.value);
  if (!isNaN(days)) updates.session_expire_days = days;
  const chromaPort = parseInt(document.getElementById("setting-chroma-port")?.value);
  if (!isNaN(chromaPort)) updates.chroma_port = chromaPort;

  // Booleans
  updates.auth_enabled        = document.getElementById("setting-auth-enabled")?.checked ?? false;
  updates.app_debug           = document.getElementById("setting-app-debug")?.checked    ?? false;
  updates.chroma_in_process   = document.getElementById("setting-chroma-in-process")?.checked ?? true;

  try {
    await API.settings.update(updates);
    toast("Settings saved", "success");
    _settings = { ..._settings, ...updates };
  } catch (e) {
    toast(e.message, "error");
  }
}

async function _changePassword() {
  const current = document.getElementById("setting-pw-current")?.value;
  const newPw   = document.getElementById("setting-pw-new")?.value;
  const confirm = document.getElementById("setting-pw-confirm")?.value;

  if (!newPw) { toast("Enter a new password", "error"); return; }
  if (newPw !== confirm) { toast("Passwords do not match", "error"); return; }

  try {
    await API.settings.changePassword(current, newPw);
    toast("Password updated", "success");
    document.getElementById("setting-pw-current").value = "";
    document.getElementById("setting-pw-new").value = "";
    document.getElementById("setting-pw-confirm").value = "";
  } catch (e) {
    toast(e.message, "error");
  }
}

// ── Exports ───────────────────────────────────────────────────────────────────
export function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("morpheus_theme", theme);
}

export function applyDensity(density) {
  document.documentElement.setAttribute("data-density", density);
  localStorage.setItem("morpheus_density", density);
}
