import { useEffect, useRef, useState } from "react";
import { Terminal as TermIcon, Plus, X } from "lucide-react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { api } from "../lib/api";

interface Tab {
  id: string;
  label: string;
  term: Terminal;
  fitAddon: FitAddon;
  ws: WebSocket | null;
}

interface SshSessionInit {
  session_id: string;
  wsUrl: string;
  label: string;
}

interface TerminalPageProps {
  sshSession?: SshSessionInit | null;
  onSshSessionConsumed?: () => void;
}

export function TerminalPage({ sshSession, onSshSessionConsumed }: TerminalPageProps) {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tabContainersRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const tabsRef = useRef<Tab[]>([]);

  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  useEffect(() => {
    if (!sshSession) openTab();
    return () => {
      tabsRef.current.forEach((t) => {
        t.ws?.close();
        t.term.dispose();
      });
    };
  }, []);

  useEffect(() => {
    if (sshSession) {
      openSshTab(sshSession);
      onSshSessionConsumed?.();
    }
  }, [sshSession]);

  useEffect(() => {
    const handleResize = () => {
      const tab = tabsRef.current.find((t) => t.id === activeTab);
      if (tab) fitTab(tab);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [activeTab]);

  function fitTab(tab: Tab) {
    try {
      tab.fitAddon.fit();
      if (tab.ws?.readyState === WebSocket.OPEN) {
        tab.ws.send(JSON.stringify({ type: "resize", cols: tab.term.cols, rows: tab.term.rows }));
      }
    } catch { /* ignore */ }
  }

  function _makeTerminal() {
    const term = new Terminal({
      cursorBlink: true,
      fontFamily: '"SF Mono", "Fira Code", "Cascadia Code", monospace',
      fontSize: 13,
      lineHeight: 1.4,
      theme: {
        background: "#0a0a12",
        foreground: "#e4e4ec",
        cursor: "#7c5cff",
        selectionBackground: "#7c5cff44",
        black: "#1a1a2e", red: "#f38ba8", green: "#a6e3a1", yellow: "#f9e2af",
        blue: "#89b4fa", magenta: "#cba6f7", cyan: "#89dceb", white: "#cdd6f4",
        brightBlack: "#45475a", brightRed: "#f38ba8", brightGreen: "#a6e3a1",
        brightYellow: "#f9e2af", brightBlue: "#89b4fa", brightMagenta: "#cba6f7",
        brightCyan: "#89dceb", brightWhite: "#cdd6f4",
      },
    });
    return term;
  }

  function _attachTab(tab: Tab) {
    const { term, fitAddon, ws, id } = tab;
    ws!.onopen = () => { setTimeout(() => fitTab(tab), 100); };
    ws!.onmessage = (e) => {
      if (e.data instanceof ArrayBuffer) term.write(new Uint8Array(e.data));
      else if (typeof e.data === "string") term.write(e.data);
    };
    ws!.onclose = () => term.write("\r\n\x1b[90m[connection closed]\x1b[0m\r\n");
    ws!.onerror = () => term.write("\r\n\x1b[31m[connection error]\x1b[0m\r\n");
    term.onData((data) => { if (ws!.readyState === WebSocket.OPEN) ws!.send(new TextEncoder().encode(data)); });
    setTabs((prev) => [...prev, tab]);
    setActiveTab(id);
    setTimeout(() => {
      const el = tabContainersRef.current.get(id);
      if (el) { term.open(el); fitAddon.fit(); }
    }, 50);
  }

  async function openTab() {
    try {
      setError(null);
      const { session_id } = await api.startTerminal(120, 30);
      const term = _makeTerminal();
      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      const wsUrl = await api.terminalWsUrl(session_id);
      const ws = new WebSocket(wsUrl);
      ws.binaryType = "arraybuffer";
      const label = `Terminal ${tabsRef.current.length + 1}`;
      const tab: Tab = { id: session_id, label, term, fitAddon, ws };
      _attachTab(tab);
    } catch (e) {
      setError(String(e));
    }
  }

  function openSshTab({ session_id, wsUrl, label }: SshSessionInit) {
    const term = _makeTerminal();
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    const ws = new WebSocket(wsUrl);
    ws.binaryType = "arraybuffer";
    const tab: Tab = { id: session_id, label, term, fitAddon, ws };
    _attachTab(tab);
  }

  async function closeTab(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    const tab = tabs.find((t) => t.id === id);
    if (tab) {
      tab.ws?.close();
      tab.term.dispose();
      await api.closeTerminal(id).catch(() => {});
    }
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== id);
      if (activeTab === id && next.length > 0) setActiveTab(next[next.length - 1].id);
      else if (next.length === 0) setActiveTab(null);
      return next;
    });
  }

  function switchTab(id: string) {
    setActiveTab(id);
    setTimeout(() => {
      const tab = tabsRef.current.find((t) => t.id === id);
      if (tab) {
        const el = tabContainersRef.current.get(id);
        if (el && !el.hasChildNodes()) {
          tab.term.open(el);
        }
        fitTab(tab);
      }
    }, 20);
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-[#0a0a12]">
      {/* Tab bar */}
      <div className="flex items-center gap-0.5 border-b border-border bg-panel px-2 py-1.5 shrink-0">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => switchTab(tab.id)}
            className={`flex items-center gap-1.5 rounded px-3 py-1 text-xs transition-colors ${
              activeTab === tab.id
                ? "bg-accent/15 text-accent"
                : "text-muted hover:bg-white/5 hover:text-text"
            }`}
          >
            <TermIcon size={11} />
            {tab.label}
            <span
              onClick={(e) => closeTab(tab.id, e)}
              className="ml-0.5 opacity-50 hover:opacity-100 hover:text-red-400 transition-opacity"
            >
              <X size={11} />
            </span>
          </button>
        ))}
        <button
          onClick={openTab}
          title="New terminal"
          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted hover:text-text hover:bg-white/5 transition-colors ml-1"
        >
          <Plus size={13} />
        </button>
      </div>

      {error && (
        <div className="border-b border-border bg-red-950/30 px-4 py-2 text-xs text-red-300">
          {error}
        </div>
      )}

      {tabs.length === 0 && !error && (
        <div className="flex flex-1 items-center justify-center flex-col gap-3 text-muted">
          <TermIcon size={40} className="opacity-20" />
          <p className="text-sm">Opening terminal…</p>
        </div>
      )}

      {/* Terminal containers */}
      {tabs.map((tab) => (
        <div
          key={tab.id}
          ref={(el) => {
            if (el) tabContainersRef.current.set(tab.id, el);
          }}
          className="flex-1 min-h-0 p-2"
          style={{ display: activeTab === tab.id ? "block" : "none" }}
        />
      ))}
    </div>
  );
}
