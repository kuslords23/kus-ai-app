/**
 * Universal AI Router — provider-agnostic gateway client factory.
 *
 * Exposes the standard OpenAI-SDK-shaped surface so business logic stays
 * provider-agnostic:
 *
 *   import { aiGateway } from "@/server/ai-gateway";
 *   const res = await aiGateway.chat.completions.create({
 *     model: "openrouter/free",
 *     messages: [{ role: "user", content: "hello" }],
 *   });
 *
 * Switching platforms is purely a configuration change:
 *   AI_GATEWAY_PROVIDER=openrouter | vercel | litellm | portkey | braintrust | direct
 *   AI_GATEWAY_BASE_URL=…      (override any platform URL)
 *   AI_GATEWAY_API_KEY=…       (gateway key; falls back to provider keys)
 *
 * The client also:
 *   - retries retryable failures (429 / 5xx / network) with exponential backoff
 *   - fails over to `AI_FALLBACK_MODELS` when the primary model errors
 *   - measures latency (and TTFT for streams)
 *   - writes per-request telemetry (tokens, cost, model, latency) to Supabase
 */
import { resolveGatewayConfig, type GatewayConfig } from "./config";
import { withRetry } from "./retry";
import { estimateUsd } from "./pricing";
import { createTelemetry, type TelemetryWriter } from "./telemetry";
import type {
  ChatCompletionChunk,
  ChatCompletionResult,
  ChatCompletionsRequest,
  Usage,
} from "./types";

export interface GatewayCallOptions {
  userId?: string;
  ip?: string;
  noFallback?: boolean;
  timeoutMs?: number;
  metadata?: Record<string, unknown>;
  virtualKey?: string;
}

export interface AiGateway {
  readonly config: GatewayConfig;
  chat: {
    completions: {
      /** Non-streaming chat completion (normalized OpenAI response). */
      create(req: ChatCompletionsRequest, opts?: GatewayCallOptions): Promise<ChatCompletionResult>;
    };
  };
  /** OpenAI-SSE streaming. Yields normalized chunks; telemetry recorded after
   *  the stream completes. Throws when every candidate fails. */
  stream(req: ChatCompletionsRequest, opts?: GatewayCallOptions): AsyncGenerator<ChatCompletionChunk>;
  /** Rebuild the client with a different resolved config (env switch). */
  withConfig(config: GatewayConfig): AiGateway;
}

function buildHeaders(config: GatewayConfig, virtualKey?: string): Record<string, string> {
  const key = virtualKey ?? config.apiKey ?? "";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (key) headers[config.headerName] = `${config.headerPrefix}${key}`;
  if (config.extraHeaders) Object.assign(headers, config.extraHeaders);
  return headers;
}

function normalizeUsage(raw: Usage | undefined | null): Usage {
  if (!raw) return { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  return {
    prompt_tokens: raw.prompt_tokens ?? 0,
    completion_tokens: raw.completion_tokens ?? 0,
    total_tokens: raw.total_tokens ?? (raw.prompt_tokens ?? 0) + (raw.completion_tokens ?? 0),
  };


function parseErrorBody(body: string, status: number): string {
  if (!body) return `HTTP ${status}`;
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } | string; message?: string };
    if (typeof parsed.error === "string") return parsed.error;
    if (parsed.error?.message) return parsed.error.message;
    if (typeof parsed.message === "string") return parsed.message;
    return body.slice(0, 300);
  } catch {
    return body.slice(0, 300);
  }
}

function errorOf(cause: unknown): { error: string; status?: number } {
  const message = cause instanceof Error ? cause.message : String(cause);
  const status = (cause as { status?: number }).status;
  return { error: message, status };
}

