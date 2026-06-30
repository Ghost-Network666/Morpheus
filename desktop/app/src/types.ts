export interface ChatSession {
  id: number;
  title: string;
  mode: string;
  created_at: string;
  updated_at?: string;
}

export interface ChatMessage {
  id: number;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
  model_used?: string | null;
}

export interface SystemInfo {
  version: string;
  default_model: string;
  default_provider: string;
  tailscale_url: string | null;
  modules: Record<string, boolean>;
}
