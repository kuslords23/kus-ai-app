/** Video embed helpers — YouTube, Vimeo, direct MP4/WebM. */

export type VideoEmbed = {
  embedUrl?: string;
  directUrl?: string;
  provider?: "youtube" | "vimeo" | "direct" | "hub";
};

export function parseVideoUrl(url: string): VideoEmbed | null {
  if (!url) return null;
  try {
    const u = new URL(url);

    if (u.hostname.includes("youtube.com") || u.hostname === "youtu.be") {
      const id =
        u.hostname === "youtu.be"
          ? u.pathname.slice(1)
          : u.searchParams.get("v");
      if (id) {
        return {
          provider: "youtube",
          embedUrl: `https://www.youtube.com/embed/${id}`,
        };
      }
    }

    if (u.hostname.includes("vimeo.com")) {
      const id = u.pathname.split("/").filter(Boolean).pop();
      if (id && /^\d+$/.test(id)) {
        return {
          provider: "vimeo",
          embedUrl: `https://player.vimeo.com/video/${id}`,
        };
      }
    }

    if (/\.(mp4|webm|mov)(\?|$)/i.test(u.pathname)) {
      return { provider: "direct", directUrl: url };
    }

    if (
      u.hostname.includes("sport-clan-nexus") ||
      u.hostname.includes("kus-lords") ||
      u.hostname.includes("vercel.app")
    ) {
      return { provider: "hub", directUrl: url, embedUrl: url };
    }
  } catch {
    // not a valid URL
  }
  return null;
}

export function isVideoItem(item: Record<string, unknown>): boolean {
  const type = String(item.type || item.kind || item.mediaType || "").toLowerCase();
  if (type.includes("video")) return true;
  const url = String(item.url || item.videoUrl || item.embedUrl || "");
  return !!parseVideoUrl(url);
}
