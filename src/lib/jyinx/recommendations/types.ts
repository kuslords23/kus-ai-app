export type ActionType = "open_view" | "run_code" | "open_repo" | "chat" | "deploy" | "commit" | "install_package" | "create_file" | "refactor" | "open_url" | "search_code" | "run_test" | "marketplace_listing";

export type RecommendationCategory = "repository" | "development" | "ai" | "learning" | "business" | "social" | "sports" | "entertainment" | "religious" | "relationship";

export interface RecommendationAction {
  type: ActionType;
  label: string;
  description: string;
  value: string;
  icon?: string;
}

export interface Recommendation {
  id: string;
  title: string;
  description: string;
  category: RecommendationCategory;
  actions: RecommendationAction[];
  confidence: number;
  source: string;
  expiresAt?: Date;
  previewUrl?: string;
}

export interface UserContext {
  repository?: string | null;
  recentCommits?: string[];
  buildStatus?: "passing" | "failing" | "unknown";
  testResults?: { passed: number; failed: number; total: number };
  chatKeywords?: string[];
  preferredDomains?: string[];
  recentFiles?: string[];
}

export interface RecommendationConfig {
  maxResults: number;
  minConfidence: number;
  includeSocial: boolean;
  includeMarketplace: boolean;
}