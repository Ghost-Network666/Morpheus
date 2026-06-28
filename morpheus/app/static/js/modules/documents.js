import API from "../api.js";
import { toast, escapeHtml } from "../app.js";

let _currentPath = "";
let _editingPath = null;

export async function initDocuments() {
  await loadFiles();
  document.getElementById("docs-new-file-btn")?.addEventListener("click", newFile);
  document.getElementById("docs-new-folder-btn")?.addEventListener("click", newFolder);
  document.getElementById("docs-save-btn")?.addEventListener("click", saveFile);
  document.getElementById("docs-ai-btn")?.addEventListener("click", aiSuggest);
  document.getElementById("docs-back-btn")?.addEventListener("click", () => navigateTo(""));

  // File upload
  const uploadInput = document.getElementById("docs-upload-input");
  document.getElementById("docs-upload-btn")?.addEventListener("click", () => uploadInput?.click());
  uploadInput?.addEventListener("change", async (e) => {
    for (const file of e.target.files) {
      const form = new FormData();
      form.append("file", file);
      await fetch(`/api/documents/upload?path=${encodeURIComponent(_currentPath)}`, {
        method: "POST", credentials: "include", body: form
      });
    }
    await loadFiles();
  });
}

async function loadFiles(path = _currentPath) {
  _currentPath = path;
  const pathEl = document.getElementById("docs-path");
  if (pathEl) pathEl.textContent = "/" + path;

  try {
    const files = await API.docs.list(path);
    renderFiles(files);
  } catch (e) { toast(e.message, "error"); }
}

function renderFiles(files) {
  const container = document.getElementById("docs-file-list");
  if (!container) return;
  if (!files.length) {
    container.innerHTML = '<div class="empty-state"><p>Empty folder</p></div>';
    return;
  }
  container.innerHTML = files.map(f => `
    <div class="connection-item" data-path="${escapeHtml(f.path)}" data-isdir="${f.is_dir}">
      <span style="font-size:18px">${f.is_dir ? "📁" : getFileIcon(f.name)}</span>
      <div class="connection-info">
        <div class="connection-label">${escapeHtml(f.name)}</div>
        ${!f.is_dir ? `<div class="connection-meta">${formatSize(f.size)}</div>` : ""}
      </div>
      <button class="btn btn-danger btn-sm" data-delete="${escapeHtml(f.path)}">Delete</button>
    </div>
  `).join("");

  container.querySelectorAll(".connection-item").forEach(el => {
    el.addEventListener("click", (e) => {
      if (e.target.closest("button")) return;
      const path = el.dataset.path;
      if (el.dataset.isdir === "true") { loadFiles(path); }
      else { openFile(path); }
    });
  });
  container.querySelectorAll("[data-delete]").forEach(el =>
    el.addEventListener("click", async () => {
      if (!confirm("Delete?")) return;
      try { await API.docs.delete(el.dataset.delete); await loadFiles(); }
      catch (e) { toast(e.message, "error"); }
    })
  );
}

async function openFile(path) {
  try {
    const content = await API.docs.getFile(path);
    _editingPath = path;
    const editor = document.getElementById("docs-editor");
    const editorArea = document.getElementById("docs-editor-area");
    if (editor) editor.style.display = "flex";
    if (editorArea) editorArea.value = content;
    document.getElementById("docs-editing-path")?.textContent && (document.getElementById("docs-editing-path").textContent = path);
  } catch (e) { toast(e.message, "error"); }
}

async function saveFile() {
  if (!_editingPath) return;
  const content = document.getElementById("docs-editor-area")?.value || "";
  try { await API.docs.saveFile(_editingPath, content); toast("Saved", "success"); }
  catch (e) { toast(e.message, "error"); }
}

async function newFile() {
  const name = prompt("File name:");
  if (!name) return;
  const path = _currentPath ? `${_currentPath}/${name}` : name;
  try { await API.docs.saveFile(path, ""); await loadFiles(); openFile(path); }
  catch (e) { toast(e.message, "error"); }
}

async function newFolder() {
  const name = prompt("Folder name:");
  if (!name) return;
  const path = _currentPath ? `${_currentPath}/${name}` : name;
  try { await API.docs.mkdir(path); await loadFiles(); }
  catch (e) { toast(e.message, "error"); }
}

async function navigateTo(path) {
  _editingPath = null;
  const editor = document.getElementById("docs-editor");
  if (editor) editor.style.display = "none";
  await loadFiles(path);
}

async function aiSuggest() {
  const content = document.getElementById("docs-editor-area")?.value || "";
  const instruction = prompt("AI instruction (e.g., 'Improve grammar', 'Summarize'):") || "Improve this text";
  const outputEl = document.getElementById("docs-editor-area");
  if (!outputEl) return;

  let result = "";
  try {
    await API.docs.aiSuggest({ content, instruction }, (chunk) => {
      result += chunk.content || "";
      outputEl.value = result;
    });
  } catch (e) { toast(e.message, "error"); }
}

function getFileIcon(name) {
  const ext = name.split(".").pop()?.toLowerCase();
  const icons = { md: "📝", txt: "📄", pdf: "📕", js: "📜", py: "🐍", json: "📋", csv: "📊", html: "🌐", png: "🖼️", jpg: "🖼️", jpeg: "🖼️" };
  return icons[ext] || "📄";
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}
