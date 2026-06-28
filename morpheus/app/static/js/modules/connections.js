import API from "../api.js";
import { toast } from "../app.js";

// ── Provider definitions ───────────────────────────────────────────────────
// type "oauth"   → clicking Connect starts an OAuth redirect flow
// type "apikey"  → clicking Connect expands an inline key input + link to dashboard
// type "url"     → just a URL field (e.g. Ollama, SearXNG)
const PROVIDERS = [
  // AI
  {
    id: "openai", name: "OpenAI", icon: "⬡", category: "AI",
    desc: "GPT-4o, o1, DALL·E, Whisper",
    type: "apikey",
    key_label: "API Key",
    key_url: "https://platform.openai.com/api-keys",
    settings_key: "openai_api_key",
    placeholder: "sk-…",
  },
  {
    id: "anthropic", name: "Anthropic", icon: "◈", category: "AI",
    desc: "Claude Sonnet, Claude Opus",
    type: "apikey",
    key_label: "API Key",
    key_url: "https://console.anthropic.com/settings/keys",
    settings_key: "anthropic_api_key",
    placeholder: "sk-ant-…",
  },
  {
    id: "ollama", name: "Ollama", icon: "🦙", category: "AI",
    desc: "Local models — llama3, mistral, gemma…",
    type: "url",
    key_label: "Server URL",
    key_url: "https://ollama.com",
    settings_key: "ollama_url",
    placeholder: "http://localhost:11434",
  },
  // Search
  {
    id: "brave", name: "Brave Search", icon: "🦁", category: "Search",
    desc: "Independent web search API",
    type: "apikey",
    key_label: "API Key",
    key_url: "https://api.search.brave.com/app/keys",
    settings_key: "brave_api_key",
    placeholder: "BSA…",
  },
  {
    id: "tavily", name: "Tavily", icon: "🔍", category: "Search",
    desc: "AI-optimised real-time search",
    type: "apikey",
    key_label: "API Key",
    key_url: "https://app.tavily.com/home",
    settings_key: "tavily_api_key",
    placeholder: "tvly-…",
  },
  {
    id: "searxng", name: "SearXNG", icon: "🔎", category: "Search",
    desc: "Self-hosted meta-search engine",
    type: "url",
    key_label: "Instance URL",
    key_url: "https://searxng.github.io/searxng/",
    settings_key: "searxng_url",
    placeholder: "http://localhost:8888",
  },
  {
    id: "google", name: "Google PSE", icon: "G", category: "Search",
    desc: "Google Programmable Search Engine",
    type: "dual",
    fields: [
      { label: "API Key", settings_key: "google_pse_key", placeholder: "AIza…", secret: true },
      { label: "Search Engine ID (CX)", settings_key: "google_pse_cx", placeholder: "cx:…", secret: false },
    ],
    key_url: "https://programmablesearchengine.google.com/controlpanel/all",
  },
  // Code
  {
    id: "github", name: "GitHub", icon: "🐙", category: "Code",
    desc: "Repos, issues, pull requests",
    type: "oauth",
    oauth_provider: "github",
    key_url: "https://github.com/settings/tokens/new",
    // fallback if no OAuth app configured: personal access token
    apikey_fallback: true,
    key_label: "Personal Access Token",
    settings_key: "github_token",
    placeholder: "ghp_…",
  },
  // Productivity
  {
    id: "notion", name: "Notion", icon: "◻", category: "Productivity",
    desc: "Pages, databases, workspace",
    type: "oauth",
    oauth_provider: "notion",
    key_url: "https://www.notion.so/my-integrations",
    apikey_fallback: true,
    key_label: "Integration Token",
    settings_key: "notion_token",
    placeholder: "secret_…",
  },
  {
    id: "linear", name: "Linear", icon: "◆", category: "Productivity",
    desc: "Issues, cycles, projects",
    type: "apikey",
    key_label: "API Key",
    key_url: "https://linear.app/settings/api",
    settings_key: "linear_api_key",
    placeholder: "lin_api_…",
  },
  // Notifications
  {
    id: "ntfy", name: "ntfy", icon: "🔔", category: "Notifications",
    desc: "Push notifications to any device",
    type: "url",
    key_label: "Server URL",
    key_url: "https://ntfy.sh",
    settings_key: "ntfy_url",
    placeholder: "https://ntfy.sh",
  },
  {
    id: "slack", name: "Slack", icon: "💬", category: "Notifications",
    desc: "Workspace messages and alerts",
    type: "apikey",
    key_label: "Webhook URL",
    key_url: "https://api.slack.com/apps",
    settings_key: "slack_webhook",
    placeholder: "https://hooks.slack.com/services/…",
  },
];

