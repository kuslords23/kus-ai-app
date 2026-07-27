import type { RagResult } from "@/lib/rag/client";
import { parseMusicItem, isMusicItem } from "@/lib/rag/music";
import { parseVideoUrl, isVideoItem } from "@/lib/rag/video";

export type MessageCard = {
  type: string;
  title: string;
  subtitle?: string;
  url?: string;
  origin?: "hub" | "web";
  data?: Record<string, unknown>;
};

function asRecord(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return null;
}

function originOf(item: Record<string, unknown>): "hub" | "web" {
  const src = String(
    item.origin || item.source || item.dataSource || item.from || ""
  ).toLowerCase();
  if (
    src.includes("hub") ||
    src.includes("kus") ||
    src.includes("kingdom") ||
    src.includes("internal")
  ) {
    return "hub";
  }
  if (src.includes("web") || src.includes("internet") || src.includes("news")) {
    return "web";
  }
  const url = String(item.url || "");
  if (
    url.includes("sport-clan-nexus") ||
    url.includes("kus-sports") ||
    url.includes("kus-lords")
  ) {
    return "hub";
  }
  return "web";
}

function normalizeItem(raw: unknown): Record<string, unknown> | null {
  const r = asRecord(raw);
  if (!r) return null;
  return r;
}

function collectRawItems(result: RagResult): Record<string, unknown>[] {
  const items: Record<string, unknown>[] = [];
  const push = (list: unknown) => {
    if (!Array.isArray(list)) return;
    for (const x of list) {
      const r = normalizeItem(x);
      if (r) items.push(r);
    }
  };

  push(result.sources);
  push(result.recommendations);

  const extra = result as RagResult & {
    webResults?: unknown[];
    media?: unknown[];
    videos?: unknown[];
    music?: unknown[];
    articles?: unknown[];
  };
  push(extra.webResults);
  push(extra.media);
  push(extra.videos);
  push(extra.music);
  push(extra.articles);

  return items;
}

function articleCard(item: Record<string, unknown>): MessageCard | null {
  if (isVideoItem(item) || isMusicItem(item)) return null;

  const title = String(
    item.title || item.headline || item.name || "Source"
  ).trim();
  const url = String(item.url || item.link || item.href || "").trim();
  const snippet = String(
    item.snippet || item.summary || item.description || item.excerpt || ""
  ).trim();

  if (!url && !snippet) return null;

  const type = String(item.type || "").toLowerCase();
  const cardType =
    type.includes("news") ? "news" : type.includes("article") ? "article" : "source";

  return {
    type: cardType,
    title,
    subtitle: snippet.slice(0, 160) || undefined,
    url: url || undefined,
    origin: originOf(item),
    data: item,
  };
}

function videoCard(item: Record<string, unknown>): MessageCard | null {
  if (!isVideoItem(item)) return null;

  const title = String(item.title || item.name || "Video").trim();
  const url = String(
    item.url || item.videoUrl || item.link || item.embedUrl || ""
  ).trim();
  const embed = parseVideoUrl(
    String(item.embedUrl || item.url || item.videoUrl || "")
  );
  const thumbnail = String(item.thumbnail || item.image || "").trim();

  if (!url && !embed?.embedUrl && !embed?.directUrl) return null;

  return {
    type: "video",
    title,
    subtitle: String(item.channel || item.creator || item.source || "").trim() || undefined,
    url: url || embed?.directUrl || embed?.embedUrl,
    origin: originOf(item),
    data: {
      ...item,
      embedUrl: embed?.embedUrl,
      directUrl: embed?.directUrl,
      thumbnail: thumbnail || undefined,
      provider: embed?.provider,
    },
  };
}

function musicCard(item: Record<string, unknown>): MessageCard | null {
  const music = parseMusicItem(item);
  if (!music) return null;

  return {
    type: "music",
    title: music.title,
    subtitle: music.artist,
    url: music.url,
    origin: music.provider === "hub" ? "hub" : "web",
    data: {
      ...item,
      previewUrl: music.previewUrl,
      thumbnail: music.thumbnail,
      provider: music.provider,
    },
  };
}

/** Build ordered chat cards: hub first, then web. Videos/music only when data present. */
export function buildEnrichedCards(result: RagResult): MessageCard[] {
  const cards: MessageCard[] = [];
  const seen = new Set<string>();

  const add = (card: MessageCard | null) => {
    if (!card) return;
    const key = `${card.type}:${card.url || card.title}`;
    if (seen.has(key)) return;
    seen.add(key);
    cards.push(card);
  };

  if (result.sportsData) {
    add({
      type: "match",
      title: "Sports data",
      subtitle: "From Kus-lords hub",
      url:
        process.env.NEXT_PUBLIC_SPORTS_COMPANION_URL ||
        "https://kus-sports.vercel.app",
      origin: "hub",
      data: result.sportsData as Record<string, unknown>,
    });
  }

  const raw = collectRawItems(result);
  const hub: MessageCard[] = [];
  const web: MessageCard[] = [];

  for (const item of raw) {
    const v = videoCard(item);
    const m = musicCard(item);
    const a = articleCard(item);

    for (const c of [v, m, a]) {
      if (!c) continue;
      if (c.origin === "hub") hub.push(c);
      else web.push(c);
    }
  }

  const sortByType = (list: MessageCard[]) => {
    const order = { video: 0, music: 1, news: 2, article: 3, source: 4, match: 5 };
    return list.sort(
      (a, b) =>
        (order[a.type as keyof typeof order] ?? 9) -
        (order[b.type as keyof typeof order] ?? 9)
    );
  };

  for (const c of sortByType(hub)) add(c);
  for (const c of sortByType(web)) add(c);

  return cards.slice(0, 12);
}

export function dataSourceLabel(result: RagResult): string | null {
  if (result.dataSource) {
    const ds = String(result.dataSource).toLowerCase();
    if (ds.includes("hub")) return "Hub";
    if (ds.includes("web") || ds.includes("internet")) return "Web";
    return result.dataSource;
  }
  if (result.usedWebSearch) return "Web";
  if (result.mode === "sports") return "Sports";
  return null;
}
