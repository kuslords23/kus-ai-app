/**
 * Hub-first retrieval policy — sent to hub RAG via userContext.
 * Hub brain decides when to fall back to web search.
 */

export const RETRIEVAL_POLICY = {
  strategy: "hub-first" as const,
  webFallback: true,
  summarizeWithSourceLinks: true,
  matchAttachmentsToSearch: true,
  conversationDepth: "adaptive" as const,
  media: {
    video: { hubFirst: true, webFallback: true, embedInChat: true },
    music: { hubFirst: true, webFallback: true, previewInChat: true },
    news: { hubFirst: true, webFallback: true, alwaysLinkOriginal: true },
  },
};

export type RetrievalContext = typeof RETRIEVAL_POLICY;

export function buildRetrievalContext(opts?: {
  hasAttachments?: boolean;
  attachmentKinds?: string[];
}) {
  return {
    ...RETRIEVAL_POLICY,
    hasAttachments: !!opts?.hasAttachments,
    attachmentKinds: opts?.attachmentKinds ?? [],
    instructions:
      "Always search Kus-lords hub data first (feed, sports, market, music, videos). " +
      "Only use internet/web search when hub has no relevant answer. " +
      "When using web results, summarize clearly and include links to original articles, videos, and music. " +
      "For uploaded files, match content to hub then web. " +
      "Support casual chat and deep, thoughtful conversations as the user prefers.",
  };
}
