import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const BASE = "http://127.0.0.1:7860";

function mockFetch(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  });
}

beforeEach(() => {
  vi.resetModules();
  delete (window as any).electronAPI;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("api.systemInfo", () => {
  it("calls GET /api/system/info and returns parsed JSON", async () => {
    const payload = { version: "1.0.0", default_model: "llama3", default_provider: "ollama", tailscale_url: null, modules: {} };
    vi.stubGlobal("fetch", mockFetch(payload));
    const { api } = await import("../lib/api");
    const info = await api.systemInfo();
    expect(info.version).toBe("1.0.0");
    expect(fetch).toHaveBeenCalledWith(`${BASE}/api/system/info`, expect.objectContaining({ headers: expect.any(Object) }));
  });

  it("throws on non-2xx responses", async () => {
    vi.stubGlobal("fetch", mockFetch({ detail: "not found" }, 404));
    const { api } = await import("../lib/api");
    await expect(api.systemInfo()).rejects.toThrow("404");
  });
});

describe("api.listSessions", () => {
  it("calls GET /api/chat/sessions", async () => {
    vi.stubGlobal("fetch", mockFetch([]));
    const { api } = await import("../lib/api");
    const sessions = await api.listSessions();
    expect(Array.isArray(sessions)).toBe(true);
    expect(fetch).toHaveBeenCalledWith(`${BASE}/api/chat/sessions`, expect.anything());
  });
});

describe("api.createSession", () => {
  it("sends POST with default title when no title provided", async () => {
    const session = { id: 1, title: "New Chat", mode: "chat", created_at: "" };
    vi.stubGlobal("fetch", mockFetch(session));
    const { api } = await import("../lib/api");
    const result = await api.createSession();
    expect(result.id).toBe(1);
    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body).title).toBe("New Chat");
  });

  it("sends provided title in request body", async () => {
    const session = { id: 2, title: "My Session", mode: "chat", created_at: "" };
    vi.stubGlobal("fetch", mockFetch(session));
    const { api } = await import("../lib/api");
    await api.createSession("My Session");
    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(JSON.parse(init.body).title).toBe("My Session");
  });
});

describe("api.deleteSession", () => {
  it("sends DELETE to the correct session URL", async () => {
    vi.stubGlobal("fetch", mockFetch({ ok: true }));
    const { api } = await import("../lib/api");
    await api.deleteSession(42);
    expect(fetch).toHaveBeenCalledWith(`${BASE}/api/chat/sessions/42`, expect.objectContaining({ method: "DELETE" }));
  });
});
