import { useEffect, useState } from "react";
import { Save, Eye, EyeOff, ToggleLeft, ToggleRight, RefreshCw } from "lucide-react";
import { api } from "../lib/api";
import type { AppSettings } from "../types";

interface Field {
  key: keyof AppSettings;
  label: string;
  placeholder?: string;
  secret?: boolean;
  type?: "text" | "number" | "select";
  options?: { value: string; label: string }[];
}

const SECTIONS: { title: string; fields: Field[] }[] = [
  {
    title: "AI Provider",
    fields: [
      { key: "default_provider", label: "Default Provider", type: "select", options: [
        { value: "ollama", label: "Ollama (local)" },
        { value: "openai", label: "OpenAI" },
        { value: "anthropic", label: "Anthropic" },
        { value: "lmstudio", label: "LM Studio" },
      ]},
      { key: "default_model", label: "Default Model", placeholder: "llama3.2:3b" },
      { key: "ollama_url", label: "Ollama URL", placeholder: "http://localhost:11434" },
      { key: "openai_api_key", label: "OpenAI API Key", placeholder: "sk-…", secret: true },
      { key: "openai_base_url", label: "OpenAI Base URL", placeholder: "https://api.openai.com/v1" },
      { key: "anthropic_api_key", label: "Anthropic API Key", placeholder: "sk-ant-…", secret: true },
    ],
  },
  {
    title: "Web Search",
    fields: [
      { key: "searxng_url", label: "SearXNG URL", placeholder: "http://localhost:8080" },
      { key: "brave_api_key", label: "Brave Search API Key", placeholder: "BSA…", secret: true },
      { key: "tavily_api_key", label: "Tavily API Key", placeholder: "tvly-…", secret: true },
    ],
  },
  {
    title: "Notifications",
    fields: [
      { key: "ntfy_url", label: "ntfy URL", placeholder: "https://ntfy.sh" },
      { key: "ntfy_topic", label: "ntfy Topic", placeholder: "morpheus-alerts" },
      { key: "slack_webhook", label: "Slack Webhook URL", placeholder: "https://hooks.slack.com/…", secret: true },
    ],
  },
  {
    title: "Integrations",
    fields: [
      { key: "github_token", label: "GitHub Token", placeholder: "ghp_…", secret: true },
      { key: "notion_token", label: "Notion Token", placeholder: "secret_…", secret: true },
      { key: "linear_api_key", label: "Linear API Key", placeholder: "lin_api_…", secret: true },
    ],
  },
  {
    title: "Obsidian",
    fields: [
      { key: "obsidian_vault_path", label: "Vault Path", placeholder: "/Users/you/Documents/Vault" },
    ],
  },
];

const MODULES: { key: keyof AppSettings; label: string; description: string }[] = [
  { key: "module_terminal", label: "Terminal", description: "Local PTY terminal" },
  { key: "module_ssh", label: "SSH", description: "Saved SSH connections" },
  { key: "module_agent", label: "Agent Mode", description: "ReAct AI agent with tools" },
  { key: "module_rag", label: "Memory / RAG", description: "Semantic search over your documents" },
  { key: "module_research", label: "Research", description: "Agentic web research" },
  { key: "module_notes", label: "Notes", description: "Markdown notes" },
  { key: "module_tasks", label: "Tasks", description: "Task list with priorities" },
  { key: "module_calendar", label: "Calendar", description: "Events and scheduling" },
  { key: "module_email", label: "Email", description: "IMAP email client" },
  { key: "module_documents", label: "Documents", description: "File browser and editor" },
  { key: "module_obsidian", label: "Obsidian", description: "Obsidian vault integration" },
  { key: "module_cookbook", label: "Cookbook", description: "Ollama model manager" },
  { key: "module_connections", label: "Connections", description: "External integrations" },
];

