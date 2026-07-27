/**
 * Hub-compatible RAG client.
 * Matches sport-clan-nexus `app/lib/rag/client.ts` request/response contract.
 * Brain stays on hub — we call via our proxy `/api/ai/rag`.
 */

export type RagHistoryItem = {
  role: "user" | "assistant";
  content: string;
};

export type RagUserContext = Record<string, unknown> | null | undefined;

export type RagAttachment = {
  kind: string;
  url?: string;
  name?: string;
  [key: string]: unknown;
};

export type RagRequestOptions = {
  sourceType?: string;
  userContext?: RagUserContext;
  history?: RagHistoryItem[];
  attachments?: RagAttachment[];
};

export type RagAction = {
  tab?: string;
  sportsSubTab?: string;
  marketSubTab?: string;
  feedMainTab?: string;
  url?: string;
  [key: string]: unknown;
};

export type RagResult = {
  ok: boolean;
  answer: string;
  error?: string;
  actionTaken?: boolean;
  action?: RagAction;
  sources?: unknown[];
  mode?: string;
  sportsData?: unknown;
  recommendations?: unknown[];
  usedWebSearch?: boolean;
  dataSource?: string;
  agentsUsed?: string[];
  intentReason?: string;
  cacheBackend?: string;
  cacheHit?: boolean;
};

export type StreamHandlers = {
  onMeta?: (meta: Record<string, unknown>) => void;
  onToken?: (text: string) => void;
  signal?: AbortSignal;
};

function parseSseBlock(
  chunk: string,
  eventName: string,
  onEvent: (name: string, data: Record<string, unknown>) => void
): { buffer: string; eventName: string } {
  const lines = chunk.split("\n");
  const rest = lines.pop() || "";
  let current = eventName;
  for (const line of lines) {
    if (line.startsWith("event:")) {
      current = line.slice(6).trim();
      continue;
    }
    if (!line.startsWith("data:")) continue;
    const raw = line.slice(5).trim();
    if (!raw) continue;
    try {
      onEvent(current, JSON.parse(raw));
    } catch {
      // ignore malformed
    }
    current = "message";
  }
  return { buffer: rest, eventName: current };
}

/** Non-streaming hub RAG call (fallback). */
export async function askRag(
  query: string,
  options?: RagRequestOptions
): Promise<RagResult> {
  try {
    const res = await fetch("/api/ai/rag", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        sourceType: options?.sourceType,
        userContext: options?.userContext ?? undefined,
        history: options?.history ?? undefined,
        attachments: options?.attachments ?? undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        error: data.error || `RAG request failed (${res.status})`,
        answer:
          data.answer ||
          "Kus AI is catching its breath — try “show my wallet” or ask again in a moment.",
        actionTaken: false,
        sources: data.sources ?? [],
        mode: data.mode ?? "extractive",
      };
    }
    return {
      ok: true,
      answer: data.answer,
      actionTaken: data.actionTaken,
      action: data.action,
      sources: data.sources ?? [],
      mode: data.mode,
      sportsData: data.sportsData,
      recommendations: data.recommendations,
      usedWebSearch: data.usedWebSearch,
      dataSource: data.dataSource,
      agentsUsed: data.agentsUsed,
      intentReason: data.intentReason,
      cacheBackend: data.cacheBackend,
      cacheHit: data.cacheHit,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Network error",
      answer:
        "Couldn’t reach Kus AI just now — check your connection and try again.",
      actionTaken: false,
      sources: [],
      mode: "extractive",
    };
  }
}

/** Streaming hub RAG call — same path as hub AIAssistantPanel. */
export async function streamRag(
  query: string,
  options?: RagRequestOptions,
  handlers?: StreamHandlers
): Promise<RagResult> {
  const parse = parseSseBlock;
  try {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 55_000);
    const outer = handlers?.signal;
    const onAbort = () => controller.abort();
    outer?.addEventListener("abort", onAbort);

    let res: Response;
    try {
      res = await fetch("/api/ai/rag", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({
          query,
          stream: true,
          sourceType: options?.sourceType,
          userContext: options?.userContext ?? undefined,
          history: options?.history ?? undefined,
          attachments: options?.attachments ?? undefined,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
      outer?.removeEventListener("abort", onAbort);
    }

    const contentType = res.headers.get("content-type") || "";
    if (!res.ok) {
      await res.json().catch(() => ({}));
      return askRag(query, options);
    }

    if (!contentType.includes("text/event-stream") || !res.body) {
      try {
        const data = await res.json();
        if (data.answer) handlers?.onToken?.(data.answer);
        return { ...data, ok: data.ok !== false };
      } catch {
        return askRag(query, options);
      }
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let eventName = "message";
    const state: {
      assembled: string;
      final: RagResult | null;
      error: string | null;
    } = { assembled: "", final: null, error: null };

    const onEvent = (name: string, data: Record<string, unknown>) => {
      if (name === "meta") {
        handlers?.onMeta?.(data);
      } else if (name === "token") {
        const text = String(data.text || "");
        state.assembled += text;
        handlers?.onToken?.(text);
      } else if (name === "done") {
        state.final = {
          ok: true,
          answer: String(data.answer || state.assembled),
          actionTaken: !!data.actionTaken,
          action: data.action as RagAction | undefined,
          sources: (data.sources as unknown[]) ?? [],
          mode: (data.mode as string) || "openai",
          sportsData: data.sportsData,
          recommendations: data.recommendations as unknown[] | undefined,
          usedWebSearch: data.usedWebSearch as boolean | undefined,
          dataSource: data.dataSource as string | undefined,
          agentsUsed: data.agentsUsed as string[] | undefined,
          intentReason: data.intentReason as string | undefined,
          cacheBackend: data.cacheBackend as string | undefined,
          cacheHit: data.cacheHit as boolean | undefined,
        };
      } else if (name === "error") {
        state.error = String(data.error || "Stream error");
      }
    };

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parsed = parse(buffer, eventName, onEvent);
      buffer = parsed.buffer;
      eventName = parsed.eventName;
    }

    buffer += decoder.decode();
    if (buffer.trim()) {
      parse(buffer.endsWith("\n") ? buffer : `${buffer}\n`, eventName, onEvent);
    }

    if (state.error && !state.final && !state.assembled) {
      return askRag(query, options);
    }
    if (state.final?.answer) return state.final;
    if (state.assembled.trim()) {
      return {
        ok: true,
        answer: state.assembled,
        actionTaken: !!state.final?.actionTaken,
        action: state.final?.action,
        sources: state.final?.sources ?? [],
        mode: state.final?.mode ?? "openai",
        sportsData: state.final?.sportsData,
        recommendations: state.final?.recommendations,
        usedWebSearch: state.final?.usedWebSearch,
        dataSource: state.final?.dataSource,
        agentsUsed: state.final?.agentsUsed,
      };
    }
    return askRag(query, options);
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      try {
        return await askRag(query, options);
      } catch {
        return {
          ok: false,
          error: "aborted",
          answer: "Kus AI timed out — try a shorter question.",
          actionTaken: false,
          sources: [],
          mode: "extractive",
        };
      }
    }
    return askRag(query, options);
  }
}
