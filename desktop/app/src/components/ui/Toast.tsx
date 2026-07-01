import * as RadixToast from "@radix-ui/react-toast";
import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";

type ToastType = "success" | "error" | "info";

interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
}

interface ToastContextValue {
  toast: (title: string, opts?: { type?: ToastType; description?: string }) => void;
}

const ToastCtx = createContext<ToastContextValue>({ toast: () => {} });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const toast = useCallback(
    (title: string, opts?: { type?: ToastType; description?: string }) => {
      const id = Math.random().toString(36).slice(2);
      setItems((prev) => [
        ...prev,
        { id, title, type: opts?.type ?? "info", description: opts?.description },
      ]);
    },
    [],
  );

  function dismiss(id: string) {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }

  const ICONS: Record<ToastType, ReactNode> = {
    success: <CheckCircle2 size={14} className="text-green-400 shrink-0" />,
    error:   <AlertCircle  size={14} className="text-red-400 shrink-0" />,
    info:    <Info         size={14} className="text-accent shrink-0" />,
  };

  return (
    <ToastCtx.Provider value={{ toast }}>
      <RadixToast.Provider swipeDirection="right" duration={4000}>
        {children}
        {items.map((item) => (
          <RadixToast.Root
            key={item.id}
            className="toast-root glass-panel border rounded-xl px-4 py-3 flex items-start gap-3 shadow-lg shadow-black/30"
            onOpenChange={(open) => { if (!open) dismiss(item.id); }}
          >
            {ICONS[item.type]}
            <div className="flex-1 min-w-0">
              <RadixToast.Title className="text-xs font-medium text-text">
                {item.title}
              </RadixToast.Title>
              {item.description && (
                <RadixToast.Description className="mt-0.5 text-xs text-muted line-clamp-2">
                  {item.description}
                </RadixToast.Description>
              )}
            </div>
            <RadixToast.Close asChild>
              <button className="shrink-0 text-muted hover:text-text transition-colors">
                <X size={12} />
              </button>
            </RadixToast.Close>
          </RadixToast.Root>
        ))}
        <RadixToast.Viewport className="toast-viewport" />
      </RadixToast.Provider>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  return useContext(ToastCtx).toast;
}
