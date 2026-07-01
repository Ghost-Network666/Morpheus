import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface FeatureState {
  modules: Record<string, boolean>;
  setModule: (key: string, enabled: boolean) => void;
  setModules: (modules: Record<string, boolean>) => void;
}

const DEFAULT_MODULES: Record<string, boolean> = {
  terminal:    true,
  ssh:         true,
  agent:       false,
  rag:         true,
  research:    true,
  notes:       true,
  tasks:       true,
  calendar:    true,
  email:       false,
  documents:   true,
  obsidian:    false,
  cookbook:    true,
  connections: true,
};

export const useFeatureStore = create<FeatureState>()(
  persist(
    (set) => ({
      modules: DEFAULT_MODULES,
      setModule: (key, enabled) =>
        set((s) => ({ modules: { ...s.modules, [key]: enabled } })),
      setModules: (modules) =>
        set({ modules: { ...DEFAULT_MODULES, ...modules } }),
    }),
    { name: "morpheus-features" },
  ),
);