export function createAiGateway(
  config: GatewayConfig = resolveGatewayConfig(),
  telemetry: TelemetryWriter = createTelemetry(config.telemetryEnabled)
): AiGateway {
  /** One non-streaming attempt against a candidate model (throws on failure). */
  const attemptCompletion = async (
    req: ChatCompletionsRequest,
    model: string,
    opts: GatewayCallOptions
  ): Promise<{ content: string; model: string; usage?: Usage }> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? config.requestTimeoutMs);
    try {
      const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: buildHeaders(config, opts.virtualKey),
        body: JSON.stringify({
          model,
          messages: req.messages,
          temperature: req.temperature,
          top_p: req.top_p,
          max_tokens: req.max_tokens,
          max_completion_tokens: req.max_completion_tokens,
          stream: false,
          stop: req.stop,
          presence_penalty: req.presence_penalty,
          frequency_penalty: req.frequency_penalty,
          seed: req.seed,
          response_format: req.response_format,
          tools: req.tools,
          tool_choice: req.tool_choice,
          user: req.user,
        }),
        cache: "no-store",
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw Object.assign(new Error(parseErrorBody(body, response.status)), { status: response.status });
      }

      const data = (await response.json().catch(() => null)) as {
        choices?: Array<{ message?: { content?: string | null } }>;
        usage?: Usage | null;
        model?: string;
      } | null;

      if (!data || !data.choices?.length) {
        throw Object.assign(new Error("Empty completion response."), { status: 502 });
      }

      return {
        content: data.choices[0]?.message?.content ?? "",
        model: data.model ?? model,
        usage: data.usage ?? undefined,
      };
    } finally {
      clearTimeout(timer);
    }
  };

  const create = async (
    req: ChatCompletionsRequest,
    opts: GatewayCallOptions = {}
  ): Promise<ChatCompletionResult> => {
    const started = Date.now();
    const requestedModel = req.model || config.primaryModel;
    const candidates = [requestedModel, ...(opts.noFallback ? [] : config.fallbackModels)];

    let lastError = "";
    let retries = 0;
    let served: { content: string; model: string; usage?: Usage } | null = null;
    let fallbackUsed = false;

    for (let i = 0; i < candidates.length; i++) {
      const model = candidates[i];
      if (i > 0) fallbackUsed = true;

      const attempt = await withRetry(
        async () => attemptCompletion(req, model, opts),
        { maxRetries: config.maxRetries, baseDelayMs: 400 }
      );

      retries = attempt.retries;
      if (attempt.ok) {
        served = attempt.value;
        break;
      }
      // After the break above, TypeScript cannot narrow the union past the
      // break statement. We use `as unknown as` to safely widen the type.
      lastError = (attempt as unknown as { ok: false; error: string }).error;
    }

    const latencyMs = Date.now() - started;
    const usage = normalizeUsage(served?.usage);
    const provider = config.directProvider ?? config.provider;
    const cost = estimateUsd(provider, served?.model ?? requestedModel, usage.prompt_tokens, usage.completion_tokens);

    const result: ChatCompletionResult = {
      ok: served !== null,
      content: served?.content ?? "",
      model: served?.model ?? requestedModel,
      requestedModel,
      provider,
      gateway: config.provider,
      usage: served?.usage,
      cost,
      latencyMs,
      retries,
      fallbackUsed,
      error: served ? undefined : lastError || `All ${candidates.length} candidate model(s) failed.`,
    };

    void telemetry.record({
      userId: opts.userId,
      ip: opts.ip,
      gateway: config.provider,
      provider,
      model: result.model,
      requestedModel,
      status: result.ok ? (result.fallbackUsed ? "fallback" : "ok") : "error",
      promptTokens: usage.prompt_tokens,
      completionTokens: usage.completion_tokens,
      totalTokens: usage.total_tokens,
      cost,
      latencyMs,
      retries,
      error: result.error,
      metadata: opts.metadata,
    });

    return result;
  };

  /** Streaming: yields OpenAI chunks for one candidate; fails over to the next. */
  const stream = async function* (
    req: ChatCompletionsRequest,
    opts: GatewayCallOptions = {}
  ): AsyncGenerator<ChatCompletionChunk> {
    const started = Date.now();
    const requestedModel = req.model || config.primaryModel;
    const candidates = [requestedModel, ...(opts.noFallback ? [] : config.fallbackModels)];

    let lastError = "";
    let ok = false;
    let ttftMs: number | undefined;
    let servedModel = requestedModel;
    let promptTokens = 0;
    let completionTokens = 0;
    let retries = 0;

    for (let i = 0; i < candidates.length; i++) {
      const model = candidates[i];

      const attempt = await withRetry<{ stream: ReadableStream<Uint8Array>; model: string }>(
        async () => {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? config.requestTimeoutMs);
          try {
            const response = await fetch(`${config.baseUrl}/chat/completions`, {
              method: "POST",
              headers: buildHeaders(config, opts.virtualKey),
              body: JSON.stringify({ ...req, model, stream: true } as Record<string, unknown>),
              cache: "no-store",
              signal: controller.signal,
            });
            if (!response.ok) {
              const body = await response.text().catch(() => "");
              throw Object.assign(new Error(parseErrorBody(body, response.status)), { status: response.status });
            }
            if (!response.body) throw Object.assign(new Error("Empty stream."), { status: 502 });
            return { stream: response.body, model };
          } catch (cause) {
            const { error, status } = errorOf(cause);
            throw Object.assign(new Error(error), { status });
          } finally {
            clearTimeout(timer);
          }
        },
        { maxRetries: config.maxRetries, baseDelayMs: 400 }
      );

      retries = attempt.retries;
      if (attempt.ok) {
        ok = true;
        servedModel = attempt.value.model;
        const reader = attempt.value.stream.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        try {
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            let sep = buffer.indexOf("\n\n");
            while (sep !== -1) {
              const chunkBlock = buffer.slice(0, sep);
              buffer = buffer.slice(sep + 2);
              for (const line of chunkBlock.split("\n")) {
                if (!line.startsWith("data:")) continue;
                const payload = line.slice(5).trim();
                if (payload === "[DONE]") continue;
                try {
                  const json = JSON.parse(payload) as ChatCompletionChunk;
                  if (ttftMs === undefined && json.choices?.[0]?.delta?.content) {
                    ttftMs = Date.now() - started;
                  }
                  if (json.usage) {
                    promptTokens = json.usage.prompt_tokens ?? promptTokens;
                    completionTokens = json.usage.completion_tokens ?? completionTokens;
                  }
                  yield json;
                } catch {
                  // skip malformed chunk
                }
              }
              sep = buffer.indexOf("\n\n");
            }
          }
        } finally {
          reader.releaseLock();
        }
        break;
      }
      lastError = (attempt as unknown as { ok: false; error: string }).error;
    }

    const latencyMs = Date.now() - started;
    const provider = config.directProvider ?? config.provider;
    const cost = estimateUsd(provider, servedModel, promptTokens, completionTokens);

    void telemetry.record({
      userId: opts.userId,
      ip: opts.ip,
      gateway: config.provider,
      provider,
      model: servedModel,
      requestedModel,
      status: ok ? "ok" : "error",
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      cost,
      latencyMs,
      ttftMs,
      retries,
      error: ok ? undefined : lastError,
      metadata: opts.metadata,
    });

    if (!ok) throw new Error(lastError || `All ${candidates.length} candidate model(s) failed.`);
  };

  return {
    config,
    chat: { completions: { create } },
    stream,
    withConfig: (next) => createAiGateway(next, createTelemetry(next.telemetryEnabled)),
  };
}
