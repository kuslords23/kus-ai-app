"use client";

/**
 * File ingestion helpers.
 *
 * Reads user attachments (images, text documents, code files) and formats
 * them into a multi-modal payload that can be passed to OpenAI-compatible
 * API endpoints (OpenRouter, Gemini, or the hub RAG proxy) so Royal and Jyinx
 * can see and process the actual bytes rather than just filenames.
 */

export type ProcessedAttachment = {
  type: "image_url" | "document" | "text";
  data: string; // base64 data (no data: prefix)
  mimeType: string;
  name: string;
};

/**
 * Read a file into a base64 payload suitable for API gateways.
 * Images become `image_url` parts; documents/text remain `document` parts
 * whose contents are decoded and injected into the prompt context.
 */
export function processAttachment(file: File): Promise<ProcessedAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      const base64Data = result.split(",")[1] ?? "";
      resolve({
        type: file.type.startsWith("image/") ? "image_url" : "document",
        data: base64Data,
        mimeType: file.type,
        name: file.name,
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** Decode a base64 string to UTF-8 text (for text/code/doc attachments). */
export function decodeTextFromBase64(data: string): string {
  if (typeof atob === "undefined") return "";
  try {
    return decodeURIComponent(escape(atob(data)));
  } catch {
    try {
      return atob(data);
    } catch {
      return "";
    }
  }
}

/**
 * Build the `content` array for an OpenAI-compatible multimodal user message
 * from a prompt + one or more attachment data-URLs or File objects.
 *
 * - Images => `image_url` parts (data: URI).
 * - Text/code/docs => decoded text appended to the prompt context.
 */
export async function buildMultimodalContent(
  prompt: string,
  attachments: Array<{ name: string; mimeType: string; dataUrl?: string; file?: File }>
): Promise<unknown> {
  if (!attachments.length) return prompt;

  const parts: unknown[] = [{ type: "text", text: prompt }];

  for (const att of attachments) {
    let processed: ProcessedAttachment | null = null;
    if (att.dataUrl) {
      const split = att.dataUrl.indexOf(",");
      if (split >= 0) {
        const meta = att.dataUrl.slice(0, split).match(/data:([^;]+)/);
        processed = {
          type: att.mimeType.startsWith("image/") ? "image_url" : "document",
          data: att.dataUrl.slice(split + 1),
          mimeType: att.mimeType,
          name: att.name,
        };
        if (meta) processed.mimeType = meta[1];
      }
    } else if (att.file) {
      processed = await processAttachment(att.file);
    }

    if (!processed) continue;

    if (processed.type === "image_url") {
      parts.push({
        type: "image_url",
        image_url: {
          url: `data:${processed.mimeType};base64,${processed.data}`,
        },
      });
    } else {
      const decoded = decodeTextFromBase64(processed.data);
      if (decoded && decoded.trim()) {
        parts.push({
          type: "text",
          text: `\n\nAttached File (${processed.name}):\n\`\`\`\n${decoded.slice(0, 40_000)}\n\`\`\``,
        });
      }
    }
  }

  return parts;
}

export default processAttachment;