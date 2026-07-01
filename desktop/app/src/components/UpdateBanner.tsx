import { X, Download } from "lucide-react";

interface Props {
  version: string;
  onInstall: () => void;
  onDismiss: () => void;
}

export function UpdateBanner({ version, onInstall, onDismiss }: Props) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-3 bg-accent/15 border-b border-accent/30 px-4 py-2 text-xs">
      <div className="flex items-center gap-2">
        <Download size={12} className="text-accent shrink-0" />
        <span className="text-text">
          Morpheus <span className="font-semibold text-accent">{version}</span> is ready to install
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onInstall}
          className="rounded bg-accent px-2.5 py-1 font-medium text-white hover:bg-accent/90 transition-colors"
        >
          Restart &amp; Update
        </button>
        <button
          onClick={onDismiss}
          className="text-muted hover:text-text transition-colors"
          title="Dismiss"
        >
          <X size={13} />
        </button>
      </div>
    </div>
  );
}
