/**
 * Agent execution event type (client-safe).
 *
 * Extracted OUT of `@/services/agentPipeline` (a server-only module) so client
 * components like AgentExecutionStream can type the SSE stream WITHOUT any
 * reference to the server module. No runtime imports.
 */

export type AgentExecutionEvent =
  | { type: "narration"; message: string; detail?: string }
  | { type: "log"; message: string }
  | { type: "reasoning"; message: string }
  | { type: "rejected"; file: string; reason: string }
  | { type: "whitespace"; message: string }
  | { type: "error"; message: string; connect?: boolean }
  | { type: "deploying"; message: string }
  | { type: "deployed"; url: string }
  | { type: "edit"; files: Array<{ path: string; content: string }> }
  | { type: "done"; summary: string };