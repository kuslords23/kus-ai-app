/**
 * Cost-Optimized Free-to-Auto Pipeline
 *
 * Tier 1 (Drafting): high-speed OpenRouter :free models for scaffolding.
 * Tier 2 (Precision): conditional fallback to paid/BYOK models only when
 * a block fails validation or the user explicitly requests cleanup.
 */

export type PipelineTier = "draft" | "precision";

export type PipelineBlock = {
  id: string;
  kind: "code" | "layout" | "config" | "markdown";
  language?: string;
  content: string;
  path?: string;
};

export type PipelineRequest = {
  intent: string;
  block?: PipelineBlock;
  forcePrecision?: boolean;
  validationFailed?: boolean;
  errorLog?: string;
  userId?: string;
  preferredPrecisionModel?: string;
};

export type PipelineRoute = {
  tier: PipelineTier;
  model: string;
  provider: "openrouter" | "byok";
  reason: string;
  systemPrompt: string;
  userPrompt: string;
};

const FREE_DRAFT_MODELS = [
  "openrouter/free",
  "google/gemini-2.5-flash:free",
  "meta-llama/llama-3.1-8b-instruct:free",
] as const;

const PRECISION_MODELS = [
  "openrouter/auto",
  "anthropic/claude-sonnet-4",
  "openai/gpt-4.1-mini",
] as const;

const DRAFT_SYSTEM = `You are Jyinx Draft Agent (Tier 1). Produce modular, isolated blocks only.
Rules:
- Prefer small, self-contained code/layout blocks.
- Do not invent secrets or credentials.
- Mark uncertainty clearly.
- Optimize for speed and zero cost; leave polish for Tier 2.`;

const PRECISION_SYSTEM = `You are Jyinx Precision Cleanup Agent (Tier 2). Fix failed or complex blocks only.
Rules:
- Preserve the original intent and file paths.
- Apply the minimum change that passes validation.
- Explain briefly what you fixed.
- Never expand scope beyond the failing block.`;

export function pickDraftModel(preferred?: string): string {
  if (preferred && FREE_DRAFT_MODELS.includes(preferred as (typeof FREE_DRAFT_MODELS)[number])) {
    return preferred;
  }
  return FREE_DRAFT_MODELS[0];
}

export function pickPrecisionModel(preferred?: string): string {
  if (preferred) return preferred;
  return PRECISION_MODELS[0];
}

/**
 * Decide whether this request stays on free drafting or escalates to precision.
 */
export function routeFreeToAuto(req: PipelineRequest): PipelineRoute {
  const needsPrecision = Boolean(req.forcePrecision || req.validationFailed || req.errorLog);

  if (!needsPrecision) {
    const model = pickDraftModel();
    return {
      tier: "draft",
      model,
      provider: "openrouter",
      reason: "Initial scaffolding via free-tier drafting layer",
      systemPrompt: DRAFT_SYSTEM,
      userPrompt: buildUserPrompt(req, "draft"),
    };
  }

  return {
    tier: "precision",
    model: pickPrecisionModel(req.preferredPrecisionModel),
    provider: "openrouter",
    reason: req.validationFailed
      ? "Validator failed — escalating to precision cleanup"
      : "Manual/forced precision pass",
    systemPrompt: PRECISION_SYSTEM,
    userPrompt: buildUserPrompt(req, "precision"),
  };
}

function buildUserPrompt(req: PipelineRequest, tier: PipelineTier): string {
  const parts = [`Intent:\n${req.intent}`];
  if (req.block) {
    parts.push(
      `Block (${req.block.kind}${req.block.path ? ` @ ${req.block.path}` : ""}):\n\`\`\`${req.block.language ?? ""}\n${req.block.content}\n\`\`\``
    );
  }
  if (tier === "precision" && req.errorLog) {
    parts.push(`Validation / error log:\n${req.errorLog}`);
  }
  parts.push(
    tier === "draft"
      ? "Return a single modular block ready for the stacking box."
      : "Return the corrected block only — no unrelated files."
  );
  return parts.join("\n\n");
}

/**
 * Server-side executor: routes through the existing gateway when available.
 */
export async function executeFreeToAuto(
  req: PipelineRequest,
  execute: (args: {
    model: string;
    system: string;
    prompt: string;
    forcePaid?: boolean;
  }) => Promise<{ content: string; model: string; error?: string }>
): Promise<{
  tier: PipelineTier;
  content: string;
  model: string;
  routeReason: string;
  error?: string;
}> {
  const route = routeFreeToAuto(req);
  const result = await execute({
    model: route.model,
    system: route.systemPrompt,
    prompt: route.userPrompt,
    forcePaid: route.tier === "precision",
  });

  return {
    tier: route.tier,
    content: result.content,
    model: result.model || route.model,
    routeReason: route.reason,
    error: result.error,
  };
}
