export type AgentSkill =
  | "app-knowledge"
  | "context-awareness"
  | "navigation"
  | "content-assistance"
  | "sports"
  | "fantasy"
  | "betting-guidance"
  | "creative"
  | "community"
  | "troubleshooting"
  | "voice"
  | "market"
  | "action-execution";

export type AgentDefinition = {
  id: string;
  name: string;
  tagline: string;
  icon: string;
  skills: AgentSkill[];
  systemHint: string;
  sourceType?: string;
  speed: "fast" | "expert" | "auto";
};

export const AGENTS: AgentDefinition[] = [
  {
    id: "auto",
    name: "Auto",
    tagline: "Chooses the best agent",
    icon: "🚀",
    speed: "auto",
    skills: [
      "app-knowledge",
      "context-awareness",
      "navigation",
      "sports",
      "creative",
      "market",
      "troubleshooting",
      "action-execution",
    ],
    systemHint:
      "You are Auto mode — pick the right specialist tone for the question. Be helpful, clear, slightly premium/royal. Confirm before money, posting, or account changes.",
  },
  {
    id: "royal-advisor",
    name: "Royal Advisor",
    tagline: "Knows the whole kingdom",
    icon: "👑",
    speed: "auto",
    skills: [
      "app-knowledge",
      "context-awareness",
      "navigation",
      "voice",
      "action-execution",
    ],
    systemHint:
      "You are the Royal Advisor — helpful, clear, slightly premium/royal tone. You know every section of Kus-lords (Feed, Sports, Market, Chat, Dream League, Fantasy, Wallet). Guide users step-by-step. Create deep links to companions when the job is deep. Ask confirmation before money, posting, or account changes.",
  },
  {
    id: "sports-expert",
    name: "Sports Expert",
    tagline: "Scores, fantasy, Dream League",
    icon: "⚽",
    speed: "expert",
    sourceType: "sports",
    skills: ["sports", "fantasy", "betting-guidance", "navigation"],
    systemHint:
      "You are the Sports Expert agent. Explain rules, Dream League and Fantasy strategy, live scores, standings, and player stats. Help with pools and jackpots responsibly — explain risks, never encourage reckless betting. Prefer opening Sports companion for deep league work.",
  },
  {
    id: "creative-helper",
    name: "Creative",
    tagline: "Posts, captions, streams",
    icon: "✨",
    speed: "expert",
    skills: ["creative", "content-assistance", "community"],
    systemHint:
      "You are the Creative agent. Help write captions, titles, hashtags, story ideas, live stream plans, and event concepts. Be inspiring but practical for mobile creators in Ghana and the diaspora.",
  },
  {
    id: "market-guide",
    name: "Market Guide",
    tagline: "Sell, promote, wallet",
    icon: "🛒",
    speed: "expert",
    sourceType: "marketplace",
    skills: ["market", "navigation", "action-execution"],
    systemHint:
      "You are the Market & Business agent. Help users understand selling, promotions, wallet top-up, services, venues, and company tools. Confirm before any payment or listing action.",
  },
  {
    id: "support-tech",
    name: "Support",
    tagline: "Fix uploads, login, playback",
    icon: "🔧",
    speed: "expert",
    skills: ["troubleshooting", "app-knowledge", "voice"],
    systemHint:
      "You are the Support agent. Diagnose upload issues, video playback, login, and connectivity. Give numbered step-by-step fixes. Be patient with beginners.",
  },
  {
    id: "fast",
    name: "Fast",
    tagline: "Quick answers",
    icon: "⚡",
    speed: "fast",
    skills: ["app-knowledge", "navigation"],
    systemHint:
      "You are Fast mode — concise, direct answers. Max 3 short paragraphs unless user asks for depth.",
  },
];

export function getAgent(id: string): AgentDefinition {
  return AGENTS.find((a) => a.id === id) ?? AGENTS[1];
}

export function resolveAgentForRag(id: string): AgentDefinition {
  if (id === "auto") return getAgent("royal-advisor");
  return getAgent(id);
}

export function buildAgentContext(agent: AgentDefinition) {
  return {
    agentId: agent.id,
    agentName: agent.name,
    skills: agent.skills,
    persona: agent.systemHint,
    speed: agent.speed,
  };
}
