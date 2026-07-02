import { useEffect, useState } from "react";
import {
  GitBranch, FileText, SquareKanban, Hash,
  CheckCircle2, XCircle, Loader, ExternalLink,
  Server, Wifi, WifiOff, Download, Link2, Unlink, RefreshCw,
} from "lucide-react";
import { api } from "../lib/api";
import { useUIStore } from "../store/useUIStore";
import type { AppSettings } from "../types";

// ── Integrations ─────────────────────────────────────────────────────────────

interface IntegrationDef {
  id: "github" | "notion" | "linear" | "slack";
  name: string;
  description: string;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
  settingsKey: keyof AppSettings;
}

const INTEGRATIONS: IntegrationDef[] = [
  { id: "github",  name: "GitHub",  description: "Personal access token for repo/issue tools.",       Icon: GitBranch,    settingsKey: "github_token" },
  { id: "notion",  name: "Notion",  description: "Integration token for reading/writing pages.",       Icon: FileText,     settingsKey: "notion_token" },
  { id: "linear",  name: "Linear",  description: "API key for issue tracking tools.",                  Icon: SquareKanban, settingsKey: "linear_api_key" },
  { id: "slack",   name: "Slack",   description: "Incoming webhook URL for notifications.",            Icon: Hash,         settingsKey: "slack_webhook" },
];

type TestState = { status: "idle" | "testing" | "ok" | "error"; detail?: string };

// ── Remote servers ─────────────────────────────────────────────────────────────

interface SshProfile {
  id: number;
  label: string;
  host: string;
  port: number;
  username: string;
}

interface ProbeResult {
  morpheus_running: boolean;
  docker_running: boolean;
  docker_available: boolean;
  tunnel_active: boolean;
  local_port: number | null;
}

type ProfileState = "idle" | "probing" | "installing" | "tunneling";

// ── Page ──────────────────────────────────────────────────────────────────────

