import { LogOut } from "lucide-react";
import type { SystemInfo } from "../types";

interface TitleBarProps {
  systemInfo: SystemInfo | null;
}

export function TitleBar({ systemInfo }: TitleBarProps) {
  const isMac = navigator.platform.toLowerCase().includes("mac");
  const bridge = (window as any).electronAPI;

  function switchConnection() {
    bridge?.goToConnect();
  }

  return (
    <div
      className="titlebar-drag flex h-9 shrink-0 items-center border-b border-border bg-panel"
      style={{ paddingLeft: isMac ? 76 : 12, paddingRight: 8 }}
    >
      <span className="font-semibold text-text">Morpheus</span>
      {systemInfo && (
        <span className="ml-2 text-xs text-muted">
          v{systemInfo.version}
        </span>
      )}

      <div className="flex-1" />

      <button
        onClick={switchConnection}
        title="Switch connection"
        className="titlebar-no-drag flex items-center gap-1.5 rounded px-2 py-1 text-xs text-muted hover:bg-white/5 hover:text-text transition-colors"
      >
        <LogOut size={12} />
        <span>Switch</span>
      </button>
    </div>
  );
}
