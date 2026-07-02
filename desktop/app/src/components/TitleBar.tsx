import { LogOut } from "lucide-react";
import type { SystemInfo } from "../types";

interface TitleBarProps {
  systemInfo: SystemInfo | null;
}

export function TitleBar({ systemInfo }: TitleBarProps) {
  const isMac = navigator.platform.toLowerCase().includes("mac");
  const bridge = (window as any).electronAPI;

  return (
    <div
      className="titlebar-drag flex h-8 shrink-0 items-center border-b"
      style={{
        paddingLeft: isMac ? 80 : 16,
        paddingRight: 8,
        background: "var(--glass-bg)",
        borderColor: "var(--glass-border)",
      }}
    >
      <span className="text-xs font-semibold tracking-wide" style={{ color: "rgb(var(--color-text-rgb))" }}>
        Morpheus
      </span>
      {systemInfo?.version && (
        <span className="ml-2 text-[10px]" style={{ color: "rgb(var(--color-muted-rgb))" }}>
          v{systemInfo.version}
        </span>
      )}

      {systemInfo?.tailscale_url && (
        <span className="ml-3 flex items-center gap-1 text-[10px]" style={{ color: "rgb(var(--color-muted-rgb))" }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: "rgb(134 239 172)" }} />
          {systemInfo.tailscale_url}
        </span>
      )}

      <div className="flex-1" />

      <button
        onClick={() => bridge?.goToConnect()}
        title="Switch connection"
        className="titlebar-no-drag flex items-center gap-1 rounded-md px-2 py-1 text-[11px] transition-colors"
        style={{ color: "rgb(var(--color-muted-rgb))" }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
      >
        <LogOut size={11} />
        <span>Switch</span>
      </button>
    </div>
  );
}
