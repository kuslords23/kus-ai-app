/**
 * Classify user queries → kingdom departments for sub-agent routing.
 */

import { KINGDOM_DEPARTMENTS } from "./domains";

const KEYWORD_MAP: Record<string, string[]> = {
  sports: [
    "football", "soccer", "basketball", "score", "league", "match", "player",
    "dream league", "fantasy", "bet", "ghana premier", "arsenal", "chelsea",
  ],
  programming: [
    "code", "javascript", "typescript", "python", "react", "nextjs", "api",
    "bug", "function", "sql", "docker", "git", "programming", "developer",
  ],
  marketing: [
    "seo", "ads", "campaign", "brand", "marketing", "instagram", "tiktok",
    "conversion", "copywriting", "email marketing",
  ],
  business: [
    "startup", "business", "revenue", "profit", "hire", "founder", "pitch",
    "strategy", "operations",
  ],
  finance: [
    "invest", "stock", "crypto", "bitcoin", "wallet", "momo", "tax", "loan",
    "savings", "budget",
  ],
  religion: [
    "god", "jesus", "allah", "prayer", "church", "mosque", "bible", "quran",
    "faith", "worship", "religion",
  ],
  technology: [
    "ai", "artificial intelligence", "machine learning", "cloud", "cyber",
    "iphone", "android", "tech",
  ],
  health: [
    "health", "doctor", "medicine", "fitness", "diet", "mental", "symptom",
  ],
  music: [
    "music", "song", "artist", "afrobeats", "album", "spotify",
  ],
  education: [
    "school", "university", "exam", "wassce", "learn", "study", "course",
  ],
};

export function classifyDepartments(query: string, limit = 5): string[] {
  const q = query.toLowerCase();
  const scores = new Map<string, number>();

  for (const dept of KINGDOM_DEPARTMENTS) {
    let score = dept.priority / 100;
    const keywords = KEYWORD_MAP[dept.id] ?? [];
    for (const kw of keywords) {
      if (q.includes(kw)) score += 3;
    }
    for (const topic of dept.topicTemplates) {
      if (q.includes(topic.replace(/-/g, " ")) || q.includes(topic)) {
        score += 2;
      }
    }
    if (score > dept.priority / 100) {
      scores.set(dept.id, score);
    }
  }

  if (scores.size === 0) {
    return ["business", "technology", "sports"].slice(0, limit);
  }

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id);
}

export function buildSearchQuery(topic: string, departmentId: string, variant: string): string {
  const dept = KINGDOM_DEPARTMENTS.find((d) => d.id === departmentId);
  const deptName = dept?.name ?? departmentId;
  const variantHint =
    variant === "ghana"
      ? "Ghana"
      : variant === "africa"
        ? "Africa"
        : variant === "howto"
          ? "how to tutorial"
          : variant === "news"
            ? "latest news"
            : "";
  return [topic.replace(/-/g, " "), deptName, variantHint, "site:edu OR site:org OR official documentation"]
    .filter(Boolean)
    .join(" ");
}
