import { useState, useEffect, useRef } from "react";
import {
  Monitor, Server, Cpu, Key, Wifi, CheckCircle2,
  Loader2, Download, AlertCircle, ChevronRight, ChevronLeft,
} from "lucide-react";

type Step =
  | "welcome"
  | "local-providers"
  | "local-ollama"
  | "local-keys"
  | "local-model"
  | "local-done"
  | "remote-ssh"
  | "remote-check"
  | "remote-done";

interface Providers {
  ollama: boolean;
  openai: boolean;
  anthropic: boolean;
  lmstudio: boolean;
}

interface Keys {
  openaiKey: string;
  anthropicKey: string;
  lmstudioUrl: string;
}

const bridge = (window as any).electronAPI as Record<string, (...a: any[]) => any> | undefined;

const STARTER_MODELS = [
  { name: "llama3.2:3b", label: "Llama 3.2 3B", note: "~2 GB · Fast, great for everyday use" },
  { name: "llama3.2:1b", label: "Llama 3.2 1B", note: "~700 MB · Ultra-fast, minimal RAM" },
  { name: "gemma3:4b",   label: "Gemma 3 4B",   note: "~2.5 GB · Google, well-rounded" },
  { name: "mistral:7b",  label: "Mistral 7B",   note: "~4 GB · High quality instruction following" },
];