export function SettingsPage() {
  const [settings, setSettings] = useState<Partial<AppSettings>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [toggling, setToggling] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      setLoading(true);
      const data = await api.getSettings();
      setSettings(data);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    try {
      setSaving(true);
      setError(null);
      await api.updateSettings(settings as Record<string, unknown>);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function toggleModule(key: string) {
    const module = key.replace("module_", "");
    try {
      setToggling(key);
      const result = await api.toggleModule(module);
      setSettings((prev) => ({ ...prev, [key]: result.enabled }));
    } catch (e) {
      setError(String(e));
    } finally {
      setToggling(null);
    }
  }

  function setValue(key: keyof AppSettings, value: unknown) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  if (loading) return <LoadingState />;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-border bg-panel/60 px-6 py-3">
        <h1 className="text-sm font-semibold text-text">Settings</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            title="Reload settings"
            className="flex items-center gap-1.5 rounded px-2 py-1.5 text-xs text-muted hover:text-text hover:bg-white/5 transition-colors"
          >
            <RefreshCw size={12} />
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-50 transition-colors"
          >
            <Save size={12} />
            {saving ? "Saving…" : saved ? "Saved!" : "Save"}
          </button>
        </div>
      </div>

      {error && (
        <div className="border-b border-border bg-red-950/30 px-6 py-2 text-xs text-red-300">
          {error}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-2xl space-y-8">
          {SECTIONS.map((section) => (
            <div key={section.title}>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">
                {section.title}
              </h2>
              <div className="rounded-lg border border-border bg-panel/60 divide-y divide-border">
                {section.fields.map((field) => (
                  <SettingsField
                    key={field.key}
                    field={field}
                    value={(settings[field.key] as string) ?? ""}
                    showSecret={showSecrets[field.key] ?? false}
                    onToggleSecret={() =>
                      setShowSecrets((prev) => ({ ...prev, [field.key]: !prev[field.key] }))
                    }
                    onChange={(v) => setValue(field.key, v)}
                  />
                ))}
              </div>
            </div>
          ))}

          {/* Modules */}
          <div>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">
              Modules
            </h2>
            <div className="rounded-lg border border-border bg-panel/60 divide-y divide-border">
              {MODULES.map((mod) => {
                const enabled = settings[mod.key] !== false;
                return (
                  <div key={mod.key} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-xs font-medium text-text">{mod.label}</p>
                      <p className="text-xs text-muted">{mod.description}</p>
                    </div>
                    <button
                      onClick={() => toggleModule(mod.key)}
                      disabled={toggling === mod.key}
                      className="flex items-center transition-colors"
                    >
                      {enabled
                        ? <ToggleRight size={24} className="text-accent" />
                        : <ToggleLeft size={24} className="text-muted/50" />
                      }
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingsField({
  field, value, showSecret, onToggleSecret, onChange,
}: {
  field: Field;
  value: string;
  showSecret: boolean;
  onToggleSecret: () => void;
  onChange: (v: string) => void;
}) {
  const isMasked = value === "••••••••";

  return (
    <div className="flex items-center gap-4 px-4 py-3">
      <label className="w-40 shrink-0 text-xs text-muted">{field.label}</label>
      {field.type === "select" ? (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 rounded border border-border bg-bg px-2 py-1.5 text-xs text-text outline-none focus:border-accent"
        >
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      ) : (
        <div className="flex flex-1 items-center gap-1">
          <input
            type={field.secret && !showSecret && !isMasked ? "password" : "text"}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => { if (isMasked) onChange(""); }}
            placeholder={field.placeholder}
            className="flex-1 rounded border border-border bg-bg px-2 py-1.5 text-xs text-text outline-none focus:border-accent placeholder-muted/50"
          />
          {field.secret && (
            <button
              onClick={onToggleSecret}
              className="text-muted hover:text-text transition-colors"
            >
              {showSecret ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex flex-1 items-center justify-center text-muted text-sm">
      Loading settings…
    </div>
  );
}
