/** Standard mobile chat attachment limits (aligned with typical API POST limits). */
export const MAX_ATTACHMENT_COUNT = 4;
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 MB per file
export const MAX_TOTAL_ATTACHMENT_BYTES = 20 * 1024 * 1024; // 20 MB combined

const ALLOWED_PREFIXES = [
  "image/",
  "video/",
  "application/pdf",
  "text/",
  "application/msword",
  "application/vnd.",
];

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function isAllowedMimeType(mime: string): boolean {
  const m = mime.toLowerCase();
  return ALLOWED_PREFIXES.some((p) => m.startsWith(p));
}

export type AttachmentValidationResult =
  | { ok: true }
  | { ok: false; reason: string };

export function validateFile(file: File): AttachmentValidationResult {
  if (!isAllowedMimeType(file.type || "")) {
    return {
      ok: false,
      reason: `"${file.name}" type is not supported. Use images, video, PDF, or documents.`,
    };
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return {
      ok: false,
      reason: `"${file.name}" is ${formatBytes(file.size)}. Max ${formatBytes(MAX_ATTACHMENT_BYTES)} per file.`,
    };
  }
  return { ok: true };
}

export function validateAttachmentBatch(
  existing: { size: number }[],
  incoming: File[]
): AttachmentValidationResult {
  if (existing.length + incoming.length > MAX_ATTACHMENT_COUNT) {
    return {
      ok: false,
      reason: `You can attach up to ${MAX_ATTACHMENT_COUNT} files.`,
    };
  }

  let total =
    existing.reduce((sum, a) => sum + a.size, 0) +
    incoming.reduce((sum, f) => sum + f.size, 0);

  for (const file of incoming) {
    const check = validateFile(file);
    if (!check.ok) return check;
  }

  if (total > MAX_TOTAL_ATTACHMENT_BYTES) {
    return {
      ok: false,
      reason: `Total attachments exceed ${formatBytes(MAX_TOTAL_ATTACHMENT_BYTES)}.`,
    };
  }

  return { ok: true };
}