export function SetupWizardPage() {
  const [step,      setStep]      = useState<Step>("welcome");
  const [providers, setProviders] = useState<Providers>({ ollama: true, openai: false, anthropic: false, lmstudio: false });
  const [keys,      setKeys]      = useState<Keys>({ openaiKey: "", anthropicKey: "", lmstudioUrl: "http://localhost:1234" });
  const [selectedModel, setSelectedModel] = useState("llama3.2:3b");

  // Ollama install state
  const [ollamaStatus,   setOllamaStatus]   = useState<{ installed: boolean; running: boolean; models: string[] } | null>(null);
  const [installing,     setInstalling]     = useState(false);
  const [installMsg,     setInstallMsg]     = useState("");
  const [installPct,     setInstallPct]     = useState(0);
  const [installError,   setInstallError]   = useState<string | null>(null);

  // Model pull state
  const [pulling,  setPulling]  = useState(false);
  const [pullMsg,  setPullMsg]  = useState("");
  const [pullPct,  setPullPct]  = useState<number | null>(null);
  const [pullDone, setPullDone] = useState(false);

  // Remote state
  const [sshForm, setSshForm] = useState({ host: "", port: "22", username: "root", password: "", authType: "password" as "password" | "key", keyPath: "", passphrase: "" });
  const [remoteChecking, setRemoteChecking]   = useState(false);
  const [remoteStatus,   setRemoteStatus]     = useState<"unknown" | "ok" | "not-installed">("unknown");
  const [remoteLog,      setRemoteLog]        = useState("");
  const [remoteInstalling, setRemoteInstalling] = useState(false);
  const [remoteError,    setRemoteError]      = useState<string | null>(null);
  const [remoteUrl,      setRemoteUrl]        = useState("");

  const logRef = useRef<HTMLPreElement>(null);
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [remoteLog]);

  // ── Ollama check on entering that step ────────────────────────────────
  useEffect(() => {
    if (step === "local-ollama") _checkOllama();
  }, [step]);

  async function _checkOllama() {
    setInstallError(null);
    try {
      const status = await bridge?.checkOllama?.();
      setOllamaStatus(status || { installed: false, running: false, models: [] });
    } catch (e) {
      setOllamaStatus({ installed: false, running: false, models: [] });
    }
  }

  async function startInstallOllama() {
    setInstalling(true);
    setInstallError(null);
    setInstallPct(0);
    setInstallMsg("Preparing…");

    const cleanup = bridge?.onOllamaProgress?.((p: { message: string; progress: number }) => {
      setInstallMsg(p.message);
      if (p.progress != null) setInstallPct(p.progress);
    });

    try {
      const res = await bridge?.installOllama?.();
      if (res?.error) throw new Error(res.error);
      await _checkOllama();
    } catch (e: any) {
      setInstallError(e.message || String(e));
    } finally {
      setInstalling(false);
      cleanup?.();
    }
  }

  async function startPullModel() {
    setPulling(true);
    setPullDone(false);
    setPullMsg("Starting download…");
    setPullPct(0);

    const cleanup = bridge?.onOllamaProgress?.((p: { message: string; progress: number | null }) => {
      if (p.message) setPullMsg(p.message);
      if (p.progress != null) setPullPct(p.progress);
    });

    try {
      await bridge?.pullOllamaModel?.(selectedModel);
      setPullDone(true);
      setPullMsg("Download complete!");
    } catch (e: any) {
      setInstallError(e.message || String(e));
    } finally {
      setPulling(false);
      cleanup?.();
    }
  }

  // ── Remote flows ──────────────────────────────────────────────────────
  async function checkRemote() {
    setRemoteChecking(true);
    setRemoteError(null);
    setRemoteStatus("unknown");
    const url = `http://${sshForm.host}:7860`;
    try {
      const res = await bridge?.testRemoteUrl?.(url);
      if (res?.ok) {
        setRemoteUrl(url);
        setRemoteStatus("ok");
      } else {
        setRemoteStatus("not-installed");
        setRemoteUrl(url);
      }
    } catch {
      setRemoteStatus("not-installed");
      setRemoteUrl(url);
    } finally {
      setRemoteChecking(false);
    }
  }

  async function installRemote() {
    setRemoteInstalling(true);
    setRemoteLog("");
    setRemoteError(null);

    const cleanup = bridge?.onRemoteInstallProgress?.((msg: string) => {
      setRemoteLog((prev) => prev + msg);
    });

    try {
      const res = await bridge?.remoteInstall?.({
        host:       sshForm.host,
        port:       parseInt(sshForm.port),
        username:   sshForm.username,
        password:   sshForm.authType === "password" ? sshForm.password : undefined,
        authType:   sshForm.authType,
        keyPath:    sshForm.authType === "key" ? sshForm.keyPath : undefined,
        passphrase: sshForm.passphrase || undefined,
      });
      if (res?.ok) {
        setRemoteStatus("ok");
      } else {
        setRemoteError(res?.error || "Installation failed");
      }
    } catch (e: any) {
      setRemoteError(e.message || String(e));
    } finally {
      setRemoteInstalling(false);
      cleanup?.();
    }
  }

  function connectLocal() {
    const settings = {
      openai_api_key:    keys.openaiKey    || undefined,
      anthropic_api_key: keys.anthropicKey || undefined,
      openai_base_url:   keys.lmstudioUrl && providers.lmstudio ? keys.lmstudioUrl : undefined,
      default_provider:  providers.ollama ? "ollama" : providers.openai ? "openai" : providers.anthropic ? "anthropic" : "lmstudio",
    };
    bridge?.wizardConnectLocal?.(settings);
  }

  function connectRemote() {
    bridge?.wizardConnectRemote?.(sshForm.host, remoteUrl);
  }

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen flex-col bg-bg text-text select-none overflow-hidden">
      {/* Draggable title bar */}
      <div className="h-8 shrink-0 [-webkit-app-region:drag] bg-bg" />

      <div className="flex flex-1 flex-col items-center justify-center px-8 py-4 overflow-y-auto">
        <div className="w-full max-w-lg">
          {step === "welcome"          && <StepWelcome    onLocal={() => setStep("local-providers")} onRemote={() => setStep("remote-ssh")} />}
          {step === "local-providers"  && <StepProviders  providers={providers} setProviders={setProviders} onBack={() => setStep("welcome")} onNext={() => setStep(providers.ollama ? "local-ollama" : (providers.openai || providers.anthropic || providers.lmstudio) ? "local-keys" : "local-done")} />}
          {step === "local-ollama"     && (
            <StepOllama
              status={ollamaStatus}
              installing={installing}
              installMsg={installMsg}
              installPct={installPct}
              installError={installError}
              onInstall={startInstallOllama}
              onNext={() => setStep(providers.openai || providers.anthropic || providers.lmstudio ? "local-keys" : "local-model")}
              onBack={() => setStep("local-providers")}
            />
          )}
          {step === "local-model"      && (
            <StepModel
              models={ollamaStatus?.models || []}
              selectedModel={selectedModel}
              setSelectedModel={setSelectedModel}
              pulling={pulling}
              pullMsg={pullMsg}
              pullPct={pullPct}
              pullDone={pullDone}
              onPull={startPullModel}
              onNext={() => setStep(providers.openai || providers.anthropic || providers.lmstudio ? "local-keys" : "local-done")}
              onSkip={() => setStep(providers.openai || providers.anthropic || providers.lmstudio ? "local-keys" : "local-done")}
              onBack={() => setStep("local-ollama")}
            />
          )}
          {step === "local-keys"       && (
            <StepKeys
              providers={providers}
              keys={keys}
              setKeys={setKeys}
              onBack={() => setStep(providers.ollama ? "local-model" : "local-providers")}
              onNext={() => setStep("local-done")}
            />
          )}
          {step === "local-done"       && <StepLocalDone onLaunch={connectLocal} />}

          {step === "remote-ssh"       && (
            <StepRemoteSSH
              form={sshForm}
              setForm={setSshForm}
              onBack={() => setStep("welcome")}
              onNext={async () => { setStep("remote-check"); await checkRemote(); }}
            />
          )}
          {step === "remote-check"     && (
            <StepRemoteCheck
              host={sshForm.host}
              checking={remoteChecking}
              status={remoteStatus}
              installing={remoteInstalling}
              log={remoteLog}
              error={remoteError}
              logRef={logRef}
              onInstall={installRemote}
              onConnect={connectRemote}
              onBack={() => setStep("remote-ssh")}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Step: Welcome ─────────────────────────────────────────────────────────
function StepWelcome({ onLocal, onRemote }: { onLocal: () => void; onRemote: () => void }) {
  return (
    <div className="flex flex-col items-center gap-8">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-text mb-2">Welcome to Morpheus</h1>
        <p className="text-sm text-muted">A privacy-first AI workspace that runs on your own hardware.</p>
        <p className="text-xs text-muted/60 mt-1">No accounts. No cloud. No data leaves your machine.</p>
      </div>
      <div className="grid grid-cols-2 gap-4 w-full">
        <button onClick={onLocal} className="group flex flex-col items-center gap-3 rounded-xl border border-border bg-panel/60 p-6 text-center hover:border-accent/50 hover:bg-panel transition-all">
          <Monitor size={32} className="text-accent group-hover:scale-110 transition-transform" />
          <div>
            <p className="text-sm font-semibold text-text">Use This Computer</p>
            <p className="text-xs text-muted mt-1">Run AI locally or connect cloud providers</p>
          </div>
          <ChevronRight size={16} className="text-muted" />
        </button>
        <button onClick={onRemote} className="group flex flex-col items-center gap-3 rounded-xl border border-border bg-panel/60 p-6 text-center hover:border-accent/50 hover:bg-panel transition-all">
          <Server size={32} className="text-accent group-hover:scale-110 transition-transform" />
          <div>
            <p className="text-sm font-semibold text-text">Connect to My Server</p>
            <p className="text-xs text-muted mt-1">NAS, homelab, or remote Linux server</p>
          </div>
          <ChevronRight size={16} className="text-muted" />
        </button>
      </div>
    </div>
  );
}

// ── Step: Provider selection ───────────────────────────────────────────────
function StepProviders({
  providers, setProviders, onBack, onNext,
}: {
  providers: Providers;
  setProviders: React.Dispatch<React.SetStateAction<Providers>>;
  onBack: () => void;
  onNext: () => void;
}) {
  const items = [
    { key: "ollama" as const, icon: <Cpu size={20} className="text-accent" />, label: "Ollama (Local AI)", desc: "Free · Private · Runs on your computer — Morpheus installs it automatically", badge: "Recommended" },
    { key: "openai" as const, icon: <Key size={20} className="text-green-400" />, label: "OpenAI", desc: "GPT-4o, GPT-4 Turbo and more · Requires API key" },
    { key: "anthropic" as const, icon: <Key size={20} className="text-orange-400" />, label: "Anthropic", desc: "Claude models · Requires API key" },
    { key: "lmstudio" as const, icon: <Wifi size={20} className="text-blue-400" />, label: "LM Studio", desc: "Connect to a running LM Studio instance on your network" },
  ];

  const anySelected = Object.values(providers).some(Boolean);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-bold text-text mb-1">Choose your AI provider</h2>
        <p className="text-xs text-muted">Select one or more. You can add more in Settings later.</p>
      </div>
      <div className="flex flex-col gap-2">
        {items.map(({ key, icon, label, desc, badge }) => {
          const active = providers[key];
          return (
            <button
              key={key}
              onClick={() => setProviders((p) => ({ ...p, [key]: !p[key] }))}
              className={`flex items-center gap-4 rounded-xl border px-4 py-3.5 text-left transition-all ${active ? "border-accent/60 bg-accent/10" : "border-border bg-panel/40 hover:border-border/80"}`}
            >
              <div className="shrink-0">{icon}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-text">{label}</span>
                  {badge && <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold bg-accent/20 text-accent">{badge}</span>}
                </div>
                <p className="text-xs text-muted mt-0.5">{desc}</p>
              </div>
              <div className={`shrink-0 h-5 w-5 rounded-full border-2 flex items-center justify-center transition-all ${active ? "border-accent bg-accent" : "border-border"}`}>
                {active && <CheckCircle2 size={12} className="text-white" />}
              </div>
            </button>
          );
        })}
      </div>
      <div className="flex justify-between">
        <button onClick={onBack} className="flex items-center gap-1 text-xs text-muted hover:text-text"><ChevronLeft size={14} /> Back</button>
        <button onClick={onNext} disabled={!anySelected} className="flex items-center gap-1.5 rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white disabled:opacity-40 hover:bg-accent/90">
          Continue <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

// ── Step: Ollama install ───────────────────────────────────────────────────
function StepOllama({
  status, installing, installMsg, installPct, installError,
  onInstall, onNext, onBack,
}: {
  status: { installed: boolean; running: boolean; models: string[] } | null;
  installing: boolean;
  installMsg: string;
  installPct: number;
  installError: string | null;
  onInstall: () => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const ready = status?.running;
  const installed = status?.installed;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-bold text-text mb-1">Setting up Ollama</h2>
        <p className="text-xs text-muted">Ollama runs AI models locally. Morpheus handles everything — no terminal needed.</p>
      </div>

      <div className="rounded-xl border border-border bg-panel/40 p-5">
        {status === null ? (
          <div className="flex items-center gap-2 text-sm text-muted">
            <Loader2 size={16} className="animate-spin" /> Checking for Ollama…
          </div>
        ) : ready ? (
          <div className="flex items-center gap-2 text-sm text-green-400">
            <CheckCircle2 size={16} /> Ollama is installed and running
          </div>
        ) : installed ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-yellow-400 flex items-center gap-2">
              <AlertCircle size={14} /> Ollama is installed but not running
            </p>
            {!installing && (
              <button onClick={onInstall} className="flex items-center gap-1.5 self-start rounded-lg bg-accent px-4 py-2 text-xs font-medium text-white hover:bg-accent/90">
                Start Ollama
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-text">Ollama is not installed on this computer.</p>
            {!installing && (
              <button onClick={onInstall} className="flex items-center gap-2 self-start rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90">
                <Download size={14} /> Install Ollama Automatically
              </button>
            )}
          </div>
        )}

        {installing && (
          <div className="mt-3 flex flex-col gap-2">
            <div className="flex items-center gap-2 text-xs text-muted">
              <Loader2 size={12} className="animate-spin" /> {installMsg}
            </div>
            <div className="h-1.5 rounded-full bg-border overflow-hidden">
              <div className="h-full rounded-full bg-accent transition-all duration-300" style={{ width: `${installPct}%` }} />
            </div>
          </div>
        )}

        {installError && (
          <div className="mt-3 text-xs text-red-400 flex items-start gap-1.5">
            <AlertCircle size={12} className="shrink-0 mt-0.5" /> {installError}
          </div>
        )}
      </div>

      <div className="flex justify-between">
        <button onClick={onBack} className="flex items-center gap-1 text-xs text-muted hover:text-text"><ChevronLeft size={14} /> Back</button>
        <button onClick={onNext} disabled={!ready} className="flex items-center gap-1.5 rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white disabled:opacity-40 hover:bg-accent/90">
          Continue <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

// ── Step: Download a starter model ────────────────────────────────────────
function StepModel({
  models, selectedModel, setSelectedModel,
  pulling, pullMsg, pullPct, pullDone,
  onPull, onNext, onSkip, onBack,
}: {
  models: string[];
  selectedModel: string;
  setSelectedModel: (m: string) => void;
  pulling: boolean;
  pullMsg: string;
  pullPct: number | null;
  pullDone: boolean;
  onPull: () => void;
  onNext: () => void;
  onSkip: () => void;
  onBack: () => void;
}) {
  const alreadyHaveModel = models.includes(selectedModel) || models.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-bold text-text mb-1">Download a starter model</h2>
        <p className="text-xs text-muted">Choose a model to download. You can add more anytime from the Cookbook page.</p>
      </div>

      <div className="flex flex-col gap-2">
        {STARTER_MODELS.map((m) => {
          const installed = models.includes(m.name);
          const selected  = selectedModel === m.name;
          return (
            <button
              key={m.name}
              onClick={() => setSelectedModel(m.name)}
              disabled={pulling}
              className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all ${selected ? "border-accent/60 bg-accent/10" : "border-border bg-panel/40 hover:border-border/80"}`}
            >
              <div className={`h-4 w-4 rounded-full border-2 shrink-0 flex items-center justify-center ${selected ? "border-accent bg-accent" : "border-border"}`}>
                {selected && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium font-mono text-text">{m.name}</span>
                  {installed && <span className="text-[10px] rounded px-1.5 py-0.5 bg-green-500/20 text-green-400">Installed</span>}
                </div>
                <p className="text-xs text-muted">{m.note}</p>
              </div>
            </button>
          );
        })}
      </div>

      {(pulling || pullDone) && (
        <div className="rounded-xl border border-border bg-panel/40 p-4">
          <div className="flex items-center gap-2 text-xs text-muted mb-2">
            {pulling ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} className="text-green-400" />}
            {pullMsg}
          </div>
          {pulling && (
            <div className="h-1.5 rounded-full bg-border overflow-hidden">
              <div className="h-full rounded-full bg-accent transition-all duration-300" style={{ width: pullPct != null ? `${pullPct}%` : "20%" }} />
            </div>
          )}
        </div>
      )}

      <div className="flex justify-between">
        <button onClick={onBack} className="flex items-center gap-1 text-xs text-muted hover:text-text"><ChevronLeft size={14} /> Back</button>
        <div className="flex items-center gap-2">
          {!pullDone && !models.includes(selectedModel) && (
            <button onClick={onSkip} disabled={pulling} className="text-xs text-muted hover:text-text disabled:opacity-40">Skip</button>
          )}
          {!pullDone && !models.includes(selectedModel) ? (
            <button onClick={onPull} disabled={pulling} className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-40 hover:bg-accent/90">
              {pulling ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
              {pulling ? "Downloading…" : "Download"}
            </button>
          ) : (
            <button onClick={onNext} className="flex items-center gap-1.5 rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white hover:bg-accent/90">
              Continue <ChevronRight size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Step: API keys ─────────────────────────────────────────────────────────
function StepKeys({
  providers, keys, setKeys, onBack, onNext,
}: {
  providers: Providers;
  keys: Keys;
  setKeys: React.Dispatch<React.SetStateAction<Keys>>;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-bold text-text mb-1">API credentials</h2>
        <p className="text-xs text-muted">Enter your keys below. They're stored locally and never sent anywhere except to the respective provider.</p>
      </div>

      <div className="flex flex-col gap-4">
        {providers.openai && (
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">OpenAI API Key</label>
            <input
              type="password"
              value={keys.openaiKey}
              onChange={(e) => setKeys((k) => ({ ...k, openaiKey: e.target.value }))}
              placeholder="sk-…"
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-accent font-mono"
            />
          </div>
        )}
        {providers.anthropic && (
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Anthropic API Key</label>
            <input
              type="password"
              value={keys.anthropicKey}
              onChange={(e) => setKeys((k) => ({ ...k, anthropicKey: e.target.value }))}
              placeholder="sk-ant-…"
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-accent font-mono"
            />
          </div>
        )}
        {providers.lmstudio && (
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">LM Studio Server URL</label>
            <input
              value={keys.lmstudioUrl}
              onChange={(e) => setKeys((k) => ({ ...k, lmstudioUrl: e.target.value }))}
              placeholder="http://localhost:1234"
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-accent font-mono"
            />
          </div>
        )}
      </div>

      <div className="flex justify-between">
        <button onClick={onBack} className="flex items-center gap-1 text-xs text-muted hover:text-text"><ChevronLeft size={14} /> Back</button>
        <button onClick={onNext} className="flex items-center gap-1.5 rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white hover:bg-accent/90">
          Continue <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

// ── Step: Local Done ───────────────────────────────────────────────────────
function StepLocalDone({ onLaunch }: { onLaunch: () => void }) {
  return (
    <div className="flex flex-col items-center gap-8 text-center">
      <div className="h-16 w-16 rounded-full bg-accent/20 flex items-center justify-center">
        <CheckCircle2 size={32} className="text-accent" />
      </div>
      <div>
        <h2 className="text-xl font-bold text-text mb-2">All set!</h2>
        <p className="text-sm text-muted">Morpheus is ready to launch. Your settings are saved locally — nothing leaves your machine.</p>
      </div>
      <button
        onClick={onLaunch}
        className="flex items-center gap-2 rounded-xl bg-accent px-8 py-3 text-sm font-semibold text-white hover:bg-accent/90"
      >
        Launch Morpheus <ChevronRight size={16} />
      </button>
    </div>
  );
}

// ── Step: Remote SSH form ──────────────────────────────────────────────────
function StepRemoteSSH({
  form, setForm, onBack, onNext,
}: {
  form: { host: string; port: string; username: string; password: string; authType: "password" | "key"; keyPath: string; passphrase: string };
  setForm: React.Dispatch<React.SetStateAction<typeof form>>;
  onBack: () => void;
  onNext: () => void;
}) {
  const valid = form.host.trim() && form.username.trim() && (form.authType === "password" ? form.password : form.keyPath);

  async function browseKey() {
    const result = await bridge?.browseSshKey?.();
    if (result?.path) setForm((f) => ({ ...f, keyPath: result.path }));
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-bold text-text mb-1">Connect to your server</h2>
        <p className="text-xs text-muted">Morpheus will connect over SSH to check and install the backend automatically.</p>
      </div>

      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <label className="block text-xs font-medium text-muted mb-1">Hostname / IP</label>
            <input value={form.host} onChange={(e) => setForm((f) => ({ ...f, host: e.target.value }))} placeholder="192.168.1.10 or server.local" className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-accent" />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1">Port</label>
            <input value={form.port} onChange={(e) => setForm((f) => ({ ...f, port: e.target.value }))} className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-accent" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1">Username</label>
          <input value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-accent" />
        </div>

        <div className="flex gap-2">
          {(["password", "key"] as const).map((t) => (
            <button key={t} onClick={() => setForm((f) => ({ ...f, authType: t }))} className={`flex-1 rounded-lg border py-1.5 text-xs font-medium transition-all ${form.authType === t ? "border-accent bg-accent/10 text-accent" : "border-border text-muted hover:text-text"}`}>
              {t === "password" ? "Password" : "SSH Key"}
            </button>
          ))}
        </div>

        {form.authType === "password" ? (
          <div>
            <label className="block text-xs font-medium text-muted mb-1">Password</label>
            <input type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-accent" />
          </div>
        ) : (
          <div>
            <label className="block text-xs font-medium text-muted mb-1">SSH Private Key</label>
            <div className="flex gap-2">
              <input readOnly value={form.keyPath} placeholder="No key selected" className="flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-xs text-muted outline-none font-mono" />
              <button onClick={browseKey} className="rounded-lg border border-border px-3 text-xs text-muted hover:text-text">Browse</button>
            </div>
            <input value={form.passphrase} onChange={(e) => setForm((f) => ({ ...f, passphrase: e.target.value }))} placeholder="Passphrase (if required)" type="password" className="mt-2 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-accent" />
          </div>
        )}
      </div>

      <div className="flex justify-between">
        <button onClick={onBack} className="flex items-center gap-1 text-xs text-muted hover:text-text"><ChevronLeft size={14} /> Back</button>
        <button onClick={onNext} disabled={!valid} className="flex items-center gap-1.5 rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white disabled:opacity-40 hover:bg-accent/90">
          Connect & Check <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

// ── Step: Remote check + install ───────────────────────────────────────────
function StepRemoteCheck({
  host, checking, status, installing, log, error,
  logRef, onInstall, onConnect, onBack,
}: {
  host: string;
  checking: boolean;
  status: "unknown" | "ok" | "not-installed";
  installing: boolean;
  log: string;
  error: string | null;
  logRef: React.RefObject<HTMLPreElement | null>;
  onInstall: () => void;
  onConnect: () => void;
  onBack: () => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-bold text-text mb-1">Checking your server</h2>
        <p className="text-xs text-muted font-mono text-accent/80">{host}</p>
      </div>

      <div className="rounded-xl border border-border bg-panel/40 p-5 min-h-[100px] flex items-center justify-center">
        {checking && (
          <div className="flex flex-col items-center gap-2 text-sm text-muted">
            <Loader2 size={20} className="animate-spin text-accent" />
            <span>Connecting to server…</span>
          </div>
        )}
        {!checking && status === "ok" && (
          <div className="flex flex-col items-center gap-2 text-center">
            <CheckCircle2 size={24} className="text-green-400" />
            <p className="text-sm font-medium text-text">Morpheus is running on this server</p>
            <p className="text-xs text-muted">Ready to connect on port 7860</p>
          </div>
        )}
        {!checking && status === "not-installed" && !installing && (
          <div className="flex flex-col items-center gap-3 text-center">
            <AlertCircle size={24} className="text-yellow-400" />
            <div>
              <p className="text-sm font-medium text-text">Morpheus backend not found</p>
              <p className="text-xs text-muted mt-1">Install it on the server with one click</p>
            </div>
            <button onClick={onInstall} className="flex items-center gap-2 rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white hover:bg-accent/90">
              <Download size={14} /> Install on Server
            </button>
          </div>
        )}
        {installing && (
          <div className="w-full flex flex-col gap-3">
            <div className="flex items-center gap-2 text-xs text-accent">
              <Loader2 size={12} className="animate-spin" /> Installing Morpheus on server…
            </div>
            <pre ref={logRef} className="text-[10px] font-mono text-muted/80 max-h-40 overflow-y-auto whitespace-pre-wrap leading-relaxed">
              {log || "Connecting…"}
            </pre>
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-800/40 bg-red-950/30 px-4 py-3 text-xs text-red-300">
          <AlertCircle size={12} className="shrink-0 mt-0.5" /> {error}
        </div>
      )}

      <div className="flex justify-between">
        <button onClick={onBack} disabled={installing} className="flex items-center gap-1 text-xs text-muted hover:text-text disabled:opacity-40"><ChevronLeft size={14} /> Back</button>
        {status === "ok" && (
          <button onClick={onConnect} className="flex items-center gap-1.5 rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white hover:bg-accent/90">
            Open Morpheus <ChevronRight size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
