/**
 * Sanitizers for assistant output.
 *
 * The conversational layer (Royal) must only ever show clean, human-readable
 * markdown. Some providers/models emit raw function-call or tool-invocation
 * XML as part of the text stream (e.g. `<dots_function_call>…</dots_function_call>`,
 * `<invoke>…</invoke>`, `<antml:invoke …>…</antml:invoke>`, partial tool calls).
 *
 * This module strips those tags and their payloads so they never leak into the
 * chat bubble, while dev/agent/sandbox logs in the Jyinx panels remain
 * untouched (they never pass through this sanitizer).
 */

const NEXT_LINE_BREAKS = "\\s*";

// Full self-closing or paired blocks. Backreference `\1` guarantees the open
// and close tag names match so we never over-consume unrelated content.
const TOOL_BLOCK_PATTERNS: RegExp[] = [
  // <dots_function_call>…</dots_function_call>, <invoke>…</invoke>,
  // <function_calls>…</function_calls>, <tool_call>…</tool_call>, with optional attrs.
  /<\s*(dots_[a-z_]+|invoke|function_calls?|tool_calls?)[^>]*>[\s\S]*?<\/\s*\1\s*>/gi,
  // Anthropic-style <antml:invoke name="…">…</antml:invoke>
  /<\s*(antml:[a-z_]+)[^>]*>[\s\S]*?<\/\s*\1\s*>/gi,
];

// Any lone leftover tool tag (unmatched open or close) after block stripping.
const LONE_TAG_PATTERNS: RegExp[] = [
  /<\s*\/?\s*(?:dots_[a-z_]+|invoke|function_calls?|tool_calls?)\b[^>]*>/gi,
  /<\s*\/?\s*antml:[a-z_]+\b[^>]*>/gi,
];

/** Cheap pre-check: only run the heavier logic when tool markup may be present. */
function mayContainToolMarkup(content: string): boolean {
  if (!content.includes("<")) return false;
  return (
    /<\/?[a-z0-9_]*:?dot[a-z_]*>/i.test(content) ||
    /<\/?(?:dots_[a-z_]+|invoke|function_calls?|tool_calls?)\b/i.test(content) ||
    /<\/?antml:[a-z_]+/i.test(content) ||
    /<\/?[a-z0-9]+_[a-z]+>/i.test(content)
  );
}

function unescapeEntities(content: string): string {
  return content
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

/**
 * Removes stray tool-invocation markup (open tag + payload + close tag, plus
 * any unmatched lone tags) while preserving markdown, code fences and prose.
 */
export function sanitizeAssistantContent(content: string): string {
  if (!content || !content.includes("<")) return content;

  const decoded = unescapeEntities(content);
  if (!mayContainToolMarkup(decoded)) {
    return decoded !== content ? decoded : content;
  }

  let result = decoded;
  for (const pattern of TOOL_BLOCK_PATTERNS) {
    result = result.replace(pattern, NEXT_LINE_BREAKS);
  }
  for (const pattern of LONE_TAG_PATTERNS) {
    result = result.replace(pattern, "");
  }

  return result
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}