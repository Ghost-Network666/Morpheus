import { getApiBase } from "./connection";
import type { ChatSession, ChatMessage, SystemInfo } from "../types";

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

export const api = {
  systemInfo: () => req<SystemInfo>("/api/system/info"),

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

  async sendMessage(
    sessionId: number,
    content: string,
    opts: { model?: string; provider?: string; system_prompt?: string },
    onChunk: (text: string) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    const base = await getApiBase();
    const res = await fetch(`${base}/api/chat/sessions/${sessionId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, ...opts }),
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

      const lines = buffer.split("\n\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === "[DONE]") return;
        try {
          const parsed = JSON.parse(payload);
          if (typeof parsed.content === "string") onChunk(parsed.content);
        } catch {
          // ignore malformed chunk
        }
      }
    }
  },
};
