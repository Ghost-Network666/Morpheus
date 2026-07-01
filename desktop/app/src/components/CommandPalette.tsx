import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  MessageSquare, Terminal, Server, FileText, ListTodo,
  Calendar, Globe, Brain, Folder, Mail, Diamond, Shield,
  BookOpen, Link2, Settings, ArrowRight, Search,
} from "lucide-react";
import type { View } from "./Sidebar";

interface PaletteAction {
  id: string;
  label: string;
  group: string;
  view: View;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
}

const ACTIONS: PaletteAction[] = [
  { id: "go-chat",        label: "Go to Chat",        group: "Navigate", view: "chat",        Icon: MessageSquare },
  { id: "go-terminal",   label: "Go to Terminal",     group: "Navigate", view: "terminal",    Icon: Terminal      },
  { id: "go-ssh",        label: "Go to SSH",          group: "Navigate", view: "ssh",         Icon: Server        },
  { id: "go-notes",      label: "Go to Notes",        group: "Navigate", view: "notes",       Icon: FileText      },
  { id: "go-tasks",      label: "Go to Tasks",        group: "Navigate", view: "tasks",       Icon: ListTodo      },
  { id: "go-calendar",   label: "Go to Calendar",     group: "Navigate", view: "calendar",    Icon: Calendar      },
  { id: "go-research",   label: "Go to Research",     group: "Knowledge", view: "research",   Icon: Globe         },
  { id: "go-rag",        label: "Go to Memory (RAG)", group: "Knowledge", view: "rag",        Icon: Brain         },
  { id: "go-documents",  label: "Go to Documents",    group: "Knowledge", view: "documents",  Icon: Folder        },
  { id: "go-email",      label: "Go to Email",        group: "Knowledge", view: "email",      Icon: Mail          },
  { id: "go-obsidian",   label: "Go to Obsidian",     group: "Knowledge", view: "obsidian",   Icon: Diamond       },
  { id: "go-vault",      label: "Go to Vault",        group: "System",   view: "vault",       Icon: Shield        },
  { id: "go-cookbook",   label: "Go to Cookbook",     group: "System",   view: "cookbook",    Icon: BookOpen      },
  { id: "go-connections",label: "Go to Connections",  group: "System",   view: "connections", Icon: Link2         },
  { id: "go-settings",   label: "Go to Settings",     group: "System",   view: "settings",    Icon: Settings      },
];

function score(action: PaletteAction, q: string): number {
  const label = action.label.toLowerCase();
  const query = q.toLowerCase();
  if (label.startsWith(query)) return 3;
  const withoutGo = label.replace("go to ", "");
  if (withoutGo.startsWith(query)) return 2;
  if (label.includes(query)) return 1;
  return 0;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onNavigate: (view: View) => void;
}

export function CommandPalette({ open, onClose, onNavigate }: Props) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = query.trim()
    ? ACTIONS.filter((a) => score(a, query.trim()) > 0)
        .sort((a, b) => score(b, query.trim()) - score(a, query.trim()))
    : ACTIONS;

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelected(0);
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [open]);

  useEffect(() => { setSelected(0); }, [query]);

  function onKeyDown(e: React.KeyboardEvent) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelected((s) => Math.min(s + 1, results.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelected((s) => Math.max(s - 1, 0));
        break;
      case "Enter":
        if (results[selected]) {
          onNavigate(results[selected].view);
          onClose();
        }
        break;
      case "Escape":
        onClose();
        break;
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="cmd-overlay" />
        <Dialog.Content
          className="cmd-content"
          onKeyDown={onKeyDown}
          aria-describedby={undefined}
        >
          <Dialog.Title className="sr-only">Command Palette</Dialog.Title>

          {/* Search bar */}
          <div className="cmd-search-row">
            <Search size={14} className="shrink-0 text-muted" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search actions…"
              className="cmd-input"
            />
            <kbd className="cmd-esc-key">Esc</kbd>
          </div>

          {/* Results */}
          <div className="cmd-list">
            {results.length === 0 ? (
              <p className="cmd-empty">No actions found</p>
            ) : (
              results.map((action, i) => (
                <button
                  key={action.id}
                  className={`cmd-item${i === selected ? " cmd-item--active" : ""}`}
                  onMouseEnter={() => setSelected(i)}
                  onClick={() => { onNavigate(action.view); onClose(); }}
                >
                  <span className="cmd-item-icon">
                    <action.Icon size={14} />
                  </span>
                  <span className="cmd-item-label">{action.label}</span>
                  <span className="cmd-item-group">{action.group}</span>
                  <ArrowRight size={11} className="shrink-0 text-muted/40" />
                </button>
              ))
            )}
          </div>

          {results.length > 0 && (
            <div className="cmd-footer">
              <span>↑↓ navigate</span>
              <span className="mx-1 opacity-30">·</span>
              <span>↵ open</span>
              <span className="mx-1 opacity-30">·</span>
              <span>Esc close</span>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
