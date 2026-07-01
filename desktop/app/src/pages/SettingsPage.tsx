import { useEffect, useState, useMemo } from "react";
import { z } from "zod";
import {
  Save, Eye, EyeOff, RefreshCw, Search,
  Cpu, Globe, Bell, Link2, BookOpen, Layout, Sliders,
  Palette, Check, Info, Download,
} from "lucide-react";
import { Switch } from "../components/ui/Switch";
import { api } from "../lib/api";
import { useUIStore, THEMES, type ThemeId } from "../store/useUIStore";
import { useFeatureStore } from "../store/useFeatureStore";
import { useToast } from "../components/ui/Toast";
import type { AppSettings } from "../types";

// ── Zod schema ──────────────────────────────────────────────────────────────
const SettingsSchema = z.object({
  ollama_url:        z.string().url().optional().or(z.literal("")),
  openai_api_key:    z.string().optional(),
  anthropic_api_key: z.string().optional(),
  openai_base_url:   z.string().url().optional().or(z.literal("")),
  default_model:     z.string().optional(),
  default_provider:  z.enum(["ollama", "openai", "anthropic", "lmstudio"]).optional(),
}).passthrough();

// ── Category definitions ─────────────────────────────────────────────────────
interface FieldDef {
  key: keyof AppSettings;
  label: string;
  description?: string;
  placeholder?: string;
  secret?: boolean;
  type?: "text" | "select" | "url";
  options?: { value: string; label: string }[];
}

interface Category {
  id: string;
  label: string;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
  fields: FieldDef[];
}

const CATEGORIES: Category[] = [
  {
    id: "ai", label: "AI Provider", Icon: Cpu,
    fields: [
      { key: "default_provider", label: "Default Provider", description: "Which provider to use for chat", type: "select",
        options: [
          { value: "ollama",    label: "Ollama (local)" },
          { value: "openai",    label: "OpenAI" },
          { value: "anthropic", label: "Anthropic" },
          { value: "lmstudio",  label: "LM Studio" },
        ],
      },
      { key: "default_model",     label: "Default Model",        placeholder: "llama3.2:3b" },
      { key: "ollama_url",        label: "Ollama URL",           placeholder: "http://localhost:11434", type: "url" },
      { key: "openai_api_key",    label: "OpenAI API Key",       placeholder: "sk-…", secret: true },
      { key: "openai_base_url",   label: "OpenAI Base URL",      placeholder: "https://api.openai.com/v1", type: "url" },
      { key: "anthropic_api_key", label: "Anthropic API Key",    placeholder: "sk-ant-…", secret: true },
    ],
  },
  {
    id: "search", label: "Web Search", Icon: Globe,
    fields: [
      { key: "searxng_url",   label: "SearXNG URL",          placeholder: "http://localhost:8080", type: "url" },
      { key: "brave_api_key", label: "Brave Search API Key", placeholder: "BSA…", secret: true },
      { key: "tavily_api_key", label: "Tavily API Key",      placeholder: "tvly-…", secret: true },
    ],
  },
  {
    id: "notifications", label: "Notifications", Icon: Bell,
    fields: [
      { key: "ntfy_url",      label: "ntfy URL",          placeholder: "https://ntfy.sh", type: "url" },
      { key: "ntfy_topic",    label: "ntfy Topic",        placeholder: "morpheus-alerts" },
      { key: "slack_webhook", label: "Slack Webhook URL", placeholder: "https://hooks.slack.com/…", secret: true },
    ],
  },
  {
    id: "integrations", label: "Integrations", Icon: Link2,
    fields: [
      { key: "github_token",   label: "GitHub Token",  placeholder: "ghp_…", secret: true },
      { key: "notion_token",   label: "Notion Token",  placeholder: "secret_…", secret: true },
      { key: "linear_api_key", label: "Linear API Key", placeholder: "lin_api_…", secret: true },
    ],
  },
  {
    id: "obsidian", label: "Obsidian", Icon: BookOpen,
    fields: [
      { key: "obsidian_vault_path", label: "Vault Path", placeholder: "/Users/you/Documents/Vault" },
    ],
  },
];

const MODULE_DEFS = [
  { key: "terminal",    label: "Terminal",    description: "Local PTY terminal" },
  { key: "ssh",         label: "SSH",         description: "Saved SSH connections" },
  { key: "agent",       label: "Agent Mode",  description: "ReAct AI agent with tools" },
  { key: "rag",         label: "Memory / RAG", description: "Semantic search over documents" },
  { key: "research",    label: "Research",    description: "Agentic web research" },
  { key: "notes",       label: "Notes",       description: "Markdown notes" },
  { key: "tasks",       label: "Tasks",       description: "Task list with priorities" },
  { key: "calendar",    label: "Calendar",    description: "Events and scheduling" },
  { key: "email",       label: "Email",       description: "IMAP email client" },
  { key: "documents",   label: "Documents",   description: "File browser" },
  { key: "obsidian",    label: "Obsidian",    description: "Obsidian vault integration" },
  { key: "cookbook",    label: "Cookbook",    description: "Ollama model manager" },
  { key: "connections", label: "Connections", description: "External integrations" },
];

