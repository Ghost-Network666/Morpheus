import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import type { ChatMessage, ChatSession, SystemInfo } from "../types";

export function ChatPage() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    api.systemInfo().then(setSystemInfo).catch((e) => setError(String(e)));
    refreshSessions();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  async function refreshSessions() {
    try {
      const list = await api.listSessions();
      setSessions(list);
      if (!activeId && list.length > 0) selectSession(list[0].id);
    } catch (e) {
      setError(String(e));
    }
  }

  async function selectSession(id: number) {
    setActiveId(id);
    setError(null);
    try {
      const detail = await api.getSession(id);
      setMessages(detail.messages);
    } catch (e) {
      setError(String(e));
    }
  }

  async function newSession() {
    try {
      const session = await api.createSession();
      setSessions((prev) => [session, ...prev]);
      setActiveId(session.id);
      setMessages([]);
    } catch (e) {
      setError(String(e));
    }
  }

  async function removeSession(id: number) {
    try {
      await api.deleteSession(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (activeId === id) {
        setActiveId(null);
        setMessages([]);
      }
    } catch (e) {
      setError(String(e));
    }
  }

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
        {
          model: systemInfo?.default_model,
          provider: systemInfo?.default_provider,
        },
        (chunk) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: m.content + chunk } : m,
            ),
          );
        },
        controller.signal,
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setStreaming(false);
      abortRef.current = null;
      refreshSessions();
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-1">
      <div className="flex w-56 shrink-0 flex-col border-r border-border bg-panel">
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">
            Sessions
          </span>
          <button
            onClick={newSession}
            className="rounded px-2 py-0.5 text-xs text-accent hover:bg-accent/10"
          >
            + New
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-1.5">
          {sessions.map((s) => (
            <div
              key={s.id}
              onClick={() => selectSession(s.id)}
              className={`group flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-xs ${
                activeId === s.id ? "bg-accent/15 text-text" : "text-muted hover:bg-white/5"
              }`}
            >
              <span className="truncate">{s.title || "New Chat"}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeSession(s.id);
                }}
                className="ml-1 hidden text-muted hover:text-red-400 group-hover:inline"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4">
          {messages.length === 0 && (
            <div className="flex h-full items-center justify-center text-sm text-muted">
              Start a conversation
            </div>
          )}
          <div className="mx-auto flex max-w-3xl flex-col gap-4">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex flex-col gap-1 ${m.role === "user" ? "items-end" : "items-start"}`}
              >
                <span className="text-[10px] uppercase tracking-wide text-muted">
                  {m.role}
                </span>
                <div
                  className={`max-w-[85%] whitespace-pre-wrap rounded-xl px-3 py-2 text-sm ${
                    m.role === "user" ? "bg-accent text-white" : "bg-panel text-text"
                  }`}
                >
                  {m.content || (streaming && m.role === "assistant" ? "…" : "")}
                </div>
              </div>
            ))}
          </div>
        </div>

        {error && (
          <div className="border-t border-border bg-red-950/40 px-6 py-2 text-xs text-red-300">
            {error}
          </div>
        )}

        <div className="border-t border-border p-3">
          <div className="mx-auto flex max-w-3xl items-end gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Message Morpheus…"
              rows={1}
              className="flex-1 resize-none rounded-lg border border-border bg-panel px-3 py-2 text-sm text-text outline-none focus:border-accent"
            />
            <button
              onClick={send}
              disabled={streaming || !draft.trim()}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              {streaming ? "…" : "Send"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
