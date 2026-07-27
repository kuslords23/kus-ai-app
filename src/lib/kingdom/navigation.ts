/**
 * Map kingdom departments → Hub navigation tab so RAG is not biased to sports.
 */

export function navigationForDepartments(departments: string[]): {
  activeTab: string;
  sportsSubTab?: string;
  marketSubTab?: string;
  source: string;
} {
  const primary = departments[0] ?? "general";

  switch (primary) {
    case "sports":
      return {
        activeTab: "sports",
        sportsSubTab: "scores",
        source: "kus-ai-app",
      };
    case "finance":
      return {
        activeTab: "market",
        marketSubTab: "wallet",
        source: "kus-ai-app",
      };
    case "business":
    case "marketing":
    case "real-estate":
      return {
        activeTab: "market",
        marketSubTab: "services",
        source: "kus-ai-app",
      };
    case "entertainment":
    case "music":
      return { activeTab: "feed", source: "kus-ai-app" };
    default:
      return { activeTab: "ai", source: "kus-ai-app" };
  }
}
