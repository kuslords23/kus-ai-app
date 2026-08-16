export type Workspace = {
  id: string;
  name: string;
  branch: string;
  source: "github" | "local";
  private?: boolean;
};

export type AgentTask = {
  id: string;
  title: string;
  workspaceId: string;
  status: "working" | "attention" | "review" | "merged" | "draft";
  branch: string;
  additions: number;
  deletions: number;
  updatedAt: string;
  files: string[];
  logs: string[];
};

export type MobileFilters = {
  groupBy: "category" | "status" | "date";
  statuses: AgentTask["status"][];
  branch: "all" | "clean" | "ahead" | "behind";
  showDiff: boolean;
  showBranch: boolean;
  showUpdated: boolean;
};
