import { useCallback, useEffect, useRef, useState } from "react";
import { List, type RowComponentProps } from "react-window";
import { Plus, Pin, Trash2, Save, FileText } from "lucide-react";
import { api } from "../lib/api";
import type { Note } from "../types";

// ── Note list row (react-window v2) ─────────────────────────────────────────

interface NoteRowData {
  notes: Note[];
  activeId: number | null;
  onOpen: (note: Note) => void;
  onPin: (note: Note, e: React.MouseEvent) => void;
  onDelete: (id: number, e: React.MouseEvent) => void;
}

function NoteRow({
  ariaAttributes, index, style,
  notes, activeId, onOpen, onPin, onDelete,
}: RowComponentProps<NoteRowData>) {
  const note = notes[index];
  if (!note) return null;
  return (
    <div {...ariaAttributes} style={style} className="px-1.5 py-0.5">
      <div
        onClick={() => onOpen(note)}
        className={`group flex cursor-pointer items-start justify-between rounded-md px-2 py-2 text-xs transition-colors ${
          activeId === note.id ? "bg-accent/15 text-text" : "text-muted hover:bg-white/5 hover:text-text"
        }`}
      >
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{note.title || "Untitled"}</p>
          <p className="truncate text-muted/70 mt-0.5">
            {note.content?.slice(0, 60) || "Empty note"}
          </p>
        </div>
        <div className="ml-1 flex shrink-0 gap-1 opacity-0 group-hover:opacity-100">
          <button onClick={(e) => onPin(note, e)} title={note.pinned ? "Unpin" : "Pin"}>
            <Pin size={11} className={note.pinned ? "text-accent" : "text-muted"} />
          </button>
          <button onClick={(e) => onDelete(note.id, e)} title="Delete">
            <Trash2 size={11} className="text-muted hover:text-red-400" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

export function NotesPage() {
  const [notes, setNotes]   = useState<Note[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [draft, setDraft]   = useState<Partial<Note>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      setLoading(true);
      const list = await api.listNotes();
      setNotes(list);
      if (list.length > 0 && !activeId) openNote(list[0]);
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  }

  function openNote(note: Note) {
    setActiveId(note.id);
    setDraft({ title: note.title, content: note.content, pinned: note.pinned });
  }

  async function newNote() {
    try {
      const note = await api.createNote({ title: "Untitled", content: "" });
      setNotes((prev) => [note, ...prev]);
      openNote(note);
    } catch (e) { setError(String(e)); }
  }

  function scheduleSave(updates: Partial<Note>) {
    const merged = { ...draft, ...updates };
    setDraft(merged);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveNote(merged), 1000);
  }

  async function saveNote(data: Partial<Note> = draft) {
    if (!activeId) return;
    try {
      setSaving(true);
      const updated = await api.updateNote(activeId, data);
      setNotes((prev) => prev.map((n) => n.id === activeId ? updated : n));
    } catch (e) { setError(String(e)); }
    finally { setSaving(false); }
  }

  const handleDelete = useCallback(async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.deleteNote(id);
      setNotes((prev) => {
        const next = prev.filter((n) => n.id !== id);
        if (activeId === id) {
          if (next.length > 0) openNote(next[0]);
          else { setActiveId(null); setDraft({}); }
        }
        return next;
      });
    } catch (e) { setError(String(e)); }
  }, [activeId]);

  const handlePin = useCallback(async (note: Note, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const updated = await api.updateNote(note.id, { pinned: !note.pinned });
      setNotes((prev) => prev.map((n) => n.id === note.id ? updated : n));
    } catch { /* ignore */ }
  }, []);

  const handleOpen = useCallback((note: Note) => { openNote(note); }, []);

  const activeNote = notes.find((n) => n.id === activeId);

  return (
    <div className="flex h-full min-h-0 flex-1">
      {/* List panel — virtualized */}
      <div className="flex w-56 shrink-0 flex-col border-r border-border bg-panel/60">
        <div className="flex items-center justify-between border-b border-border px-3 py-2 shrink-0">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">Notes</span>
          <button
            onClick={newNote}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-accent hover:bg-accent/10"
          >
            <Plus size={12} /> New
          </button>
        </div>

        {loading ? (
          <p className="px-2 py-3 text-xs text-muted text-center">Loading…</p>
        ) : notes.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-muted">
            <FileText size={28} className="opacity-30" />
            <p className="text-xs">No notes yet</p>
          </div>
        ) : (
          <List
            rowComponent={NoteRow}
            rowCount={notes.length}
            rowHeight={58}
            rowProps={{ notes, activeId, onOpen: handleOpen, onPin: handlePin, onDelete: handleDelete }}
            style={{ flex: 1 }}
          />
        )}
      </div>

      {/* Editor */}
      <div className="flex min-w-0 flex-1 flex-col">
        {!activeNote ? (
          <div className="flex flex-1 items-center justify-center flex-col gap-3 text-muted">
            <FileText size={40} className="opacity-20" />
            <p className="text-sm">Select or create a note</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between border-b border-border bg-panel/40 px-4 py-2 shrink-0">
              <input
                value={draft.title ?? ""}
                onChange={(e) => scheduleSave({ title: e.target.value })}
                placeholder="Note title"
                className="flex-1 bg-transparent text-sm font-medium text-text outline-none placeholder-muted/50"
              />
              <div className="flex items-center gap-2">
                {saving && <span className="text-xs text-muted">Saving…</span>}
                <button
                  onClick={() => saveNote()}
                  className="flex items-center gap-1 rounded px-2 py-1 text-xs text-accent hover:bg-accent/10"
                >
                  <Save size={12} /> Save
                </button>
              </div>
            </div>
            <textarea
              value={draft.content ?? ""}
              onChange={(e) => scheduleSave({ content: e.target.value })}
              placeholder="Write your note in Markdown…"
              className="flex-1 resize-none bg-transparent p-4 text-sm text-text outline-none placeholder-muted/40 font-mono leading-relaxed"
            />
            {error && (
              <div className="border-t border-border bg-red-950/30 px-4 py-2 text-xs text-red-300 shrink-0">
                {error}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
