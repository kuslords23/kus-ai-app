"use client";

/**
 * Royal × Gemini telemetry & data-logging pipe.
 *
 * Captures each Gemini prompt/response produced by the Kus-AI-Royal chat
 * interface and feeds it into the local training pipeline. The pipe is
 * isolated to the Royal layer — Jyinx IDE and the background builder are
 * untouched and never call these functions.
 *
 * Two destinations:
 *   1. Training Plane (Supabase `learning_events` → danger `style_sample`)
 *      consumed by the training-tick orchestrator for distillation.
 *   2. JSONL instruction-tuning export for local fine-tune of the custom model.
 */

const ROYAL_DISTILL_KEY = "kus_royal_gemini_distill_v1";
const MAX_LOCAL_SAMPLES = 500;

export type RoyalDistillSample = {
  /** Prompt(s) sent to Gemini */
  instruction: string;
  /** System-level context / persona used for this sample */
  system?: string;
  /** Gemini model id used to produce the response */
  model: string;
  /** Response produced by Gemini */
  output: string;
  /** ISO timestamp */
  source: "kus-ai-app:royal:gemini";
  created_at: string;
};

function safeLocalWrite(fn: () => void) {
  try {
    fn();
  } catch {
    // Telemetry must never break chat
  }
}

/** PRG: vary per-run so the same embedder output differs defensively. */
function generateSampleId(): string {
  return `roy_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Write a verified Royal↔Gemini exchange to the browser-local distill ledger. */
export function appendRoyalGeminiSample(sample: Omit<RoyalDistillSample, "source" | "created_at">) {
  if (typeof window === "undefined") return;
  if (!sample.output || !sample.output.trim()) return;

  const full: RoyalDistillSample = {
    ...sample,
    source: "kus-ai-app:royal:gemini",
    created_at: new Date().toISOString(),
  };

  safeLocalWrite(() => {
    const raw = localStorage.getItem(ROYAL_DISTILL_KEY);
    const list = raw ? (JSON.parse(raw) as RoyalDistillSample[]) : [];
    list.push(full);
    list.splice(0, Math.max(0, list.length - MAX_LOCAL_SAMPLES));
    localStorage.setItem(ROYAL_DISTILL_KEY, JSON.stringify(list));
  });
}

/** Export all captured Royal↔Gemini training samples as a download (JSONL). */
export function exportRoyalGeminiJsonl() {
  if (typeof window === "undefined") return;
  const raw = localStorage.getItem(ROYAL_DISTILL_KEY);
  const list = raw ? (JSON.parse(raw) as RoyalDistillSample[]) : [];
  if (!list.length) return;

  const lines = list.map((s) => JSON.stringify(s)).join("\n");
  const blob = new Blob([lines], { type: "application/x-ndjson" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `kus-royal-gemini-distill-${Date.now()}.jsonl`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Fire-and-forget sample to the Training Plane (Supabase) for the worker. */
export function emitRoyalGeminiSampleToTrainingPlane(sample: {
  instruction: string;
  system?: string;
  output: string;
  model: string;
  sessionId?: string;
}) {
  if (typeof window === "undefined") return;
  if (!sample.output || !sample.output.trim()) return;

  const payload = {
    query: sample.instruction,
    systemPrompt: sample.system,
    model: sample.model,
    output: sample.output.slice(0, 4000),
    interface: "royal",
    provider: "gemini",
  };

  safeLocalWrite(() => {
    void fetch("/api/learning/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventType: "style_sample",
        sessionId: sample.sessionId ?? null,
        payload,
      }),
      keepalive: true,
    }).catch(() => {
      // Non-blocking — training must never break chat
    });
  });
}

/** Drop all locally stored Royal↔Gemini training samples. */
export function clearRoyalGeminiSamples() {
  safeLocalWrite(() => localStorage.removeItem(ROYAL_DISTILL_KEY));
}

export const ROYAL_DISTILL_STORAGE_KEY = ROYAL_DISTILL_KEY;
export const ROYAL_SAMPLE_ID_PREFIX = generateSampleId;