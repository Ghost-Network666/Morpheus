import { useState, useRef } from "react";
import { Search, StopCircle, Globe } from "lucide-react";
import { api } from "../lib/api";
import { MarkdownRenderer } from "../components/MarkdownRenderer";

export function ResearchPage() {
  const [topic, setTopic] = useState("");
  const [depth, setDepth] = useState(3);
  const [output, setOutput] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!topic.trim() || running) return;
    setOutput("");
    setError(null);
    setRunning(true);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await api.runResearch(
        topic.trim(),
        depth,
        (chunk) => {
          setOutput((prev) => {
            const next = prev + chunk;
            setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }), 0);
            return next;
          });
        },
        controller.signal,
      );
    } catch (e) {
      if (!(e instanceof Error && e.name === "AbortError")) {
        setError(String(e));
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="border-b border-border bg-panel/60 px-6 py-3">
        <h1 className="text-sm font-semibold text-text mb-3">Web Research</h1>
        <form onSubmit={run} className="flex items-center gap-2">
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Research topic or question…"
            className="flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-accent placeholder-muted/50"
            disabled={running}
          />
          <div className="flex items-center gap-1.5 text-xs text-muted">
            <label>Depth:</label>
            <select
              value={depth}
              onChange={(e) => setDepth(Number(e.target.value))}
              disabled={running}
              className="rounded border border-border bg-bg px-2 py-1.5 text-xs text-text outline-none"
            >
              {[1,2,3,5,7,10].map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          {running ? (
            <button
              type="button"
              onClick={stop}
              className="flex items-center gap-1.5 rounded-lg bg-red-500/20 border border-red-500/30 px-3 py-2 text-xs text-red-300 hover:bg-red-500/30"
            >
              <StopCircle size={14} /> Stop
            </button>
          ) : (
            <button
              type="submit"
              disabled={!topic.trim()}
              className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-xs font-medium text-white disabled:opacity-30 hover:bg-accent/90"
            >
              <Search size={14} /> Research
            </button>
          )}
        </form>
      </div>

      {error && (
        <div className="border-b border-border bg-red-950/30 px-6 py-2 text-xs text-red-300">{error}</div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6">
        {!output && !running && (
          <div className="flex flex-col items-center gap-3 py-12 text-muted">
            <Globe size={40} className="opacity-20" />
            <p className="text-sm">Enter a topic and click Research</p>
            <p className="text-xs opacity-60">Searches the web, reads pages, and synthesises a report</p>
          </div>
        )}
        {running && !output && (
          <div className="flex items-center gap-2 text-xs text-muted">
            <span className="animate-pulse">Researching…</span>
          </div>
        )}
        {output && (
          <div className="mx-auto max-w-3xl">
            <MarkdownRenderer content={output} />
            {running && (
              <span className="inline-flex gap-1 items-center text-xs text-muted mt-2">
                <span className="animate-pulse">●</span> Generating…
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
