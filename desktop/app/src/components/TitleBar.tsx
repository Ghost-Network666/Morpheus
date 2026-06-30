interface TitleBarProps {
  connectionName: string;
}

export function TitleBar({ connectionName }: TitleBarProps) {
  const isMac = navigator.platform.toLowerCase().includes("mac");

  return (
    <div
      className="titlebar-drag flex h-9 shrink-0 items-center justify-center border-b border-border bg-panel px-3 text-xs text-muted"
      style={{ paddingLeft: isMac ? 76 : 12 }}
    >
      <span className="font-medium text-text">Morpheus</span>
      <span className="mx-2 text-border">·</span>
      <span>{connectionName}</span>
    </div>
  );
}
