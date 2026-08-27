"use client";

import { useRef } from "react";

interface MusicPreviewCardProps {
  title: string;
  subtitle?: string;
  url?: string;
  data?: Record<string, unknown>;
  origin?: "hub" | "web";
}

export function MusicPreviewCard({
  title,
  subtitle,
  url,
  data,
  origin,
}: MusicPreviewCardProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const previewUrl = String(data?.previewUrl || data?.audioUrl || "").trim();
  const thumbnail = String(data?.thumbnail || data?.artwork || "").trim();
  const canPreview = !!previewUrl && /\.(mp3|m4a|ogg|wav)|audio/i.test(previewUrl);

  return (
    <div className="rounded-xl border border-border bg-background/60 p-3">
      <div className="flex items-center gap-3">
        {thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbnail}
            alt=""
            className="w-12 h-12 rounded-lg object-cover shrink-0"
          />
        ) : (
          <div className="w-12 h-12 rounded-lg bg-purple/15 flex items-center justify-center text-lg shrink-0">
            ♫
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{title}</p>
          {subtitle && (
            <p className="text-[11px] text-muted truncate">{subtitle}</p>
          )}
          <span
            className={`text-[9px] uppercase tracking-wide ${
              origin === "hub" ? "text-gold" : "text-purple-soft"
            }`}
          >
            {origin === "hub" ? "Hub music" : "Web music"}
          </span>
        </div>
        {canPreview && (
          <button
            type="button"
            onClick={() => audioRef.current?.play()}
            className="text-[11px] px-2.5 py-1 rounded-lg border border-purple/30 text-purple-soft shrink-0"
          >
            Preview
          </button>
        )}
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-muted hover:text-gold shrink-0"
          >
            Open
          </a>
        )}
      </div>
      {canPreview && (
        <audio ref={audioRef} src={previewUrl} preload="none" className="hidden" />
      )}
    </div>
  );
}
