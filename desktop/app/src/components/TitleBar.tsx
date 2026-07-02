import { useEffect, useState } from "react";
import { LogOut, Minus, Square, Copy, X } from "lucide-react";
import type { SystemInfo } from "../types";

interface TitleBarProps {
  systemInfo: SystemInfo | null;
}

export function TitleBar({ systemInfo }: TitleBarProps) {
  const isMac = navigator.platform.toLowerCase().includes("mac");
  const bridge = (window as any).electronAPI;
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (isMac) return;
    bridge?.isWindowMaximized?.().then((v: boolean) => setMaximized(!!v));
    const unsubscribe = bridge?.onWindowStateChanged?.((state: { maximized: boolean }) =>
      setMaximized(state.maximized),
    );
    return () => unsubscribe?.();
  }, [isMac]);

  return (
    <div
      className="titlebar-drag flex h-8 shrink-0 items-center border-b select-none"
      style={{
        paddingLeft: isMac ? 80 : 10,
        paddingRight: isMac ? 8 : 0,
        background: "var(--glass-bg)",
        borderColor: "var(--glass-border)",
      }}
    >
      {!isMac && (
        <div
          className="mr-2 flex h-4 w-4 items-center justify-center rounded-[5px] text-[10px] font-bold"
          style={{
            background: "rgb(var(--color-accent-rgb) / 0.16)",
            color: "rgb(var(--color-accent-rgb))",
          }}
        >
          M
        </div>
      )}

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
        className="titlebar-no-drag flex items-center gap-1 rounded-md px-2 py-1 text-[11px] transition-colors hover:bg-white/[0.06]"
        style={{ color: "rgb(var(--color-muted-rgb))" }}
      >
        <LogOut size={11} />
        <span>Switch</span>
      </button>

      {!isMac && (
        <div className="titlebar-no-drag ml-1 flex h-8 items-stretch">
          <button
            onClick={() => bridge?.windowMinimize()}
            title="Minimize"
            className="flex w-11 items-center justify-center transition-colors hover:bg-white/[0.08]"
            style={{ color: "rgb(var(--color-muted-rgb))" }}
          >
            <Minus size={14} />
          </button>
          <button
            onClick={() => bridge?.windowMaximizeToggle()}
            title={maximized ? "Restore" : "Maximize"}
            className="flex w-11 items-center justify-center transition-colors hover:bg-white/[0.08]"
            style={{ color: "rgb(var(--color-muted-rgb))" }}
          >
            {maximized ? <Copy size={12} className="-scale-x-100" /> : <Square size={11} />}
          </button>
          <button
            onClick={() => bridge?.windowClose()}
            title="Close"
            className="flex w-11 items-center justify-center transition-colors hover:bg-[#e81123] hover:text-white"
            style={{ color: "rgb(var(--color-muted-rgb))" }}
          >
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
