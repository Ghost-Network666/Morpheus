import { useEffect, useState } from "react";
import { Folder, File, ChevronRight, Home, Loader } from "lucide-react";
import { api } from "../lib/api";
import type { FSEntry } from "../types";

export function DocumentsPage() {
  const [entries, setEntries] = useState<FSEntry[]>([]);
  const [path, setPath] = useState("");
  const [content, setContent] = useState<string | null>(null);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { navigate(""); }, []);

  async function navigate(p: string) {
    try {
      setLoading(true);
      setError(null);
      setContent(null);
      setActiveFile(null);
      setPath(p);
      setEntries(await api.listFiles(p));
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  }

  async function openFile(entry: FSEntry) {
    if (entry.is_dir) { navigate(entry.path); return; }
    try {
      setLoading(true);
      setActiveFile(entry.path);
      const res = await api.readFile(entry.path);
      setContent(res.content);
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  }

  const breadcrumbs = path ? path.split("/").filter(Boolean) : [];

  return (
    <div className="flex h-full min-h-0 flex-1">
      {/* File browser */}
      <div className="flex w-64 shrink-0 flex-col border-r border-border bg-panel/60">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1 border-b border-border px-3 py-2 overflow-x-auto">
          <button onClick={() => navigate("")} className="text-muted hover:text-text shrink-0">
            <Home size={13} />
          </button>
          {breadcrumbs.map((segment, i) => (
            <div key={i} className="flex items-center gap-1 shrink-0">
              <ChevronRight size={11} className="text-muted/50" />
              <button
                onClick={() => navigate(breadcrumbs.slice(0, i + 1).join("/"))}
                className="text-xs text-muted hover:text-text"
              >
                {segment}
              </button>
            </div>
          ))}
        </div>

        {error && <div className="border-b border-border bg-red-950/30 px-3 py-2 text-xs text-red-300">{error}</div>}

        <div className="flex-1 overflow-y-auto p-1.5 flex flex-col gap-0.5">
          {loading && !content && (
            <div className="flex items-center justify-center py-6 text-muted">
              <Loader size={16} className="animate-spin" />
            </div>
          )}
          {!loading && entries.length === 0 && (
            <p className="text-xs text-muted text-center py-4">Empty directory</p>
          )}
          {entries.map((entry) => (
            <button
              key={entry.path}
              onClick={() => openFile(entry)}
              className={`flex items-center gap-2 rounded px-2 py-1.5 text-xs text-left transition-colors w-full ${
                activeFile === entry.path ? "bg-accent/15 text-accent" : "text-muted hover:bg-white/5 hover:text-text"
              }`}
            >
              {entry.is_dir
                ? <Folder size={13} className="shrink-0 text-yellow-400/70" />
                : <File size={13} className="shrink-0 text-muted/60" />
              }
              <span className="truncate">{entry.name}</span>
              {!entry.is_dir && (
                <span className="ml-auto shrink-0 text-muted/40">{formatSize(entry.size)}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* File content */}
      <div className="flex min-w-0 flex-1 flex-col">
        {!activeFile ? (
          <div className="flex flex-1 items-center justify-center flex-col gap-3 text-muted">
            <Folder size={40} className="opacity-20" />
            <p className="text-sm">Select a file to view</p>
          </div>
        ) : (
          <>
            <div className="border-b border-border bg-panel/40 px-4 py-2">
              <p className="text-xs font-medium text-muted">{activeFile}</p>
            </div>
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center h-full text-muted">
                  <Loader size={16} className="animate-spin" />
                </div>
              ) : (
                <pre className="p-4 text-xs text-text/80 font-mono leading-relaxed whitespace-pre-wrap break-words">
                  {content}
                </pre>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}K`;
  return `${(bytes / 1024 / 1024).toFixed(1)}M`;
}