export function ConnectionsPage() {
  // integrations state
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [tests, setTests] = useState<Record<string, TestState>>({});

  // remote servers state
  const [profiles, setProfiles]   = useState<SshProfile[]>([]);
  const [discovered, setDiscovered] = useState<any[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const [probeResults, setProbeResults] = useState<Record<number, ProbeResult>>({});
  const [profileStates, setProfileStates] = useState<Record<number, ProfileState>>({});
  const [remoteError, setRemoteError] = useState<string | null>(null);

  const setActiveSettingsCategory = useUIStore((s) => s.setActiveSettingsCategory);

  useEffect(() => {
    api.getSettings().then(setSettings).finally(() => setLoadingSettings(false));
    api.listSshProfiles().then(setProfiles).catch(() => {});
    runDiscover();
  }, []);

  // ── Integrations actions ─────────────────────────────────────────────────

  async function runTest(id: IntegrationDef["id"]) {
    setTests((t) => ({ ...t, [id]: { status: "testing" } }));
    try {
      const result = await api.testIntegration(id);
      setTests((t) => ({ ...t, [id]: { status: result.ok ? "ok" : "error", detail: result.detail } }));
    } catch (e) {
      setTests((t) => ({ ...t, [id]: { status: "error", detail: e instanceof Error ? e.message : String(e) } }));
    }
  }

  function openIntegrationSettings() {
    setActiveSettingsCategory("integrations");
    window.dispatchEvent(new CustomEvent("navigate-view", { detail: { view: "settings" } }));
  }

  // ── Remote server actions ────────────────────────────────────────────────

  async function runDiscover() {
    setDiscovering(true);
    try { setDiscovered(await api.discoverServers()); } catch { /* ignore */ }
    finally { setDiscovering(false); }
  }

  function setPState(id: number, s: ProfileState) {
    setProfileStates((prev) => ({ ...prev, [id]: s }));
  }

  async function probe(profile: SshProfile) {
    setPState(profile.id, "probing");
    setRemoteError(null);
    try {
      const r = await api.probeRemote(profile.id);
      setProbeResults((prev) => ({ ...prev, [profile.id]: r }));
    } catch (e) { setRemoteError(String(e)); }
    finally { setPState(profile.id, "idle"); }
  }

  async function install(profile: SshProfile) {
    setPState(profile.id, "installing");
    setRemoteError(null);
    try {
      await api.installRemote(profile.id);
      const r = await api.probeRemote(profile.id);
      setProbeResults((prev) => ({ ...prev, [profile.id]: r }));
    } catch (e) { setRemoteError(String(e)); }
    finally { setPState(profile.id, "idle"); }
  }

  async function openTunnel(profile: SshProfile) {
    setPState(profile.id, "tunneling");
    setRemoteError(null);
    try {
      const r = await api.startTunnel(profile.id);
      setProbeResults((prev) => ({
        ...prev,
        [profile.id]: { ...prev[profile.id], tunnel_active: true, local_port: r.local_port },
      }));
    } catch (e) { setRemoteError(String(e)); }
    finally { setPState(profile.id, "idle"); }
  }

  async function closeTunnel(profile: SshProfile) {
    setPState(profile.id, "tunneling");
    setRemoteError(null);
    try {
      await api.stopTunnel(profile.id);
      setProbeResults((prev) => ({
        ...prev,
        [profile.id]: { ...prev[profile.id], tunnel_active: false, local_port: null },
      }));
    } catch (e) { setRemoteError(String(e)); }
    finally { setPState(profile.id, "idle"); }
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      {/* ── Integrations section ───────────────────────────────── */}
      <div className="border-b px-6 py-3" style={{ borderColor: "var(--glass-border)" }}>
        <h1 className="text-sm font-semibold text-text">Connections</h1>
        <p className="mt-0.5 text-xs text-muted">
          Personal access tokens and webhooks used by agent tools and automations.
        </p>
      </div>

      <div className="flex flex-col gap-3 p-6">
        {loadingSettings && (
          <div className="flex items-center justify-center py-8 text-muted">
            <Loader size={16} className="animate-spin" />
          </div>
        )}

        {!loadingSettings && settings && INTEGRATIONS.map((integration) => {
          const configured = !!settings[integration.settingsKey];
          const test = tests[integration.id] ?? { status: "idle" as const };

          return (
            <div
              key={integration.id}
              className="glass-panel flex items-center gap-4 rounded-xl border px-4 py-3.5"
              style={{ borderColor: "var(--glass-border)" }}
            >
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                style={{ background: "rgb(var(--color-accent-rgb) / 0.12)" }}
              >
                <integration.Icon size={16} className="text-accent" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-text">{integration.name}</span>
                  {configured ? (
                    <span className="rounded-full px-1.5 py-0.5 text-[10px] font-medium" style={{ background: "rgba(74,222,128,0.12)", color: "rgb(74,222,128)" }}>
                      Configured
                    </span>
                  ) : (
                    <span className="rounded-full px-1.5 py-0.5 text-[10px] font-medium text-muted" style={{ background: "rgba(255,255,255,0.06)" }}>
                      Not configured
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-muted">{integration.description}</p>
                {test.status === "ok" && (
                  <p className="mt-1 flex items-center gap-1 text-xs" style={{ color: "rgb(74,222,128)" }}>
                    <CheckCircle2 size={11} /> {test.detail}
                  </p>
                )}
                {test.status === "error" && (
                  <p className="mt-1 flex items-center gap-1 text-xs text-red-400">
                    <XCircle size={11} /> {test.detail}
                  </p>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {configured && (
                  <button
                    onClick={() => runTest(integration.id)}
                    disabled={test.status === "testing"}
                    className="rounded-lg border px-3 py-1.5 text-xs font-medium text-text transition-colors hover:bg-white/[0.06] disabled:opacity-50"
                    style={{ borderColor: "var(--glass-border)" }}
                  >
                    {test.status === "testing" ? "Testing…" : "Test connection"}
                  </button>
                )}
                <button
                  onClick={openIntegrationSettings}
                  className="flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-white/[0.06] hover:text-text"
                  style={{ borderColor: "var(--glass-border)" }}
                >
                  {configured ? "Edit" : "Configure"} <ExternalLink size={10} />
                </button>
              </div>
            </div>
          );
        })}

        <p className="mt-2 text-xs text-muted opacity-70">
          Tokens are stored encrypted and only used by tools you run locally. Nothing is sent to a third-party server.
        </p>
      </div>

      {/* ── Remote servers section ─────────────────────────────── */}
      <div className="border-t px-6 py-3 flex items-center justify-between" style={{ borderColor: "var(--glass-border)" }}>
        <div>
          <h2 className="text-sm font-semibold text-text">Remote Servers</h2>
          <p className="mt-0.5 text-xs text-muted">Connect to a Morpheus instance on another machine via SSH.</p>
        </div>
        <button
          onClick={runDiscover}
          disabled={discovering}
          className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted hover:text-text disabled:opacity-50"
        >
          {discovering ? <Loader size={11} className="animate-spin" /> : <RefreshCw size={11} />}
          Discover
        </button>
      </div>

      {remoteError && (
        <div className="mx-6 mb-3 rounded border border-red-900/40 bg-red-950/30 px-3 py-2 text-xs text-red-300">{remoteError}</div>
      )}

      <div className="flex flex-col gap-3 px-6 pb-6">
        {/* Auto-discovered instances */}
        {discovered.map((srv, i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl border border-border bg-panel/40 px-4 py-3">
            <Wifi size={14} className="text-green-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-text">{srv.host}</p>
              <p className="text-xs text-muted font-mono">{srv.url} · v{srv.version} · {srv.source}</p>
            </div>
            <a
              href={srv.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 rounded-lg border border-accent/20 px-2.5 py-1 text-xs text-accent hover:bg-accent/10"
            >
              Open <ExternalLink size={10} />
            </a>
          </div>
        ))}

        {/* SSH profile cards */}
        {profiles.length === 0 && discovered.length === 0 && !discovering && (
          <div className="flex flex-col items-center gap-3 py-8 text-muted">
            <Server size={32} className="opacity-20" />
            <p className="text-sm">No servers found</p>
            <p className="text-xs opacity-60 text-center max-w-xs">
              Add an SSH profile in the SSH page, then come back here to probe and connect to a remote instance.
            </p>
          </div>
        )}

        {profiles.map((profile) => {
          const probeData = probeResults[profile.id];
          const pstate = profileStates[profile.id] ?? "idle";
          const busy = pstate !== "idle";
          return (
            <div key={profile.id} className="rounded-xl border border-border bg-panel/40 px-4 py-3 flex flex-col gap-2">
              <div className="flex items-center gap-3">
                <Server size={14} className="text-muted shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-text">{profile.label}</p>
                  <p className="text-xs text-muted font-mono">{profile.username}@{profile.host}:{profile.port}</p>
                </div>
                {probeData && (
                  <span className={"flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium " + (probeData.morpheus_running ? "bg-green-500/10 text-green-400" : "bg-yellow-500/10 text-yellow-400")}>
                    {probeData.morpheus_running ? <Wifi size={10} /> : <WifiOff size={10} />}
                    {probeData.morpheus_running ? "Running" : "Not running"}
                  </span>
                )}
                <button
                  onClick={() => probe(profile)}
                  disabled={busy}
                  className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs text-muted hover:text-text disabled:opacity-50"
                >
                  {pstate === "probing" ? <Loader size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                  {probeResults[profile.id] ? "Re-probe" : "Probe"}
                </button>
              </div>

              {probeData && (
                <div className="flex items-center gap-2 flex-wrap pl-6">
                  {!probeData.morpheus_running && probeData.docker_available && (
                    <button
                      onClick={() => install(profile)}
                      disabled={busy}
                      className="flex items-center gap-1.5 rounded-lg border border-accent/20 px-2.5 py-1 text-xs text-accent hover:bg-accent/10 disabled:opacity-50"
                    >
                      {pstate === "installing" ? <Loader size={11} className="animate-spin" /> : <Download size={11} />}
                      {pstate === "installing" ? "Installing…" : "Install via Docker"}
                    </button>
                  )}
                  {!probeData.morpheus_running && !probeData.docker_available && (
                    <p className="text-xs text-muted opacity-60">Docker not available on this server</p>
                  )}
                  {probeData.morpheus_running && !probeData.tunnel_active && (
                    <button
                      onClick={() => openTunnel(profile)}
                      disabled={busy}
                      className="flex items-center gap-1.5 rounded-lg border border-accent/20 px-2.5 py-1 text-xs text-accent hover:bg-accent/10 disabled:opacity-50"
                    >
                      {pstate === "tunneling" ? <Loader size={11} className="animate-spin" /> : <Link2 size={11} />}
                      {pstate === "tunneling" ? "Connecting…" : "Open Tunnel"}
                    </button>
                  )}
                  {probeData.tunnel_active && probeData.local_port && (
                    <>
                      <span className="flex items-center gap-1.5 rounded-full bg-green-500/10 px-2.5 py-0.5 text-[10px] text-green-400 font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                        Tunnel · port {probeData.local_port}
                      </span>
                      <a
                        href={"http://127.0.0.1:" + probeData.local_port}
                        className="flex items-center gap-1 rounded-lg border border-accent/20 px-2.5 py-1 text-xs text-accent hover:bg-accent/10"
                        target="_blank" rel="noreferrer"
                      >
                        Open <ExternalLink size={10} />
                      </a>
                      <button
                        onClick={() => closeTunnel(profile)}
                        disabled={busy}
                        className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs text-muted hover:text-red-400 disabled:opacity-50"
                      >
                        <Unlink size={11} /> Close
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
