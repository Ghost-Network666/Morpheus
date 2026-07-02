import { useEffect, useState, lazy, Suspense } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { TitleBar } from "./components/TitleBar";
import { Sidebar, type View } from "./components/Sidebar";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { CommandPalette } from "./components/CommandPalette";
import { UpdateBanner } from "./components/UpdateBanner";
import { useUIStore, applyTheme } from "./store/useUIStore";
import { useFeatureStore } from "./store/useFeatureStore";
import { api } from "./lib/api";
import type { SystemInfo } from "./types";

// Lazy-load heavy pages to keep initial bundle smaller
const ChatPage     = lazy(() => import("./pages/ChatPage").then((m) => ({ default: m.ChatPage })));
const TerminalPage = lazy(() => import("./pages/TerminalPage").then((m) => ({ default: m.TerminalPage })));
const SettingsPage = lazy(() => import("./pages/SettingsPage").then((m) => ({ default: m.SettingsPage })));
const ResearchPage = lazy(() => import("./pages/ResearchPage").then((m) => ({ default: m.ResearchPage })));
const RagPage      = lazy(() => import("./pages/RagPage").then((m) => ({ default: m.RagPage })));

import { SshPage }       from "./pages/SshPage";
import { NotesPage }     from "./pages/NotesPage";
import { TasksPage }     from "./pages/TasksPage";
import { CalendarPage }  from "./pages/CalendarPage";
import { EmailPage }     from "./pages/EmailPage";
import { DocumentsPage } from "./pages/DocumentsPage";
import { ObsidianPage }  from "./pages/ObsidianPage";
import { VaultPage }     from "./pages/VaultPage";
import { CookbookPage }  from "./pages/CookbookPage";

function PageFallback() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="skeleton h-4 w-24 rounded" />
    </div>
  );
}

const PAGE_TRANSITION = {
  initial:    { opacity: 0, x: 6 },
  animate:    { opacity: 1, x: 0 },
  exit:       { opacity: 0 },
  transition: { duration: 0.15, ease: "easeOut" as const },
};

