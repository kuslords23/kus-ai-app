/**
 * Kingdom departments — every domain Royal should know.
 * Sub-agents are generated as department × topic × variant (~10k total).
 */

export type KingdomDepartment = {
  id: string;
  name: string;
  description: string;
  icon: string;
  priority: number;
  topicTemplates: string[];
};

export const KINGDOM_DEPARTMENTS: KingdomDepartment[] = [
  {
    id: "sports",
    name: "Sports",
    description: "Scores, leagues, fantasy, betting context, athletes",
    icon: "⚽",
    priority: 95,
    topicTemplates: [
      "football", "basketball", "cricket", "tennis", "boxing", "mma", "rugby",
      "athletics", "olympics", "world-cup", "premier-league", "la-liga", "nba",
      "nfl", "dream-league", "fantasy-sports", "betting-odds", "transfers",
      "ghana-football", "african-football", "champions-league", "coaching",
      "sports-nutrition", "injuries", "referee-rules", "youth-sports",
    ],
  },
  {
    id: "marketing",
    name: "Marketing",
    description: "SEO, ads, branding, growth, campaigns",
    icon: "📣",
    priority: 88,
    topicTemplates: [
      "seo", "sem", "social-media", "content-marketing", "email-marketing",
      "influencer", "brand-strategy", "copywriting", "conversion-rate",
      "google-ads", "meta-ads", "tiktok-marketing", "youtube-marketing",
      "affiliate", "growth-hacking", "pr", "crisis-comms", "b2b-marketing",
      "b2c-marketing", "ghana-marketing", "african-market-entry",
    ],
  },
  {
    id: "business",
    name: "Business",
    description: "Strategy, operations, startups, management",
    icon: "💼",
    priority: 90,
    topicTemplates: [
      "startups", "fundraising", "venture-capital", "business-plan", "operations",
      "leadership", "management", "hr", "hiring", "remote-work", "saas",
      "ecommerce", "retail", "supply-chain", "negotiation", "partnerships",
      "franchise", "sme-ghana", "african-entrepreneurship", "pitch-decks",
    ],
  },
  {
    id: "finance",
    name: "Finance",
    description: "Investing, banking, crypto, taxes, MoMo",
    icon: "💰",
    priority: 92,
    topicTemplates: [
      "personal-finance", "investing", "stocks", "bonds", "crypto", "bitcoin",
      "defi", "forex", "taxes", "accounting", "budgeting", "momo", "mobile-money",
      "banking-ghana", "insurance", "real-estate-investing", "retirement",
      "financial-literacy", "microfinance", "remittances",
    ],
  },
  {
    id: "technology",
    name: "Technology",
    description: "Gadgets, AI, cloud, industry trends",
    icon: "💻",
    priority: 93,
    topicTemplates: [
      "artificial-intelligence", "machine-learning", "cloud-computing", "cybersecurity",
      "blockchain", "iot", "5g", "hardware", "smartphones", "enterprise-it",
      "open-source", "tech-news", "startups-tech", "ghana-tech", "africa-tech",
    ],
  },
  {
    id: "programming",
    name: "Programming & Code",
    description: "Languages, frameworks, patterns, dev practices",
    icon: "👨‍💻",
    priority: 94,
    topicTemplates: [
      "javascript", "typescript", "python", "rust", "golang", "java", "csharp",
      "react", "nextjs", "vue", "angular", "nodejs", "django", "fastapi",
      "sql", "postgresql", "mongodb", "redis", "docker", "kubernetes",
      "aws", "gcp", "azure", "git", "ci-cd", "testing", "system-design",
      "algorithms", "data-structures", "api-design", "graphql", "rest",
      "mobile-react-native", "flutter", "swift", "kotlin", "web-security",
    ],
  },
  {
    id: "religion",
    name: "Religion & Faith",
    description: "Christianity, Islam, traditional faiths, ethics",
    icon: "🙏",
    priority: 75,
    topicTemplates: [
      "christianity", "islam", "judaism", "hinduism", "buddhism",
      "traditional-african-spirituality", "theology", "ethics", "comparative-religion",
      "bible-study", "quran-study", "prayer", "worship", "interfaith",
      "ghana-religion", "church-leadership", "mosque-community",
    ],
  },
  {
    id: "health",
    name: "Health & Wellness",
    description: "Medicine, fitness, mental health, nutrition",
    icon: "🏥",
    priority: 85,
    topicTemplates: [
      "nutrition", "fitness", "mental-health", "sleep", "meditation",
      "public-health", "women-health", "men-health", "pediatrics", "first-aid",
      "ghana-healthcare", "tropical-medicine", "malaria", "vaccines",
    ],
  },
  {
    id: "education",
    name: "Education",
    description: "Learning, exams, universities, skills",
    icon: "🎓",
    priority: 80,
    topicTemplates: [
      "k12", "university", "online-learning", "bece", "wassce", "scholarships",
      "study-skills", "teaching", "edtech", "vocational", "languages",
      "ghana-education", "stem-education",
    ],
  },
  {
    id: "legal",
    name: "Legal",
    description: "Law, contracts, rights, compliance",
    icon: "⚖️",
    priority: 70,
    topicTemplates: [
      "contract-law", "employment-law", "intellectual-property", "privacy-gdpr",
      "criminal-law", "family-law", "business-law", "ghana-law", "human-rights",
    ],
  },
  {
    id: "entertainment",
    name: "Entertainment",
    description: "Film, TV, gaming, celebrities",
    icon: "🎬",
    priority: 78,
    topicTemplates: [
      "movies", "tv-series", "streaming", "gaming", "esports", "celebrities",
      "nollywood", "ghana-music", "afrobeats", "comedy", "podcasts",
    ],
  },
  {
    id: "music",
    name: "Music",
    description: "Production, theory, industry, artists",
    icon: "🎵",
    priority: 82,
    topicTemplates: [
      "music-production", "songwriting", "music-theory", "afrobeats", "hip-hop",
      "gospel-music", "streaming-royalties", "live-performance", "music-business",
    ],
  },
  {
    id: "science",
    name: "Science",
    description: "Physics, biology, chemistry, space",
    icon: "🔬",
    priority: 72,
    topicTemplates: [
      "physics", "biology", "chemistry", "astronomy", "climate-science",
      "environment", "renewable-energy", "agriculture-science",
    ],
  },
  {
    id: "travel",
    name: "Travel",
    description: "Destinations, visas, tourism",
    icon: "✈️",
    priority: 65,
    topicTemplates: [
      "ghana-travel", "africa-travel", "visa-guides", "budget-travel",
      "hotels", "ecotourism", "city-guides",
    ],
  },
  {
    id: "food",
    name: "Food & Cuisine",
    description: "Recipes, restaurants, nutrition culture",
    icon: "🍲",
    priority: 68,
    topicTemplates: [
      "ghanaian-cuisine", "west-african-food", "recipes", "restaurants",
      "food-business", "street-food", "vegan", "baking",
    ],
  },
  {
    id: "fashion",
    name: "Fashion & Beauty",
    description: "Style, brands, beauty industry",
    icon: "👗",
    priority: 60,
    topicTemplates: [
      "streetwear", "african-fashion", "beauty", "skincare", "sustainable-fashion",
    ],
  },
  {
    id: "real-estate",
    name: "Real Estate",
    description: "Property, rentals, development",
    icon: "🏠",
    priority: 74,
    topicTemplates: [
      "buying-home", "renting", "property-ghana", "mortgages", "commercial-real-estate",
    ],
  },
  {
    id: "politics",
    name: "Politics & News",
    description: "Government, elections, policy",
    icon: "🏛️",
    priority: 55,
    topicTemplates: [
      "ghana-politics", "africa-politics", "elections", "policy", "geopolitics",
      "journalism", "fact-checking",
    ],
  },
  {
    id: "philosophy",
    name: "Philosophy",
    description: "Ethics, logic, schools of thought",
    icon: "📖",
    priority: 50,
    topicTemplates: [
      "ethics", "logic", "existentialism", "stoicism", "african-philosophy",
    ],
  },
  {
    id: "history",
    name: "History",
    description: "World and African history",
    icon: "🏺",
    priority: 58,
    topicTemplates: [
      "world-history", "african-history", "ghana-history", "colonialism",
      "ancient-civilizations",
    ],
  },
  {
    id: "parenting",
    name: "Parenting & Family",
    description: "Child development, family life",
    icon: "👨‍👩‍👧",
    priority: 62,
    topicTemplates: [
      "parenting-tips", "child-development", "relationships", "marriage", "teenagers",
    ],
  },
  {
    id: "automotive",
    name: "Automotive",
    description: "Cars, EVs, maintenance",
    icon: "🚗",
    priority: 55,
    topicTemplates: [
      "car-reviews", "electric-vehicles", "car-maintenance", "ghana-transport",
    ],
  },
  {
    id: "agriculture",
    name: "Agriculture",
    description: "Farming, agribusiness, crops",
    icon: "🌾",
    priority: 76,
    topicTemplates: [
      "crop-farming", "livestock", "agribusiness-ghana", "sustainable-farming",
      "cocoa", "cashew",
    ],
  },
  {
    id: "design",
    name: "Design & UX",
    description: "UI, UX, graphics, product design",
    icon: "🎨",
    priority: 77,
    topicTemplates: [
      "ui-design", "ux-research", "figma", "graphic-design", "product-design",
      "design-systems", "accessibility",
    ],
  },
];

/** Target ~10,000 sub-agents across all departments */
export const TARGET_SUB_AGENT_COUNT = 10_000;

export const VARIANTS = [
  "general",
  "beginner",
  "advanced",
  "ghana",
  "africa",
  "global",
  "2025",
  "news",
  "howto",
  "reference",
] as const;

export type KingdomVariant = (typeof VARIANTS)[number];

export function allDepartmentIds(): string[] {
  return KINGDOM_DEPARTMENTS.map((d) => d.id);
}

export function getDepartment(id: string): KingdomDepartment | undefined {
  return KINGDOM_DEPARTMENTS.find((d) => d.id === id);
}
