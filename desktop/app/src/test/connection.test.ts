import { describe, it, expect, beforeEach, vi } from "vitest";

// Reset module between tests so cached is cleared
beforeEach(() => {
  vi.resetModules();
  delete (window as any).electronAPI;
});

describe("getApiBase", () => {
  it("falls back to dev default when no electronAPI bridge", async () => {
    const { getApiBase } = await import("../lib/connection");
    const base = await getApiBase();
    expect(base).toBe("http://127.0.0.1:7860");
  });

  it("uses electronAPI.getApiBase() when bridge is present", async () => {
    (window as any).electronAPI = {
      getApiBase: vi.fn().mockResolvedValue("http://192.168.1.10:7860"),
    };
    const { getApiBase } = await import("../lib/connection");
    const base = await getApiBase();
    expect(base).toBe("http://192.168.1.10:7860");
    expect((window as any).electronAPI.getApiBase).toHaveBeenCalledOnce();
  });

  it("strips trailing slash from bridge-provided URL", async () => {
    (window as any).electronAPI = {
      getApiBase: vi.fn().mockResolvedValue("http://server.local:7860/"),
    };
    const { getApiBase } = await import("../lib/connection");
    const base = await getApiBase();
    expect(base).toBe("http://server.local:7860");
  });

  it("falls back to dev default when bridge returns null", async () => {
    (window as any).electronAPI = {
      getApiBase: vi.fn().mockResolvedValue(null),
    };
    const { getApiBase } = await import("../lib/connection");
    const base = await getApiBase();
    expect(base).toBe("http://127.0.0.1:7860");
  });

  it("caches the resolved base on subsequent calls", async () => {
    const mockGet = vi.fn().mockResolvedValue("http://cached:7860");
    (window as any).electronAPI = { getApiBase: mockGet };
    const { getApiBase } = await import("../lib/connection");
    await getApiBase();
    await getApiBase();
    await getApiBase();
    expect(mockGet).toHaveBeenCalledOnce();
  });
});