export function App() {
  const [view,       setView]       = useState<View>("chat");
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [initError,  setInitError]  = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [updateVersion, setUpdateVersion] = useState<string | null>(null);
  const [pendingSshSession, setPendingSshSession] = useState<{ session_id: string; wsUrl: string; label: string } | null>(null);

  const { theme } = useUIStore();
  const { modules, setModules } = useFeatureStore();

  useEffect(() => { applyTheme(theme); }, [theme]);

  useEffect(() => {
    api.systemInfo()
      .then((info) => {
        setSystemInfo(info);
        if (info.modules) {
          const mods: Record<string, boolean> = {};
          for (const [k, v] of Object.entries(info.modules)) mods[k] = v !== false;
          setModules(mods);
        }
      })
      .catch((e) => setInitError(String(e)));
  }, []);

  // Listen for in-app update events from main process
  useEffect(() => {
    const ea = (window as any).electronAPI;
    if (!ea) return;
    const unsub1 = ea.onUpdateDownloaded?.((info: { version: string }) => setUpdateVersion(info.version));
    return () => { unsub1?.(); };
  }, []);

  // Open SSH terminal from external events
  useEffect(() => {
    const handler = (e: Event) => {
      const { session_id, wsUrl, label } = (e as CustomEvent).detail ?? {};
      if (session_id && wsUrl) setPendingSshSession({ session_id, wsUrl, label: label || "SSH" });
      setView("terminal");
    };
    window.addEventListener("open-ssh-terminal", handler);
    return () => window.removeEventListener("open-ssh-terminal", handler);
  }, []);

  // Command palette keyboard shortcut (Ctrl+P / Cmd+P)
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "p") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Keyboard shortcuts: Ctrl+1–9 for sidebar items
  useEffect(() => {
    const VIEWS: View[] = ["chat", "terminal", "ssh", "notes", "tasks", "calendar", "research", "rag", "settings"];
    function handler(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey)) return;
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= VIEWS.length) {
        e.preventDefault();
        setView(VIEWS[n - 1]);
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const effectiveSystemInfo: SystemInfo | null = systemInfo
    ? { ...systemInfo, modules: { ...systemInfo.modules, ...modules } }
    : null;

  function renderPage() {
    if (initError && view !== "settings") {
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <p className="text-sm font-medium text-text">Could not connect to backend</p>
          <p className="text-xs text-muted max-w-xs">{initError}</p>
          <button
            onClick={() => setView("settings")}
            className="rounded-lg bg-accent px-4 py-2 text-xs font-medium text-white hover:bg-accent/90 transition-colors"
          >
            Open Settings
          </button>
        </div>
      );
    }
    return (
      <Suspense fallback={<PageFallback />}>
        {view === "chat"        && <ErrorBoundary name="Chat"><ChatPage systemInfo={systemInfo} /></ErrorBoundary>}
        {view === "terminal"    && <ErrorBoundary name="Terminal"><TerminalPage sshSession={pendingSshSession} onSshSessionConsumed={() => setPendingSshSession(null)} /></ErrorBoundary>}
        {view === "ssh"         && <ErrorBoundary name="SSH"><SshPage /></ErrorBoundary>}
        {view === "research"    && <ErrorBoundary name="Research"><ResearchPage /></ErrorBoundary>}
        {view === "rag"         && <ErrorBoundary name="Memory"><RagPage /></ErrorBoundary>}
        {view === "notes"       && <ErrorBoundary name="Notes"><NotesPage /></ErrorBoundary>}
        {view === "tasks"       && <ErrorBoundary name="Tasks"><TasksPage /></ErrorBoundary>}
        {view === "calendar"    && <ErrorBoundary name="Calendar"><CalendarPage /></ErrorBoundary>}
        {view === "email"       && <ErrorBoundary name="Email"><EmailPage /></ErrorBoundary>}
        {view === "documents"   && <ErrorBoundary name="Documents"><DocumentsPage /></ErrorBoundary>}
        {view === "obsidian"    && <ErrorBoundary name="Obsidian"><ObsidianPage /></ErrorBoundary>}
        {view === "vault"       && <ErrorBoundary name="Vault"><VaultPage /></ErrorBoundary>}
        {view === "cookbook"    && <ErrorBoundary name="Cookbook"><CookbookPage /></ErrorBoundary>}
        {view === "connections" && <ConnectionsView />}
        {view === "settings"    && <ErrorBoundary name="Settings"><SettingsPage /></ErrorBoundary>}
      </Suspense>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-bg text-text select-none overflow-hidden">
      {updateVersion && (
        <UpdateBanner
          version={updateVersion}
          onInstall={() => { (window as any).electronAPI?.installUpdate(); }}
          onDismiss={() => setUpdateVersion(null)}
        />
      )}
      <TitleBar systemInfo={systemInfo} />

      <div className="flex min-h-0 flex-1">
        <ErrorBoundary name="Sidebar">
          <Sidebar
            active={view}
            onSelect={setView}
            systemInfo={effectiveSystemInfo}
          />
        </ErrorBoundary>

        <main className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={view}
              {...PAGE_TRANSITION}
              className="flex min-h-0 min-w-0 flex-1 overflow-hidden absolute inset-0"
            >
              {renderPage()}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onNavigate={(v) => { setView(v); setPaletteOpen(false); }}
      />
    </div>
  );
}

function ConnectionsView() {
  return (
    <div className="flex flex-1 flex-col">
      <div className="border-b px-6 py-3" style={{ borderColor: "var(--glass-border)" }}>
        <h1 className="text-sm font-semibold text-text">Connections</h1>
      </div>
      <div className="flex flex-1 items-center justify-center text-muted">
        <div className="text-center">
          <p className="text-sm mb-1">External integrations</p>
          <p className="text-xs opacity-60">Configure GitHub, Notion, Linear, and Slack in Settings → Integrations</p>
        </div>
      </div>
    </div>
  );
}
