import { useEffect, useState } from "react";
import { Shield, Plus, Eye, EyeOff, Trash2, Copy, Check, Loader } from "lucide-react";
import { api } from "../lib/api";
import type { VaultEntry } from "../types";

export function VaultPage() {
  const [entries, setEntries]     = useState<VaultEntry[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [showForm, setShowForm]   = useState(false);
  const [form, setForm]           = useState({ key: "", value: "", category: "general" });
  const [revealed, setRevealed]   = useState<Record<string, string>>({});
  const [revealing, setRevealing] = useState<Set<string>>(new Set());
  const [copied, setCopied]       = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      setLoading(true);
      setEntries(await api.listVault());
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  }

  async function addEntry(e: React.FormEvent) {
    e.preventDefault();
    if (!form.key || !form.value) return;
    try {
      await api.setVaultItem(form.key, form.value, form.category);
      setForm({ key: "", value: "", category: "general" });
      setShowForm(false);
      await load();
    } catch (e) { setError(String(e)); }
  }

  async function deleteEntry(key: string) {
    try {
      await api.deleteVaultItem(key);
      setEntries((prev) => prev.filter((e) => e.key !== key));
      setRevealed((prev) => { const next = { ...prev }; delete next[key]; return next; });
    } catch (e) { setError(String(e)); }
  }

  async function toggleReveal(key: string) {
    if (revealed[key]) {
      setRevealed((prev) => { const next = { ...prev }; delete next[key]; return next; });
      return;
    }
    try {
      setRevealing((prev) => new Set(prev).add(key));
      const { value } = await api.getVaultValue(key);
      setRevealed((prev) => ({ ...prev, [key]: value }));
    } catch (e) { setError(String(e)); }
    finally { setRevealing((prev) => { const next = new Set(prev); next.delete(key); return next; }); }
  }

  async function copyEntry(key: string) {
    try {
      const value = revealed[key] ?? (await api.getVaultValue(key)).value;
      await navigator.clipboard.writeText(value);
      setCopied(key);
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
        <form onSubmit={addEntry} className="border-b border-border bg-panel/30 px-6 py-4">
          <div className="grid grid-cols-2 gap-3 max-w-xl">
            <div>
              <label className="text-xs text-muted mb-1 block">Key</label>
              <input
                required value={form.key} onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))}
                placeholder="e.g. OPENAI_API_KEY"
                className="w-full rounded border border-border bg-bg px-3 py-1.5 text-xs text-text outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="text-xs text-muted mb-1 block">Category</label>
              <select
                value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                className="w-full rounded border border-border bg-bg px-3 py-1.5 text-xs text-text outline-none focus:border-accent"
              >
                <option value="general">General</option>
                <option value="api_key">API Key</option>
                <option value="token">Token</option>
                <option value="password">Password</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-xs text-muted mb-1 block">Value</label>
              <input
                required type="password" value={form.value} onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
                placeholder="Secret value"
                className="w-full rounded border border-border bg-bg px-3 py-1.5 text-xs text-text outline-none focus:border-accent"
              />
            </div>
            <div className="col-span-2 flex gap-2">
              <button type="submit" className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90">Save</button>
              <button type="button" onClick={() => setShowForm(false)} className="rounded border border-border px-3 py-1.5 text-xs text-muted hover:text-text">Cancel</button>
            </div>
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
            const value = revealed[entry.key];
            const isRevealing = revealing.has(entry.key);
            const wasCopied = copied === entry.key;
            return (
              <div key={entry.key} className="group flex items-center gap-3 rounded-lg border border-border bg-panel/40 px-4 py-3">
                <Shield size={14} className="shrink-0 text-accent/60" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-text font-mono">{entry.key}</p>
                  <p className="text-xs text-muted/50 mt-0.5">{entry.category}</p>
                  {value && (
                    <p className="text-xs font-mono text-muted/70 mt-1 break-all">{value}</p>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => toggleReveal(entry.key)} disabled={isRevealing} className="text-muted hover:text-text transition-colors disabled:opacity-50">
                    {isRevealing ? <Loader size={13} className="animate-spin" /> : value ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                  <button onClick={() => copyEntry(entry.key)} className="text-muted hover:text-text transition-colors">
                    {wasCopied ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
                  </button>
                  <button onClick={() => deleteEntry(entry.key)} className="hidden group-hover:flex text-muted hover:text-red-400 transition-colors">
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
