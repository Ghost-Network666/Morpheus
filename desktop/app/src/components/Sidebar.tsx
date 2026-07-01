import {
  MessageSquare, Terminal, Globe, Brain, FileText, ListTodo,
  Calendar, Mail, Folder, Diamond, Shield, BookOpen, Link2,
  Settings, Server, ChevronLeft, ChevronRight,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Tooltip } from "./ui/Tooltip";
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
  group?: "primary" | "knowledge" | "system";
}

const NAV_ITEMS: NavItem[] = [
  { id: "chat",        label: "Chat",       Icon: MessageSquare,  group: "primary"   },
  { id: "terminal",    label: "Terminal",   Icon: Terminal,  moduleKey: "terminal",  group: "primary"   },
  { id: "ssh",         label: "SSH",        Icon: Server,    moduleKey: "ssh",       group: "primary"   },
  { id: "notes",       label: "Notes",      Icon: FileText,  moduleKey: "notes",     group: "primary"   },
  { id: "tasks",       label: "Tasks",      Icon: ListTodo,  moduleKey: "tasks",     group: "primary"   },
  { id: "calendar",    label: "Calendar",   Icon: Calendar,  moduleKey: "calendar",  group: "primary"   },
  { id: "research",    label: "Research",   Icon: Globe,     moduleKey: "research",  group: "knowledge" },
  { id: "rag",         label: "Memory",     Icon: Brain,     moduleKey: "rag",       group: "knowledge" },
  { id: "documents",   label: "Documents",  Icon: Folder,    moduleKey: "documents", group: "knowledge" },
  { id: "email",       label: "Email",      Icon: Mail,      moduleKey: "email",     group: "knowledge" },
  { id: "obsidian",    label: "Obsidian",   Icon: Diamond,   moduleKey: "obsidian",  group: "knowledge" },
  { id: "vault",       label: "Vault",      Icon: Shield,                            group: "system"    },
  { id: "cookbook",    label: "Cookbook",   Icon: BookOpen,  moduleKey: "cookbook",  group: "system"    },
  { id: "connections", label: "Connect",    Icon: Link2,     moduleKey: "connections",group: "system"  },
];

interface SidebarProps {
  active: View;
  onSelect: (view: View) => void;
  systemInfo: SystemInfo | null;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

const SIDEBAR_W = { expanded: 220, collapsed: 56 };

const sidebarVariants = {
  expanded:  { width: SIDEBAR_W.expanded },
  collapsed: { width: SIDEBAR_W.collapsed },
};

export function Sidebar({ active, onSelect, systemInfo, collapsed, onToggleCollapse }: SidebarProps) {
  const modules = systemInfo?.modules ?? {};

  const isEnabled = (item: NavItem) => {
    if (!item.moduleKey) return true;
    return modules[item.moduleKey] !== false;
  };

  const grouped = {
    primary:   NAV_ITEMS.filter((i) => i.group === "primary"   && isEnabled(i)),
    knowledge: NAV_ITEMS.filter((i) => i.group === "knowledge" && isEnabled(i)),
    system:    NAV_ITEMS.filter((i) => i.group === "system"    && isEnabled(i)),
  };

  return (
    <motion.div
      variants={sidebarVariants}
      animate={collapsed ? "collapsed" : "expanded"}
      transition={{ duration: 0.15, ease: "easeOut" }}
      className="relative flex shrink-0 flex-col glass border-r overflow-hidden"
      style={{ willChange: "width" }}
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden py-2">
        <NavGroup items={grouped.primary}   active={active} collapsed={collapsed} onSelect={onSelect} />
        <AnimatePresence>
          {grouped.knowledge.length > 0 && (
            <NavGroup
              key="knowledge"
              items={grouped.knowledge}
              active={active}
              collapsed={collapsed}
              onSelect={onSelect}
              label="Knowledge"
            />
          )}
        </AnimatePresence>
        <AnimatePresence>
          {grouped.system.length > 0 && (
            <NavGroup
              key="system"
              items={grouped.system}
              active={active}
              collapsed={collapsed}
              onSelect={onSelect}
            />
          )}
        </AnimatePresence>
      </div>

      <div className="border-t py-1.5 shrink-0" style={{ borderColor: "var(--glass-border)" }}>
        <NavBtn
          item={{ id: "settings", label: "Settings", Icon: Settings }}
          active={active === "settings"}
          collapsed={collapsed}
          onClick={() => onSelect("settings")}
        />
        <button
          onClick={onToggleCollapse}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="flex h-8 w-full items-center gap-2 px-3 text-xs text-muted hover:text-text transition-colors"
        >
          {collapsed ? (
            <ChevronRight size={13} className="mx-auto" />
          ) : (
            <>
              <ChevronLeft size={13} />
              <AnimatePresence>
                <motion.span
                  key="collapse-label"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.1 }}
                >
                  Collapse
                </motion.span>
              </AnimatePresence>
            </>
          )}
        </button>
      </div>
    </motion.div>
  );
}

function NavGroup({
  items, active, collapsed, onSelect, label,
}: {
  items: NavItem[];
  active: View;
  collapsed: boolean;
  onSelect: (v: View) => void;
  label?: string;
}) {
  if (!items.length) return null;
  return (
    <div className="px-1.5 py-1">
      <AnimatePresence>
        {label && !collapsed && (
          <motion.p
            key={`label-${label}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.1 }}
            className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-widest text-muted/50"
          >
            {label}
          </motion.p>
        )}
      </AnimatePresence>
      {items.map((item) => (
        <NavBtn
          key={item.id}
          item={item}
          active={active === item.id}
          collapsed={collapsed}
          onClick={() => onSelect(item.id)}
        />
      ))}
    </div>
  );
}

function NavBtn({
  item, active, collapsed, onClick,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  onClick: () => void;
}) {
  const button = (
    <button
      onClick={onClick}
      className={`
        relative flex h-8 w-full items-center gap-2.5 rounded-lg px-2
        text-xs font-medium transition-colors duration-100
        ${active
          ? "bg-white/[0.08] text-text active-glow"
          : "text-muted hover:bg-white/[0.05] hover:text-text"
        }
      `}
    >
      <item.Icon
        size={15}
        className={`shrink-0 ${active ? "text-accent" : ""}`}
      />
      <AnimatePresence>
        {!collapsed && (
          <motion.span
            key={`label-${item.id}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.1 }}
            className="truncate"
          >
            {item.label}
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );

  if (collapsed) {
    return <Tooltip content={item.label} side="right">{button}</Tooltip>;
  }
  return button;
}
