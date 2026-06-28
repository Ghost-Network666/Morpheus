import API from "../api.js";
import { toast, escapeHtml } from "../app.js";

let _notes = [];
let _active = null;
let _saveTimer = null;

export async function initNotes() {
  await loadNotes();
  document.getElementById("notes-new-btn")?.addEventListener("click", newNote);
  document.getElementById("notes-delete-btn")?.addEventListener("click", deleteNote);
}

async function loadNotes() {
  try {
    _notes = await API.notes.list();
    renderList();
    if (_notes.length) selectNote(_notes[0]);
  } catch (e) { toast(e.message, "error"); }
}

function renderList() {
  const list = document.getElementById("notes-list");
  if (!list) return;
  list.innerHTML = _notes.map(n => `
    <div class="note-item ${_active?.id === n.id ? 'active' : ''}" data-id="${n.id}">
      <div class="note-item-title">${escapeHtml(n.title)}</div>
      <div class="note-item-preview">${escapeHtml((n.content || "").slice(0, 60))}</div>
    </div>
  `).join("");
  list.querySelectorAll(".note-item").forEach(el =>
    el.addEventListener("click", () => selectNote(_notes.find(n => n.id === +el.dataset.id)))
  );
}

function selectNote(note) {
  _active = note;
  renderList();
  const titleEl = document.getElementById("note-title");
  const contentEl = document.getElementById("note-content");
  if (titleEl) titleEl.value = note.title;
  if (contentEl) contentEl.value = note.content;

  titleEl?.addEventListener("input", scheduleAutoSave);
  contentEl?.addEventListener("input", scheduleAutoSave);
}

function scheduleAutoSave() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(saveNote, 1200);
}

async function saveNote() {
  if (!_active) return;
  const title = document.getElementById("note-title")?.value || "";
  const content = document.getElementById("note-content")?.value || "";
  try {
    await API.notes.update(_active.id, { title, content });
    const idx = _notes.findIndex(n => n.id === _active.id);
    if (idx >= 0) { _notes[idx].title = title; _notes[idx].content = content; }
    renderList();
  } catch (e) { toast(e.message, "error"); }
}

async function newNote() {
  try {
    const note = await API.notes.create({ title: "New Note", content: "" });
    _notes.unshift(note);
    selectNote(note);
    renderList();
    document.getElementById("note-title")?.focus();
  } catch (e) { toast(e.message, "error"); }
}

async function deleteNote() {
  if (!_active || !confirm("Delete this note?")) return;
  try {
    await API.notes.delete(_active.id);
    _notes = _notes.filter(n => n.id !== _active.id);
    _active = null;
    renderList();
    if (_notes.length) selectNote(_notes[0]);
    else { document.getElementById("note-title").value = ""; document.getElementById("note-content").value = ""; }
  } catch (e) { toast(e.message, "error"); }
}
