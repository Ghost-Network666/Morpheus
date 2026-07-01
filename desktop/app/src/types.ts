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

export interface Note {
  id: number;
  title: string;
  content: string;
  tags: string[];
  pinned: boolean;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: number;
  title: string;
  description: string | null;
  priority: "low" | "medium" | "high" | "critical";
  completed: boolean;
  due_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface CalendarEvent {
  id: number;
  summary: string;
  start: string;
  end: string | null;
  all_day: boolean;
  color: string | null;
  description: string | null;
}

export interface AppSettings {
  ollama_url: string | null;
  openai_api_key: string | null;
  anthropic_api_key: string | null;
  openai_base_url: string | null;
  default_model: string | null;
  default_provider: string | null;
  searxng_url: string | null;
  brave_api_key: string | null;
  tavily_api_key: string | null;
  ntfy_url: string | null;
  ntfy_topic: string | null;
  slack_webhook: string | null;
  github_token: string | null;
  notion_token: string | null;
  linear_api_key: string | null;
  module_terminal: boolean;
  module_ssh: boolean;
  module_agent: boolean;
  module_rag: boolean;
  module_email: boolean;
  module_calendar: boolean;
  module_notes: boolean;
  module_tasks: boolean;
  module_research: boolean;
  module_documents: boolean;
  module_cookbook: boolean;
  module_connections: boolean;
  module_obsidian: boolean;
  obsidian_vault_path: string | null;
  memory_source: string | null;
  theme: string | null;
}

export interface RAGDocument {
  id: string;
  filename: string;
  size: number;
  uploaded_at: string;
  chunks?: number;
}

export interface RAGSearchResult {
  text: string;
  source: string;
  score: number;
}

export interface RAGChunk {
  id: string;
  text: string;
  chunk_index: number;
  tokens: number;
  source: string;
}

export interface EmailMessage {
  id: string;
  subject: string;
  from_addr: string;
  date: string;
  summary_ai: string;
  is_read: boolean;
}

export interface EmailAccount {
  id: number;
  label: string;
  email: string;
  imap_host: string;
}

export interface FSEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
}

export interface ObsidianFile {
  path: string;
  title: string;
  modified: string;
  size: number;
}

export interface VaultEntry {
  id: number;
  key: string;
  category: string;
  updated_at: string;
}

export interface OllamaModel {
  name: string;
  size: number;
  modified_at: string;
}
