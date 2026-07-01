import { create } from "zustand";

interface ConnectionState {
  apiBase: string | null;
  connected: boolean;
  latency: number | null;
  serverName: string | null;
  setConnected: (v: boolean, name?: string) => void;
  setApiBase: (base: string) => void;
  setLatency: (ms: number) => void;
}

export const useConnectionStore = create<ConnectionState>()((set) => ({
  apiBase: null,
  connected: false,
  latency: null,
  serverName: null,

  setConnected: (v, name) => set({ connected: v, serverName: name ?? null }),
  setApiBase:   (base) => set({ apiBase: base }),
  setLatency:   (ms)   => set({ latency: ms }),
}));
