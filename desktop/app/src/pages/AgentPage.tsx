import { useEffect, useRef, useState } from "react";
import { Send, StopCircle, Bot, User, Brain, Wrench, Terminal, CheckCircle2 } from "lucide-react";
import { api } from "../lib/api";
import { MarkdownRenderer } from "../components/MarkdownRenderer";
import { DropdownSelect } from "../components/ui/DropdownMenu";
import type { SystemInfo } from "../types";

const PROVIDER_ITEMS = [
  { value: "",          label: "Auto"      },
  { value: "ollama",    label: "Ollama"    },
  { value: "openai",    label: "OpenAI"    },
  { value: "anthropic", label: "Anthropic" },
  { value: "lmstudio",  label: "LM Studio" },
];

// The backend's ReAct loop (app/core/agent_executor.py) always emits these
// literal line prefixes — this parses that real, defined protocol rather
// than guessing at arbitrary wording.
type SegmentType = "text" | "thought" | "action" | "action_input" | "observation" | "final";
interface Segment { type: SegmentType; text: string }

const MARKERS: [string, SegmentType][] = [
  ["Thought:", "thought"],
  ["Action Input:", "action_input"],
  ["Action:", "action"],
  ["Observation:", "observation"],
  ["Final Answer:", "final"],
];

function parseReactSegments(content: string): Segment[] {
  const lines = content.split("\n");
  const segments: Segment[] = [];
  let current: Segment = { type: "text", text: "" };

  for (const line of lines) {
    const hit = MARKERS.find(([prefix]) => line.startsWith(prefix));
    if (hit) {
      if (current.text.trim()) segments.push(current);
      const [prefix, type] = hit;
      current = { type, text: line.slice(prefix.length).trim() };
    } else {
      current.text += (current.text ? "\n" : "") + line;
    }
  }
  if (current.text.trim()) segments.push(current);
  return segments;
}

const SEGMENT_META: Record<SegmentType, { label: string; Icon: typeof Brain; color: string }> = {
  text:          { label: "",            Icon: Bot,          color: "var(--color-muted-rgb)" },
  thought:       { label: "Thought",     Icon: Brain,        color: "var(--color-accent-rgb)" },
  action:        { label: "Action",      Icon: Wrench,       color: "245, 158, 11" },
  action_input:  { label: "Input",       Icon: Terminal,     color: "245, 158, 11" },
  observation:   { label: "Observation", Icon: Terminal,     color: "56, 189, 248" },
  final:         { label: "Answer",      Icon: CheckCircle2, color: "74, 222, 128" },
};

interface AgentTurn {
  id: number;
  role: "user" | "assistant";
  content: string;
}

