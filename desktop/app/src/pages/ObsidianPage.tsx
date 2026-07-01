import { useEffect, useState } from "react";
import { Diamond, Search, FileText, Loader } from "lucide-react";
import { api } from "../lib/api";
import type { ObsidianFile } from "../types";
import { MarkdownRenderer } from "../components/MarkdownRenderer";

export function ObsidianPage() {
  const [files, setFiles] = useState<ObsidianFile[]>([]);
  const [query, setQuery] = useState("");
  const [activeFile, setActiveFile] = useState<ObsidianFile | null>(null);
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [fileLoading, setFileLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noVault, setNoVault] = useState(false);

  useEffect(() => { loadFiles(); }, []);

  async function loadFiles(q = "") {
    try {
      setLoading(true);
      setError(null);
      const result = await api.listObsidianFiles(q);
      setFiles(result);
    } catch (e: any) {
      if (String(e).includes("vault") || String(e).includes("404")) {
        setNoVault(true);
      } else {
        setError(String(e));
      }
    } finally {
      setLoading(false);
    }
  }

  async function openFile(file: ObsidianFile) {
    try {
      setFileLoading(true);
      setActiveFile(file);
      const res = await api.readObsidianFile(file.path);
      setContent(res.content);
    } catch (e) {
      setError(String(e));
    } finally {
      setFileLoading(false);
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    loadFiles(query);
  }

  if (noVault) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-muted p-8">
        <Diamond size={48} className="opacity-20" />
        <p className="text-sm font-medium text-text">No Obsidian vault configured</p>
        <p className="text-xs text-center max-w-xs">
          Set your vault path in Settings → Obsidian to browse and search your notes.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-1">
      {/* File list */}
      <div className="flex w-64 shrink-0 flex-col border-r border-border bg-panel/60">
        <div className="border-b border-border px-3 py-2">
          <form onSubmit={handleSearch} className="flex items-center gap-1">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search vault…"
              className="flex-1 bg-transparent text-xs text-text outline-none placeholder-muted/50"
            />
            <button type="submit" className="text-muted hover:text-text">
              <Search size={13} />
            </button>
          </form>
        </div>

        {error && <div className="border-b border-border bg-red-950/30 px-3 py-2 text-xs text-red-300">{error}</div>}

        <div className="flex-1 overflow-y-auto p-1.5 flex flex-col gap-0.5">
          {loading && (
            <div className="flex items-center justify-center py-6 text-muted">
              <Loader size={16} className="animate-spin" />
            </div>
          )}
          {!loading && files.length === 0 && (
            <p className="text-xs text-muted text-center py-4">No files found</p>
          )}
          {files.map((file) => (
            <button
              key={file.path}
              onClick={() => openFile(file)}
              className={`flex items-start gap-2 rounded px-2 py-1.5 text-xs text-left transition-colors w-full ${
                activeFile?.path === file.path ? "bg-accent/15 text-accent" : "text-muted hover:bg-white/5 hover:text-text"
              }`}
            >
              <FileText size={13} className="shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="truncate">{file.title || file.path.split("/").pop()}</p>
                <p className="text-[10px] text-muted/50">{new Date(file.modified).toLocaleDateString()}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* File content */}
      <div className="flex min-w-0 flex-1 flex-col">
        {!activeFile ? (
          <div className="flex flex-1 items-center justify-center flex-col gap-3 text-muted">
            <Diamond size={40} className="opacity-20" />
            <p className="text-sm">Select a note to read</p>
          </div>
        ) : (
          <>
            <div className="border-b border-border bg-panel/40 px-6 py-3">
              <h2 className="text-sm font-semibold text-text">
                {activeFile.title || activeFile.path.split("/").pop()}
              </h2>
              <p className="text-xs text-muted mt-0.5">{activeFile.path}</p>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {fileLoading ? (
                <div className="flex items-center justify-center h-full text-muted">
                  <Loader size={16} className="animate-spin" />
                </div>
              ) : (
                <div className="max-w-3xl">
                  <MarkdownRenderer content={content} />
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
