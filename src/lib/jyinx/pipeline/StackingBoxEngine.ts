/**
 * Stacking Box & Auto-Rewind Engine
 *
 * Agents may only advance one validated block at a time.
 * Failed validation triggers a micro-rewind to the prior state node,
 * then feeds error logs back to the Coder for a self-healing loop.
 */

import { timeTravelEngine } from "@/lib/jyinx/orchestrator/TimeTravelEngine";
import type { StateNode } from "@/lib/jyinx/orchestrator/StateNode";
import { routeFreeToAuto, type PipelineBlock } from "@/lib/jyinx/pipeline/FreeToAutoPipeline";

export type ValidatorResult = {
  ok: boolean;
  errors: string[];
  antiPatterns: string[];
};

export type StackBlock = PipelineBlock & {
  status: "pending" | "validating" | "accepted" | "rejected" | "healing";
  attempts: number;
  lastErrors?: string[];
  nodeId?: string;
};

export type StackEvent =
  | { type: "block_queued"; block: StackBlock }
  | { type: "block_accepted"; block: StackBlock; nodeId: string }
  | { type: "block_rejected"; block: StackBlock; errors: string[] }
  | { type: "auto_rewind"; toNodeId: string; reason: string }
  | { type: "heal_started"; block: StackBlock; route: ReturnType<typeof routeFreeToAuto> }
  | { type: "heal_finished"; block: StackBlock; success: boolean };

const ANTI_PATTERNS: Array<{ id: string; test: RegExp; message: string }> = [
  { id: "eval", test: /\beval\s*\(/, message: "Avoid eval()" },
  { id: "innerhtml", test: /\.innerHTML\s*=/, message: "Avoid raw innerHTML assignment" },
  { id: "hardcoded-secret", test: /(api[_-]?key|secret|password)\s*[:=]\s*['"][^'"]+['"]/i, message: "Possible hardcoded secret" },
  { id: "sql-concat", test: /(?:SELECT|INSERT|UPDATE|DELETE).*\+\s*(?:req\.|user|input|query)/i, message: "Possible SQL string concatenation" },
];

export function validateBlock(block: PipelineBlock): ValidatorResult {
  const errors: string[] = [];
  const antiPatterns: string[] = [];

  if (!block.content.trim()) {
    errors.push("Empty block");
  }

  if (block.kind === "code") {
    const open = (block.content.match(/\{/g) ?? []).length;
    const close = (block.content.match(/\}/g) ?? []).length;
    if (Math.abs(open - close) > 2) {
      errors.push("Unbalanced braces — block looks incomplete");
    }
  }

  for (const pattern of ANTI_PATTERNS) {
    if (pattern.test.test(block.content)) {
      antiPatterns.push(`${pattern.id}: ${pattern.message}`);
    }
  }

  return {
    ok: errors.length === 0 && antiPatterns.length === 0,
    errors,
    antiPatterns,
  };
}

type Listener = (event: StackEvent) => void;

export class StackingBoxEngine {
  private stack: StackBlock[] = [];
  private listeners = new Set<Listener>();
  private maxHealAttempts = 3;
  private lastGoodNodeId = "root";

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: StackEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  getStack(): StackBlock[] {
    return [...this.stack];
  }

  /**
   * Queue a block, validate it, accept or auto-rewind + heal.
   */
  async pushBlock(
    block: PipelineBlock,
    context: { intent: string; files?: Record<string, string> }
  ): Promise<{ accepted: boolean; block: StackBlock }> {
    const entry: StackBlock = {
      ...block,
      status: "pending",
      attempts: 0,
    };
    this.stack.push(entry);
    this.emit({ type: "block_queued", block: entry });

    return this.validateAndAdvance(entry, context);
  }

  private async validateAndAdvance(
    entry: StackBlock,
    context: { intent: string; files?: Record<string, string> }
  ): Promise<{ accepted: boolean; block: StackBlock }> {
    entry.status = "validating";
    entry.attempts += 1;

    const result = validateBlock(entry);
    if (result.ok) {
      const nodeId = this.snapshotAccept(entry, context);
      entry.status = "accepted";
      entry.nodeId = nodeId;
      entry.lastErrors = undefined;
      this.lastGoodNodeId = nodeId;
      this.emit({ type: "block_accepted", block: entry, nodeId });
      return { accepted: true, block: entry };
    }

    const errors = [...result.errors, ...result.antiPatterns];
    entry.status = "rejected";
    entry.lastErrors = errors;
    this.emit({ type: "block_rejected", block: entry, errors });

    // Proactive micro-rewind to last good node
    try {
      timeTravelEngine.rewind(this.lastGoodNodeId, { preserveCurrent: true, label: `pre-fault:${entry.id}` });
      this.emit({
        type: "auto_rewind",
        toNodeId: this.lastGoodNodeId,
        reason: errors.join("; "),
      });
    } catch {
      // Root may be the only node — still continue healing
    }

    if (entry.attempts >= this.maxHealAttempts) {
      return { accepted: false, block: entry };
    }

    return this.heal(entry, context, errors);
  }

  private async heal(
    entry: StackBlock,
    context: { intent: string; files?: Record<string, string> },
    errors: string[]
  ): Promise<{ accepted: boolean; block: StackBlock }> {
    entry.status = "healing";
    const route = routeFreeToAuto({
      intent: context.intent,
      block: entry,
      validationFailed: true,
      errorLog: errors.join("\n"),
    });
    this.emit({ type: "heal_started", block: entry, route });

    // Stop here — API/orchestrator must call applyHealPatch after Tier-2 rewrite.
    // Avoid recursive re-validation on unchanged content.
    this.emit({ type: "heal_finished", block: entry, success: false });
    return { accepted: false, block: entry };
  }

  /**
   * Apply a healed content patch from the Coder agent, then re-validate once.
   */
  async applyHealPatch(
    blockId: string,
    content: string,
    context: { intent: string; files?: Record<string, string> }
  ): Promise<{ accepted: boolean; block: StackBlock | undefined }> {
    const entry = this.stack.find((b) => b.id === blockId);
    if (!entry) return { accepted: false, block: undefined };
    entry.content = content;
    entry.status = "pending";
    return this.validateAndAdvance(entry, context);
  }

  private snapshotAccept(
    entry: StackBlock,
    context: { intent: string; files?: Record<string, string> }
  ): string {
    const files = { ...(context.files ?? {}) };
    if (entry.path) files[entry.path] = entry.content;

    const state: StateNode = {
      id: "",
      parentId: this.lastGoodNodeId,
      branch: timeTravelEngine.getActiveBranch()?.id ?? "main",
      timestamp: new Date(),
      phase: "executing",
      userIntent: context.intent,
      repository: "",
      tasks: [],
      logs: [
        {
          id: `log_${entry.id}`,
          timestamp: new Date(),
          action: "block_accept",
          details: `Accepted block ${entry.id}${entry.path ? ` (${entry.path})` : ""}`,
          status: "completed",
          success: true,
        },
      ],
      files,
      metadata: { blockId: entry.id, kind: entry.kind },
      label: `block:${entry.id}`,
    };

    return timeTravelEngine.snapshot(state, `Accepted ${entry.id}`);
  }

  reset(): void {
    this.stack = [];
    this.lastGoodNodeId = "root";
  }
}

export const stackingBoxEngine = new StackingBoxEngine();