// Track which card is expanded
let _expanded = null;
let _settings = {};

export async function initConnections() {
  try {
    _settings = await API.settings.get();
  } catch { _settings = {}; }

  _render();

  document.getElementById("backup-btn")?.addEventListener("click", async () => {
    try {
      const b = await API.post("/api/connections/backup");
      toast(`Backup created: ${b.path}`, "success");
    } catch (e) { toast(e.message, "error"); }
  });

  // Handle OAuth callback result in URL hash
  _checkOAuthResult();
}

// ── Render grid ────────────────────────────────────────────────────────────
function _render() {
  const grid = document.getElementById("connections-grid");
  if (!grid) return;

  // Group by category
  const categories = [...new Set(PROVIDERS.map(p => p.category))];

  grid.innerHTML = categories.map(cat => {
    const providers = PROVIDERS.filter(p => p.category === cat);
    return `
      <div class="settings-section">
        <div class="settings-section-title">${cat}</div>
        <div class="provider-grid">
          ${providers.map(p => _cardHtml(p)).join("")}
        </div>
      </div>`;
  }).join("");

  // Wire up buttons after DOM insertion
  PROVIDERS.forEach(p => _wireCard(p));
}

function _isConnected(p) {
  if (p.type === "dual") {
    return p.fields.every(f => _settingHasValue(f.settings_key));
  }
  return _settingHasValue(p.settings_key);
}

function _settingHasValue(key) {
  const v = _settings[key];
  return v && v !== "" && !String(v).startsWith("••");
}

function _cardHtml(p) {
  const connected = _isConnected(p);
  return `
    <div class="provider-card ${connected ? "connected" : ""}" id="card-${p.id}">
      <div class="provider-badge ${connected ? "connected" : ""}"></div>
      <div class="provider-card-header">
        <div class="provider-icon">${p.icon}</div>
        <div>
          <div class="provider-name">${p.name}</div>
          <div class="provider-status ${connected ? "ok" : ""}">${connected ? "Connected" : "Not connected"}</div>
        </div>
      </div>
      <div class="provider-desc">${p.desc}</div>
      <div class="provider-actions">
        ${connected
          ? `<button class="btn btn-secondary btn-sm" data-action="disconnect" data-id="${p.id}">Disconnect</button>`
          : `<button class="btn btn-primary btn-sm" data-action="connect" data-id="${p.id}">${p.type === "oauth" ? "Authorise →" : "Connect"}</button>`
        }
        ${connected ? `<a href="${p.key_url}" target="_blank" rel="noopener" class="btn btn-secondary btn-sm">Dashboard ↗</a>` : ""}
      </div>
      <div class="provider-key-form" id="form-${p.id}" style="display:none"></div>
    </div>`;
}

function _wireCard(p) {
  const card = document.getElementById(`card-${p.id}`);
  if (!card) return;

  card.querySelector("[data-action='connect']")?.addEventListener("click", () => _handleConnect(p));
  card.querySelector("[data-action='disconnect']")?.addEventListener("click", () => _handleDisconnect(p));
}

// ── Connect flow ───────────────────────────────────────────────────────────
function _handleConnect(p) {
  if (p.type === "oauth") {
    _startOAuth(p);
  } else {
    _toggleForm(p);
  }
}

