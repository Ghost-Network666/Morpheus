import { useEffect, useState } from "react";
import { Shield, Plus, Eye, EyeOff, Trash2, Copy, Check } from "lucide-react";
import { api } from "../lib/api";
import { getApiBase } from "../lib/connection";

interface VaultEntry {
  id: number;
  label: string;
  value: string;
  created_at: string;
}

export function VaultPage() {
  const [entries, setEntries] = useState<VaultEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ label: "", value: "" });
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [copied, setCopied] = useState<number | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      setLoading(true);
      const base = await getApiBase();
      const res = await fetch(`${base}/api/vault`);
      if (!res.ok) throw new Error(`${res.status}`);
      setEntries(await res.json());
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  }

  async function addEntry(e: React.FormEvent) {
    e.preventDefault();
    if (!form.label || !form.value) return;
    try {
      const base = await getApiBase();
      const res = await fetch(`${base}/api/vault`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const entry = await res.json();
      setEntries((prev) => [entry, ...prev]);
      setForm({ label: "", value: "" });
      setShowForm(false);
    } catch (e) { setError(String(e)); }
  }

  async function deleteEntry(id: number) {
    try {
      const base = await getApiBase();
      await fetch(`${base}/api/vault/${id}`, { method: "DELETE" });
      setEntries((prev) => prev.filter((e) => e.id !== id));
    } catch (e) { setError(String(e)); }
  }

  function toggleReveal(id: number) {
    setRevealed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function copyEntry(entry: VaultEntry) {
    try {
      await navigator.clipboard.writeText(entry.value);
      setCopied(entry.id);
      setTimeout(() => setCopied(null), 1500);
    } catch { /* ignore */ }
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-border bg-panel/60 px-6 py-3">
        <h1 className="text-sm font-semibold text-text">Vault</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1 rounded-md bg-accent/10 border border-accent/20 px-2.5 py-1.5 text-xs text-accent hover:bg-accent/20"
        >
          <Plus size={12} /> Add Secret
        </button>
      </div>

      {error && <div className="border-b border-border bg-red-950/30 px-6 py-2 text-xs text-red-300">{error}</div>}

      {showForm && (
        <form onSubmit={addEntry} className="flex items-end gap-3 border-b border-border bg-panel/30 px-6 py-4">
          <div className="flex-1">
            <label className="text-xs text-muted mb-1 block">Label</label>
            <input
              required value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              placeholder="e.g. OPENAI_KEY"
              className="w-full rounded border border-border bg-bg px-3 py-1.5 text-xs text-text outline-none focus:border-accent"
            />
          </div>
          <div className="flex-1">
            <label className="text-xs text-muted mb-1 block">Value</label>
            <input
              required type="password" value={form.value} onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
              placeholder="Secret value"
              className="w-full rounded border border-border bg-bg px-3 py-1.5 text-xs text-text outline-none focus:border-accent"
            />
          </div>
          <div className="flex gap-2 pb-0.5">
            <button type="submit" className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90">Save</button>
            <button type="button" onClick={() => setShowForm(false)} className="rounded border border-border px-3 py-1.5 text-xs text-muted hover:text-text">Cancel</button>
          </div>
        </form>
      )}

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {loading && <p className="text-xs text-muted">Loading…</p>}
        {!loading && entries.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-12 text-muted">
            <Shield size={40} className="opacity-20" />
            <p className="text-sm">No secrets stored</p>
            <p className="text-xs opacity-60">Store API keys, tokens, and passwords encrypted at rest</p>
          </div>
        )}
        <div className="flex flex-col gap-1.5 max-w-2xl">
          {entries.map((entry) => {
            const show = revealed.has(entry.id);
            const wasCopied = copied === entry.id;
            return (
              <div key={entry.id} className="group flex items-center gap-3 rounded-lg border border-border bg-panel/40 px-4 py-3">
                <Shield size={14} className="shrink-0 text-accent/60" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-text">{entry.label}</p>
                  <p className="text-xs font-mono text-muted/70 mt-0.5">
                    {show ? entry.value : "••••••••••••"}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => toggleReveal(entry.id)} className="text-muted hover:text-text transition-colors">
                    {show ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                  <button onClick={() => copyEntry(entry)} className="text-muted hover:text-text transition-colors">
                    {wasCopied ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
                  </button>
                  <button onClick={() => deleteEntry(entry.id)} className="hidden group-hover:flex text-muted hover:text-red-400 transition-colors">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
