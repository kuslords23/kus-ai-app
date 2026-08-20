"use client";

interface ModelFailureFallbackProps {
  provider: string;
  model: string;
  error: string;
  onRetry?: () => void;
  onSwitchProvider?: () => void;
  className?: string;
}

export function ModelFailureFallback({ provider, model, error, onRetry, onSwitchProvider, className }: ModelFailureFallbackProps) {
  const isAuthError = error.toLowerCase().includes("unauthorized") || error.toLowerCase().includes("missing authentication");
  const isRateLimited = error.toLowerCase().includes("429") || error.toLowerCase().includes("rate limit");
  const isCreditExhausted = error.toLowerCase().includes("balance") || error.toLowerCase().includes("quota") || error.toLowerCase().includes("credit");
  const isModelNotFound = error.toLowerCase().includes("not found") || error.toLowerCase().includes("deprecated");

  let title = "Model unavailable";
  let suggestion = "The AI endpoint returned an error. You can retry or switch models.";
  let badgeColor = "bg-red-500/15 text-red-400";

  if (isAuthError) {
    title = "Authentication required";
    suggestion = "API key missing or invalid. Add or update it in Settings.";
    badgeColor = "bg-amber-500/15 text-amber-400";
  } else if (isRateLimited) {
    title = "Rate limit reached";
    suggestion = "Try again later or switch to a different free-tier model.";
    badgeColor = "bg-orange-500/15 text-orange-400";
  } else if (isCreditExhausted) {
    title = "Insufficient credits";
    suggestion = "Purchase credits or switch to a free-tier model.";
    badgeColor = "bg-purple-500/15 text-purple-400";
  } else if (isModelNotFound) {
    title = "Model not available";
    suggestion = "This model may have been deprecated. Falling back to an alternative.";
    badgeColor = "bg-blue-500/15 text-blue-400";
  }

  return (
    <div className={`rounded-2xl border border-border bg-background/80 p-4 ${className ?? ""}`}>
      <div className="flex items-start gap-3">
        <div className={`flex-shrink-0 h-8 w-8 rounded-xl ${badgeColor} flex items-center justify-center`}>
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold">{title}</p>
          <p className="text-[11px] text-muted mt-0.5">{suggestion}</p>
          <p className="text-[10px] text-muted mt-1 truncate">{provider} / {model}</p>
          <div className="flex gap-2 mt-3">
            {onRetry && <button onClick={onRetry} className="rounded-lg bg-gold/15 border border-gold/30 px-3 py-1.5 text-[11px] font-medium text-gold">Retry</button>}
            {onSwitchProvider && <button onClick={onSwitchProvider} className="rounded-lg border border-border px-3 py-1.5 text-[11px] text-muted">Switch provider</button>}
          </div>
        </div>
      </div>
    </div>
  );
}