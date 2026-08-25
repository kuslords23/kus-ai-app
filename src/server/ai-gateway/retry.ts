/**
 * Retry & failover resilience helpers.
 *
 * Classifies failures into retryable (429 rate limit, 5xx server error,
 * network error, timeout) vs terminal (400, 401, 404, 422 …) and retries with
 * exponential backoff + jitter so a burst of traffic doesn't hammer the
 * upstream the moment it recovers.
 */

const RETRYABLE_STATUS = new Set([408, 409, 429, 500, 502, 503, 504]);
const NETWORK_ERROR_RE = /timeout|econnreset|econnrefused|eai_again|etimedout|fetch failed|socket hang up/i;

export function isRetryableStatus(status: number): boolean {
  return RETRYABLE_STATUS.has(status);
}

export function isRateLimit(status: number): boolean {
  return status === 429;
}

function isRetryableError(message: string, status?: number): boolean {
  if (status !== undefined && status === 0) return true; // network-layer failure
  if (status !== undefined && RETRYABLE_STATUS.has(status)) return true;
  return NETWORK_ERROR_RE.test(message);
}

/** Exponential backoff + jitter: floor(random * base * 2^attempt), capped. */
export function backoffMs(baseMs: number, attempt: number, capMs = 8000): number {
  const window = Math.min(baseMs * 2 ** attempt, capMs);
  return Math.floor(Math.random() * window);
}

export type RetryOutcome<T> = {
  ok: true;
  value: T;
  retries: number;
} | {
  ok: false;
  error: string;
  status?: number;
  retries: number;
}

/**
 * Runs `fn` with automatic retries.
 *
 * `fn` returns either a success value, or a failure carrying a status / error.
 * Retries happen when the failure is retryable AND attempts remain. `fn` may
 * also throw — thrown errors follow the same retry classification.
 */
export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  opts: {
    maxRetries?: number;
    baseDelayMs?: number;
    /** Custom predicate deciding whether a failure is retryable. */
    isRetryable?: (error: string, status?: number) => boolean;
    /** Thrown errors are surfaced through this (defaults to rethrow-capture). */
    onError?: (error: unknown, attempt: number) => { error: string; status?: number };
  }
): Promise<RetryOutcome<T>> {
  const maxRetries = opts.maxRetries ?? 3;
  const baseDelay = opts.baseDelayMs ?? 400;
  const classify = opts.isRetryable ?? isRetryableError;
  const onError = opts.onError;

  let lastError = "Request failed.";
  let lastStatus: number | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const value = await fn(attempt);
      return { ok: true, value, retries: attempt };
    } catch (cause) {
      // Preserve the numeric HTTP status thrown by callers (e.g. via
      // `Object.assign(new Error(...), { status })`) so retry classification
      // works on status codes, not just the message text.
      const message = cause instanceof Error ? cause.message : String(cause);
      const status = (cause as { status?: number }).status;
      if (onError) {
        const mapped = onError(cause, attempt);
        lastError = mapped.error;
        lastStatus = mapped.status;
      } else {
        lastError = message;
        lastStatus = status;
      }

      if (!classify(lastError, lastStatus)) {
        return { ok: false, error: lastError, status: lastStatus, retries: attempt };
      }
      if (attempt < maxRetries) {
        await wait(backoffMs(baseDelay, attempt));
      }
    }
  }

  return { ok: false, error: lastError, status: lastStatus, retries: maxRetries };
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}