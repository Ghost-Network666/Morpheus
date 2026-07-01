import { useCallback, useEffect, useState } from "react";
import { List, type RowComponentProps } from "react-window";
import { Plus, Trash2, CheckSquare, Square, ListTodo } from "lucide-react";
import { api } from "../lib/api";
import type { Task } from "../types";

const PRIORITY_COLORS: Record<string, string> = {
  critical: "text-red-400 border-red-400/40 bg-red-400/10",
  high:     "text-orange-400 border-orange-400/40 bg-orange-400/10",
  medium:   "text-yellow-400 border-yellow-400/40 bg-yellow-400/10",
  low:      "text-muted border-border bg-panel/40",
};

// ── Task list row (react-window v2) ─────────────────────────────────────────

interface TaskRowData {
  tasks: Task[];
  onToggle: (task: Task) => void;
  onDelete: (id: number) => void;
  onPriority: (task: Task, p: string) => void;
}

function TaskRow({
  ariaAttributes, index, style,
  tasks, onToggle, onDelete, onPriority,
}: RowComponentProps<TaskRowData>) {
  const task = tasks[index];
  if (!task) return null;
  const done = task.status === "done";

  return (
    <div {...ariaAttributes} style={style} className="px-6 py-1">
      <div className={`flex items-center gap-3 rounded-lg border border-border bg-panel/40 px-3 py-2.5 transition-colors hover:bg-panel/70 group ${done ? "opacity-50" : ""}`}>
        <button
          onClick={() => onToggle(task)}
          className="shrink-0 text-muted hover:text-accent transition-colors"
        >
          {done ? <CheckSquare size={16} className="text-accent" /> : <Square size={16} />}
        </button>
        <div className="flex-1 min-w-0">
          <p className={`text-xs font-medium ${done ? "line-through text-muted" : "text-text"}`}>
            {task.title}
          </p>
          {task.due_date && (
            <p className="text-xs text-muted/70 mt-0.5">
              Due {new Date(task.due_date).toLocaleDateString()}
            </p>
          )}
        </div>
        <select
          value={task.priority}
          onChange={(e) => onPriority(task, e.target.value)}
          onClick={(e) => e.stopPropagation()}
          className={`rounded border px-1.5 py-0.5 text-xs bg-transparent outline-none ${PRIORITY_COLORS[task.priority]}`}
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="critical">Critical</option>
        </select>
        <button
          onClick={() => onDelete(task.id)}
          className="hidden group-hover:flex text-muted hover:text-red-400 transition-colors"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

export function TasksPage() {
  const [tasks, setTasks]       = useState<Task[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newPriority, setNewPriority] = useState<string>("medium");
  const [filter, setFilter]     = useState<string>("active");

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      setLoading(true);
      setTasks(await api.listTasks());
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  }

  async function addTask(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    try {
      const task = await api.createTask({ title: newTitle.trim(), priority: newPriority });
      setTasks((prev) => [task, ...prev]);
      setNewTitle("");
    } catch (e) { setError(String(e)); }
  }

  const handleToggle = useCallback(async (task: Task) => {
    const next = task.status === "done" ? "pending" : "done";
    try {
      const updated = await api.updateTask(task.id, { status: next as Task["status"] });
      setTasks((prev) => prev.map((t) => t.id === task.id ? updated : t));
    } catch (e) { setError(String(e)); }
  }, []);

  const handleDelete = useCallback(async (id: number) => {
    try {
      await api.deleteTask(id);
      setTasks((prev) => prev.filter((t) => t.id !== id));
    } catch (e) { setError(String(e)); }
  }, []);

  const handlePriority = useCallback(async (task: Task, priority: string) => {
    try {
      const updated = await api.updateTask(task.id, { priority: priority as Task["priority"] });
      setTasks((prev) => prev.map((t) => t.id === task.id ? updated : t));
    } catch { /* ignore */ }
  }, []);

  const filtered = tasks.filter((t) => {
    if (filter === "active") return t.status !== "done" && t.status !== "cancelled";
    if (filter === "done")   return t.status === "done";
    return true;
  });

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border bg-panel/60 px-6 py-3 shrink-0">
        <h1 className="text-sm font-semibold text-text">Tasks</h1>
        <div className="flex gap-1 text-xs">
          {["active", "done", "all"].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded px-2.5 py-1 capitalize transition-colors ${
                filter === f ? "bg-accent/15 text-accent" : "text-muted hover:bg-white/5 hover:text-text"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="border-b border-border bg-red-950/30 px-6 py-2 text-xs text-red-300 shrink-0">
          {error}
        </div>
      )}

      {/* Add task form */}
      <form
        onSubmit={addTask}
        className="flex items-center gap-2 border-b border-border px-6 py-3 bg-panel/30 shrink-0"
      >
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Add a task…"
          className="flex-1 rounded border border-border bg-bg px-3 py-1.5 text-xs text-text outline-none focus:border-accent placeholder-muted/50"
        />
        <select
          value={newPriority}
          onChange={(e) => setNewPriority(e.target.value)}
          className="rounded border border-border bg-bg px-2 py-1.5 text-xs text-text outline-none focus:border-accent"
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="critical">Critical</option>
        </select>
        <button
          type="submit"
          disabled={!newTitle.trim()}
          className="flex items-center gap-1 rounded bg-accent px-3 py-1.5 text-xs font-medium text-white disabled:opacity-30 hover:bg-accent/90"
        >
          <Plus size={12} /> Add
        </button>
      </form>

      {/* Task list — virtualized */}
      {loading && <p className="px-6 py-4 text-xs text-muted shrink-0">Loading…</p>}
      {!loading && filtered.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-12 text-muted">
          <ListTodo size={36} className="opacity-20" />
          <p className="text-sm">No tasks here</p>
        </div>
      )}
      {!loading && filtered.length > 0 && (
        <List
          rowComponent={TaskRow}
          rowCount={filtered.length}
          rowHeight={54}
          rowProps={{ tasks: filtered, onToggle: handleToggle, onDelete: handleDelete, onPriority: handlePriority }}
          style={{ flex: 1 }}
        />
      )}
    </div>
  );
}
