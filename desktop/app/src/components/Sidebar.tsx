import {
  MessageSquare, Terminal, Globe, Brain, FileText, ListTodo,
  Calendar, Mail, Folder, Diamond, Shield, BookOpen, Link2,
  Settings, Server, ChevronLeft, ChevronRight,
} from "lucide-react";
import type { SystemInfo } from "../types";

export type View =
  | "chat" | "terminal" | "ssh" | "research" | "rag"
  | "notes" | "tasks" | "calendar" | "email" | "documents"
  | "obsidian" | "vault" | "cookbook" | "connections" | "settings";

interface NavItem {
  id: View;
  label: string;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
  moduleKey?: string;
}

const MAIN_ITEMS: NavItem[] = [
  { id: "chat",        label: "Chat",       Icon: MessageSquare },
  { id: "terminal",    label: "Terminal",   Icon: Terminal,    moduleKey: "terminal" },
  { id: "ssh",         label: "SSH",        Icon: Server,      moduleKey: "ssh" },
  { id: "research",    label: "Research",   Icon: Globe,       moduleKey: "research" },
  { id: "rag",         label: "Memory",     Icon: Brain,       moduleKey: "rag" },
  { id: "notes",       label: "Notes",      Icon: FileText,    moduleKey: "notes" },
  { id: "tasks",       label: "Tasks",      Icon: ListTodo,    moduleKey: "tasks" },
  { id: "calendar",    label: "Calendar",   Icon: Calendar,    moduleKey: "calendar" },
  { id: "email",       label: "Email",      Icon: Mail,        moduleKey: "email" },
  { id: "documents",   label: "Documents",  Icon: Folder,      moduleKey: "documents" },
  { id: "obsidian",    label: "Obsidian",   Icon: Diamond,     moduleKey: "obsidian" },
  { id: "vault",       label: "Vault",      Icon: Shield },
  { id: "cookbook",    label: "Cookbook",   Icon: BookOpen,    moduleKey: "cookbook" },
  { id: "connections", label: "Connect",    Icon: Link2,       moduleKey: "connections" },
];

interface SidebarProps {
  active: View;
  onSelect: (view: View) => void;
  systemInfo: SystemInfo | null;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export function Sidebar({ active, onSelect, systemInfo, collapsed, onToggleCollapse }: SidebarProps) {
  const modules = systemInfo?.modules ?? {};

  const isEnabled = (item: NavItem) => {
    if (!item.moduleKey) return true;
    return modules[item.moduleKey] !== false;
  };

  const visibleItems = MAIN_ITEMS.filter(isEnabled);

  return (
    <div
      className={`flex shrink-0 flex-col border-r border-border bg-panel transition-all duration-200 ${
        collapsed ? "w-14" : "w-48"
      }`}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto py-2 px-1.5">
        {visibleItems.map((item) => (
          <NavButton
            key={item.id}
            item={item}
            active={active === item.id}
            collapsed={collapsed}
            onClick={() => onSelect(item.id)}
          />
        ))}
      </div>

      <div className="border-t border-border px-1.5 py-2 flex flex-col gap-0.5">
        <NavButton
          item={{ id: "settings", label: "Settings", Icon: Settings }}
          active={active === "settings"}
          collapsed={collapsed}
          onClick={() => onSelect("settings")}
        />
        <button
          onClick={onToggleCollapse}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-xs text-muted hover:bg-white/5 hover:text-text transition-colors"
        >
          {collapsed
            ? <ChevronRight size={14} />
            : <><ChevronLeft size={14} /><span>Collapse</span></>
          }
        </button>
      </div>
    </div>
  );
}

function NavButton({
  item, active, collapsed, onClick,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={collapsed ? item.label : undefined}
      className={`flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-xs font-medium transition-colors ${
        active
          ? "bg-accent/15 text-accent"
          : "text-muted hover:bg-white/5 hover:text-text"
      }`}
    >
      <item.Icon size={15} className="shrink-0" />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </button>
  );
}
