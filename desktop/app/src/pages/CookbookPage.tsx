import { useEffect, useState } from "react";
import { BookOpen, Trash2, Download, RefreshCw, Search } from "lucide-react";
import { api } from "../lib/api";
import type { OllamaModel } from "../types";

const POPULAR_MODELS = [
  { name: "llama3.2:3b", description: "Llama 3.2 3B — fast, efficient" },
  { name: "llama3.2:1b", description: "Llama 3.2 1B — very fast" },
  { name: "llama3.1:8b", description: "Llama 3.1 8B — great quality" },
  { name: "gemma3:4b", description: "Gemma 3 4B by Google" },
  { name: "mistral:7b", description: "Mistral 7B — instruction tuned" },
  { name: "qwen2.5:7b", description: "Qwen 2.5 7B — multilingual" },
  { name: "deepseek-r1:8b", description: "DeepSeek-R1 8B — reasoning" },
  { name: "phi4:14b", description: "Phi-4 14B by Microsoft" },
  { name: "codellama:7b", description: "Code Llama 7B — coding" },
  { name: "nomic-embed-text", description: "Text embeddings for RAG" },
];

export function CookbookPage() {
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pulling, setPulling] = useState<string | null>(null);
  const [pullLog, setPullLog] = useState<string>("");
  const [pullName, setPullName] = useState("");
  const [filter, setFilter] = useState("");

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      setLoading(true);
      setError(null);
      const res = await api.listModels();
      setModels(res.models);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function pull(name: string) {
    try {
      setPulling(name);
      setPullLog("");
      setError(null);
      await api.pullModel(name, (chunk) => {
        setPullLog((prev) => prev + chunk);
      });
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setPulling(null);
      setPullLog("");
    }
  }

  async function deleteModel(name: string) {
    try {
      await api.deleteModel(name);
      setModels((prev) => prev.filter((m) => m.name !== name));
    } catch (e) {
      setError(String(e));
    }
  }

  const installedNames = new Set(models.map((m) => m.name));
  const filteredInstalled = models.filter((m) =>
    !filter || m.name.toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-border bg-panel/60 px-6 py-3">
        <h1 className="text-sm font-semibold text-text">Cookbook — Ollama Models</h1>
        <button onClick={load} className="text-muted hover:text-text transition-colors">
          <RefreshCw size={14} />
        </button>
      </div>

      {error && <div className="border-b border-border bg-red-950/30 px-6 py-2 text-xs text-red-300">{error}</div>}

      {pulling && (
        <div className="border-b border-border bg-panel/60 px-6 py-3">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
            <p className="text-xs text-accent">Pulling {pulling}…</p>
          </div>
          {pullLog && (
            <pre className="text-xs text-muted font-mono whitespace-pre-wrap max-h-24 overflow-y-auto">
              {pullLog.slice(-500)}
            </pre>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
        {/* Pull by name */}
        <div>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Pull Model</h2>
          <form
            onSubmit={(e) => { e.preventDefault(); if (pullName.trim()) pull(pullName.trim()); }}
            className="flex gap-2"
          >
            <input
              value={pullName}
              onChange={(e) => setPullName(e.target.value)}
              placeholder="e.g. llama3.2:3b or any Ollama model name"
              className="flex-1 rounded border border-border bg-bg px-3 py-1.5 text-xs text-text outline-none focus:border-accent placeholder-muted/50"
            />
            <button
              type="submit"
              disabled={!pullName.trim() || !!pulling}
              className="flex items-center gap-1.5 rounded bg-accent px-3 py-1.5 text-xs font-medium text-white disabled:opacity-30 hover:bg-accent/90"
            >
              <Download size={12} /> Pull
            </button>
          </form>
        </div>

        {/* Popular models */}
        <div>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Popular Models</h2>
          <div className="grid grid-cols-1 gap-1.5">
            {POPULAR_MODELS.map((m) => {
              const installed = installedNames.has(m.name);
              return (
                <div key={m.name} className="flex items-center justify-between rounded-lg border border-border bg-panel/40 px-4 py-2.5">
                  <div>
                    <p className="text-xs font-medium text-text font-mono">{m.name}</p>
                    <p className="text-xs text-muted/70">{m.description}</p>
                  </div>
                  {installed ? (
                    <span className="text-xs text-green-400/80 font-medium">Installed</span>
                  ) : (
                    <button
                      onClick={() => pull(m.name)}
                      disabled={!!pulling}
                      className="flex items-center gap-1 rounded px-2 py-1 text-xs text-accent hover:bg-accent/10 disabled:opacity-40"
                    >
                      <Download size={11} /> Get
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Installed models */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">Installed</h2>
            {models.length > 0 && (
              <div className="relative">
                <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted/60" />
                <input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Filter…"
                  className="rounded border border-border bg-bg pl-6 pr-2 py-1 text-xs text-text outline-none focus:border-accent w-36"
                />
              </div>
            )}
          </div>

          {loading && <p className="text-xs text-muted">Loading…</p>}
          {!loading && models.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-8 text-muted">
              <BookOpen size={32} className="opacity-20" />
              <p className="text-xs">No models installed</p>
              <p className="text-xs opacity-60">Pull a model above to get started</p>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            {filteredInstalled.map((m) => (
              <div key={m.name} className="group flex items-center justify-between rounded-lg border border-border bg-panel/40 px-4 py-2.5">
                <div>
                  <p className="text-xs font-medium text-text font-mono">{m.name}</p>
                  <p className="text-xs text-muted/60">{formatSize(m.size)}</p>
                </div>
                <button
                  onClick={() => deleteModel(m.name)}
                  className="hidden group-hover:flex text-muted hover:text-red-400 transition-colors"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function formatSize(bytes: number): string {
  const gb = bytes / 1024 / 1024 / 1024;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / 1024 / 1024;
  return `${mb.toFixed(0)} MB`;
}
