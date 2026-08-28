"use client";

/**
 * Preview page — receives generated HTML via sessionStorage or query params
 * and renders it in the PreviewLayout with desktop/mobile/device switcher.
 * Users can test their built app, blog, or 3D game here.
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PreviewLayout } from "@/components/jyinx/PreviewLayout";

export function PreviewPage() {
  const [html, setHtml] = useState<string | null>(null);
  const [title, setTitle] = useState("Preview");
  const [stack, setStack] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Try to load from sessionStorage (set by the builder panel)
    try {
      const stored = sessionStorage.getItem("jyinx_preview_html");
      const storedTitle = sessionStorage.getItem("jyinx_preview_title");
      const storedStack = sessionStorage.getItem("jyinx_preview_stack");
      if (stored) {
        setHtml(stored);
        if (storedTitle) setTitle(storedTitle);
        if (storedStack) setStack(storedStack);
        return;
      }
    } catch {
      /* ignore */
    }

    // Fallback: load from URL hash (for sharing links)
    try {
      const hash = window.location.hash.slice(1);
      if (hash) {
        const decoded = decodeURIComponent(hash);
        setHtml(decoded);
        return;
      }
    } catch {
      /* ignore */
    }

    // No content found — show a demo scene
    setError("No preview content found. Build something in the Jyinx Builder first.");
  }, []);

  const previewHtml = useMemo(() => {
    if (html) return html;
    // Default demo 3D scene if nothing is stored
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Jyinx Preview</title><style>*{margin:0;padding:0;box-sizing:border-box}body{background:#0d0917;color:#e7e2f0;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;flex-direction:column;gap:16px;padding:20px;text-align:center}h1{color:#f6c945;font-size:1.5rem}p{color:#8d85aa;max-width:400px}.card{border:1px solid #2a2440;border-radius:14px;padding:24px;background:#141024}.btn{background:#f6c945;color:#0d0917;border:0;padding:10px 20px;border-radius:10px;font-weight:600;cursor:pointer;text-decoration:none}</style></head><body><div class="card"><h1>Jyinx Preview</h1><p>Your built app, blog, or 3D game will appear here. Go build something!</p><a href="/jyinx" class="btn" style="display:inline-block;margin-top:12px">← Back to Jyinx</a></div></body></html>`;
  }, [html]);

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="flex shrink-0 items-center gap-2 border-b border-border bg-background/90 px-4 py-3">
        <Link href="/jyinx" className="shrink-0 rounded-lg border border-gold/30 bg-gold/10 px-3 py-1.5 text-xs font-medium text-gold hover:bg-gold/15 transition-colors">
          ← Jyinx
        </Link>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{title}</p>
          <p className="truncate text-[10px] text-muted">
            Preview{stack ? ` · ${stack}` : ""} · {html ? `${(html.length / 1024).toFixed(0)} KB` : "demo"}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {html && (
            <button
              type="button"
              onClick={() => {
                try {
                  sessionStorage.setItem("jyinx_preview_html", html);
                  sessionStorage.setItem("jyinx_preview_title", title);
                  navigator.clipboard?.writeText(`${window.location.origin}/jyinx/preview#${encodeURIComponent(html)}`);
                  alert("Preview URL copied to clipboard!");
                } catch {
                  /* ignore */
                }
              }}
              className="rounded-lg border border-border px-2.5 py-1.5 text-[11px] text-muted hover:text-foreground transition-colors"
            >
              Share
            </button>
          )}
          <Link
            href="/jyinx"
            className="rounded-lg bg-gold px-3 py-1.5 text-xs font-semibold text-background hover:bg-gold/90 transition-colors"
          >
            Build More
          </Link>
        </div>
      </header>

      {error && (
        <div className="shrink-0 border-b border-gold/25 bg-gold/5 px-4 py-2 text-xs text-gold">{error}</div>
      )}

      <div className="min-h-0 flex-1">
        <PreviewLayout src={undefined} html={previewHtml} title={title} defaultOpen />
      </div>
    </div>
  );
}