export function AgentPage({ systemInfo }: { systemInfo: SystemInfo | null }) {
  const [turns, setTurns] = useState<AgentTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState(systemInfo?.default_model ?? "");
  const [provider, setProvider] = useState(systemInfo?.default_provider ?? "");

  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (systemInfo) {
      setModel(systemInfo.default_model ?? "");
      setProvider(systemInfo.default_provider ?? "");
    }
  }, [systemInfo]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns]);

  async function send() {
    const message = draft.trim();
    if (!message || streaming) return;

    setDraft("");
    setError(null);
    setTurns((prev) => [...prev, { id: Date.now(), role: "user", content: message }]);

    const assistantId = Date.now() + 1;
    setTurns((prev) => [...prev, { id: assistantId, role: "assistant", content: "" }]);

    setStreaming(true);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await api.runAgent(
        message,
        { model: model || undefined, provider: provider || undefined },
        (chunk) => {
          setTurns((prev) =>
            prev.map((t) => (t.id === assistantId ? { ...t, content: t.content + chunk } : t)),
          );
        },
        controller.signal,
      );
    } catch (e) {
      if (!(e instanceof Error && e.name === "AbortError")) setError(String(e));
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  function stopStreaming() {
    abortRef.current?.abort();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-border bg-panel/40 px-4 py-1.5 shrink-0">
        <Bot size={13} className="text-accent" />
        <span className="text-xs font-medium text-text">Agent Mode</span>
        <span className="text-xs text-muted">— reasons, calls tools, and acts autonomously</span>
        <div className="flex-1" />
        <span className="text-xs text-muted">Model:</span>
        <input
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder={systemInfo?.default_model || "e.g. llama3.2:3b"}
          className="rounded border border-border bg-bg px-2 py-0.5 text-xs text-text outline-none focus:border-accent w-40"
        />
        <span className="text-xs text-muted">via</span>
        <DropdownSelect value={provider} items={PROVIDER_ITEMS} onChange={setProvider} placeholder="Auto" />
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        {turns.length === 0 && !streaming && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-muted">
            <Bot size={40} className="opacity-30" />
            <p className="text-sm">Give the agent a task</p>
            <p className="max-w-sm text-center text-xs opacity-70">
              It can search the web, run shell/SSH commands, read and write files, and create notes or tasks —
              reasoning through multiple steps on its own.
            </p>
          </div>
        )}
        <div className="mx-auto flex max-w-3xl flex-col gap-5">
          {turns.map((t) => (
            <AgentTurnView key={t.id} turn={t} streaming={streaming} />
          ))}
        </div>
      </div>

      {error && (
        <div className="border-t border-border bg-red-950/30 px-4 py-2 text-xs text-red-300/90 shrink-0">
          {error}
        </div>
      )}

      <div className="border-t border-border p-3 shrink-0">
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Describe a task for the agent… (Enter to send, Shift+Enter for newline)"
            rows={1}
            className="flex-1 resize-none rounded-lg border border-border bg-panel px-3 py-2 text-sm text-text placeholder-muted outline-none focus:border-accent transition-colors"
            style={{ minHeight: 38, maxHeight: 160 }}
          />
          {streaming ? (
            <button
              onClick={stopStreaming}
              className="flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/20 px-3 py-2 text-xs font-medium text-red-300 transition-colors hover:bg-red-500/30"
            >
              <StopCircle size={14} /> Stop
            </button>
          ) : (
            <button
              onClick={send}
              disabled={!draft.trim()}
              className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-30"
            >
              <Send size={14} /> Run
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function AgentTurnView({ turn, streaming }: { turn: AgentTurn; streaming: boolean }) {
  const isUser = turn.role === "user";
  const isEmpty = !turn.content && streaming && !isUser;

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      <div
        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs ${
          isUser ? "bg-accent/20 text-accent" : "bg-white/5 text-muted"
        }`}
      >
        {isUser ? <User size={13} /> : <Bot size={13} />}
      </div>
      <div className={`min-w-0 max-w-[85%] flex-1 ${isUser ? "items-end" : "items-start"} flex flex-col gap-1`}>
        {isUser ? (
          <div className="rounded-xl border border-transparent bg-accent/20 px-3.5 py-2.5 text-sm text-text">
            <span className="whitespace-pre-wrap">{turn.content}</span>
          </div>
        ) : isEmpty ? (
          <div className="rounded-xl border border-border/50 bg-panel/80 px-3.5 py-2.5 text-sm">
            <span className="inline-flex items-center gap-1 text-muted">
              <span className="animate-pulse">●</span>
              <span className="animate-pulse" style={{ animationDelay: "0.2s" }}>●</span>
              <span className="animate-pulse" style={{ animationDelay: "0.4s" }}>●</span>
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {parseReactSegments(turn.content).map((seg, i) => (
              <SegmentView key={i} segment={seg} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SegmentView({ segment }: { segment: Segment }) {
  const meta = SEGMENT_META[segment.type];

  if (segment.type === "text" || segment.type === "final") {
    return (
      <div className="rounded-xl border border-border/50 bg-panel/80 px-3.5 py-2.5 text-sm text-text">
        <MarkdownRenderer content={segment.text} />
      </div>
    );
  }

  return (
    <div
      className="rounded-lg border px-3 py-2 text-xs"
      style={{ borderColor: `rgb(${meta.color} / 0.25)`, background: `rgb(${meta.color} / 0.06)` }}
    >
      <div className="mb-1 flex items-center gap-1.5 font-medium" style={{ color: `rgb(${meta.color})` }}>
        <meta.Icon size={11} />
        {meta.label}
      </div>
      <div className="whitespace-pre-wrap text-muted">{segment.text}</div>
    </div>
  );
}
