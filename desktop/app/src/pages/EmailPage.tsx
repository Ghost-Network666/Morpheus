import { useEffect, useState } from "react";
import { Mail, RefreshCw, AlertCircle } from "lucide-react";
import { api } from "../lib/api";
import type { EmailMessage, EmailAccount } from "../types";

export function EmailPage() {
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [messages, setMessages] = useState<EmailMessage[]>([]);
  const [selected, setSelected] = useState<EmailMessage | null>(null);
  const [activeAccount, setActiveAccount] = useState<number | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { loadAccounts(); }, []);

  async function loadAccounts() {
    try {
      const accts = await api.listEmailAccounts();
      setAccounts(accts);
      if (accts.length > 0) {
        setActiveAccount(accts[0].id);
        loadMessages(accts[0].id);
      } else {
        setLoading(false);
      }
    } catch (e) {
      setError(String(e));
      setLoading(false);
    }
  }

  async function loadMessages(accountId?: number) {
    try {
      setLoading(true);
      setError(null);
      setMessages(await api.listEmails(accountId));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <Loading />;

  if (accounts.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-muted p-8">
        <Mail size={48} className="opacity-20" />
        <p className="text-sm font-medium text-text">No email accounts configured</p>
        <p className="text-xs text-center max-w-xs">
          Add an IMAP email account in Settings → Email to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-1">
      {/* Accounts + message list */}
      <div className="flex w-72 shrink-0 flex-col border-r border-border bg-panel/60">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <select
            value={activeAccount}
            onChange={(e) => { setActiveAccount(Number(e.target.value)); loadMessages(Number(e.target.value)); }}
            className="flex-1 bg-transparent text-xs text-text outline-none"
          >
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.email}</option>)}
          </select>
          <button onClick={() => loadMessages(activeAccount)} className="text-muted hover:text-text">
            <RefreshCw size={13} />
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-1.5 border-b border-border bg-red-950/30 px-3 py-2 text-xs text-red-300">
            <AlertCircle size={12} /> {error}
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <p className="px-3 py-4 text-xs text-muted text-center">No messages</p>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                onClick={() => setSelected(msg)}
                className={`cursor-pointer border-b border-border/50 px-3 py-2.5 transition-colors hover:bg-white/5 ${
                  selected?.id === msg.id ? "bg-accent/10" : ""
                } ${!msg.read ? "border-l-2 border-l-accent" : ""}`}
              >
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <span className={`truncate text-xs ${!msg.read ? "font-semibold text-text" : "text-muted"}`}>
                    {msg.from_addr}
                  </span>
                  <span className="shrink-0 text-[10px] text-muted/60">
                    {new Date(msg.date).toLocaleDateString()}
                  </span>
                </div>
                <p className={`truncate text-xs ${!msg.read ? "text-text" : "text-muted/80"}`}>{msg.subject}</p>
                <p className="truncate text-[11px] text-muted/60 mt-0.5">{msg.snippet}</p>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Message view */}
      <div className="flex min-w-0 flex-1 flex-col">
        {!selected ? (
          <div className="flex flex-1 items-center justify-center flex-col gap-3 text-muted">
            <Mail size={40} className="opacity-20" />
            <p className="text-sm">Select a message</p>
          </div>
        ) : (
          <>
            <div className="border-b border-border bg-panel/40 px-6 py-4">
              <h2 className="text-sm font-semibold text-text">{selected.subject}</h2>
              <p className="text-xs text-muted mt-1">
                From: {selected.from_addr} · {new Date(selected.date).toLocaleString()}
              </p>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <p className="text-sm text-text/80 whitespace-pre-wrap leading-relaxed">
                {selected.snippet}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Loading() {
  return (
    <div className="flex flex-1 items-center justify-center text-muted text-sm">Loading…</div>
  );
}
