"use strict";

/**
 * Connector Service Registry.
 *
 * Ensures active connectors properly authenticate and initialize without
 * getting blocked or missing environmental bindings. Wires up the user
 * workspace and multi-platform code ingestion engine to seamlessly
 * sync with connector state.
 *
 * Responsibilities:
 *   1. Service-level health checks that validate credentials at init time
 *   2. Registry of required env vars per connector (block deployment if missing)
 *   3. Lazy initialization — connectors boot only when first requested
 *   4. Shared state bridge: connector status → workspace context → ingestion engine
 */

// ── Types ────────────────────────────────────────────────

export type ConnectorService =
  | "github"
  | "gitlab"
  | "bitbucket"
  | "vercel"
  | "netlify"
  | "aws"
  | "supabase"
  | "firebase"
  | "redis"
  | "sentry";

export interface ServiceConfig {
  id: ConnectorService;
  /** Environment variables that MUST be set at the platform level for this connector to boot. */
  requiredEnv: string[];
  /** Environment variables that are optional (e.g., custom API URL overrides). */
  optionalEnv: string[];
  /** Whether this connector can work at the platform level (no per-user key needed). */
  platformDefault: boolean;
  /** A user-level credential table column for this connector. */
  credentialStore?: string;
  /** Capabilities this service exposes to the Jyinx agent. */
  capabilities: string[];
}

export interface ServiceHealth {
  id: ConnectorService;
  name: string;
  configuredAtPlatform: boolean;
  configuredForUser: boolean | null;
  healthy: boolean;
  lastCheck?: string;
  error?: string;
  capabilitiesAvailable: string[];
}

export interface ServiceInitContext {
  userId?: string;
  workspaceId?: string;
  projectDir?: string;
}

// ── Registry ────────────────────────────────────────────

const SERVICE_REGISTRY: Record<ConnectorService, ServiceConfig> = {
  github: {
    id: "github",
    requiredEnv: [],
    optionalEnv: ["GITHUB_TOKEN", "GITHUB_APP_ID", "GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"],
    platformDefault: false,
    credentialStore: "ai_byok_keys",
    capabilities: ["clone", "push", "pr", "repo-create", "search"],
  },
  gitlab: {
    id: "gitlab",
    requiredEnv: [],
    optionalEnv: ["GITLAB_TOKEN"],
    platformDefault: false,
    credentialStore: "ai_byok_keys",
    capabilities: ["clone", "push", "mr", "search"],
  },
  bitbucket: {
    id: "bitbucket",
    requiredEnv: [],
    optionalEnv: ["BITBUCKET_TOKEN"],
    platformDefault: false,
    credentialStore: "ai_byok_keys",
    capabilities: ["clone", "push", "pr"],
  },
  vercel: {
    id: "vercel",
    requiredEnv: [],
    optionalEnv: ["VERCEL_TOKEN", "VERCEL_TEAM_ID", "VERCEL_PROJECT_ID"],
    platformDefault: false,
    credentialStore: "ai_byok_keys",
    capabilities: ["deploy", "env-sync", "build-logs"],
  },
  netlify: {
    id: "netlify",
    requiredEnv: [],
    optionalEnv: ["NETLIFY_TOKEN"],
    platformDefault: false,
    credentialStore: "ai_byok_keys",
    capabilities: ["deploy", "env-sync"],
  },
  aws: {
    id: "aws",
    requiredEnv: [],
    optionalEnv: ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION"],
    platformDefault: false,
    credentialStore: "ai_byok_keys",
    capabilities: ["deploy", "storage", "compute"],
  },
  supabase: {
    id: "supabase",
    requiredEnv: ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"],
    optionalEnv: ["SUPABASE_SERVICE_ROLE_KEY"],
    platformDefault: true,
    capabilities: ["db", "auth", "storage", "migration"],
  },
  firebase: {
    id: "firebase",
    requiredEnv: [],
    optionalEnv: ["FIREBASE_PROJECT_ID", "FIREBASE_PRIVATE_KEY", "FIREBASE_CLIENT_EMAIL"],
    platformDefault: false,
    credentialStore: "ai_byok_keys",
    capabilities: ["db", "auth", "storage"],
  },
  redis: {
    id: "redis",
    requiredEnv: [],
    optionalEnv: ["REDIS_URL"],
    platformDefault: false,
    credentialStore: "ai_byok_keys",
    capabilities: ["cache", "queue"],
  },
  sentry: {
    id: "sentry",
    requiredEnv: [],
    optionalEnv: ["SENTRY_DSN"],
    platformDefault: false,
    credentialStore: "ai_byok_keys",
    capabilities: ["monitoring", "error-tracking"],
  },
};

