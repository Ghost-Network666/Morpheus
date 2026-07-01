import { getApiBase } from "./connection";
import type {
  ChatSession, ChatMessage, SystemInfo,
  Note, Task, CalendarEvent, AppSettings,
  RAGDocument, RAGSearchResult, EmailMessage, EmailAccount,
  FSEntry, ObsidianFile, VaultEntry, OllamaModel,
} from "../types";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const base = await getApiBase();
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  return res.json();
}

async function streamReq(
  path: string,
  body: unknown,
  onChunk: (text: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const base = await getApiBase();
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() || "";
    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") return;
      try {
        const parsed = JSON.parse(payload);
        if (typeof parsed.content === "string") onChunk(parsed.content);
      } catch { /* ignore */ }
    }
  }
}

export const api = {
  // ── System ─────────────────────────────────────────────────────────────────
  systemInfo: () => req<SystemInfo>("/api/system/info"),

  // ── Chat ───────────────────────────────────────────────────────────────────
  listSessions: () => req<ChatSession[]>("/api/chat/sessions"),
  createSession: (title?: string) =>
    req<ChatSession>("/api/chat/sessions", {
      method: "POST",
      body: JSON.stringify({ title: title || "New Chat" }),
    }),
  getSession: (id: number) =>
    req<{ id: number; title: string; mode: string; messages: ChatMessage[] }>(
      `/api/chat/sessions/${id}`,
    ),
  deleteSession: (id: number) =>
    req<{ ok: boolean }>(`/api/chat/sessions/${id}`, { method: "DELETE" }),
  sendMessage: (
    sessionId: number,
    content: string,
    opts: { model?: string; provider?: string; system_prompt?: string },
    onChunk: (text: string) => void,
    signal?: AbortSignal,
  ) =>
    streamReq(
      `/api/chat/sessions/${sessionId}/messages`,
      { content, ...opts },
      onChunk,
      signal,
    ),

  // ── Settings ───────────────────────────────────────────────────────────────
  getSettings: () => req<AppSettings>("/api/settings"),
  updateSettings: (updates: Record<string, unknown>) =>
    req<{ ok: boolean }>("/api/settings", {
      method: "PUT",
      body: JSON.stringify(updates),
    }),
  toggleModule: (module: string) =>
    req<{ module: string; enabled: boolean }>(
      `/api/settings/toggle/${module}`,
      { method: "POST" },
    ),

  // ── Notes ──────────────────────────────────────────────────────────────────
  listNotes: () => req<Note[]>("/api/notes"),
  createNote: (data: { title: string; content?: string; tags?: string[] }) =>
    req<Note>("/api/notes", { method: "POST", body: JSON.stringify(data) }),
  updateNote: (id: number, data: Partial<Note>) =>
    req<Note>(`/api/notes/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteNote: (id: number) =>
    req<{ ok: boolean }>(`/api/notes/${id}`, { method: "DELETE" }),

  // ── Tasks ──────────────────────────────────────────────────────────────────
  listTasks: () => req<Task[]>("/api/tasks"),
  createTask: (data: { title: string; priority?: string; description?: string; due_date?: string }) =>
    req<Task>("/api/tasks", { method: "POST", body: JSON.stringify(data) }),
  updateTask: (id: number, data: Partial<Task>) =>
    req<Task>(`/api/tasks/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteTask: (id: number) =>
    req<{ ok: boolean }>(`/api/tasks/${id}`, { method: "DELETE" }),

  // ── Calendar ───────────────────────────────────────────────────────────────
  listEvents: () => req<CalendarEvent[]>("/api/calendar"),
  createEvent: (data: Partial<CalendarEvent>) =>
    req<CalendarEvent>("/api/calendar", { method: "POST", body: JSON.stringify(data) }),
  deleteEvent: (id: number) =>
    req<{ ok: boolean }>(`/api/calendar/${id}`, { method: "DELETE" }),

  // ── Terminal ───────────────────────────────────────────────────────────────
  startTerminal: (cols = 80, rows = 24) =>
    req<{ session_id: string }>(`/api/terminal/local?cols=${cols}&rows=${rows}`),
  resizeTerminal: (id: string, cols: number, rows: number) =>
    req<{ ok: boolean }>(`/api/terminal/${id}/resize`, {
      method: "POST",
      body: JSON.stringify({ cols, rows }),
    }),
  closeTerminal: (id: string) =>
    req<{ ok: boolean }>(`/api/terminal/${id}`, { method: "DELETE" }),
  async terminalWsUrl(sessionId: string): Promise<string> {
    const base = await getApiBase();
    return base.replace(/^http/, "ws") + `/api/terminal/ws/${sessionId}`;
  },

  // ── Research ───────────────────────────────────────────────────────────────
  runResearch: (
    topic: string,
    depth: number,
    onChunk: (text: string) => void,
    signal?: AbortSignal,
  ) =>
    streamReq("/api/research/run", { topic, depth }, onChunk, signal),

  // ── RAG ────────────────────────────────────────────────────────────────────
  listRagDocs: () => req<RAGDocument[]>("/api/rag/documents"),
  deleteRagDoc: (id: string) =>
    req<{ ok: boolean }>(`/api/rag/documents/${id}`, { method: "DELETE" }),
  ragSearch: (query: string, n_results?: number) =>
    req<{ results: RAGSearchResult[] }>("/api/rag/search", {
      method: "POST",
      body: JSON.stringify({ query, n_results: n_results ?? 5 }),
    }),
  async uploadRagFile(file: File, onProgress?: (pct: number) => void): Promise<RAGDocument> {
    const base = await getApiBase();
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${base}/api/rag/upload`, {
      method: "POST",
      body: form,
    });
    if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
    return res.json();
  },

  // ── Email ──────────────────────────────────────────────────────────────────
  listEmailAccounts: () => req<EmailAccount[]>("/api/email/accounts"),
  listEmails: (accountId?: number, folder = "INBOX", limit = 50) =>
    req<EmailMessage[]>(
      `/api/email/messages?folder=${folder}&limit=${limit}` +
        (accountId ? `&account_id=${accountId}` : ""),
    ),

  // ── Documents ──────────────────────────────────────────────────────────────
  listFiles: (path = "") =>
    req<FSEntry[]>(`/api/documents/list?path=${encodeURIComponent(path)}`),
  readFile: (path: string) =>
    req<{ content: string; encoding: string }>(`/api/documents/read?path=${encodeURIComponent(path)}`),

  // ── Obsidian ───────────────────────────────────────────────────────────────
  listObsidianFiles: (query = "") =>
    req<ObsidianFile[]>(`/api/obsidian/files?query=${encodeURIComponent(query)}`),
  readObsidianFile: (path: string) =>
    req<{ content: string }>(`/api/obsidian/file?path=${encodeURIComponent(path)}`),

  // ── Cookbook (Ollama models) ────────────────────────────────────────────────
  listModels: () => req<{ models: OllamaModel[] }>("/api/cookbook/models"),
  pullModel: (name: string, onChunk: (text: string) => void) =>
    streamReq("/api/cookbook/pull", { name }, onChunk),
  deleteModel: (name: string) =>
    req<{ ok: boolean }>(`/api/cookbook/models/${encodeURIComponent(name)}`, { method: "DELETE" }),
};
