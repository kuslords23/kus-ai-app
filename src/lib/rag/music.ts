/** Music preview helpers — hub, Spotify, SoundCloud, direct audio. */

export type MusicPreview = {
  title: string;
  artist?: string;
  url: string;
  previewUrl?: string;
  thumbnail?: string;
  provider?: "hub" | "spotify" | "soundcloud" | "direct" | "web";
};

export function parseMusicItem(item: Record<string, unknown>): MusicPreview | null {
  const title = String(item.title || item.name || item.track || "").trim();
  const url = String(item.url || item.link || item.href || "").trim();
  const previewUrl = String(
    item.previewUrl || item.audioUrl || item.streamUrl || ""
  ).trim();
  const artist = String(item.artist || item.creator || item.channel || "").trim();
  const thumbnail = String(item.thumbnail || item.image || item.artwork || "").trim();

  if (!title && !url && !previewUrl) return null;

  const type = String(item.type || item.kind || "").toLowerCase();
  const isMusic =
    type.includes("music") ||
    type.includes("track") ||
    type.includes("audio") ||
    /\.(mp3|m4a|ogg|wav)(\?|$)/i.test(url) ||
    /\.(mp3|m4a|ogg|wav)(\?|$)/i.test(previewUrl) ||
    url.includes("spotify.com") ||
    url.includes("soundcloud.com");

  if (!isMusic && !previewUrl.match(/\.(mp3|m4a|ogg)/i)) return null;

  let provider: MusicPreview["provider"] = "web";
  if (url.includes("spotify.com")) provider = "spotify";
  else if (url.includes("soundcloud.com")) provider = "soundcloud";
  else if (previewUrl || /\.(mp3|m4a|ogg)/i.test(url)) provider = "direct";
  else if (url.includes("kus-lords") || url.includes("sport-clan-nexus"))
    provider = "hub";

  return {
    title: title || "Track",
    artist: artist || undefined,
    url: url || previewUrl,
    previewUrl: previewUrl || undefined,
    thumbnail: thumbnail || undefined,
    provider,
  };
}

export function isMusicItem(item: Record<string, unknown>): boolean {
  return parseMusicItem(item) !== null;
}
