// API client — wraps fetch + SSE helpers

const API = {
  async request(method, path, body = null, opts = {}) {
    const headers = { "Content-Type": "application/json", ...opts.headers };
    const res = await fetch(path, {
      method,
      headers,
      credentials: "include",
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || `HTTP ${res.status}`);
    }
    if (res.status === 204) return null;
    return res.json();
  },

  get: (path, opts) => API.request("GET", path, null, opts),
  post: (path, body, opts) => API.request("POST", path, body, opts),
  put: (path, body, opts) => API.request("PUT", path, body, opts),
  delete: (path, opts) => API.request("DELETE", path, null, opts),

  // SSE stream: calls onChunk for each data event, resolves on DONE
  async stream(path, body, onChunk) {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6);
        if (data === "[DONE]") return;
        try {
          const json = JSON.parse(data);
          onChunk(json);
        } catch {}
      }
    }
  },

  // Auth
  auth: {
    login: (u, p, t) => API.post("/api/auth/login", { username: u, password: p, totp_code: t }),
    logout: () => API.post("/api/auth/logout"),
    me: () => API.get("/api/auth/me"),
  },

  // System
  system: {
    info: () => API.get("/api/system/info"),
  },

  // Chat
  chat: {
    sessions: () => API.get("/api/chat/sessions"),
    createSession: (b) => API.post("/api/chat/sessions", b),
    getSession: (id) => API.get(`/api/chat/sessions/${id}`),
    deleteSession: (id) => API.delete(`/api/chat/sessions/${id}`),
    sendMessage: (id, body, onChunk) => API.stream(`/api/chat/sessions/${id}/messages`, body, onChunk),
    runAgent: (body, onChunk) => API.stream("/api/chat/agent", body, onChunk),
  },

  // SSH
  ssh: {
    profiles: () => API.get("/api/ssh/profiles"),
    create: (b) => API.post("/api/ssh/profiles", b),
    update: (id, b) => API.put(`/api/ssh/profiles/${id}`, b),
    delete: (id) => API.delete(`/api/ssh/profiles/${id}`),
    connect: (id) => API.post(`/api/ssh/profiles/${id}/connect`),
    disconnect: (id) => API.post(`/api/ssh/profiles/${id}/disconnect`),
    openTerminal: (id, b) => API.post(`/api/ssh/profiles/${id}/terminal`, b),
    quickConnect: (b) => API.post("/api/ssh/quick-connect", b),
    active: () => API.get("/api/ssh/active"),
  },

  // Terminal
  terminal: {
    local: (cols, rows) => API.get(`/api/terminal/local?cols=${cols||80}&rows=${rows||24}`),
    resize: (id, c, r) => API.post(`/api/terminal/${id}/resize`, { cols: c, rows: r }),
    close: (id) => API.delete(`/api/terminal/${id}`),
  },

  // Cookbook
  cookbook: {
    hardware: () => API.get("/api/cookbook/hardware"),
    recommendations: () => API.get("/api/cookbook/recommendations"),
    models: () => API.get("/api/cookbook/models"),
    download: (model, onChunk) => API.stream("/api/cookbook/models/download", { model }, onChunk),
    delete: (name) => API.delete(`/api/cookbook/models/${encodeURIComponent(name)}`),
  },

  // RAG
  rag: {
    list: () => API.get("/api/rag/documents"),
    query: (q, n) => API.post("/api/rag/query", { query: q, n_results: n }),
    delete: (id) => API.delete(`/api/rag/documents/${id}`),
  },

  // Research
  research: {
    run: (body, onChunk) => API.stream("/api/research/run", body, onChunk),
  },

  // Notes
  notes: {
    list: () => API.get("/api/notes"),
    create: (b) => API.post("/api/notes", b),
    get: (id) => API.get(`/api/notes/${id}`),
    update: (id, b) => API.put(`/api/notes/${id}`, b),
    delete: (id) => API.delete(`/api/notes/${id}`),
  },

  // Tasks
  tasks: {
    list: (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return API.get(`/api/tasks${qs ? "?" + qs : ""}`);
    },
    get: (id) => API.get(`/api/tasks/${id}`),
    create: (b) => API.post("/api/tasks", b),
    update: (id, b) => API.put(`/api/tasks/${id}`, b),
    delete: (id) => API.delete(`/api/tasks/${id}`),
  },

  // Calendar
  calendar: {
    list: () => API.get("/api/calendar"),
    create: (b) => API.post("/api/calendar", b),
    update: (id, b) => API.put(`/api/calendar/${id}`, b),
    delete: (id) => API.delete(`/api/calendar/${id}`),
    exportIcs: () => window.open("/api/calendar/export.ics", "_blank"),
  },

  // Email
  email: {
    accounts: () => API.get("/api/email/accounts"),
    addAccount: (b) => API.post("/api/email/accounts", b),
    deleteAccount: (id) => API.delete(`/api/email/accounts/${id}`),
    fetch: (id) => API.post(`/api/email/accounts/${id}/fetch`),
    messages: (id) => API.get(`/api/email/accounts/${id}/messages`),
    reply: (id, b, onChunk) => API.stream(`/api/email/accounts/${id}/reply`, b, onChunk),
    triage: (id) => API.post(`/api/email/accounts/${id}/triage`),
  },

  // Documents
  docs: {
    list: (path) => API.get(`/api/documents?path=${encodeURIComponent(path || "")}`),
    getFile: (path) => fetch(`/api/documents/file?path=${encodeURIComponent(path)}`, { credentials: "include" }).then(r => r.text()),
    saveFile: (path, content) => API.put(`/api/documents/file?path=${encodeURIComponent(path)}`, { content }),
    delete: (path) => API.delete(`/api/documents/file?path=${encodeURIComponent(path)}`),
    mkdir: (path) => API.post("/api/documents/mkdir", { path }),
    aiSuggest: (body, onChunk) => API.stream("/api/documents/ai-suggest", body, onChunk),
  },

  // Settings
  settings: {
    get: () => API.get("/api/settings"),
    update: (b) => API.put("/api/settings", b),
    toggle: (mod) => API.post(`/api/settings/toggle/${mod}`),
    changePassword: (current, newPw) => API.post("/api/settings/change-password", { current_password: current, new_password: newPw }),
    envStatus: () => API.get("/api/settings/env-status"),
  },

  // Connections / Vault
  vault: {
    list: () => API.get("/api/connections/vault"),
    set: (key, value, cat) => API.post("/api/connections/vault", { key, value, category: cat }),
    get: (key) => API.get(`/api/connections/vault/${encodeURIComponent(key)}`),
    delete: (key) => API.delete(`/api/connections/vault/${encodeURIComponent(key)}`),
  },

  // API tokens
  tokens: {
    list: () => API.get("/api/auth/tokens"),
    create: (b) => API.post("/api/auth/tokens", b),
    revoke: (id) => API.delete(`/api/auth/tokens/${id}`),
  },
};

export default API;
