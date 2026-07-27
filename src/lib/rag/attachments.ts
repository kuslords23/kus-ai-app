import type { ChatAttachment } from "@/lib/attachments/types";

/** Enrich user query so hub prioritizes attachment matching + hub-first search. */
export function enrichQueryWithAttachments(
  query: string,
  attachments: ChatAttachment[]
): string {
  if (!attachments.length) return query;

  const fileList = attachments
    .map((a) => `${a.name} (${a.kind}/${a.mimeType})`)
    .join("; ");

  const base = query.trim() || "Analyze the attached file(s)";

  return (
    `${base}\n\n` +
    `[Companion attachments: ${fileList}. ` +
    `Match these files to relevant Kus-lords hub content first (videos, music, posts, sports). ` +
    `If hub has no match, search the public web and summarize with links to original sources. ` +
    `Return video/music preview URLs when available.]`
  );
}

/** Infer sourceType hint from attachments for hub routing. */
export function sourceTypeFromAttachments(
  attachments: ChatAttachment[]
): string | undefined {
  if (!attachments.length) return undefined;
  const kinds = new Set(attachments.map((a) => a.kind));
  if (kinds.has("video")) return "video";
  if (attachments.some((a) => a.mimeType.startsWith("audio/"))) return "music";
  if (kinds.has("image")) return "feed";
  return "general";
}
