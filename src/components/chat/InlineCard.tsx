"use client";

import { motion } from "framer-motion";
import { VideoPreviewCard } from "./VideoPreviewCard";
import { MusicPreviewCard } from "./MusicPreviewCard";
import { SourceLinkCard } from "./SourceLinkCard";

export interface CardData {
  type: string;
  title: string;
  subtitle?: string;
  url?: string;
  origin?: "hub" | "web";
  data?: Record<string, unknown>;
}

export function InlineCard({ card }: { card: CardData }) {
  if (card.type === "video") {
    return (
      <VideoPreviewCard
        title={card.title}
        subtitle={card.subtitle}
        url={card.url}
        data={card.data}
        origin={card.origin}
      />
    );
  }

  if (card.type === "music") {
    return (
      <MusicPreviewCard
        title={card.title}
        subtitle={card.subtitle}
        url={card.url}
        data={card.data}
        origin={card.origin}
      />
    );
  }

  if (
    card.type === "source" ||
    card.type === "article" ||
    card.type === "news"
  ) {
    return (
      <SourceLinkCard
        title={card.title}
        subtitle={card.subtitle}
        url={card.url}
        origin={card.origin}
        type={card.type}
      />
    );
  }

  const content = (
    <motion.div
      whileHover={{ scale: 1.01 }}
      className="rounded-xl border border-gold/20 bg-background/60 p-3 cursor-pointer hover:border-gold/40 transition-colors"
    >
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-gold/10 flex items-center justify-center text-gold text-sm">
          {card.type === "match" ? "⚽" : "i"}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{card.title}</p>
          {card.subtitle && (
            <p className="text-xs text-muted truncate">{card.subtitle}</p>
          )}
        </div>
        <svg
          className="w-4 h-4 text-muted"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path d="M9 18l6-6-6-6" />
        </svg>
      </div>
    </motion.div>
  );

  if (card.url) {
    return (
      <a href={card.url} target="_blank" rel="noopener noreferrer">
        {content}
      </a>
    );
  }

  return content;
}
