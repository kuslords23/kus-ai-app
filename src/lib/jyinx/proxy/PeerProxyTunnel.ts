/**
 * P2P Agent/Model Proxy Tunnel
 *
 * Shares or rents agent/model access without exposing raw API keys.
 * The gateway attaches owner-authorized credits at runtime.
 */

export type ProxySession = {
  id: string;
  ownerId: string;
  renterId: string;
  listingId: string;
  expiresAt: Date;
  creditsBudget: number;
  creditsSpent: number;
  status: "active" | "expired" | "revoked";
};

export type ProxyInvokeRequest = {
  sessionId: string;
  renterId: string;
  prompt: string;
  model?: string;
  estimatedCostCredits?: number;
};

export type ProxyInvokeResult = {
  ok: boolean;
  content?: string;
  model?: string;
  creditsCharged?: number;
  error?: string;
};

const sessions = new Map<string, ProxySession>();

export function createProxySession(params: {
  ownerId: string;
  renterId: string;
  listingId: string;
  durationMinutes: number;
  creditsBudget: number;
}): ProxySession {
  const session: ProxySession = {
    id: `px_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    ownerId: params.ownerId,
    renterId: params.renterId,
    listingId: params.listingId,
    expiresAt: new Date(Date.now() + params.durationMinutes * 60_000),
    creditsBudget: params.creditsBudget,
    creditsSpent: 0,
    status: "active",
  };
  sessions.set(session.id, session);
  return session;
}

export function getProxySession(id: string): ProxySession | undefined {
  const s = sessions.get(id);
  if (!s) return undefined;
  if (s.status === "active" && s.expiresAt.getTime() < Date.now()) {
    s.status = "expired";
  }
  return s;
}

export function revokeProxySession(id: string, ownerId: string): boolean {
  const s = sessions.get(id);
  if (!s || s.ownerId !== ownerId) return false;
  s.status = "revoked";
  return true;
}

/**
 * Authorize a renter invoke. Does not expose owner keys — callers must
 * execute generation with server-side owner credentials after this gate.
 */
export function authorizeProxyInvoke(req: ProxyInvokeRequest): {
  allowed: boolean;
  session?: ProxySession;
  error?: string;
} {
  const session = getProxySession(req.sessionId);
  if (!session) return { allowed: false, error: "Session not found" };
  if (session.status !== "active") return { allowed: false, error: `Session ${session.status}` };
  if (session.renterId !== req.renterId) return { allowed: false, error: "Renter mismatch" };

  const cost = Math.max(1, req.estimatedCostCredits ?? 1);
  if (session.creditsSpent + cost > session.creditsBudget) {
    return { allowed: false, error: "Proxy credit budget exhausted" };
  }

  session.creditsSpent += cost;
  return { allowed: true, session };
}

/** Strip any accidental key material from outbound proxy responses. */
export function sanitizeProxyOutput(text: string): string {
  return text
    .replace(/sk-[A-Za-z0-9]{10,}/g, "[redacted-key]")
    .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, "Bearer [redacted]");
}
