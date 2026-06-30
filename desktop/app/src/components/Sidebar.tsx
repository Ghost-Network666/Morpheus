export type View = "chat";

interface NavItem {
  id: View;
  label: string;
  icon: string;
  enabled: boolean;
}

const ITEMS: NavItem[] = [
  { id: "chat", label: "Chat", icon: "💬", enabled: true },
];

interface SidebarProps {
  active: View;
  onSelect: (view: View) => void;
}

export function Sidebar({ active, onSelect }: SidebarProps) {
  return (
    <div className="flex w-14 shrink-0 flex-col items-center gap-1 border-r border-border bg-panel py-3">
      {ITEMS.map((item) => (
        <button
          key={item.id}
          disabled={!item.enabled}
          onClick={() => onSelect(item.id)}
          title={item.label}
          className={`flex h-10 w-10 items-center justify-center rounded-lg text-lg transition-colors ${
            active === item.id
              ? "bg-accent/20 text-accent"
              : item.enabled
                ? "text-muted hover:bg-white/5 hover:text-text"
                : "cursor-not-allowed text-muted/30"
          }`}
        >
          {item.icon}
        </button>
      ))}
    </div>
  );
}
