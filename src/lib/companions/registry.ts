export type CompanionApp = {
  id: string;
  name: string;
  shortName: string;
  tagline: string;
  url: string;
  status: "active" | "planned" | "hub";
  envKey?: string;
};

const hub = process.env.NEXT_PUBLIC_HUB_URL || "https://sport-clan-nexus.vercel.app";
const sports =
  process.env.NEXT_PUBLIC_SPORTS_COMPANION_URL || "https://kus-sports.vercel.app";

/** Kingdom companion registry — extend as new apps ship. */
export const COMPANIONS: CompanionApp[] = [
  {
    id: "hub",
    name: "Kus-lords Hub",
    shortName: "Hub",
    tagline: "Clan OS — wallet, Dream, betting, town square",
    url: hub,
    status: "active",
    envKey: "NEXT_PUBLIC_HUB_URL",
  },
  {
    id: "sports",
    name: "Kus-lords Sports",
    shortName: "Sports",
    tagline: "Scores, leagues, Dream League deep work",
    url: sports,
    status: "active",
    envKey: "NEXT_PUBLIC_SPORTS_COMPANION_URL",
  },
  {
    id: "ai",
    name: "Kus-lords AI",
    shortName: "AI",
    tagline: "You are here — royal assistant home",
    url: process.env.NEXT_PUBLIC_SITE_URL || "https://kus-ai-app.vercel.app",
    status: "active",
  },
  {
    id: "live",
    name: "Kus-lords Live",
    shortName: "Live",
    tagline: "Feed, streams, studio",
    url: process.env.NEXT_PUBLIC_LIVE_COMPANION_URL || hub,
    status: "planned",
    envKey: "NEXT_PUBLIC_LIVE_COMPANION_URL",
  },
  {
    id: "music",
    name: "Kus-lords Music",
    shortName: "Music",
    tagline: "Tracks, playlists, artist tools",
    url: process.env.NEXT_PUBLIC_MUSIC_COMPANION_URL || hub,
    status: "planned",
    envKey: "NEXT_PUBLIC_MUSIC_COMPANION_URL",
  },
  {
    id: "market",
    name: "Kus-lords Market",
    shortName: "Market",
    tagline: "Shop, services, venues",
    url: process.env.NEXT_PUBLIC_MARKET_COMPANION_URL || hub,
    status: "planned",
    envKey: "NEXT_PUBLIC_MARKET_COMPANION_URL",
  },
  {
    id: "wallet",
    name: "Wallet",
    shortName: "Wallet",
    tagline: "MoMo, balance, transfers",
    url: `${hub}?tab=marketplace&sub=wallet`,
    status: "active",
  },
  {
    id: "chat",
    name: "Chat",
    shortName: "Chat",
    tagline: "Messages, groups, calls",
    url: process.env.NEXT_PUBLIC_CHAT_COMPANION_URL || hub,
    status: "planned",
    envKey: "NEXT_PUBLIC_CHAT_COMPANION_URL",
  },
];

export function getCompanion(id: string): CompanionApp | undefined {
  return COMPANIONS.find((c) => c.id === id);
}

export function companionDeepLink(
  companionId: string,
  path = ""
): string | null {
  const c = getCompanion(companionId);
  if (!c?.url) return null;
  return path ? `${c.url.replace(/\/$/, "")}${path}` : c.url;
}
