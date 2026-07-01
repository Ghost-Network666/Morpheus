import { useEffect, useState } from "react";
import { Plus, Trash2, Calendar as CalIcon } from "lucide-react";
import { api } from "../lib/api";
import type { CalendarEvent } from "../types";

export function CalendarPage() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ summary: "", start: "", end: "", all_day: false, description: "" });

  useEffect(() => { load(); }, []);

  async function load() {
    try { setLoading(true); setEvents(await api.listEvents()); }
    catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  }

  async function addEvent(e: React.FormEvent) {
    e.preventDefault();
    if (!form.summary || !form.start) return;
    try {
      const ev = await api.createEvent({ ...form, end: form.end || undefined });
      setEvents((prev) => [...prev, ev].sort((a, b) => a.start.localeCompare(b.start)));
      setShowForm(false);
      setForm({ summary: "", start: "", end: "", all_day: false, description: "" });
    } catch (e) { setError(String(e)); }
  }

  async function deleteEvent(id: number) {
    try {
      await api.deleteEvent(id);
      setEvents((prev) => prev.filter((e) => e.id !== id));
    } catch (e) { setError(String(e)); }
  }

  const now = new Date();
  const upcoming = events.filter((e) => new Date(e.start) >= now);
  const past = events.filter((e) => new Date(e.start) < now);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-border bg-panel/60 px-6 py-3">
        <h1 className="text-sm font-semibold text-text">Calendar</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1 rounded-md bg-accent/10 border border-accent/20 px-2.5 py-1.5 text-xs text-accent hover:bg-accent/20"
        >
          <Plus size={12} /> Add Event
        </button>
      </div>

      {error && <div className="border-b border-border bg-red-950/30 px-6 py-2 text-xs text-red-300">{error}</div>}

      {showForm && (
        <form onSubmit={addEvent} className="border-b border-border bg-panel/30 px-6 py-4">
          <div className="grid grid-cols-2 gap-3 max-w-xl">
            <div className="col-span-2">
              <label className="text-xs text-muted mb-1 block">Title</label>
              <input required value={form.summary} onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))}
                className="w-full rounded border border-border bg-bg px-3 py-1.5 text-xs text-text outline-none focus:border-accent" />
            </div>
            <div>
              <label className="text-xs text-muted mb-1 block">Start</label>
              <input required type="datetime-local" value={form.start} onChange={(e) => setForm((f) => ({ ...f, start: e.target.value }))}
                className="w-full rounded border border-border bg-bg px-3 py-1.5 text-xs text-text outline-none focus:border-accent" />
            </div>
            <div>
              <label className="text-xs text-muted mb-1 block">End (optional)</label>
              <input type="datetime-local" value={form.end} onChange={(e) => setForm((f) => ({ ...f, end: e.target.value }))}
                className="w-full rounded border border-border bg-bg px-3 py-1.5 text-xs text-text outline-none focus:border-accent" />
            </div>
            <div className="col-span-2 flex items-center gap-4">
              <label className="flex items-center gap-2 text-xs text-muted cursor-pointer">
                <input type="checkbox" checked={form.all_day} onChange={(e) => setForm((f) => ({ ...f, all_day: e.target.checked }))} />
                All day
              </label>
              <div className="flex gap-2">
                <button type="submit" className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90">Save</button>
                <button type="button" onClick={() => setShowForm(false)} className="rounded border border-border px-3 py-1.5 text-xs text-muted hover:text-text">Cancel</button>
              </div>
            </div>
          </div>
        </form>
      )}

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {loading && <p className="text-xs text-muted">Loading…</p>}
        {!loading && events.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-12 text-muted">
            <CalIcon size={40} className="opacity-20" />
            <p className="text-sm">No events yet</p>
          </div>
        )}
        {upcoming.length > 0 && <EventSection title="Upcoming" events={upcoming} onDelete={deleteEvent} />}
        {past.length > 0 && <EventSection title="Past" events={past} onDelete={deleteEvent} muted />}
      </div>
    </div>
  );
}

function EventSection({ title, events, onDelete, muted }: {
  title: string; events: CalendarEvent[]; onDelete: (id: number) => void; muted?: boolean;
}) {
  return (
    <div className={`mb-6 ${muted ? "opacity-50" : ""}`}>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">{title}</h2>
      <div className="flex flex-col gap-1.5">
        {events.map((ev) => (
          <div key={ev.id} className="group flex items-start gap-3 rounded-lg border border-border bg-panel/40 px-4 py-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-text">{ev.summary}</p>
              <p className="text-xs text-muted mt-0.5">
                {new Date(ev.start).toLocaleString(undefined, {
                  dateStyle: "medium", timeStyle: ev.all_day ? undefined : "short",
                })}
                {ev.end && ` → ${new Date(ev.end).toLocaleTimeString(undefined, { timeStyle: "short" })}`}
                {ev.all_day && " (all day)"}
              </p>
              {ev.description && <p className="text-xs text-muted/70 mt-1">{ev.description}</p>}
            </div>
            <button onClick={() => onDelete(ev.id)} className="hidden group-hover:flex text-muted hover:text-red-400">
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
