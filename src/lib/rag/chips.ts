/**
 * Hub-compatible suggestion chips (from hub `co(userContext)`).
 * Standalone AI app defaults to sports/leagues context.
 */

export type Chip = {
  label: string;
  prompt: string;
  primary?: boolean;
};

export function getSuggestionChips(userContext?: {
  navigation?: {
    activeTab?: string;
    feedMainTab?: string;
    marketSubTab?: string;
    sportsSubTab?: string;
  };
} | null): Chip[] {
  const t = userContext?.navigation?.activeTab || "sports";
  const a = userContext?.navigation?.feedMainTab;
  const s = userContext?.navigation?.marketSubTab;
  const i = userContext?.navigation?.sportsSubTab;

  if (t === "marketplace") {
    const primary =
      s === "wallet"
        ? { label: "Show my wallet", prompt: "show my wallet", primary: true }
        : s === "services"
          ? {
              label: "Book a service",
              prompt: "book a plumber near me",
              primary: true,
            }
          : s === "venues"
            ? {
                label: "Find venues",
                prompt: "find venues for hire",
                primary: true,
              }
            : s === "company"
              ? {
                  label: "Company tools",
                  prompt: "open marketplace company",
                  primary: true,
                }
              : {
                  label: "Match me gear",
                  prompt: "what should I buy",
                  primary: true,
                };
    return [
      primary,
      { label: "Services", prompt: "recommend service" },
      { label: "Venues", prompt: "find venues for hire" },
      { label: "Wallet top-up", prompt: "how do I deposit to my wallet" },
      { label: "Sports analytics", prompt: "sports analytics" },
      { label: "Help", prompt: "help" },
    ];
  }

  if (t === "leagues" || t === "sports") {
    const primary =
      i === "dream"
        ? {
            label: "My Dream League",
            prompt: "open Dream League",
            primary: true,
          }
        : i === "betting"
          ? {
              label: "Recommend pools",
              prompt: "recommend pools",
              primary: true,
            }
          : {
              label: "Sports analytics",
              prompt: "sports analytics",
              primary: true,
            };
    return [
      primary,
      { label: "Live scores", prompt: "Premier League scores today" },
      { label: "Recommend pools", prompt: "recommend pools" },
      { label: "Dream League", prompt: "open Dream League" },
      { label: "Suggest leagues", prompt: "suggest leagues" },
      { label: "Match market", prompt: "what should I buy" },
      { label: "Open Sports", prompt: "__open_sports__" },
      { label: "Open Hub", prompt: "__open_hub__" },
    ];
  }

  if (t === "messages") {
    return [
      {
        label: "Unread inbox",
        prompt: "how many unread messages do I have",
        primary: true,
      },
      { label: "What’s live", prompt: "what's live" },
      { label: "Sports analytics", prompt: "sports analytics" },
      { label: "Recommend pools", prompt: "recommend pools" },
      { label: "Help", prompt: "help" },
    ];
  }

  if (a === "music") {
    return [
      { label: "Recommend music", prompt: "recommend music", primary: true },
      { label: "Discover content", prompt: "discover content" },
      { label: "What’s live", prompt: "what's live" },
      { label: "Sports analytics", prompt: "sports analytics" },
      { label: "Help", prompt: "help" },
    ];
  }

  // Default feed-style chips (hub soul) + companion deep links
  return [
    { label: "For You", prompt: "open videos", primary: true },
    { label: "What’s live", prompt: "what's live" },
    { label: "Sports analytics", prompt: "sports analytics" },
    { label: "Recommend pools", prompt: "recommend pools" },
    { label: "Match market", prompt: "what should I buy" },
    { label: "Help", prompt: "help" },
    { label: "Open Sports", prompt: "__open_sports__" },
    { label: "Open Hub", prompt: "__open_hub__" },
  ];
}

export const WELCOME_TEXT =
  "Hey — I'm **Royal**, your Kus-lords companion. We can talk, take actions in the app, or I can brief you on sports, wallet, and more. What's on your mind?";