// ── Component ────────────────────────────────────────────────────────────────
export function SettingsPage() {
  const [settings,    setSettings]    = useState<Partial<AppSettings>>({});
  const [loading,     setLoading]     = useState(true);
  const [saving,      setSaving]      = useState(false);
  const [toggling,    setToggling]    = useState<string | null>(null);
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [errors,      setErrors]      = useState<Record<string, string>>({});
  const [appVersion,  setAppVersion]  = useState<string>("");
  const [updateStatus, setUpdateStatus] = useState<"idle" | "checking" | "available" | "up-to-date" | "error">("idle");

  const { theme, setTheme, settingsSearch, setSettingsSearch, activeSettingsCategory, setActiveSettingsCategory } = useUIStore();
  const { modules, setModule } = useFeatureStore();
  const toast = useToast();

  useEffect(() => {
    load();
    const ea = (window as any).electronAPI;
    if (!ea) return;
    ea.getVersion?.().then((v: string) => setAppVersion(v)).catch(() => {});
    const u1 = ea.onUpdateNotAvailable?.(() => setUpdateStatus("up-to-date"));
    const u2 = ea.onUpdateAvailable?.(() => setUpdateStatus("available"));
    const u3 = ea.onUpdateError?.(() => setUpdateStatus("error"));
    return () => { u1?.(); u2?.(); u3?.(); };
  }, []);

  async function load() {
    try {
      setLoading(true);
      const data = await api.getSettings();
      setSettings(data);
      // Sync feature store with backend modules
      const mods: Record<string, boolean> = {};
      for (const mod of MODULE_DEFS) {
        const backendKey = `module_${mod.key}` as keyof AppSettings;
        if (typeof data[backendKey] === "boolean") {
          mods[mod.key] = data[backendKey] as boolean;
        }
      }
      useFeatureStore.getState().setModules(mods);
    } catch (e) {
      toast("Failed to load settings", { type: "error", description: String(e) });
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    const result = SettingsSchema.safeParse(settings);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.issues.forEach((issue) => {
        const key = issue.path[0]?.toString() ?? "unknown";
        fieldErrors[key] = issue.message;
      });
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    try {
      setSaving(true);
      await api.updateSettings(settings as Record<string, unknown>);
      toast("Settings saved", { type: "success" });
    } catch (e) {
      toast("Save failed", { type: "error", description: String(e) });
    } finally {
      setSaving(false);
    }
  }

  async function toggleMod(key: string) {
    try {
      setToggling(key);
      const result = await api.toggleModule(key);
      setModule(key, result.enabled);
      const backendKey = `module_${key}` as keyof AppSettings;
      setSettings((prev) => ({ ...prev, [backendKey]: result.enabled }));
    } catch (e) {
      toast(`Failed to toggle ${key}`, { type: "error" });
    } finally {
      setToggling(null);
    }
  }

  function setValue(key: keyof AppSettings, value: unknown) {
    setSettings((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => { const n = { ...prev }; delete n[key]; return n; });
  }

  // ── Search filtering ──────────────────────────────────────────────────────
  const q = settingsSearch.toLowerCase();

  const filteredCategories = useMemo(() =>
    CATEGORIES.map((cat) => ({
      ...cat,
      fields: q
        ? cat.fields.filter(
            (f) => f.label.toLowerCase().includes(q) || (f.description ?? "").toLowerCase().includes(q),
          )
        : cat.fields,
    })).filter((cat) => cat.fields.length > 0 || cat.label.toLowerCase().includes(q)),
    [q],
  );

  const filteredModules = useMemo(() =>
    q ? MODULE_DEFS.filter((m) => m.label.toLowerCase().includes(q) || m.description.toLowerCase().includes(q))
      : MODULE_DEFS,
    [q],
  );

  const activeCategory = filteredCategories.find((c) => c.id === activeSettingsCategory)
    ?? filteredCategories[0];

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 text-muted">
        <RefreshCw size={14} className="animate-spin" />
        <span className="text-xs">Loading settings…</span>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-1">
      {/* Left: category nav */}
      <div className="w-44 shrink-0 border-r flex flex-col" style={{ borderColor: "var(--glass-border)" }}>
        <div className="px-3 py-3 border-b" style={{ borderColor: "var(--glass-border)" }}>
          <div className="relative">
            <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted/60 pointer-events-none" />
            <input
              value={settingsSearch}
              onChange={(e) => setSettingsSearch(e.target.value)}
              placeholder="Search…"
              className="glass-input w-full rounded-md border pl-6 pr-2 py-1.5 text-xs text-text placeholder-muted/40"
            />
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto py-2 px-1.5 space-y-0.5">
          {filteredCategories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveSettingsCategory(cat.id)}
              className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium transition-all ${
                activeSettingsCategory === cat.id
                  ? "bg-white/[0.08] text-text"
                  : "text-muted hover:bg-white/[0.05] hover:text-text"
              }`}
            >
              <cat.Icon size={13} className={activeSettingsCategory === cat.id ? "text-accent" : ""} />
              {cat.label}
            </button>
          ))}
          {(filteredModules.length > 0) && (
            <button
              onClick={() => setActiveSettingsCategory("modules")}
              className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium transition-all ${
                activeSettingsCategory === "modules"
                  ? "bg-white/[0.08] text-text"
                  : "text-muted hover:bg-white/[0.05] hover:text-text"
              }`}
            >
              <Sliders size={13} className={activeSettingsCategory === "modules" ? "text-accent" : ""} />
              Modules
            </button>
          )}
          <button
            onClick={() => setActiveSettingsCategory("appearance")}
            className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium transition-all ${
              activeSettingsCategory === "appearance"
                ? "bg-white/[0.08] text-text"
                : "text-muted hover:bg-white/[0.05] hover:text-text"
            }`}
          >
            <Palette size={13} className={activeSettingsCategory === "appearance" ? "text-accent" : ""} />
            Appearance
          </button>
          <button
            onClick={() => setActiveSettingsCategory("about")}
            className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium transition-all ${
              activeSettingsCategory === "about"
                ? "bg-white/[0.08] text-text"
                : "text-muted hover:bg-white/[0.05] hover:text-text"
            }`}
          >
            <Info size={13} className={activeSettingsCategory === "about" ? "text-accent" : ""} />
            About
          </button>
        </nav>
      </div>

      {/* Right: content */}
      <div className="flex flex-1 flex-col min-h-0">
        <div className="flex items-center justify-between border-b px-5 py-3" style={{ borderColor: "var(--glass-border)" }}>
          <h1 className="text-sm font-semibold text-text">
            {activeSettingsCategory === "modules"    ? "Modules"
             : activeSettingsCategory === "appearance" ? "Appearance"
             : activeSettingsCategory === "about"      ? "About"
             : activeCategory?.label ?? "Settings"}
          </h1>
          <div className="flex items-center gap-2">
            <button onClick={load} className="text-muted hover:text-text transition-colors p-1.5 rounded-md hover:bg-white/5">
              <RefreshCw size={12} />
            </button>
            {activeSettingsCategory !== "modules" && activeSettingsCategory !== "appearance" && activeSettingsCategory !== "about" && (
              <button
                onClick={save}
                disabled={saving}
                className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-50 transition-colors"
              >
                {saving ? <RefreshCw size={11} className="animate-spin" /> : <Save size={11} />}
                {saving ? "Saving…" : "Save"}
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {/* Appearance tab */}
          {/* About tab */}
          {activeSettingsCategory === "about" && (
            <div className="max-w-md space-y-6">
              <div className="glass-panel rounded-xl border p-5 space-y-3" style={{ borderColor: "var(--glass-border)" }}>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/20">
                    <Info size={18} className="text-accent" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-text">Morpheus</p>
                    <p className="text-xs text-muted">{appVersion ? `v${appVersion}` : "Desktop App"}</p>
                  </div>
                </div>
              </div>

              <div className="glass-panel rounded-xl border p-4 space-y-3" style={{ borderColor: "var(--glass-border)" }}>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted/60">Updates</p>
                <p className="text-xs text-muted leading-relaxed">
                  Morpheus updates automatically in the background. When a new version is downloaded,
                  a banner appears at the top of the app to restart and install it.
                </p>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => {
                      setUpdateStatus("checking");
                      (window as any).electronAPI?.checkForUpdates();
                    }}
                    disabled={updateStatus === "checking"}
                    className="flex items-center gap-1.5 rounded-lg bg-accent/15 border border-accent/30 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/25 disabled:opacity-50 transition-colors"
                  >
                    {updateStatus === "checking"
                      ? <><RefreshCw size={12} className="animate-spin" /> Checking…</>
                      : <><Download size={12} /> Check for Updates</>
                    }
                  </button>
                  {updateStatus === "up-to-date" && (
                    <span className="flex items-center gap-1 text-xs text-green-400">
                      <Check size={11} /> Up to date
                    </span>
                  )}
                  {updateStatus === "available" && (
                    <span className="text-xs text-accent">Update downloading…</span>
                  )}
                  {updateStatus === "error" && (
                    <span className="text-xs text-red-400">Check failed — try again</span>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeSettingsCategory === "appearance" && (
            <div className="max-w-xl space-y-6">
              <div>
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted/60">Theme</h2>
                <div className="grid grid-cols-3 gap-2.5">
                  {THEMES.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setTheme(t.id as ThemeId)}
                      className={`relative group flex flex-col gap-2 rounded-xl border p-3 text-left transition-all ${
                        theme === t.id
                          ? "border-accent/60 bg-accent/10"
                          : "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.1]"
                      }`}
                    >
                      <div
                        className="h-10 w-full rounded-md border border-white/10"
                        style={{ background: t.preview }}
                      >
                        <div
                          className="h-2 w-full rounded-t-md"
                          style={{ background: t.accent, opacity: 0.8 }}
                        />
                      </div>
                      <span className="text-[11px] font-medium text-text">{t.label}</span>
                      {theme === t.id && (
                        <div className="absolute top-2 right-2 h-4 w-4 rounded-full bg-accent flex items-center justify-center">
                          <Check size={9} className="text-white" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Modules tab */}
          {activeSettingsCategory === "modules" && (
            <div className="max-w-xl">
              <p className="mb-4 text-xs text-muted">Toggle modules to show or hide them in the sidebar. Changes take effect immediately.</p>
              <div className="glass-panel rounded-xl border divide-y" style={{ borderColor: "var(--glass-border)" }}>
                {filteredModules.map((mod) => {
                  const enabled = modules[mod.key] ?? true;
                  return (
                    <div key={mod.key} className="flex items-center justify-between px-4 py-3">
                      <div>
                        <p className="text-xs font-medium text-text">{mod.label}</p>
                        <p className="text-[11px] text-muted/70 mt-0.5">{mod.description}</p>
                      </div>
                      <Switch
                        checked={enabled}
                        onCheckedChange={() => toggleMod(mod.key)}
                        disabled={toggling === mod.key}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Settings categories */}
          {activeSettingsCategory !== "modules" && activeSettingsCategory !== "appearance" && activeSettingsCategory !== "about" && activeCategory && (
            <div className="max-w-xl">
              <div className="glass-panel rounded-xl border divide-y" style={{ borderColor: "var(--glass-border)" }}>
                {activeCategory.fields.map((field) => (
                  <SettingField
                    key={field.key}
                    field={field}
                    value={(settings[field.key] as string) ?? ""}
                    error={errors[field.key]}
                    showSecret={showSecrets[field.key] ?? false}
                    onToggleSecret={() => setShowSecrets((p) => ({ ...p, [field.key]: !p[field.key] }))}
                    onChange={(v) => setValue(field.key, v)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SettingField({
  field, value, error, showSecret, onToggleSecret, onChange,
}: {
  field: FieldDef;
  value: string;
  error?: string;
  showSecret: boolean;
  onToggleSecret: () => void;
  onChange: (v: string) => void;
}) {
  const isMasked = value === "••••••••";

  return (
    <div className="px-4 py-3">
      <div className="flex items-start gap-4">
        <div className="w-36 shrink-0 pt-1.5">
          <p className="text-xs font-medium text-text">{field.label}</p>
          {field.description && (
            <p className="text-[11px] text-muted/60 mt-0.5">{field.description}</p>
          )}
        </div>
        <div className="flex-1">
          {field.type === "select" ? (
            <select
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className="glass-input w-full rounded-lg border px-2.5 py-1.5 text-xs text-text"
            >
              {field.options?.map((o) => (
                <option key={o.value} value={o.value} style={{ background: "rgb(var(--color-panel-rgb))" }}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : (
            <div className="flex items-center gap-1.5">
              <input
                type={field.secret && !showSecret && !isMasked ? "password" : "text"}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onFocus={() => { if (isMasked) onChange(""); }}
                placeholder={field.placeholder}
                className={`glass-input flex-1 rounded-lg border px-2.5 py-1.5 text-xs text-text placeholder-muted/40 font-mono ${
                  error ? "border-red-500/50" : ""
                }`}
              />
              {field.secret && (
                <button onClick={onToggleSecret} className="text-muted hover:text-text transition-colors p-1">
                  {showSecret ? <EyeOff size={12} /> : <Eye size={12} />}
                </button>
              )}
            </div>
          )}
          {error && <p className="mt-1 text-[11px] text-red-400">{error}</p>}
        </div>
      </div>
    </div>
  );
}
