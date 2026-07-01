import { useEffect, useState } from "react";
import { Server, Plus, Trash2, Terminal } from "lucide-react";
import { api } from "../lib/api";
import { getApiBase } from "../lib/connection";

interface SshProfile {
  id: number;
  label: string;
  host: string;
  port: number;
  username: string;
}

export function SshPage() {
  const [profiles, setProfiles] = useState<SshProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ label: "", host: "", port: "22", username: "root", password: "" });
  const [connecting, setConnecting] = useState<number | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      setLoading(true);
      setProfiles(await api.listSshProfiles());
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  }

  async function addProfile(e: React.FormEvent) {
    e.preventDefault();
    try {
      const profile = await api.createSshProfile({
        ...form,
        port: Number(form.port),
      });
      setProfiles((prev) => [...prev, profile]);
      setShowForm(false);
      setForm({ label: "", host: "", port: "22", username: "root", password: "" });
    } catch (e) { setError(String(e)); }
  }

  async function connectProfile(profile: SshProfile) {
    try {
      setConnecting(profile.id);
      setError(null);
      const { session_id } = await api.connectSshProfile(profile.id);
      const base = await getApiBase();
      const wsUrl = base.replace(/^http/, "ws") + `/api/terminal/ws/${session_id}`;
      window.dispatchEvent(new CustomEvent("open-ssh-terminal", { detail: { session_id, wsUrl, label: profile.label } }));
    } catch (e) { setError(String(e)); }
    finally { setConnecting(null); }
  }

  async function deleteProfile(id: number) {
    try {
      await api.deleteSshProfile(id);
      setProfiles((prev) => prev.filter((p) => p.id !== id));
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
        <form onSubmit={addProfile} className="border-b border-border bg-panel/30 px-6 py-4">
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
        {!loading && profiles.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-12 text-muted">
            <Server size={40} className="opacity-20" />
            <p className="text-sm">No SSH connections saved</p>
            <p className="text-xs opacity-60">Add a server to connect to it via SSH</p>
          </div>
        )}
        <div className="grid grid-cols-1 gap-2 max-w-xl">
          {profiles.map((profile) => (
            <div key={profile.id} className="group flex items-center justify-between rounded-lg border border-border bg-panel/40 px-4 py-3">
              <div>
                <p className="text-xs font-medium text-text">{profile.label}</p>
                <p className="text-xs text-muted/70 font-mono">{profile.username}@{profile.host}:{profile.port}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => connectProfile(profile)}
                  disabled={connecting === profile.id}
                  className="flex items-center gap-1.5 rounded px-2.5 py-1 text-xs text-accent border border-accent/20 hover:bg-accent/10 disabled:opacity-50"
                >
                  <Terminal size={12} />
                  {connecting === profile.id ? "Connecting…" : "Connect"}
                </button>
                <button
                  onClick={() => deleteProfile(profile.id)}
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
