/**
 * BaseConnector — uniform interface for every Jyinx-connected tool.
 *
 * Handles authentication (OAuth / API token / connection string), health
 * checks, and capability flags. Concrete connectors (GitHub, Vercel, Supabase,
 * …) extend this and implement `health`. Credential metadata is stored
 * encrypted per-user/project by the ConnectorStore and injected at call time.
 */

import type {
  ConnectorCapability,
  ConnectorStatus,
  ConnectorSpec,
} from "@/server/connectors/types";

export interface ConnectorCredential {
  type: "oauth" | "token" | "connection-string";
  /** OAuth access token, API token, or full connection string. */
  value: string;
  /** For OAuth, optional refresh token. */
  refreshToken?: string;
  /** For connection strings, parsed endpoint (host). */
  endpoint?: string;
  expiry?: string;
  scopes?: string[];
  /** Project/repo this credential is bound to (e.g. "acme/web", "prj_123"). */
  boundApp?: string;
}

export class BaseConnector {
  readonly spec: ConnectorSpec;
  protected credential: ConnectorCredential | null = null;
  /** Public auth header builder used by the action dispatcher. */
  readonly authHeaders: () => Record<string, string>;

  constructor(spec: ConnectorSpec) {
    this.spec = spec;
    this.authHeaders = this.buildAuthHeaders;
  }

  /** @internal build auth headers bound to the live credential. */
  private buildAuthHeaders = (): Record<string, string> => {
    if (!this.credential) return {};
    return {
      Authorization: `Bearer ${this.credential.value}`,
      "Content-Type": "application/json",
    };
  };

  get id(): string {
    return this.spec.id;
  }

  /** Initialize with the stored credential. */
  setCredential(credential: ConnectorCredential | null): this {
    this.credential = credential;
    return this;
  }

  get isConfigured(): boolean {
    return Boolean(this.credential?.value);
  }

  get capabilities(): ConnectorCapability[] {
    return this.spec.capabilities;
  }

  hasCapability(capability: ConnectorCapability): boolean {
    return this.capabilities.includes(capability);
  }

  /** Overridden: subclasses run a real health probe. */
  async health(): Promise<{ status: ConnectorStatus; message?: string }> {
    const status: ConnectorStatus = this.isConfigured ? "connected" : "disconnected";
    return { status, message: status === "connected" ? "Connected" : "Not connected" };
  }

  /** Push an authenticated request. Returns raw response so callers can inspect status. */
  protected async request<T>(path: string, init?: RequestInit): Promise<{ status: number; data: T | null; error?: string }> {
    return doRequest<T>(path, this.buildAuthHeaders(), init);
  }

  /** Public variant of `request` used by the action dispatcher. */
  async call<T>(path: string, init?: RequestInit): Promise<{ status: number; data: T | null; error?: string }> {
    return doRequest<T>(path, this.buildAuthHeaders(), init);
  }
}

const doRequest = async <T>(path: string, headers: Record<string, string>, init?: RequestInit): Promise<{ status: number; data: T | null; error?: string }> => {
  try {
    const response = await fetch(path, {
      ...init,
      headers: { ...headers, ...(init?.headers ?? {}) },
      cache: "no-store",
    });
    const text = await response.text();
    let data: T | null = null;
    try {
      data = text ? (JSON.parse(text) as T) : null;
    } catch {
      /* non-JSON body */
    }
    if (!response.ok) {
      return { status: response.status, data: null, error: text || `HTTP ${response.status}` };
    }
    return { status: response.status, data };
  } catch (cause) {
    return { status: 0, data: null, error: cause instanceof Error ? cause.message : "Request failed" };
  }
};