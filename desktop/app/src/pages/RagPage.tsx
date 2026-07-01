import { useEffect, useRef, useState } from "react";
import { Brain, Upload, Search, Trash2, FileText } from "lucide-react";
import { api } from "../lib/api";
import type { RAGDocument, RAGSearchResult } from "../types";

export function RagPage() {
  const [docs, setDocs] = useState<RAGDocument[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<RAGSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadDocs(); }, []);

  async function loadDocs() {
    try {
      setLoading(true);
      setDocs(await api.listRagDocs());
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setUploading(true);
      setError(null);
      const doc = await api.uploadRagFile(file);
      setDocs((prev) => [doc, ...prev]);
    } catch (err) { setError(String(err)); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  async function deleteDoc(id: string) {
    try {
      await api.deleteRagDoc(id);
      setDocs((prev) => prev.filter((d) => d.id !== id));
    } catch (e) { setError(String(e)); }
  }

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    try {
      setSearching(true);
      setError(null);
      const res = await api.ragSearch(query.trim());
      setResults(res.results);
    } catch (e) { setError(String(e)); }
    finally { setSearching(false); }
  }

  return (
    <div className="flex h-full min-h-0 flex-1">
      {/* Docs panel */}
      <div className="flex w-60 shrink-0 flex-col border-r border-border bg-panel/60">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">Documents</span>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-accent hover:bg-accent/10 disabled:opacity-50"
          >
            <Upload size={12} />
            {uploading ? "…" : "Upload"}
          </button>
          <input ref={fileRef} type="file" className="hidden" accept=".pdf,.txt,.md,.docx" onChange={handleUpload} />
        </div>
        <div className="flex-1 overflow-y-auto p-1.5 flex flex-col gap-0.5">
          {loading && <p className="text-xs text-muted text-center py-4">Loading…</p>}
          {!loading && docs.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-8 text-muted">
              <FileText size={28} className="opacity-30" />
              <p className="text-xs">No documents yet</p>
              <p className="text-xs opacity-60 text-center px-2">Upload PDFs, text files, or Markdown</p>
            </div>
          )}
          {docs.map((doc) => (
            <div key={doc.id} className="group flex items-center justify-between rounded px-2 py-1.5 hover:bg-white/5">
              <div className="min-w-0">
                <p className="truncate text-xs text-text">{doc.filename}</p>
                <p className="text-xs text-muted/60">{(doc.size / 1024).toFixed(1)} KB</p>
              </div>
              <button onClick={() => deleteDoc(doc.id)} className="hidden group-hover:flex text-muted hover:text-red-400 ml-1">
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Search panel */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="border-b border-border bg-panel/40 px-4 py-3">
          <form onSubmit={search} className="flex gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search your documents semantically…"
              className="flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-accent placeholder-muted/50"
            />
            <button
              type="submit"
              disabled={!query.trim() || searching}
              className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-xs font-medium text-white disabled:opacity-30 hover:bg-accent/90"
            >
              <Search size={14} /> {searching ? "…" : "Search"}
            </button>
          </form>
        </div>

        {error && (
          <div className="border-b border-border bg-red-950/30 px-4 py-2 text-xs text-red-300">{error}</div>
        )}

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {results.length === 0 && !searching && (
            <div className="flex flex-col items-center gap-3 py-12 text-muted">
              <Brain size={40} className="opacity-20" />
              <p className="text-sm">Semantic memory search</p>
              <p className="text-xs opacity-60">Upload documents and search them with natural language</p>
            </div>
          )}
          <div className="flex flex-col gap-3 max-w-2xl">
            {results.map((r, i) => (
              <div key={i} className="rounded-lg border border-border bg-panel/40 p-3">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <p className="text-xs font-medium text-accent truncate">{r.source}</p>
                  <span className="shrink-0 text-xs text-muted/60">
                    {(r.score * 100).toFixed(0)}% match
                  </span>
                </div>
                <p className="text-xs text-text/80 leading-relaxed">{r.text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
