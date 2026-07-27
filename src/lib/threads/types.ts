export type ThreadMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  at: number;
  cards?: Array<{
    type: string;
    title: string;
    subtitle?: string;
    url?: string;
    data?: Record<string, unknown>;
  }>;
  chips?: Array<{
    label: string;
    url?: string;
    action?: string;
    prompt?: string;
  }>;
};

export type ChatThread = {
  id: string;
  title: string;
  updatedAt: number;
  messages: ThreadMessage[];
};
