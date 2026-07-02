import { useEffect, useState } from "react";
import { GitBranch, FileText, SquareKanban, Hash, CheckCircle2, XCircle, Loader, ExternalLink } from "lucide-react";
import { api } from "../lib/api";
import { useUIStore } from "../store/useUIStore";
import type { AppSettings } from "../types";

interface IntegrationDef {
  id: "github" | "notion" | "linear" | "slack";
  name: string;
  description: string;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
  settingsKey: keyof AppSettings;
}

const INTEGRATIONS: IntegrationDef[] = [
  { id: "github", name: "GitHub", description: "Personal access token for repo/issue tools.", Icon: GitBranch, settingsKey: "github_token" },
  { id: "notion", name: "Notion", description: "Integration token for reading/writing pages.", Icon: FileText, settingsKey: "notion_token" },
  { id: "linear", name: "Linear", description: "API key for issue tracking tools.", Icon: SquareKanban, settingsKey: "linear_api_key" },
  { id: "slack", name: "Slack", description: "Incoming webhook URL for notifications.", Icon: Hash, settingsKey: "slack_webhook" },
];

type TestState = { status: "idle" | "testing" | "ok" | "error"; detail?: string };

export function ConnectionsPage() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [tests, setTests] = useState<Record<string, TestState>>({});

  useEffect(() => {
    api.getSettings().then(setSettings).finally(() => setLoading(false));
  }, []);

  async function runTest(id: IntegrationDef["id"]) {
    setTests((t) => ({ ...t, [id]: { status: "testing" } }));
    try {
      const result = await api.testIntegration(id);
      setTests((t) => ({ ...t, [id]: { status: result.ok ? "ok" : "error", detail: result.detail } }));
    } catch (e) {
      setTests((t) => ({ ...t, [id]: { status: "error", detail: e instanceof Error ? e.message : String(e) } }));
    }
  }

  const setActiveSettingsCategory = useUIStore((s) => s.setActiveSettingsCategory);

  function openIntegrationSettings() {
    setActiveSettingsCategory("integrations");
    window.dispatchEvent(new CustomEvent("navigate-view", { detail: { view: "settings" } }));
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <div className="border-b px-6 py-3" style={{ borderColor: "var(--glass-border)" }}>
        <h1 className="text-sm font-semibold text-text">Connections</h1>
        <p className="mt-0.5 text-xs text-muted">
          Personal access tokens and webhooks used by agent tools and automations.
        </p>
      </div>

      <div className="flex flex-col gap-3 p-6">
        {loading && (
          <div className="flex items-center justify-center py-12 text-muted">
            <Loader size={16} className="animate-spin" />
          </div>
        )}

        {!loading && settings && INTEGRATIONS.map((integration) => {
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
          These are personal-access-token connections, not OAuth apps — tokens are stored encrypted and only used
          by tools you run from Morpheus (agent mode, notifications). Nothing is shared with a third-party server.
        </p>
      </div>
    </div>
  );
}
