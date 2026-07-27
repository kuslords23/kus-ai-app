"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { parseVideoUrl } from "@/lib/rag/video";

interface VideoPreviewCardProps {
  title: string;
  subtitle?: string;
  url?: string;
  data?: Record<string, unknown>;
  origin?: "hub" | "web";
}

export function VideoPreviewCard({
  title,
  subtitle,
  url,
  data,
  origin,
}: VideoPreviewCardProps) {
  const [expanded, setExpanded] = useState(false);
  const videoUrl = String(data?.embedUrl || data?.directUrl || url || "");
  const embed = parseVideoUrl(videoUrl);
  const thumbnail = String(data?.thumbnail || "");
  const canEmbed = !!(embed?.embedUrl || embed?.directUrl);

  return (
    <div className="rounded-xl border border-border bg-background/60 overflow-hidden">
      <div className="flex items-center gap-2 p-3">
        <div className="w-9 h-9 rounded-lg bg-gold/10 flex items-center justify-center text-sm shrink-0">
          ▶
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{title}</p>
          {subtitle && <p className="text-[11px] text-muted truncate">{subtitle}</p>}
          <span
            className={`text-[9px] uppercase tracking-wide ${
              origin === "hub" ? "text-gold" : "text-muted"
            }`}
          >
            {origin === "hub" ? "Hub video" : "Web video"}
          </span>
        </div>
        {canEmbed && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-[11px] px-2 py-1 rounded-lg border border-gold/30 text-gold shrink-0"
          >
            {expanded ? "Hide" : "Play"}
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

      <AnimatePresence>
        {expanded && canEmbed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-border bg-black/20"
          >
            {embed?.embedUrl ? (
              <iframe
                src={embed.embedUrl}
                title={title}
                className="w-full aspect-video"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            ) : embed?.directUrl ? (
              <video
                src={embed.directUrl}
                controls
                playsInline
                className="w-full max-h-56 bg-black"
                poster={thumbnail || undefined}
              />
            ) : null}
          </motion.div>
        )}
      </AnimatePresence>

      {!expanded && thumbnail && (
        <button
          type="button"
          onClick={() => canEmbed && setExpanded(true)}
          className="w-full relative aspect-video max-h-32 overflow-hidden"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={thumbnail} alt="" className="w-full h-full object-cover opacity-80" />
          <span className="absolute inset-0 flex items-center justify-center text-2xl bg-black/30">
            ▶
          </span>
        </button>
      )}
    </div>
  );
}
