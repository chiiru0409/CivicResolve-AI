import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  fallbackMessage?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('CivicResolve Uncaught UI Error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[280px] p-6 flex items-center justify-center bg-[#0C0C0C] border border-[#E10600]/30 rounded-3xl m-4 text-center">
          <div className="max-w-md space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-[#E10600]/15 border border-[#E10600]/30 flex items-center justify-center mx-auto text-[#E10600]">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">
                {this.props.fallbackTitle || 'Component Error'}
              </h3>
              <p className="text-xs text-white/50 mt-1">
                {this.props.fallbackMessage || this.state.error?.message || 'An unexpected rendering error occurred in this section.'}
              </p>
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={this.handleReset}
                className="btn-primary py-2 px-4 text-xs font-bold inline-flex items-center gap-2"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Retry Section
              </button>
              <button
                onClick={() => window.location.reload()}
                className="btn-secondary py-2 px-4 text-xs font-bold inline-flex items-center gap-2"
              >
                Reload Application
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
