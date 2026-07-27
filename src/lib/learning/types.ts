/** Shared event types for the Kus Training Plane (Hub + companion + worker). */

export const LEARNING_SOURCE = "kus-ai-app" as const;

export type LearningSource = "hub" | "kus-ai-app" | "training-worker";

export type LearningEventType =
  | "retrieval_miss"
  | "rag_error"
  | "correction"
  | "style_sample"
  | "memory_export"
  | "harvest_request"
  | "helpful";

export type LearningEventPayload = {
  retrieval_miss?: {
    query: string;
    dataSource?: string;
    usedWebSearch?: boolean;
    sourceCount?: number;
    agentId?: string;
  };
  rag_error?: {
    query: string;
    error?: string;
    agentId?: string;
  };
  correction?: {
    messageId: string;
    userQuery?: string;
    assistantReply: string;
    note?: string;
  };
  helpful?: {
    messageId: string;
    userQuery?: string;
    assistantReply: string;
  };
  style_sample?: {
    text: string;
    domain?: string;
  };
  memory_export?: {
    preferenceSummary?: string;
    episodicSummary?: string;
    toneNotes?: string;
    recentTopics?: string[];
  };
  harvest_request?: {
    sourceUrl: string;
    sourceType: string;
    reason?: string;
  };
};

export type LearningEventInput = {
  eventType: LearningEventType;
  sessionId?: string | null;
  payload: LearningEventPayload[LearningEventType] extends infer P
    ? P extends undefined
      ? Record<string, unknown>
      : P
    : Record<string, unknown>;
};
