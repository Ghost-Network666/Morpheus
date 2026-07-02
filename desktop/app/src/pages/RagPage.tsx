import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Brain, Upload, Search, Trash2, FileText, Eye, X } from "lucide-react";
import { api } from "../lib/api";
import type { RAGDocument, RAGSearchResult, RAGChunk } from "../types";

// 8px grid, 150ms transitions enforced via classes + framer

const cardTransition = { duration: 0.15, ease: "easeOut" as const };

export function RagPage() {
  const [docs, setDocs] = useState<RAGDocument[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<RAGSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Sandbox state
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [chunks, setChunks] = useState<RAGChunk[]>([]);
  const [chunksLoading, setChunksLoading] = useState(false);
  const [inspectChunk, setInspectChunk] = useState<RAGChunk | null>(null);

  useEffect(() => { loadDocs(); }, []);

  async function loadDocs() {
    try {
      setLoading(true);
      const list = await api.listRagDocs();
      setDocs(list);
      // auto-select first if none
      if (!selectedDocId && list.length > 0) {
        selectDoc(list[0].id);
      }
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  }

  async function selectDoc(docId: string) {
    setSelectedDocId(docId);
    setInspectChunk(null);
    setChunksLoading(true);
    try {
      const res = await api.listRagChunks(docId);
      setChunks(res.chunks || []);
    } catch (e) {
      setError(String(e));
      setChunks([]);
    } finally {
      setChunksLoading(false);
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setUploading(true);
      setError(null);
      const doc = await api.uploadRagFile(file);
      setDocs((prev) => [doc, ...prev]);
      // immediately load its chunks
      await selectDoc(doc.id);
    } catch (err) { setError(String(err)); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  async function deleteDoc(id: string) {
    try {
      await api.deleteRagDoc(id);
      setDocs((prev) => prev.filter((d) => d.id !== id));
      if (selectedDocId === id) {
        setSelectedDocId(null);
        setChunks([]);
        setInspectChunk(null);
      }
    } catch (e) { setError(String(e)); }
  }

  async function pruneChunk(chunk: RAGChunk) {
    try {
      await api.deleteRagChunk(chunk.id);
      setChunks((prev) => prev.filter((c) => c.id !== chunk.id));
      if (inspectChunk?.id === chunk.id) setInspectChunk(null);
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

  const totalChunks = docs.reduce((sum, d) => sum + (d.chunks || 0), 0);
  const selectedDoc = docs.find(d => d.id === selectedDocId);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-bg text-text" style={{ padding: '8px' }}>
      {/* Header + compact context gauge */}
      <div className="flex items-center justify-between border-b border-border px-2 py-2 mb-1" style={{ gap: '8px' }}>
        <div className="flex items-center gap-2">
          <Brain size={16} className="text-accent" />
          <div>
            <div className="text-sm font-semibold tracking-tight">Knowledge Sandbox</div>
            <div className="text-[10px] text-muted -mt-0.5">RAG Metadata • Vector Fragments</div>
          </div>
        </div>

        <div className="flex items-center gap-3 text-[10px] text-muted">
          <span className="tabular-nums">{docs.length} document{docs.length === 1 ? "" : "s"}</span>
          <span className="opacity-40">·</span>
          <span className="tabular-nums">{totalChunks} chunk{totalChunks === 1 ? "" : "s"}</span>
        </div>

        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-accent hover:bg-accent/10 border border-border disabled:opacity-50 transition-colors"
          style={{ padding: '4px 8px' }}
        >
          <Upload size={12} />
          {uploading ? "Uploading…" : "Upload Document"}
        </button>
        <input ref={fileRef} type="file" className="hidden" accept=".pdf,.txt,.md,.docx" onChange={handleUpload} />
      </div>

      {error && (
        <div className="mx-2 mb-1 rounded border border-red-500/30 bg-red-950/30 px-2 py-1 text-xs text-red-300" style={{ padding: '4px 8px' }}>
          {error}
          <button className="ml-2 opacity-60" onClick={() => setError(null)}>×</button>
        </div>
      )}

      <div className="flex flex-1 min-h-0" style={{ gap: '8px' }}>
        {/* Documents sidebar — dense list */}
        <div className="w-52 shrink-0 flex flex-col border border-border rounded bg-panel/40 overflow-hidden">
          <div className="px-2 py-1.5 text-[10px] font-medium uppercase tracking-widest text-muted border-b border-border" style={{ padding: '4px 8px' }}>
            Documents ({docs.length})
          </div>
          <div className="flex-1 overflow-y-auto p-1" style={{ gap: '4px' }}>
            {loading && <div className="px-2 py-3 text-xs text-muted">Loading…</div>}
            {!loading && docs.length === 0 && (
              <div className="px-2 py-6 text-center text-xs text-muted">No documents. Upload to begin.</div>
            )}
            {docs.map((doc) => {
              const isActive = doc.id === selectedDocId;
              return (
                <button
                  key={doc.id}
                  onClick={() => selectDoc(doc.id)}
                  className={`w-full text-left rounded px-2 py-1.5 text-xs flex justify-between items-center border transition-all duration-150 ${isActive ? 'bg-accent/10 border-accent/40' : 'border-transparent hover:bg-white/5 hover:border-border'}`}
                  style={{ padding: '4px 8px' }}
                >
                  <div className="min-w-0 pr-2">
                    <div className="truncate font-medium text-text/90">{doc.filename}</div>
                    <div className="text-[10px] text-muted/60 tabular-nums">{(doc.size/1024).toFixed(1)} KB • {doc.chunks ?? '?'} chunks</div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteDoc(doc.id); }}
                    className="opacity-40 hover:opacity-100 text-red-400 p-0.5"
                  >
                    <Trash2 size={11} />
                  </button>
                </button>
              );
            })}
          </div>
        </div>

        {/* Main Sandbox — Chunk grid (interactive data grid / cards) */}
        <div className="flex-1 min-w-0 flex flex-col border border-border rounded bg-panel/30 overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-2 py-1.5" style={{ padding: '4px 8px' }}>
            <div className="text-xs font-medium">
              {selectedDoc ? (
                <>Chunks for <span className="text-accent">{selectedDoc.filename}</span> <span className="text-muted">• {chunks.length}</span></>
              ) : "Select a document"}
            </div>
            {chunksLoading && <span className="text-[10px] text-muted">loading fragments…</span>}
          </div>

          <div className="flex-1 overflow-auto p-2" style={{ padding: '8px' }}>
            {!selectedDocId && (
              <div className="h-full flex items-center justify-center text-muted text-sm">Select a document on the left to explore its vector fragments.</div>
            )}

            {selectedDocId && chunks.length === 0 && !chunksLoading && (
              <div className="text-xs text-muted p-4">No chunks indexed for this document.</div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-2">
              <AnimatePresence>
                {chunks.map((chunk, idx) => (
                  <motion.div
                    key={chunk.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={cardTransition}
                    whileHover={{ scale: 1.005, transition: { duration: 0.1 } }}
                    className="group rounded border border-border bg-bg/70 hover:border-accent/30 flex flex-col overflow-hidden"
                    style={{ padding: '6px 8px' }}
                  >
                    {/* Chunk header */}
                    <div className="flex items-center gap-1.5 text-[10px] mb-1 text-muted">
                      <span className="font-mono text-accent/80">#{chunk.chunk_index}</span>
                      <span>{chunk.tokens} tok</span>
                    </div>

                    {/* Isolated chunk content */}
                    <div className="text-[11px] leading-snug text-text/90 line-clamp-4 font-mono bg-black/30 rounded p-1 mb-1.5 min-h-[52px]">
                      {chunk.text}
                    </div>

                    <div className="text-[9px] text-muted/70 truncate mb-1">{chunk.source}</div>

                    {/* Inline controls — subtle, no menu jump (guideline 1) */}
                    <div className="flex gap-2 text-[10px] mt-auto pt-1 border-t border-border/40">
                      <button
                        onClick={() => pruneChunk(chunk)}
                        className="text-red-400/70 hover:text-red-400 flex items-center gap-0.5 hover:bg-red-500/10 px-1 rounded transition-colors"
                      >
                        <Trash2 size={10} /> prune
                      </button>
                      <button
                        onClick={() => setInspectChunk(chunk)}
                        className="text-muted/70 hover:text-text flex items-center gap-0.5 hover:bg-white/5 px-1 rounded transition-colors"
                      >
                        <Eye size={10} /> inspect
                      </button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* Inspect detail pane (isolated) */}
        <AnimatePresence>
          {inspectChunk && (
            <motion.div
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              transition={cardTransition}
              className="w-80 shrink-0 border border-border rounded bg-panel/60 flex flex-col overflow-hidden"
              style={{ padding: '8px' }}
            >
              <div className="flex justify-between items-center mb-2 text-xs">
                <div className="font-medium">Chunk #{inspectChunk.chunk_index} • {inspectChunk.tokens} tokens</div>
                <button onClick={() => setInspectChunk(null)} className="text-muted hover:text-text"><X size={14} /></button>
              </div>
              <div className="text-[10px] text-muted mb-1">Source: {inspectChunk.source}</div>
              <div className="flex-1 overflow-auto text-xs font-mono leading-relaxed bg-bg/60 rounded p-2 whitespace-pre-wrap border border-border/40">
                {inspectChunk.text}
              </div>
              <div className="pt-2 flex gap-2 text-xs">
                <button
                  onClick={() => pruneChunk(inspectChunk)}
                  className="flex-1 rounded border border-red-500/30 bg-red-500/5 py-1 text-red-300 hover:bg-red-500/10"
                >
                  Prune this fragment
                </button>
                <button onClick={() => setInspectChunk(null)} className="flex-1 rounded border border-border py-1 hover:bg-white/5">Close</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Search results — also rendered as isolated cards */}
      <div className="border-t border-border mt-1 pt-2" style={{ padding: '0 8px 8px' }}>
        <form onSubmit={search} className="flex gap-2 mb-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Semantic search across all fragments…"
            className="flex-1 rounded border border-border bg-bg px-2 py-1 text-xs outline-none focus:border-accent placeholder-muted/50"
            style={{ padding: '4px 8px' }}
          />
          <button
            type="submit"
            disabled={!query.trim() || searching}
            className="rounded bg-accent px-3 py-1 text-xs text-white disabled:opacity-40"
          >
            {searching ? "…" : "Search"}
          </button>
        </form>

        {results.length > 0 && (
          <div className="text-[10px] uppercase tracking-widest text-muted mb-1">Search Hits</div>
        )}
        <div className="flex flex-col gap-1.5 max-h-[140px] overflow-auto pr-1">
          {results.map((r, i) => (
            <div key={i} className="rounded border border-border bg-panel/40 text-xs" style={{ padding: '4px 8px' }}>
              <div className="flex justify-between text-[10px] mb-0.5">
                <span className="text-accent truncate">{r.source}</span>
                <span className="text-muted">{(r.score * 100).toFixed(0)}%</span>
              </div>
              <p className="text-text/80 line-clamp-2 leading-snug">{r.text}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
