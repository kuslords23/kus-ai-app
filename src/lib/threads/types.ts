export type ThreadMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  at: number;
  attachments?: Array<{
    id?: string;
    kind: "image" | "file" | "video";
    name: string;
    mimeType?: string;
    previewUrl?: string;
    dataUrl?: string;
    size?: number;
  }>;
  cards?: Array<{
    type: string;
    title: string;
    subtitle?: string;
    url?: string;
    origin?: "hub" | "web";
    data?: Record<string, unknown>;
  }>;
  chips?: Array<{
    label: string;
    url?: string;
    action?: string;
    prompt?: string;
  }>;
  sourceLabel?: string;
};

export type ChatThread = {
  id: string;
  title: string;
  updatedAt: number;
  messages: ThreadMessage[];
};
