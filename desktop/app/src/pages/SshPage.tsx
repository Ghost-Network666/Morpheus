import { useEffect, useState } from "react";
import { Server, Plus, Trash2, Terminal } from "lucide-react";
import { api } from "../lib/api";
import { getApiBase } from "../lib/connection";

interface SshConnection {
  id: number;
  label: string;
  host: string;
  port: number;
  username: string;
}

export function SshPage() {
  const [connections, setConnections] = useState<SshConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ label: "", host: "", port: "22", username: "root", password: "" });
  const [connecting, setConnecting] = useState<number | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      setLoading(true);
      const base = await getApiBase();
      const res = await fetch(`${base}/api/ssh/connections`);
      if (!res.ok) throw new Error(`${res.status}`);
      setConnections(await res.json());
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  }

  async function addConnection(e: React.FormEvent) {
    e.preventDefault();
    try {
      const base = await getApiBase();
      const res = await fetch(`${base}/api/ssh/connections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, port: Number(form.port) }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const conn = await res.json();
      setConnections((prev) => [...prev, conn]);
      setShowForm(false);
      setForm({ label: "", host: "", port: "22", username: "root", password: "" });
    } catch (e) { setError(String(e)); }
  }

  async function connectSsh(conn: SshConnection) {
    try {
      setConnecting(conn.id);
      setError(null);
      const base = await getApiBase();
      const res = await fetch(`${base}/api/ssh/connect/${conn.id}`, { method: "POST" });
      if (!res.ok) throw new Error(`${res.status}`);
      const { session_id } = await res.json();
      // Open terminal with this SSH session
      // For now, navigate to terminal with the session
      const wsUrl = base.replace(/^http/, "ws") + `/api/terminal/ws/${session_id}`;
      window.dispatchEvent(new CustomEvent("open-ssh-terminal", { detail: { session_id, wsUrl, label: conn.label } }));
    } catch (e) { setError(String(e)); }
    finally { setConnecting(null); }
  }

  async function deleteConn(id: number) {
    try {
      const base = await getApiBase();
      await fetch(`${base}/api/ssh/connections/${id}`, { method: "DELETE" });
      setConnections((prev) => prev.filter((c) => c.id !== id));
    } catch (e) { setError(String(e)); }
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-border bg-panel/60 px-6 py-3">
        <h1 className="text-sm font-semibold text-text">SSH Connections</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1 rounded-md bg-accent/10 border border-accent/20 px-2.5 py-1.5 text-xs text-accent hover:bg-accent/20"
        >
          <Plus size={12} /> Add Connection
        </button>
      </div>

      {error && <div className="border-b border-border bg-red-950/30 px-6 py-2 text-xs text-red-300">{error}</div>}

      {showForm && (
        <form onSubmit={addConnection} className="border-b border-border bg-panel/30 px-6 py-4">
          <div className="grid grid-cols-2 gap-3 max-w-xl">
            {[
              { key: "label", label: "Label", placeholder: "My Server" },
              { key: "host", label: "Host", placeholder: "192.168.1.10" },
              { key: "port", label: "Port", placeholder: "22" },
              { key: "username", label: "Username", placeholder: "root" },
            ].map(({ key, label, placeholder }) => (
              <div key={key}>
                <label className="text-xs text-muted mb-1 block">{label}</label>
                <input
                  required
                  value={(form as any)[key]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className="w-full rounded border border-border bg-bg px-3 py-1.5 text-xs text-text outline-none focus:border-accent"
                />
              </div>
            ))}
            <div className="col-span-2">
              <label className="text-xs text-muted mb-1 block">Password (optional — leave blank to use key)</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                className="w-full rounded border border-border bg-bg px-3 py-1.5 text-xs text-text outline-none focus:border-accent"
              />
            </div>
            <div className="col-span-2 flex gap-2">
              <button type="submit" className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-white">Save</button>
              <button type="button" onClick={() => setShowForm(false)} className="rounded border border-border px-3 py-1.5 text-xs text-muted hover:text-text">Cancel</button>
            </div>
          </div>
        </form>
      )}

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {loading && <p className="text-xs text-muted">Loading…</p>}
        {!loading && connections.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-12 text-muted">
            <Server size={40} className="opacity-20" />
            <p className="text-sm">No SSH connections saved</p>
            <p className="text-xs opacity-60">Add a server to connect to it via SSH</p>
          </div>
        )}
        <div className="grid grid-cols-1 gap-2 max-w-xl">
          {connections.map((conn) => (
            <div key={conn.id} className="group flex items-center justify-between rounded-lg border border-border bg-panel/40 px-4 py-3">
              <div>
                <p className="text-xs font-medium text-text">{conn.label}</p>
                <p className="text-xs text-muted/70 font-mono">{conn.username}@{conn.host}:{conn.port}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => connectSsh(conn)}
                  disabled={connecting === conn.id}
                  className="flex items-center gap-1.5 rounded px-2.5 py-1 text-xs text-accent border border-accent/20 hover:bg-accent/10 disabled:opacity-50"
                >
                  <Terminal size={12} />
                  {connecting === conn.id ? "Connecting…" : "Connect"}
                </button>
                <button
                  onClick={() => deleteConn(conn.id)}
                  className="hidden group-hover:flex text-muted hover:text-red-400"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
