import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Search, StopCircle, Globe, Check, AlertCircle } from "lucide-react";
import { api } from "../lib/api";
import { MarkdownRenderer } from "../components/MarkdownRenderer";

interface PipelineStep {
  key: string;
  label: string;
  desc: string;
}

const PIPELINE: PipelineStep[] = [
  { key: "search", label: "Web search", desc: "Querying sources" },
  { key: "read", label: "Read pages", desc: "Fetching & parsing content" },
  { key: "synthesize", label: "Synthesize", desc: "Generating structured report" },
];

const stepTransition = { duration: 0.15, ease: "easeOut" as const };

export function ResearchPage() {
  const [topic, setTopic] = useState("");
  const [depth, setDepth] = useState(3);
  const [output, setOutput] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Timeline state (derived + live detection)
  const [activeStep, setActiveStep] = useState(0);
  const [completed, setCompleted] = useState<number[]>([]);
  const [stepError, setStepError] = useState<string | null>(null);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!topic.trim() || running) return;

    setOutput("");
    setError(null);
    setActiveStep(0);
    setCompleted([]);
    setStepError(null);
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
            // live step detection for timeline
            updatePipeline(next);
            setTimeout(() => {
              scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
            }, 0);
            return next;
          });
        },
        controller.signal,
      );
      // mark final complete
      setActiveStep(PIPELINE.length);
      setCompleted([0, 1, 2]);
    } catch (e) {
      if (!(e instanceof Error && e.name === "AbortError")) {
        const msg = String(e);
        setError(msg);
        setStepError(msg);
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }

  function updatePipeline(text: string) {
    const lower = text.toLowerCase();
    let newActive = activeStep;
    const newCompleted: number[] = [];

    if (lower.includes("searching the web") || lower.includes("querying")) {
      newActive = 0;
    }
    if (lower.includes("found") || lower.includes("sources found")) {
      newCompleted.push(0);
      newActive = 1;
    }
    if (lower.includes("reading") || lower.includes("fetching full") || lower.includes("read:")) {
      newCompleted.push(0, 1);
      newActive = 2;
    }
    if (lower.includes("synthesi") || lower.includes("generating")) {
      newCompleted.push(0, 1);
      newActive = 2;
    }
    if (lower.includes("report") && lower.includes("sources:")) {
      newCompleted.push(0, 1, 2);
      newActive = 3;
    }

    if (newActive !== activeStep) setActiveStep(newActive);
    if (JSON.stringify(newCompleted) !== JSON.stringify(completed)) setCompleted(newCompleted);

    // crude failure detection
    if (lower.includes("error") || lower.includes("failed") || lower.includes("no search results")) {
      setStepError(text.slice(-280));
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  // Timeline node renderer (guideline 2)
  function TimelineNode({ step, index }: { step: PipelineStep; index: number }) {
    const isDone = completed.includes(index);
    const isActive = activeStep === index && running;
    const isFailed = !!stepError && index === activeStep;

    return (
      <div className="relative flex gap-2 pl-1">
        {/* vertical connector */}
        {index < PIPELINE.length - 1 && (
          <div className="absolute left-[9px] top-5 h-5 w-px bg-border/60" />
        )}
        <div
          className={`mt-0.5 h-4 w-4 shrink-0 rounded-full border flex items-center justify-center transition-all duration-150
            ${isDone ? "border-accent bg-accent/10" : ""}
            ${isActive ? "border-accent ring-1 ring-accent/40" : ""}
            ${isFailed ? "border-red-500/60 bg-red-500/10" : "border-border"}
          `}
        >
          {isDone && <Check size={10} className="text-accent" />}
          {isActive && !isDone && <div className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />}
          {isFailed && <AlertCircle size={10} className="text-red-400" />}
        </div>
        <div className="-mt-px">
          <div className={`text-xs font-medium ${isActive ? "text-accent" : isDone ? "text-text" : "text-muted"}`}>
            {step.label}
          </div>
          <div className="text-[10px] text-muted/60 leading-none mt-px">{step.desc}</div>

          {/* Failure expansion (isolated error log) */}
          {isFailed && stepError && (
            <div className="mt-1 rounded border border-red-500/30 bg-red-950/20 p-1.5 text-[10px] font-mono text-red-300 whitespace-pre-wrap max-h-24 overflow-auto">
              {stepError}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-1" style={{ padding: '8px', gap: '8px' }}>
      {/* Thinking Pipeline Timeline (left) */}
      <div className="w-56 shrink-0 border border-border rounded bg-panel/40 flex flex-col overflow-hidden">
        <div className="px-2 py-1.5 text-xs font-semibold border-b border-border flex items-center gap-1.5" style={{ padding: '4px 8px' }}>
          <Globe size={13} /> Thinking Pipeline
        </div>

        <div className="p-2 flex-1 space-y-3 text-sm" style={{ padding: '8px' }}>
          {PIPELINE.map((step, idx) => (
            <TimelineNode key={step.key} step={step} index={idx} />
          ))}

          {running && (
            <div className="text-[10px] text-muted pl-1 mt-1">Streaming live…</div>
          )}
        </div>
      </div>

      {/* Main research area */}
      <div className="flex-1 min-w-0 flex flex-col border border-border rounded bg-panel/30 overflow-hidden">
        <div className="border-b border-border bg-panel/60 px-3 py-2" style={{ padding: '4px 8px' }}>
          <form onSubmit={run} className="flex items-center gap-2">
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Research topic or question…"
              className="flex-1 rounded border border-border bg-bg px-2 py-1 text-sm text-text outline-none focus:border-accent placeholder-muted/50"
              disabled={running}
              style={{ padding: '4px 8px' }}
            />
            <div className="flex items-center gap-1 text-xs text-muted">
              <label className="text-[10px]">Depth</label>
              <select
                value={depth}
                onChange={(e) => setDepth(Number(e.target.value))}
                disabled={running}
                className="rounded border border-border bg-bg px-1.5 py-0.5 text-xs"
              >
                {[1,2,3,5,7,10].map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            {running ? (
              <button type="button" onClick={stop} className="flex items-center gap-1 rounded border border-red-500/30 bg-red-500/10 px-2 py-1 text-xs text-red-300">
                <StopCircle size={13} /> Stop
              </button>
            ) : (
              <button
                type="submit"
                disabled={!topic.trim()}
                className="flex items-center gap-1 rounded bg-accent px-3 py-1 text-xs font-medium text-white disabled:opacity-40"
              >
                <Search size={13} /> Research
              </button>
            )}
          </form>
        </div>

        {error && <div className="border-b border-border bg-red-950/30 px-3 py-1 text-xs text-red-300" style={{ padding: '4px 8px' }}>{error}</div>}

        {/* Isolated system canvas / console block (guideline 4) */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto bg-[#0f0f17]" style={{ padding: '8px' }}>
          {!output && !running && (
            <div className="h-full flex flex-col items-center justify-center text-muted gap-2">
              <Globe size={36} className="opacity-20" />
              <p className="text-sm">Enter a topic to start a structured research run</p>
              <p className="text-xs opacity-50 max-w-xs text-center">Pipeline steps appear on the left. Final synthesis renders here with full citations.</p>
            </div>
          )}

          {(output || running) && (
            <div className="max-w-3xl mx-auto">
              <div className="mb-2 text-[10px] uppercase tracking-[1px] text-muted/70 flex items-center gap-2">
                <div className="h-px flex-1 bg-border/50" /> LIVE REPORT <div className="h-px flex-1 bg-border/50" />
              </div>
              <div className="prose prose-invert prose-sm max-w-none">
                <MarkdownRenderer content={output || (running ? "Thinking…" : "")} />
              </div>
              {running && (
                <div className="mt-3 text-[10px] text-muted inline-flex items-center gap-1">
                  <span className="inline-block h-1 w-1 rounded-full bg-accent animate-pulse" /> streaming
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
