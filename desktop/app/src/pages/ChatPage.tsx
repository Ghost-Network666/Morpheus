import { memo, useCallback, useEffect, useRef, useState } from "react";
import { List, type RowComponentProps } from "react-window";
import { Send, Plus, Trash2, StopCircle, Bot, User } from "lucide-react";
import { api } from "../lib/api";
import { MarkdownRenderer } from "../components/MarkdownRenderer";
import { DropdownSelect } from "../components/ui/DropdownMenu";
import type { ChatMessage, ChatSession, SystemInfo } from "../types";

const PROVIDER_ITEMS = [
  { value: "",          label: "Auto"      },
  { value: "ollama",    label: "Ollama"    },
  { value: "openai",    label: "OpenAI"    },
  { value: "anthropic", label: "Anthropic" },
  { value: "lmstudio",  label: "LM Studio" },
];

// ── Session list row (react-window v2) ──────────────────────────────────────

interface SessionRowData {
  sessions: ChatSession[];
  activeId: number | null;
  onSelect: (id: number) => void;
  onRemove: (id: number, e: React.MouseEvent) => void;
}

function SessionRow({
  ariaAttributes, index, style,
  sessions, activeId, onSelect, onRemove,
}: RowComponentProps<SessionRowData>) {
  const s = sessions[index];
  if (!s) return null;
  return (
    <div {...ariaAttributes} style={style} className="px-1.5 py-0.5">
      <div
        onClick={() => onSelect(s.id)}
        className={`group flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-xs transition-colors h-8 ${
          activeId === s.id
            ? "bg-accent/15 text-text"
            : "text-muted hover:bg-white/5 hover:text-text"
        }`}
      >
        <span className="truncate">{s.title || "New Chat"}</span>
        <button
          onClick={(e) => onRemove(s.id, e)}
          className="ml-1 hidden text-muted/50 hover:text-red-400 group-hover:flex items-center"
        >
          <Trash2 size={11} />
        </button>
      </div>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

export function ChatPage({ systemInfo }: { systemInfo: SystemInfo | null }) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState(systemInfo?.default_model ?? "");
  const [provider, setProvider] = useState(systemInfo?.default_provider ?? "");

  const scrollRef   = useRef<HTMLDivElement>(null);
  const abortRef    = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (systemInfo) {
      setModel(systemInfo.default_model ?? "");
      setProvider(systemInfo.default_provider ?? "");
    }
  }, [systemInfo]);

  useEffect(() => { refreshSessions(); }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function refreshSessions() {
    try {
      const list = await api.listSessions();
      setSessions(list);
      if (!activeId && list.length > 0) selectSession(list[0].id);
    } catch (e) { setError(String(e)); }
  }

  async function selectSession(id: number) {
    setActiveId(id);
    setError(null);
    try {
      const detail = await api.getSession(id);
      setMessages(detail.messages);
    } catch (e) { setError(String(e)); }
  }

  async function newSession() {
    try {
      const session = await api.createSession();
      setSessions((prev) => [session, ...prev]);
      setActiveId(session.id);
      setMessages([]);
      textareaRef.current?.focus();
    } catch (e) { setError(String(e)); }
  }

  const removeSession = useCallback(async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.deleteSession(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (activeId === id) { setActiveId(null); setMessages([]); }
    } catch (e) { setError(String(e)); }
  }, [activeId]);

  const handleSelect = useCallback((id: number) => { selectSession(id); }, []);

  async function send() {
    const content = draft.trim();
    if (!content || streaming) return;

    let sessionId = activeId;
    if (!sessionId) {
      const session = await api.createSession(content.slice(0, 60));
      sessionId = session.id;
      setSessions((prev) => [session, ...prev]);
      setActiveId(sessionId);
    }

    setDraft("");
    setError(null);
    setMessages((prev) => [
      ...prev,
      { id: Date.now(), role: "user", content, created_at: new Date().toISOString() },
    ]);

    const assistantId = Date.now() + 1;
    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: "assistant", content: "", created_at: new Date().toISOString() },
    ]);

    setStreaming(true);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await api.sendMessage(
        sessionId,
        content,
        { model: model || undefined, provider: provider || undefined },
        (chunk) => {
          setMessages((prev) =>
            prev.map((m) => m.id === assistantId ? { ...m, content: m.content + chunk } : m),
          );
        },
        controller.signal,
      );
    } catch (e) {
      if (!(e instanceof Error && e.name === "AbortError")) setError(String(e));
    } finally {
      setStreaming(false);
      abortRef.current = null;
      refreshSessions();
    }
  }

  function stopStreaming() { abortRef.current?.abort(); }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  }

  function autoResize(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setDraft(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }

  return (
    <div className="flex h-full min-h-0 flex-1">
      {/* Session list — virtualized */}
      <div className="flex w-52 shrink-0 flex-col border-r border-border bg-panel/60">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">Chats</span>
          <button
            onClick={newSession}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-accent hover:bg-accent/10 transition-colors"
          >
            <Plus size={12} /> New
          </button>
        </div>
        {sessions.length === 0 ? (
          <p className="px-2 py-3 text-xs text-muted text-center">No conversations yet</p>
        ) : (
          <List
            rowComponent={SessionRow}
            rowCount={sessions.length}
            rowHeight={36}
            rowProps={{ sessions, activeId, onSelect: handleSelect, onRemove: removeSession }}
            style={{ flex: 1 }}
          />
        )}
      </div>

      {/* Main chat area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Model/provider bar */}
        <div className="flex items-center gap-2 border-b border-border bg-panel/40 px-4 py-1.5 shrink-0">
          <span className="text-xs text-muted">Model:</span>
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={systemInfo?.default_model || "e.g. llama3.2:3b"}
            className="rounded border border-border bg-bg px-2 py-0.5 text-xs text-text outline-none focus:border-accent w-44"
          />
          <span className="text-xs text-muted">via</span>
          <DropdownSelect
            value={provider}
            items={PROVIDER_ITEMS}
            onChange={setProvider}
            placeholder="Auto"
          />
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
          {messages.length === 0 && !streaming && (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-muted">
              <Bot size={40} className="opacity-30" />
              <p className="text-sm">Start a conversation</p>
              {!systemInfo?.default_model && (
                <p className="text-xs text-amber-400/80 max-w-xs text-center">
                  No model configured — go to Settings to add an AI provider.
                </p>
              )}
            </div>
          )}
          <div className="mx-auto flex max-w-3xl flex-col gap-5">
            {messages.map((m) => (
              <Message key={m.id} message={m} streaming={streaming} />
            ))}
          </div>
        </div>

        {error && (
          <div className="border-t border-border bg-red-950/30 px-4 py-2 text-xs text-red-300/90 shrink-0">
            {error}
          </div>
        )}

        {/* Input */}
        <div className="border-t border-border p-3 shrink-0">
          <div className="mx-auto flex max-w-3xl items-end gap-2">
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={autoResize}
              onKeyDown={onKeyDown}
              placeholder="Message… (Enter to send, Shift+Enter for newline)"
              rows={1}
              className="flex-1 resize-none rounded-lg border border-border bg-panel px-3 py-2 text-sm text-text placeholder-muted outline-none focus:border-accent transition-colors"
              style={{ minHeight: 38, maxHeight: 160 }}
            />
            {streaming ? (
              <button
                onClick={stopStreaming}
                className="flex items-center gap-1.5 rounded-lg bg-red-500/20 border border-red-500/30 px-3 py-2 text-xs font-medium text-red-300 hover:bg-red-500/30 transition-colors"
              >
                <StopCircle size={14} /> Stop
              </button>
            ) : (
              <button
                onClick={send}
                disabled={!draft.trim()}
                className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white disabled:opacity-30 hover:bg-accent/90 transition-colors"
              >
                <Send size={14} /> Send
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const Message = memo(function Message({
  message: m,
  streaming,
}: {
  message: ChatMessage;
  streaming: boolean;
}) {
  const isUser  = m.role === "user";
  const isEmpty = !m.content && streaming && !isUser;

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs ${
        isUser ? "bg-accent/20 text-accent" : "bg-white/5 text-muted"
      }`}>
        {isUser ? <User size={13} /> : <Bot size={13} />}
      </div>
      <div className={`min-w-0 max-w-[85%] ${isUser ? "items-end" : "items-start"} flex flex-col gap-1`}>
        <div className={`rounded-xl px-3.5 py-2.5 text-sm ${
          isUser ? "bg-accent/20 text-text" : "bg-panel/80 text-text border border-border/50"
        }`}>
          {isEmpty ? (
            <span className="inline-flex gap-1 items-center text-muted">
              <span className="animate-pulse">●</span>
              <span className="animate-pulse" style={{ animationDelay: "0.2s" }}>●</span>
              <span className="animate-pulse" style={{ animationDelay: "0.4s" }}>●</span>
            </span>
          ) : isUser ? (
            <span className="whitespace-pre-wrap">{m.content}</span>
          ) : (
            <MarkdownRenderer content={m.content} />
          )}
        </div>
        {m.model_used && (
          <span className="text-[10px] text-muted/60 px-1">{m.model_used}</span>
        )}
      </div>
    </div>
  );
});
