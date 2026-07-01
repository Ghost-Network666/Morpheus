import { Component, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
  name?: string;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error(`[ErrorBoundary:${this.props.name ?? "unknown"}]`, error, info.componentStack);
  }

  reset() {
    this.setState({ hasError: false, error: null });
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-950/40 border border-red-800/30">
          <AlertTriangle size={22} className="text-red-400" />
        </div>
        <div>
          <p className="text-sm font-medium text-text mb-1">
            {this.props.name ? `${this.props.name} crashed` : "Something went wrong"}
          </p>
          <p className="text-xs text-muted max-w-xs">
            {this.state.error?.message ?? "An unexpected error occurred."}
          </p>
        </div>
        <button
          onClick={() => this.reset()}
          className="flex items-center gap-1.5 rounded-lg bg-accent/10 border border-accent/20 px-4 py-2 text-xs font-medium text-accent hover:bg-accent/20 transition-colors"
        >
          <RefreshCw size={12} /> Try Again
        </button>
      </div>
    );
  }
}
