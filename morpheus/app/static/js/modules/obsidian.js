import API from "../api.js";
import { toast, escapeHtml, renderMarkdown } from "../app.js";

let _notes = [];
let _activePath = null;
let _dirty = false;
let _viewMode = "preview"; // "edit" | "preview"

export function initObsidian() {
  _bindEvents();
  _loadNotes();
}

// ── API helpers ───────────────────────────────────────────────────────────────

async function _loadNotes(q = "") {
  try {
    const params = q ? `?q=${encodeURIComponent(q)}` : "";
    const res = await fetch(`/api/obsidian/notes${params}`);
    if (res.status === 400) {
      _showVaultNotConfigured();
      return;
    }
    _notes = await res.json();
    _renderList();
  } catch (e) {
    toast("Failed to load vault notes", "error");
  }
}

async function _openNote(path) {
  if (_dirty && _activePath) {
    if (!confirm("Unsaved changes — discard?")) return;
  }
  try {
    const res = await fetch(`/api/obsidian/notes/${encodeURIComponent(path)}`);
    if (!res.ok) { toast("Failed to load note", "error"); return; }
    const { content } = await res.json();
    _activePath = path;
    _dirty = false;
    _renderEditor(content);
    document.querySelectorAll(".obsidian-note-item").forEach(el =>
      el.classList.toggle("active", el.dataset.path === path)
    );
  } catch (e) {
    toast("Error opening note", "error");
  }
}

async function _saveNote() {
  if (!_activePath) return;
  const content = document.getElementById("obsidian-editor-area")?.value || "";
  try {
    const res = await fetch(`/api/obsidian/notes/${encodeURIComponent(_activePath)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) throw new Error();
    _dirty = false;
    document.getElementById("obsidian-save-btn")?.classList.remove("unsaved");
    toast("Saved", "success", 1500);
    _loadNotes(document.getElementById("obsidian-search")?.value || "");
  } catch {
    toast("Failed to save note", "error");
  }
}

async function _createNote() {
  const title = prompt("Note title:") || "Untitled";
  try {
    const res = await fetch("/api/obsidian/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error();
    await _loadNotes();
    await _openNote(data.path);
  } catch {
    toast("Failed to create note", "error");
  }
}

async function _deleteNote() {
  if (!_activePath) return;
  if (!confirm(`Delete "${_activePath}"?`)) return;
  try {
    await fetch(`/api/obsidian/notes/${encodeURIComponent(_activePath)}`, { method: "DELETE" });
    _activePath = null;
    _dirty = false;
    document.getElementById("obsidian-editor-panel")?.style.setProperty("display", "none");
    document.getElementById("obsidian-empty-panel")?.style.setProperty("display", "flex");
    await _loadNotes();
    toast("Note deleted", "success");
  } catch {
    toast("Failed to delete note", "error");
  }
}

async function _syncVault() {
  const btn = document.getElementById("obsidian-sync-btn");
  if (btn) btn.textContent = "Syncing…";
  try {
    await fetch("/api/obsidian/sync", { method: "POST" });
    await _loadNotes();
    toast("Vault synced", "success", 1500);
  } catch {
    toast("Sync failed", "error");
  } finally {
    if (btn) btn.textContent = "Sync";
  }
}

// ── Render ────────────────────────────────────────────────────────────────────

function _renderList() {
  const list = document.getElementById("obsidian-note-list");
  if (!list) return;
  if (_notes.length === 0) {
    list.innerHTML = '<div style="padding:16px;color:var(--text3);font-size:13px">No notes found</div>';
    return;
  }
  list.innerHTML = _notes.map(n => `
    <div class="obsidian-note-item${_activePath === n.path ? " active" : ""}" data-path="${escapeHtml(n.path)}">
      <div class="obsidian-note-title">${escapeHtml(n.title)}</div>
      <div class="obsidian-note-meta">${n.path}${n.tags.length ? " · " + n.tags.join(", ") : ""}</div>
    </div>
  `).join("");
  list.querySelectorAll(".obsidian-note-item").forEach(el => {
    el.addEventListener("click", () => _openNote(el.dataset.path));
  });
}

function _renderEditor(content) {
  const editorPanel = document.getElementById("obsidian-editor-panel");
  const emptyPanel = document.getElementById("obsidian-empty-panel");
  const pathLabel = document.getElementById("obsidian-active-path");
  const area = document.getElementById("obsidian-editor-area");
  const preview = document.getElementById("obsidian-preview");

  if (editorPanel) editorPanel.style.display = "flex";
  if (emptyPanel) emptyPanel.style.display = "none";
  if (pathLabel) pathLabel.textContent = _activePath || "";
  if (area) area.value = content;
  if (preview && _viewMode === "preview") preview.innerHTML = renderMarkdown(content);
  _applyViewMode();
}

function _applyViewMode() {
  const area = document.getElementById("obsidian-editor-area");
  const preview = document.getElementById("obsidian-preview");
  const editBtn = document.getElementById("obsidian-edit-btn");
  const previewBtn = document.getElementById("obsidian-preview-btn");

  if (!area || !preview) return;
  if (_viewMode === "edit") {
    area.style.display = "block";
    preview.style.display = "none";
    editBtn?.classList.add("active");
    previewBtn?.classList.remove("active");
  } else {
    area.style.display = "none";
    preview.style.display = "block";
    editBtn?.classList.remove("active");
    previewBtn?.classList.add("active");
    preview.innerHTML = renderMarkdown(area.value);
  }
}

function _showVaultNotConfigured() {
  const list = document.getElementById("obsidian-note-list");
  if (list) list.innerHTML = `
    <div style="padding:16px;font-size:13px;color:var(--text2)">
      <strong>Vault not configured</strong><br>
      Set <code>OBSIDIAN_VAULT_PATH</code> in your .env file to point at your Obsidian vault directory.
    </div>
  `;
}

// ── Events ────────────────────────────────────────────────────────────────────

function _bindEvents() {
  document.getElementById("obsidian-new-btn")?.addEventListener("click", _createNote);
  document.getElementById("obsidian-save-btn")?.addEventListener("click", _saveNote);
  document.getElementById("obsidian-delete-btn")?.addEventListener("click", _deleteNote);
  document.getElementById("obsidian-sync-btn")?.addEventListener("click", _syncVault);

  document.getElementById("obsidian-edit-btn")?.addEventListener("click", () => {
    _viewMode = "edit";
    _applyViewMode();
  });
  document.getElementById("obsidian-preview-btn")?.addEventListener("click", () => {
    _viewMode = "preview";
    _applyViewMode();
  });

  const area = document.getElementById("obsidian-editor-area");
  if (area) {
    area.addEventListener("input", () => {
      _dirty = true;
      document.getElementById("obsidian-save-btn")?.classList.add("unsaved");
    });
    area.addEventListener("keydown", e => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        _saveNote();
      }
    });
  }

  let _searchTimer;
  document.getElementById("obsidian-search")?.addEventListener("input", e => {
    clearTimeout(_searchTimer);
    _searchTimer = setTimeout(() => _loadNotes(e.target.value), 250);
  });
}
