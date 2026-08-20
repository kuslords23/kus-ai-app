"use client";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html>
      <body className="bg-background text-foreground">
        <div className="flex min-h-screen items-center justify-center px-4">
          <div className="max-w-sm text-center space-y-4">
            <div className="mx-auto h-14 w-14 rounded-2xl bg-red-500/15 flex items-center justify-center">
              <svg className="h-7 w-7 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <p className="text-sm font-semibold">Critical Error</p>
            <p className="text-xs text-muted">{error.message || "A fatal error occurred."}</p>
            <button onClick={reset} className="rounded-xl bg-gold/15 border border-gold/30 px-4 py-2 text-xs font-medium text-gold">
              Try Again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}