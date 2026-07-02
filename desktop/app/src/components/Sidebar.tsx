import {
  MessageSquare, Terminal, Globe, Brain, FileText, ListTodo,
  Calendar, Mail, Folder, Diamond, Shield, BookOpen, Link2,
  Settings, Server, Zap,
} from "lucide-react";
import { Tooltip } from "./ui/Tooltip";
import type { SystemInfo } from "../types";

export type View =
  | "chat" | "terminal" | "ssh" | "research" | "rag"
  | "notes" | "tasks" | "calendar" | "email" | "documents"
  | "obsidian" | "vault" | "cookbook" | "connections" | "settings";

interface NavItem {
  id: View;
  label: string;
  Icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
  moduleKey?: string;
}

const NAV_PRIMARY: NavItem[] = [
  { id: "chat",      label: "Chat",      Icon: MessageSquare },
  { id: "terminal",  label: "Terminal",  Icon: Terminal,  moduleKey: "terminal" },
  { id: "ssh",       label: "SSH",       Icon: Server,    moduleKey: "ssh"      },
  { id: "notes",     label: "Notes",     Icon: FileText,  moduleKey: "notes"    },
  { id: "tasks",     label: "Tasks",     Icon: ListTodo,  moduleKey: "tasks"    },
  { id: "calendar",  label: "Calendar",  Icon: Calendar,  moduleKey: "calendar" },
];

const NAV_KNOWLEDGE: NavItem[] = [
  { id: "research",  label: "Research",  Icon: Globe,     moduleKey: "research"  },
  { id: "rag",       label: "Memory",    Icon: Brain,     moduleKey: "rag"       },
  { id: "documents", label: "Documents", Icon: Folder,    moduleKey: "documents" },
  { id: "email",     label: "Email",     Icon: Mail,      moduleKey: "email"     },
  { id: "obsidian",  label: "Obsidian",  Icon: Diamond,   moduleKey: "obsidian"  },
];

const NAV_SYSTEM: NavItem[] = [
  { id: "vault",       label: "Vault",    Icon: Shield                               },
  { id: "cookbook",    label: "Models",   Icon: BookOpen,  moduleKey: "cookbook"    },
  { id: "connections", label: "Connect",  Icon: Link2,     moduleKey: "connections" },
];

interface SidebarProps {
  active: View;
  onSelect: (view: View) => void;
  systemInfo: SystemInfo | null;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function Sidebar({ active, onSelect, systemInfo }: SidebarProps) {
  const modules = systemInfo?.modules ?? {};
  const enabled = (item: NavItem) => !item.moduleKey || modules[item.moduleKey] !== false;

  const primary   = NAV_PRIMARY.filter(enabled);
  const knowledge = NAV_KNOWLEDGE.filter(enabled);
  const system    = NAV_SYSTEM.filter(enabled);

  return (
    <div className="relative flex w-14 shrink-0 flex-col items-center overflow-hidden"
      style={{ background: "var(--glass-bg)", borderRight: "1px solid var(--glass-border)" }}>

      {/* Logo */}
      <div className="flex h-12 w-full items-center justify-center shrink-0">
        <div className="flex h-7 w-7 items-center justify-center rounded-xl"
          style={{ background: "rgb(var(--color-accent-rgb) / 0.15)" }}>
          <Zap size={14} className="text-accent" />
        </div>
      </div>

      {/* Nav groups */}
      <div className="flex min-h-0 flex-1 flex-col items-center gap-0.5 overflow-y-auto overflow-x-hidden px-1.5 py-1 w-full">
        <NavGroup items={primary} active={active} onSelect={onSelect} />
        {knowledge.length > 0 && (
          <>
            <div className="my-1 w-6 shrink-0" style={{ height: 1, background: "var(--glass-border)" }} />
            <NavGroup items={knowledge} active={active} onSelect={onSelect} />
          </>
        )}
        {system.length > 0 && (
          <>
            <div className="my-1 w-6 shrink-0" style={{ height: 1, background: "var(--glass-border)" }} />
            <NavGroup items={system} active={active} onSelect={onSelect} />
          </>
        )}
      </div>

      {/* Settings pinned at bottom */}
      <div className="flex w-full flex-col items-center px-1.5 pb-2 shrink-0"
        style={{ borderTop: "1px solid var(--glass-border)" }}>
        <div className="pt-1.5">
          <NavIcon
            item={{ id: "settings", label: "Settings", Icon: Settings }}
            active={active === "settings"}
            onSelect={onSelect}
          />
        </div>
      </div>
    </div>
  );
}

function NavGroup({ items, active, onSelect }: {
  items: NavItem[];
  active: View;
  onSelect: (v: View) => void;
}) {
  return (
    <>
      {items.map((item) => (
        <NavIcon key={item.id} item={item} active={active === item.id} onSelect={onSelect} />
      ))}
    </>
  );
}

function NavIcon({ item, active, onSelect }: {
  item: NavItem;
  active: boolean;
  onSelect: (v: View) => void;
}) {
  return (
    <Tooltip content={item.label} side="right">
      <button
        onClick={() => onSelect(item.id)}
        className="relative flex h-9 w-9 items-center justify-center rounded-xl transition-all duration-100"
        style={{
          background: active ? "rgb(var(--color-accent-rgb) / 0.15)" : "transparent",
        }}
        onMouseEnter={(e) => {
          if (!active) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)";
        }}
        onMouseLeave={(e) => {
          if (!active) (e.currentTarget as HTMLElement).style.background = "transparent";
        }}
      >
        <item.Icon
          size={16}
          className={active ? "text-accent transition-colors" : "text-muted transition-colors"}
        />
        {active && (
          <span
            className="absolute left-0 top-1/2 -translate-y-1/2 rounded-r"
            style={{
              width: 3,
              height: 16,
              background: "rgb(var(--color-accent-rgb))",
              boxShadow: "2px 0 8px rgb(var(--color-accent-rgb) / 0.6)",
            }}
          />
        )}
      </button>
    </Tooltip>
  );
}
