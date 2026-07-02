import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ThemeId =
  | "linear-dark"
  | "matte-black"
  | "pure-cyber"
  | "arc-slate"
  | "terminal-amber"
  | "achromatic";

export const THEMES: { id: ThemeId; label: string; accent: string; preview: string }[] = [
  { id: "linear-dark",    label: "Linear Dark",    accent: "#7c5cff", preview: "#0f0f17" },
  { id: "matte-black",    label: "Matte Black",    accent: "#3b82f6", preview: "#09090b" },
  { id: "pure-cyber",     label: "Pure Cyber",     accent: "#00ff88", preview: "#0a0a1a" },
  { id: "arc-slate",      label: "Arc Slate",      accent: "#2563eb", preview: "#0e1219" },
  { id: "terminal-amber", label: "Terminal Amber", accent: "#f59e0b", preview: "#0e0c08" },
  { id: "achromatic",     label: "Achromatic",     accent: "#c8c8c8", preview: "#000000" },
];

interface UIState {
  theme: ThemeId;
  settingsSearch: string;
  activeSettingsCategory: string;
  setTheme: (theme: ThemeId) => void;
  setSettingsSearch: (q: string) => void;
  setActiveSettingsCategory: (c: string) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      theme: "linear-dark",
      settingsSearch: "",
      activeSettingsCategory: "ai",

      setTheme: (theme) => {
        document.documentElement.setAttribute("data-theme", theme);
        set({ theme });
      },
      setSettingsSearch: (q) => set({ settingsSearch: q }),
      setActiveSettingsCategory: (c) => set({ activeSettingsCategory: c }),
    }),
    {
      name: "morpheus-ui",
      partialState: (state: UIState) => ({
        theme: state.theme,
      }),
    } as any,
  ),
);

export function applyTheme(theme: ThemeId) {
  document.documentElement.setAttribute("data-theme", theme);
}
