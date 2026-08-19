"use client";

/**
 * MessageRenderer — safe, link-aware renderer for Royal / Jyinx assistant text.
 *
 * Renders:
 *  - legacy `**bold**` spans (used across hub-style answers)
 *  - inline code (`...`) as monospace
 *  - raw URLs and markdown links as clickable anchors
 *    (`<a target="_blank" rel="noopener noreferrer">`) with anti-spoof masks
 *    for long URLs.
 *
 * Purely regex-based — no dangerouslySetInnerHTML, so it cannot inject HTML.
 */

import type { ReactNode } from "react";

const RAW_URL_RE =
  /(\b(?:https?|ftp):\/\/[^\s<>()[\]"']+|\bwww\.[a-z0-9-]+(?:\.[a-z0-9-]+)+(?::\d+)?(?:[^\s<>()[\]"']*)?)/gi;

function sanitizeHref(href: string): string | null {
  const h = href.trim();
  if (!h || /^javascript:/i.test(h) || /^data:/i.test(h)) return null;
  if (/^www\./i.test(h)) return `https://${h}`;
  if (!/^https?:/i.test(h)) {
    // Bare domains without scheme → treat as https.
    if (/^[a-z0-9-]+(?:\.[a-z0-9-]+)+(?::\d+)?(?:\/|$)/i.test(h)) return `https://${h}`;
    return null;
  }
  return h;
}

function displayForUrl(url: string): string {
  try {
    const u = new URL(/^[a-z]+:\/\//i.test(url) ? url : `https://${url}`);
    const host = u.hostname.replace(/^www\./, "");
    const rest = (u.pathname + u.search).replace(/\/$/, "");
    return rest ? `${host}${rest.length > 42 ? `${rest.slice(0, 42)}…` : rest}` : host;
  } catch {
    return url;
  }
}

/** Detects & renders markdown links, then raw URLs / bare domains. */
function LinkInline({ children }: { children: string }): ReactNode {
  const mdParts = children.split(/(\[[^\]]+\]\([^)\s]+(?:\s+"[^"]*")?\))/g);
  return mdParts.map((part, idx) => {
    const md = /^\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)$/.exec(part.trim());
    if (md) {
      const href = sanitizeHref(md[2]);
      if (!href) return <span key={idx}>{part}</span>;
      return (
        <a key={idx} href={href} target="_blank" rel="noopener noreferrer" className="text-gold underline decoration-gold/40 underline-offset-2 hover:decoration-gold">
          {md[1]}
        </a>
      );
    }
    const rawParts = part.split(RAW_URL_RE);
    return rawParts.map((chunk, j) => {
      if (!chunk) return null;
      const trimmed = chunk.trim();
      const isLink = /^(?:https?|ftp):\/\//i.test(trimmed) || /^www\./i.test(trimmed) || /^[a-z0-9-]+(?:\.[a-z0-9-]+)+(?::\d+)?(?:\/|$)/i.test(trimmed);
      if (isLink) {
        const href = sanitizeHref(trimmed);
        if (!href) return <span key={`${idx}-${j}`}>{chunk}</span>;
        return (
          <a key={`${idx}-${j}`} href={href} target="_blank" rel="noopener noreferrer" className="text-gold underline decoration-gold/40 underline-offset-2 hover:decoration-gold">
            {displayForUrl(trimmed)}
          </a>
        );
      }
      return <span key={`${idx}-${j}`}>{chunk}</span>;
    });
  });
}

/** Renders assistant text: bold, inline code, and autolinked URLs/domains. */
export function renderMessageText(text: string, opts: { allowLinks?: boolean } = {}): ReactNode {
  const allowLinks = opts.allowLinks ?? true;

  // Protect inline code spans so URLs inside code are not autolinked.
  const codeParts = text.split(/(`[^`\n]+`)/g);
  return codeParts.map((part, i) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={i} className="rounded bg-surface border border-border px-1 py-0.5 font-mono text-[0.85em]">
          {part.slice(1, -1)}
        </code>
      );
    }

    // Bold segments.
    const boldParts = part.split(/(\*\*[^*]+\*\*)/g);
    return boldParts.map((bold, j) => {
      if (bold.startsWith("**") && bold.endsWith("**")) {
        return (
          <strong key={`${i}-${j}`} className="font-semibold text-gold-light">
            {allowLinks ? <LinkInline>{bold.slice(2, -2)}</LinkInline> : bold.slice(2, -2)}
          </strong>
        );
      }
      return (
        <span key={`${i}-${j}`}>{allowLinks ? <LinkInline>{bold}</LinkInline> : bold}</span>
      );
    });
  });
}