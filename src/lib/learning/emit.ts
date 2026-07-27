"use client";

import type { LearningEventInput } from "./types";

/** Fire-and-forget learning signal to the Training Plane (via companion API). */
export function emitLearningEvent(
  input: LearningEventInput
): void {
  if (typeof window === "undefined") return;

  void fetch("/api/learning/event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    keepalive: true,
  }).catch(() => {
    // Non-blocking — training must never break chat
  });
}

export function emitRetrievalMiss(opts: {
  query: string;
  sessionId?: string;
  dataSource?: string;
  usedWebSearch?: boolean;
  sourceCount?: number;
  agentId?: string;
}) {
  emitLearningEvent({
    eventType: "retrieval_miss",
    sessionId: opts.sessionId,
    payload: {
      query: opts.query,
      dataSource: opts.dataSource,
      usedWebSearch: opts.usedWebSearch,
      sourceCount: opts.sourceCount,
      agentId: opts.agentId,
    },
  });
}

export function emitRagError(opts: {
  query: string;
  sessionId?: string;
  error?: string;
  agentId?: string;
}) {
  emitLearningEvent({
    eventType: "rag_error",
    sessionId: opts.sessionId,
    payload: {
      query: opts.query,
      error: opts.error,
      agentId: opts.agentId,
    },
  });
}

export function emitCorrection(opts: {
  messageId: string;
  sessionId?: string;
  userQuery?: string;
  assistantReply: string;
  note?: string;
}) {
  emitLearningEvent({
    eventType: "correction",
    sessionId: opts.sessionId,
    payload: {
      messageId: opts.messageId,
      userQuery: opts.userQuery,
      assistantReply: opts.assistantReply,
      note: opts.note,
    },
  });
}

export function emitHelpful(opts: {
  messageId: string;
  sessionId?: string;
  userQuery?: string;
  assistantReply: string;
}) {
  emitLearningEvent({
    eventType: "helpful",
    sessionId: opts.sessionId,
    payload: {
      messageId: opts.messageId,
      userQuery: opts.userQuery,
      assistantReply: opts.assistantReply,
    },
  });
}
