// Resolves the FastAPI backend base URL this window should talk to.
//
// In the packaged Electron app, the main process already knows whether the
// user picked "local" (it spawned the bundled server itself) or "remote"
// (a URL the user typed in on the connect screen), and hands that resolved
// address to us over the preload bridge — the renderer never has to guess.
//
// When running this app outside Electron (`vite dev` in a browser, for
// local UI iteration) there is no preload bridge, so fall back to the
// default local port the backend always listens on.
const DEV_FALLBACK = "http://127.0.0.1:7860";

let cached: string | null = null;

export async function getApiBase(): Promise<string> {
  if (cached) return cached;

  const bridge = (window as any).electronAPI;
  if (bridge && typeof bridge.getApiBase === "function") {
    const base: string | null = await bridge.getApiBase();
    cached = (base || DEV_FALLBACK).replace(/\/$/, "");
    return cached;
  }

  cached = DEV_FALLBACK;
  return cached;
}
