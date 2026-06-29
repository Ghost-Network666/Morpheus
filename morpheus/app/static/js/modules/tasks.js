import API from "../api.js";
import { toast, escapeHtml, showModal, closeModal } from "../app.js";

let _tasks = [];
let _filter = { status: "all", priority: "all" };

export async function initTasks() {
  await loadTasks();
  document.getElementById("tasks-new-btn")?.addEventListener("click", () => showNewTaskModal());

  document.getElementById("tasks-status-filter")?.addEventListener("change", async (e) => {
    _filter.status = e.target.value;
    await loadTasks();
  });
  document.getElementById("tasks-priority-filter")?.addEventListener("change", async (e) => {
    _filter.priority = e.target.value;
    await loadTasks();
  });
}

async function loadTasks() {
  try {
    const params = {};
    if (_filter.status !== "all") params.status = _filter.status;
    if (_filter.priority !== "all") params.priority = _filter.priority;
    _tasks = await API.tasks.list(params);
    render();
  } catch (e) { toast(e.message, "error"); }
}

function render() {
  const container = document.getElementById("tasks-list");
  if (!container) return;

  if (!_tasks.length) {
    container.innerHTML = '<div class="empty-state"><p>No tasks yet. Create one!</p></div>';
    return;
  }

  container.innerHTML = _tasks.map(t => `
    <div class="task-item ${t.completed ? 'done' : ''}">
      <input type="checkbox" class="task-check" ${t.completed ? 'checked' : ''} data-id="${t.id}">
      <div class="task-title">${escapeHtml(t.title)}</div>
      <div class="task-meta">
        <span class="priority-badge priority-${t.priority}">${t.priority}</span>
        ${t.due_date ? `<span>${new Date(t.due_date).toLocaleDateString()}</span>` : ''}
      </div>
      <button class="btn-icon" data-delete="${t.id}" title="Delete">
        <svg viewBox="0 0 16 16" fill="currentColor"><path d="M11 1.5v1h3.5a.5.5 0 0 1 0 1h-.538l-.853 10.66A2 2 0 0 1 11.115 16h-6.23a2 2 0 0 1-1.994-1.84L2.038 3.5H1.5a.5.5 0 0 1 0-1H5v-1A1.5 1.5 0 0 1 6.5 0h3A1.5 1.5 0 0 1 11 1.5zm-5 0v1h4v-1a.5.5 0 0 0-.5-.5h-3a.5.5 0 0 0-.5.5z"/></svg>
      </button>
    </div>
  `).join("");

  container.querySelectorAll(".task-check").forEach(el =>
    el.addEventListener("change", () => toggleTask(+el.dataset.id, el.checked))
  );
  container.querySelectorAll("[data-delete]").forEach(el =>
    el.addEventListener("click", () => deleteTask(+el.dataset.delete))
  );
}

async function toggleTask(id, completed) {
  try {
    await API.tasks.update(id, { completed });
    const t = _tasks.find(t => t.id === id);
    if (t) t.completed = completed;
    render();
  } catch (e) { toast(e.message, "error"); }
}

async function deleteTask(id) {
  if (!confirm("Delete task?")) return;
  try {
    await API.tasks.delete(id);
    _tasks = _tasks.filter(t => t.id !== id);
    render();
  } catch (e) { toast(e.message, "error"); }
}

function showNewTaskModal() {
  showModal("task-modal");
  document.getElementById("task-modal-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const title = document.getElementById("task-title-input")?.value.trim();
    const priority = document.getElementById("task-priority-input")?.value || "medium";
    const due = document.getElementById("task-due-input")?.value;
    if (!title) return;
    try {
      const task = await API.tasks.create({ title, priority, due_date: due || null });
      _tasks.unshift(task);
      render();
      closeModal("task-modal");
      document.getElementById("task-title-input").value = "";
    } catch (e) { toast(e.message, "error"); }
  }, { once: true });
}

export async function reloadTasks() {
  await loadTasks();
}
