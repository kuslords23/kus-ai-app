"use client";

interface SourceLinkCardProps {
  title: string;
  subtitle?: string;
  url?: string;
  origin?: "hub" | "web";
  type?: string;
}

export function SourceLinkCard({
  title,
  subtitle,
  url,
  origin,
  type,
}: SourceLinkCardProps) {
  const badge =
    origin === "hub"
      ? "Hub"
      : type === "news"
        ? "News"
        : "Web";

  const inner = (
    <div className="rounded-xl border border-border bg-background/60 p-3 hover:border-gold/35 transition-colors">
      <div className="flex items-start gap-2">
        <span
          className={`text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded shrink-0 ${
            origin === "hub"
              ? "bg-gold/15 text-gold"
              : "bg-surface text-muted"
          }`}
        >
          {badge}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium leading-snug">{title}</p>
          {subtitle && (
            <p className="text-[11px] text-muted mt-1 line-clamp-2">{subtitle}</p>
          )}
          {url && (
            <p className="text-[10px] text-gold/80 mt-1 truncate">{url}</p>
          )}
        </div>
        {url && (
          <svg
            className="w-4 h-4 text-muted shrink-0 mt-0.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" />
          </svg>
        )}
      </div>
    </div>
  );

  if (url) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer">
        {inner}
      </a>
    );
  }
  return inner;
}
