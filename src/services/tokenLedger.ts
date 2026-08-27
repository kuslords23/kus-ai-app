"use client";

import { hybridStorage } from "@/lib/jyinx/hybrid-storage-adapter";

/**
 * Local token-metering ledger.
 *
 * A lightweight, zero-cloud-dependency ledger that persists token usage locally
 * (IndexedDB via the project's hybrid storage adapter). Intercepts model
 * responses to record input tokens, output tokens, cached tokens, and compute a
 * precise cost estimate using a provider pricing manifest.
 *
 * Safe in the browser and on the server (adapters that are not available in a
 * given runtime degrade gracefully).
 */

export type LedgerEntry = {
  id: string;
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  totalTokens: number;
  cost: number;
  timestamp: string;
  note?: string;
};

export type LedgerTotals = {
  totalRequests: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  totalTokens: number;
  totalCost: number;
  byModel: Record<string, { requests: number; tokens: number; cost: number }>;
};

const LEDGER_PREFIX = "token-ledger";
const LIMIT = 500;

function entryId(): string {
  return `entry_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// Provider pricing manifest (USD per 1M tokens).
const PRICING: Record<string, { input: number; output: number }> = {
  openrouter: { input: 0, output: 0 }, // free routing
  openai: { input: 2.5, output: 10 },
  anthropic: { input: 3, output: 15 },
  deepseek: { input: 0.27, output: 1.1 },
  google: { input: 1.25, output: 5 },
  local: { input: 0, output: 0 },
};

export function costForTokens(provider: string, inputTokens: number, outputTokens: number, cachedTokens = 0): number {
  const price = PRICING[provider] ?? PRICING.openrouter;
  const billedInput = Math.max(0, inputTokens - cachedTokens);
  return (billedInput / 1_000_000) * price.input + (outputTokens / 1_000_000) * price.output;
}

const EMPTY_TOTALS: LedgerTotals = {
  totalRequests: 0,
  inputTokens: 0,
  outputTokens: 0,
  cachedTokens: 0,
  totalTokens: 0,
  totalCost: 0,
  byModel: {},
};

/**
 * Records one token-usage event (input/output/cached) and returns the entry.
 */
export async function recordUsage(input: {
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens?: number;
  note?: string;
}): Promise<LedgerEntry | null> {
  const entry: LedgerEntry = {
    id: entryId(),
    model: input.model,
    provider: input.provider,
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
    cachedTokens: input.cachedTokens ?? 0,
    totalTokens: input.inputTokens + input.outputTokens + (input.cachedTokens ?? 0),
    cost: costForTokens(input.provider, input.inputTokens, input.outputTokens, input.cachedTokens),
    timestamp: new Date().toISOString(),
    note: input.note,
  };
  try {
    const stored = await hybridStorage.readData(LEDGER_PREFIX + ":list");
    const prev = (stored as LedgerEntry[] | null) ?? [];
    const next = [entry, ...prev].slice(0, LIMIT);
    await hybridStorage.writeData(LEDGER_PREFIX + ":list", next);
  } catch {
    // storage unavailable — entry still returned for immediate display
  }
  return entry;
}

/**
 * Reads all recorded usage entries, newset first.
 */
export async function getLedger(): Promise<LedgerEntry[]> {
  try {
    const entries = (await hybridStorage.readData(LEDGER_PREFIX + ":list")) as LedgerEntry[] | null;
    if (!Array.isArray(entries)) return [];
    return entries;
  } catch {
    return [];
  }
}

/**
 * Aggregates the ledger into totals suitable for a dashboard or cost tracker.
 */
export async function getTotals(): Promise<LedgerTotals> {
  const entries = await getLedger();
  if (!entries.length) return EMPTY_TOTALS;
  const totals: LedgerTotals = { ...EMPTY_TOTALS, byModel: {} };
  for (const entry of entries) {
    totals.totalRequests += 1;
    totals.inputTokens += entry.inputTokens;
    totals.outputTokens += entry.outputTokens;
    totals.cachedTokens += entry.cachedTokens;
    totals.totalTokens += entry.totalTokens;
    totals.totalCost += entry.cost;
    const model = totals.byModel[entry.model] ?? { requests: 0, tokens: 0, cost: 0 };
    model.requests += 1;
    model.tokens += entry.totalTokens;
    model.cost += entry.cost;
    totals.byModel[entry.model] = model;
  }
  return totals;
}

/** Clears the local ledger. */
export async function clearLedger(): Promise<void> {
  try {
    await hybridStorage.writeData(LEDGER_PREFIX + ":list", []);
  } catch {
    // ignore
  }
}