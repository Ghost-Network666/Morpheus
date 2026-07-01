import { useEffect, useState } from "react";
import { TitleBar } from "./components/TitleBar";
import { Sidebar, type View } from "./components/Sidebar";
import { ChatPage } from "./pages/ChatPage";
import { TerminalPage } from "./pages/TerminalPage";
import { SshPage } from "./pages/SshPage";
import { ResearchPage } from "./pages/ResearchPage";
import { RagPage } from "./pages/RagPage";
import { NotesPage } from "./pages/NotesPage";
import { TasksPage } from "./pages/TasksPage";
import { CalendarPage } from "./pages/CalendarPage";
import { EmailPage } from "./pages/EmailPage";
import { DocumentsPage } from "./pages/DocumentsPage";
import { ObsidianPage } from "./pages/ObsidianPage";
import { VaultPage } from "./pages/VaultPage";
import { CookbookPage } from "./pages/CookbookPage";
import { SettingsPage } from "./pages/SettingsPage";
import { api } from "./lib/api";
import type { SystemInfo } from "./types";

export function App() {
  const [view, setView] = useState<View>("chat");
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    api.systemInfo()
      .then(setSystemInfo)
      .catch((e) => setInitError(String(e)));
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      setView("terminal");
    };
    window.addEventListener("open-ssh-terminal", handler);
    return () => window.removeEventListener("open-ssh-terminal", handler);
  }, []);

  return (
    <div className="flex h-screen flex-col bg-bg text-text select-none overflow-hidden">
      <TitleBar systemInfo={systemInfo} />
      <div className="flex min-h-0 flex-1">
        <Sidebar
          active={view}
          onSelect={setView}
          systemInfo={systemInfo}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
        />
        <main className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
          {initError && view !== "settings" && (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
              <p className="text-sm font-medium text-text">Could not connect to backend</p>
              <p className="text-xs text-muted max-w-xs">{initError}</p>
              <button
                onClick={() => setView("settings")}
                className="rounded-md bg-accent px-4 py-2 text-xs font-medium text-white hover:bg-accent/90"
              >
                Open Settings
              </button>
            </div>
          )}
          {(!initError || view === "settings") && (
            <>
              {view === "chat"        && <ChatPage systemInfo={systemInfo} />}
              {view === "terminal"    && <TerminalPage />}
              {view === "ssh"         && <SshPage />}
              {view === "research"    && <ResearchPage />}
              {view === "rag"         && <RagPage />}
              {view === "notes"       && <NotesPage />}
              {view === "tasks"       && <TasksPage />}
              {view === "calendar"    && <CalendarPage />}
              {view === "email"       && <EmailPage />}
              {view === "documents"   && <DocumentsPage />}
              {view === "obsidian"    && <ObsidianPage />}
              {view === "vault"       && <VaultPage />}
              {view === "cookbook"    && <CookbookPage />}
              {view === "connections" && <ConnectionsView />}
              {view === "settings"    && <SettingsPage />}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function ConnectionsView() {
  return (
    <div className="flex flex-1 flex-col">
      <div className="border-b border-border bg-panel/60 px-6 py-3">
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
