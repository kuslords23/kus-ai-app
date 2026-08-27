"use client";

import { Component, ReactNode } from "react";

interface Props { children: ReactNode; fallback?: ReactNode; }

interface State { hasError: boolean; error: Error | null; }

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error("[ErrorBoundary]", error, info);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex min-h-screen items-center justify-center bg-background px-4">
          <div className="max-w-sm text-center space-y-4">
            <div className="mx-auto h-14 w-14 rounded-2xl bg-red-500/15 flex items-center justify-center">
              <svg className="h-7 w-7 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
            </div>
            <p className="text-sm font-semibold">Something went wrong</p>
            <p className="text-xs text-muted mt-1">{this.state.error?.message ?? "An unexpected error occurred."}</p>
            <button onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}
              className="rounded-xl bg-gold/15 border border-gold/30 px-4 py-2 text-xs font-medium text-gold">
              Reload App
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}