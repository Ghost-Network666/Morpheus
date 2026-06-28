import API from "./api.js";
import { initBackground } from "./modules/background.js";

// ── State ─────────────────────────────────────────────────────────────────────
let _currentPage = null;
let _sysInfo = null;
let _user = null;
const _initializedPages = new Set();

// ── Exports ───────────────────────────────────────────────────────────────────
export function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderMarkdown(text) {
  // Simple markdown renderer (no external dep)
  let html = escapeHtml(text);
  // Code blocks
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) =>
    `<pre><code class="lang-${lang}">${code}</code></pre>`);
  // Inline code
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  // Italic
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  // Headings
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");
  // Unordered list
  html = html.replace(/^- (.+)$/gm, "<li>$1</li>").replace(/(<li>.*<\/li>)/gs, "<ul>$1</ul>");
  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  // Horizontal rule
  html = html.replace(/^---$/gm, "<hr>");
  // Line breaks
  html = html.replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br>");
  return `<p>${html}</p>`;
}

export function toast(message, type = "info", duration = 3000) {
  const container = document.getElementById("toast-container");
  if (!container) return;
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => el.remove(), duration);
}

export function showModal(id) {
  document.getElementById(id)?.classList.add("open");
}

export function closeModal(id) {
  document.getElementById(id)?.classList.remove("open");
}

// ── Navigation ────────────────────────────────────────────────────────────────
async function navigate(page) {
  if (_currentPage === page) return;
  _currentPage = page;

  // Update nav
  document.querySelectorAll(".nav-item").forEach(el => {
    el.classList.toggle("active", el.dataset.page === page);
  });

  // Show/hide pages
  document.querySelectorAll(".page").forEach(el => {
    el.classList.toggle("active", el.id === `page-${page}`);
  });

  // Update header title
  const titles = {
    chat: "Chat", terminal: "Terminal", research: "Research",
    documents: "Documents", email: "Email", notes: "Notes",
    tasks: "Tasks", calendar: "Calendar", connections: "Connections",
    settings: "Settings", cookbook: "Models",
  };
  const headerTitle = document.getElementById("header-title");
  if (headerTitle) headerTitle.textContent = titles[page] || "Morpheus";

  // Lazy init page
  await initPage(page);
}

async function initPage(page) {
  if (_initializedPages.has(page)) return;
  _initializedPages.add(page);
  switch (page) {
    case "chat": {
      const { initChat } = await import("./chat.js");
      initChat();
      break;
    }
    case "terminal": {
      const { initTerminal } = await import("./terminal.js");
      await initTerminal();
      break;
    }
    case "notes": {
      const { initNotes } = await import("./modules/notes.js");
      initNotes();
      break;
    }
    case "tasks": {
      const { initTasks } = await import("./modules/tasks.js");
      initTasks();
      break;
    }
    case "calendar": {
      const { initCalendar } = await import("./modules/calendar.js");
      initCalendar();
      break;
    }
    case "cookbook": {
      const { initCookbook } = await import("./modules/cookbook.js");
      initCookbook();
      break;
    }
    case "research": {
      const { initResearch } = await import("./modules/research.js");
      initResearch();
      break;
    }
    case "email": {
      const { initEmail } = await import("./modules/email.js");
      initEmail();
      break;
    }
    case "connections": {
      const { initConnections } = await import("./modules/connections.js");
      initConnections();
      break;
    }
    case "documents": {
      const { initDocuments } = await import("./modules/documents.js");
      initDocuments();
      break;
    }
    case "settings": {
      const { initSettings } = await import("./settings.js");
      initSettings();
      break;
    }
  }
}

// ── Auth ──────────────────────────────────────────────────────────────────────
async function checkAuth() {
  try {
    _user = await API.auth.me();
    document.getElementById("login-overlay")?.remove();
    return true;
  } catch {
    if (_sysInfo?.auth_enabled) {
      showLoginOverlay();
      return false;
    }
    // Auth disabled, create guest session
    return true;
  }
}

function showLoginOverlay() {
  const overlay = document.getElementById("login-overlay");
  if (!overlay) return;
  overlay.style.display = "flex";

  document.getElementById("login-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = document.getElementById("login-username")?.value;
    const password = document.getElementById("login-password")?.value;
    try {
      await API.auth.login(username, password);
      _user = await API.auth.me();
      overlay.style.display = "none";
      init();
    } catch (err) {
      document.getElementById("login-error")?.textContent && (document.getElementById("login-error").textContent = err.message);
      toast(err.message, "error");
    }
  });
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  // Load system info
  try {
    _sysInfo = await API.system.info();
    if (_sysInfo.tailscale_url) {
      const el = document.getElementById("tailscale-url");
      if (el) { el.textContent = _sysInfo.tailscale_url; el.href = _sysInfo.tailscale_url; }
    }

    // Show/hide nav items based on modules
    const moduleMap = {
      terminal: "terminal", ssh: "connections", agent: "chat",
      email: "email", calendar: "calendar", notes: "notes",
      tasks: "tasks", research: "research", documents: "documents",
      cookbook: "cookbook", connections: "connections",
    };
    for (const [mod, navPage] of Object.entries(moduleMap)) {
      if (_sysInfo.modules[mod] === false) {
        document.querySelectorAll(`.nav-item[data-page="${navPage}"]`).forEach(el => el.style.display = "none");
      }
    }
  } catch (e) {
    console.warn("System info unavailable:", e.message);
  }

  // Apply saved theme + density
  const { applyTheme, applyDensity } = await import("./settings.js");
  applyTheme(localStorage.getItem("morpheus_theme") || "one-dark");
  applyDensity(localStorage.getItem("morpheus_density") || "comfortable");

  // Init animated background
  initBackground();

  // Check auth
  const authed = await checkAuth();
  if (!authed) return;

  // Wire up nav
  document.querySelectorAll(".nav-item[data-page]").forEach(el => {
    el.addEventListener("click", () => navigate(el.dataset.page));
  });

  // Wire up modals close buttons
  document.querySelectorAll("[data-close-modal]").forEach(el => {
    el.addEventListener("click", () => closeModal(el.dataset.closeModal));
  });
  document.querySelectorAll(".modal-overlay").forEach(overlay => {
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.classList.remove("open");
    });
  });

  // Logout
  document.getElementById("logout-btn")?.addEventListener("click", async () => {
    await API.auth.logout();
    location.reload();
  });


  // Route from hash or default to chat
  const hash = location.hash.replace("#/", "") || "chat";
  await navigate(hash);

  window.addEventListener("hashchange", () => {
    const page = location.hash.replace("#/", "") || "chat";
    navigate(page);
  });
}


// Start
document.addEventListener("DOMContentLoaded", init);