function _toggleForm(p) {
  const form = document.getElementById(`form-${p.id}`);
  if (!form) return;

  if (_expanded && _expanded !== p.id) {
    const prev = document.getElementById(`form-${_expanded}`);
    if (prev) prev.style.display = "none";
  }

  if (form.style.display === "none" || !form.innerHTML) {
    form.style.display = "flex";
    form.style.flexDirection = "column";
    form.style.gap = "8px";
    form.innerHTML = _formHtml(p);
    _wireForm(p, form);
    _expanded = p.id;
  } else {
    form.style.display = "none";
    _expanded = null;
  }
}

function _formHtml(p) {
  if (p.type === "dual") {
    return `
      ${p.fields.map(f => `
        <div>
          <label class="form-label">${f.label}</label>
          <input type="${f.secret ? "password" : "text"}" id="input-${p.id}-${f.settings_key}"
            placeholder="${f.placeholder}" class="provider-key-input">
        </div>`).join("")}
      <div style="display:flex;gap:6px;align-items:center">
        <button class="btn btn-primary btn-sm" data-save="${p.id}">Save</button>
        <a href="${p.key_url}" target="_blank" rel="noopener" style="font-size:11px;color:var(--accent)">Get credentials ↗</a>
      </div>`;
  }
  return `
    <div>
      <label class="form-label">${p.key_label}</label>
      <input type="${p.type === "url" ? "url" : "password"}" id="input-${p.id}"
        placeholder="${p.placeholder}" class="provider-key-input">
    </div>
    <div style="display:flex;gap:6px;align-items:center">
      <button class="btn btn-primary btn-sm" data-save="${p.id}">Save</button>
      <a href="${p.key_url}" target="_blank" rel="noopener" style="font-size:11px;color:var(--accent)">
        ${p.type === "url" ? "Learn more ↗" : "Get your key ↗"}
      </a>
    </div>`;
}

function _wireForm(p, form) {
  form.querySelector(`[data-save="${p.id}"]`)?.addEventListener("click", async () => {
    const updates = {};

    if (p.type === "dual") {
      for (const f of p.fields) {
        const val = document.getElementById(`input-${p.id}-${f.settings_key}`)?.value?.trim();
        if (val) updates[f.settings_key] = val;
      }
    } else {
      const val = document.getElementById(`input-${p.id}`)?.value?.trim();
      if (val) updates[p.settings_key] = val;
    }

    if (!Object.keys(updates).length) {
      toast("Enter a value", "error");
      return;
    }

    try {
      await API.settings.update(updates);
      Object.assign(_settings, updates);
      toast(`${p.name} connected`, "success");
      form.style.display = "none";
      _expanded = null;
      _render(); // re-render grid to show connected state
    } catch (e) { toast(e.message, "error"); }
  });
}

// ── OAuth flow ─────────────────────────────────────────────────────────────
function _startOAuth(p) {
  // OAuth requires a registered app — fall back to token input if none configured
  // For now, show the token input form (providers like GitHub/Notion also accept PATs)
  _toggleForm(p);

  // Future: if server has client_id configured, do real OAuth redirect:
  // window.location.href = `/api/connections/oauth/${p.oauth_provider}/start`;
}

function _checkOAuthResult() {
  // After an OAuth callback redirect back to /#/connections?oauth=github&status=ok
  const params = new URLSearchParams(window.location.search);
  const provider = params.get("oauth");
  const status   = params.get("status");
  if (provider && status === "ok") {
    toast(`${provider} connected successfully`, "success");
    // Clean URL
    history.replaceState(null, "", location.pathname + location.hash);
    _render();
  } else if (provider && status === "error") {
    toast(`${provider} connection failed`, "error");
    history.replaceState(null, "", location.pathname + location.hash);
  }
}

// ── Disconnect ─────────────────────────────────────────────────────────────
async function _handleDisconnect(p) {
  const keys = p.type === "dual" ? p.fields.map(f => f.settings_key) : [p.settings_key];
  const updates = {};
  for (const k of keys) updates[k] = "__clear__";
  try {
    await API.settings.update(updates);
    for (const k of keys) delete _settings[k];
    toast(`${p.name} disconnected`, "success");
    _render();
  } catch (e) { toast(e.message, "error"); }
}
