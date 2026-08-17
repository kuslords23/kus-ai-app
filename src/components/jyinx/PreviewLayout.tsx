"use client";

import { useMemo, useState } from "react";

export type PreviewDevice = "desktop" | "mobile";

type PreviewLayoutProps = {
  /** Route or absolute path the preview should load (e.g. "/"). */
  src?: string;
  /** Arbitrary HTML to render in the preview (instead of loading a route). */
  html?: string;
  title?: string;
  /** Default collapsed state. */
  defaultOpen?: boolean;
};

/**
 * Responsive split-screen preview pane (Lovable-style).
 *
 * Renders the live app output beside the IDE. A quick viewport switcher at the
 * top toggles between a Desktop frame and a Mobile frame so layouts can be
 * tested instantly across screen sizes.
 */
export function PreviewLayout({ src = "/", html, title = "Preview", defaultOpen = true }: PreviewLayoutProps) {
  const [device, setDevice] = useState<PreviewDevice>("desktop");
  const [open, setOpen] = useState(defaultOpen);

  // When `html` is provided, serve it inline via a blob URL so both device
  // frames render exactly the same content without a server round-trip.
  const htmlSrc = useMemo(
    () => (typeof html === "string" ? URL.createObjectURL(new Blob([html], { type: "text/html" })) : null),
    [html]
  );

  const frameSrc = htmlSrc ?? src;

  return (
    <section className="flex h-full min-h-0 flex-col border-l border-border bg-surface/40" aria-label={title}>
      <header className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="rounded-lg border border-gold/30 bg-gold/10 px-2 py-1 text-[11px] font-medium text-gold"
          title={open ? "Hide preview" : "Show preview"}
        >
          {open ? "▸ Hide preview" : "◂ Show preview"}
        </button>
        <span className="text-[10px] uppercase tracking-wider text-muted">Preview</span>

        <div className="ml-auto flex overflow-hidden rounded-lg border border-border" role="group" aria-label="Viewport size">
          <button
            type="button"
            onClick={() => setDevice("desktop")}
            aria-pressed={device === "desktop"}
            className={`px-2.5 py-1 text-[11px] ${device === "desktop" ? "bg-gold text-background" : "text-muted hover:text-foreground"}`}
          >
            ◻ Desktop
          </button>
          <button
            type="button"
            onClick={() => setDevice("mobile")}
            aria-pressed={device === "mobile"}
            className={`px-2.5 py-1 text-[11px] ${device === "mobile" ? "bg-gold text-background" : "text-muted hover:text-foreground"}`}
          >
            ◧ Mobile
          </button>
        </div>
      </header>

      {open && (
        <div className="grid min-h-0 flex-1 place-items-center overflow-auto bg-[#05030b] p-4">
          <div className="relative overflow-hidden rounded-xl border border-border bg-white shadow-2xl">
            {device === "desktop" ? (
              <iframe
                key={`desktop-${frameSrc}`}
                src={frameSrc}
                className="block h-[70vh] w-full"
                title={`${title} (desktop)`}
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                style={{ background: "#0d0917" }}
              />
            ) : (
              <div className="mx-auto w-72 overflow-hidden rounded-[1.75rem] border-[4px] border-surface-hover shadow-2xl">
                <div className="h-6 bg-surface-hover" aria-hidden />
                <div className="h-[560px]">
                  <iframe
                    key={`mobile-${frameSrc}`}
                    src={frameSrc}
                    className="h-full w-full border-0"
                    title={`${title} (mobile)`}
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                    style={{ background: "#0d0917" }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}