// ── Public API ──────────────────────────────────────────

/**
 * Returns the full service registry for UI rendering or agent tool listing.
 */
export function listServices(): ServiceConfig[] {
  return Object.values(SERVICE_REGISTRY);
}

/**
 * Gets a single service config by id.
 */
export function getService(id: ConnectorService): ServiceConfig | null {
  return SERVICE_REGISTRY[id] ?? null;
}

/**
 * Health-check: which required env vars are missing at the platform level?
 */
export function missingPlatformEnv(service: ConnectorService): string[] {
  const cfg = SERVICE_REGISTRY[service];
  if (!cfg) return [];
  return cfg.requiredEnv.filter((key) => !process.env[key]);
}

/**
 * Determines if a service can be initialized for the current platform.
 */
export function canInitialize(service: ConnectorService): boolean {
  const cfg = SERVICE_REGISTRY[service];
  if (!cfg) return false;
  if (cfg.platformDefault) return missingPlatformEnv(service).length === 0;
  // Per-user services always *can* initialize — the credential is resolved at request time.
  return true;
}

/**
 * Full health report for all connectors. Used by the ConnectorsPanel and
 * the Jyinx agent to know which tools are available.
 */
export function healthReport(): ServiceHealth[] {
  return Object.values(SERVICE_REGISTRY).map((cfg) => {
    const missing = missingPlatformEnv(cfg.id);
    const platformReady = missing.length === 0;
    return {
      id: cfg.id,
      name: SERVICE_NAMES[cfg.id] ?? cfg.id,
      configuredAtPlatform: cfg.platformDefault ? platformReady : true,
      configuredForUser: cfg.platformDefault ? platformReady : null, // null = resolved per-user
      healthy: cfg.platformDefault ? platformReady : true,
      lastCheck: undefined,
      error: missing.length > 0 ? `Missing env: ${missing.join(", ")}` : undefined,
      capabilitiesAvailable: missing.length > 0 ? [] : cfg.capabilities,
    };
  });
}

/**
 * Blocks startup / deployment if a critical platform service is misconfigured.
 * Throws with a human-readable message listing missing env vars.
 */
export function assertPlatformServices(required: ConnectorService[]): void {
  const failures: string[] = [];
  for (const svc of required) {
    const missing = missingPlatformEnv(svc);
    if (missing.length > 0) {
      failures.push(`${SERVICE_NAMES[svc] ?? svc}: ${missing.join(", ")}`);
    }
  }
  if (failures.length > 0) {
    throw new Error(`Platform connector initialization blocked. Missing environment variables:\n- ${failures.join("\n- ")}`);
  }
}

/**
 * Resolves the full capabilities available to the Jyinx agent based on
 * which services are currently configured.
 */
export function agentCapabilities(): string[] {
  const report = healthReport();
  const caps = new Set<string>();
  for (const r of report) {
    if (r.healthy) for (const c of r.capabilitiesAvailable) caps.add(c);
  }
  return [...caps];
}

// ── Friendly names ──────────────────────────────────────

const SERVICE_NAMES: Record<ConnectorService, string> = {
  github: "GitHub",
  gitlab: "GitLab",
  bitbucket: "Bitbucket",
  vercel: "Vercel",
  netlify: "Netlify",
  aws: "AWS",
  supabase: "Supabase",
  firebase: "Firebase",
  redis: "Redis",
  sentry: "Sentry",
};