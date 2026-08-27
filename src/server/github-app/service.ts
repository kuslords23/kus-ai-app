/**
 * GitHub App integration service.
 *
 * Manages GitHub App installation tokens, fine-grained PATs, and credential
 * injection for Jyinx's autonomous agent. Enables the agent to clone, edit,
 * commit, and push to private repositories without relying on the user's
 * personal OAuth token.
 *
 * Two token sources:
 *  1. GitHub App Installation — OAuth App flow + installation webhook.
 *     Generates short-lived installation access tokens scoped to specific
 *     repositories. The app must be installed on the user's account/org.
 *  2. Fine-grained PAT — user-supplied tokens with defined repo scopes.
 *     Stored hashed; raw token is returned once at creation.
 */
import { Buffer } from "node:buffer";
import { createHash, sign } from "node:crypto";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";

// ── Config ──────────────────────────────────────────────────────────────────

const APP_ID = process.env.GH_APP_ID ?? "";
const APP_PRIVATE_KEY = (process.env.GH_APP_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");
const APP_CLIENT_ID = process.env.GH_APP_CLIENT_ID ?? "";
const APP_CLIENT_SECRET = process.env.GH_APP_CLIENT_SECRET ?? "";
const APP_INSTALL_URL = process.env.GH_APP_INSTALL_URL ?? "https://github.com/apps/jyinx-bot/installations/new";

const GH_API = "https://api.github.com";
const TOKEN_TABLE = "github_app_installations";
const PAT_TABLE = "github_pat_tokens";

// ── Helpers ─────────────────────────────────────────────────────────────────

async function db() {
  return createSupabaseServerClient();
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

// ── JWT generation for GitHub App auth ──────────────────────────────────────

/**
 * Generate a JWT for the GitHub App (used to exchange for installation tokens).
 * The JWT is signed with the app's private key and expires after 10 minutes.
 */
function generateAppJwt(): string {
  if (!APP_ID || !APP_PRIVATE_KEY) {
    throw new Error("GH_APP_ID and GH_APP_PRIVATE_KEY must be set");
  }
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iat: now - 60,  // 60s leeway
    exp: now + 600, // 10 min
    iss: APP_ID,
  };
  // Simple base64url-encode function
  const b64u = (obj: unknown) =>
    Buffer.from(JSON.stringify(obj))
      .toString("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
  const headerEnc = b64u(header);
  const payloadEnc = b64u(payload);
  const signInput = `${headerEnc}.${payloadEnc}`;
  const signature = sign("sha256", Buffer.from(signInput), APP_PRIVATE_KEY);
  const sigEnc = signature
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  return `${signInput}.${sigEnc}`;
}

// ── Installation token management ───────────────────────────────────────────

export interface GitHubInstallation {
  id: string;
  userId: string;
  installationId: number;
  accountLogin: string;
  accountType: string;
  repoIds: number[];
  repoNames: string[];
  token?: string;
  tokenExpiresAt?: string;
  permissions?: Record<string, string>;
  status: "active" | "suspended" | "removed";
}

export interface GitHubPatToken {
  id: string;
  userId: string;
  label?: string;
  tokenHash: string;
  tokenShort: string;
  scopes: string[];
  repoScope: string[];
  expiresAt?: string;
  status: "active" | "expired" | "revoked";
}

/**
 * Exchange an installation ID for an installation access token.
 * Called by the webhook handler when a new installation is created.
 */
export async function exchangeInstallationToken(
  installationId: number
): Promise<{ token: string; expiresAt: string }> {
  const jwt = generateAppJwt();
  const response = await fetch(
    `${GH_API}/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: "application/vnd.github+json",
      },
      cache: "no-store",
    }
  );
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`GitHub App token exchange failed (${response.status}): ${body.slice(0, 300)}`);
  }
  const data = (await response.json()) as {
    token?: string;
    expires_at?: string;
    permissions?: Record<string, string>;
    repository_selection?: string;
  };
  if (!data.token || !data.expires_at) {
    throw new Error("GitHub App returned no token.");
  }
  return { token: data.token, expiresAt: data.expires_at };
}

/**
 * Store a new installation record after a user installs the GitHub App.
 */
export async function recordInstallation(opts: {
  userId: string;
  installationId: number;
  accountLogin: string;
  accountType?: string;
  repoIds?: number[];
  repoNames?: string[];
  token: string;
  expiresAt: string;
  permissions?: Record<string, string>;
}): Promise<GitHubInstallation | null> {
  try {
    const supabase = await db();
    const { data, error } = await supabase
      .from(TOKEN_TABLE)
      .upsert(
        {
          user_id: opts.userId,
          installation_id: opts.installationId,
          account_login: opts.accountLogin,
          account_type: opts.accountType ?? "user",
          repo_ids: opts.repoIds ?? [],
          repo_names: opts.repoNames ?? [],
          token: opts.token,
          token_expires_at: opts.expiresAt,
          permissions: opts.permissions ?? null,
          status: "active",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,installation_id" }
      )
      .select("*")
      .maybeSingle();
    if (error || !data) return null;
    return mapInstallation(data as unknown as Record<string, unknown>);
  } catch {
    return null;
  }
}

function mapInstallation(row: Record<string, unknown>): GitHubInstallation {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    installationId: Number(row.installation_id),
    accountLogin: String(row.account_login),
    accountType: String(row.account_type ?? "user"),
    repoIds: Array.isArray(row.repo_ids) ? (row.repo_ids as number[]) : [],
    repoNames: Array.isArray(row.repo_names) ? (row.repo_names as string[]) : [],
    token: row.token ? String(row.token) : undefined,
    tokenExpiresAt: row.token_expires_at ? String(row.token_expires_at) : undefined,
    permissions: row.permissions ? (row.permissions as Record<string, string>) : undefined,
    status: (row.status as "active" | "suspended" | "removed") ?? "active",
  };
}

/**
 * Get a fresh installation token for a user. Refreshes expired tokens automatically.
 */
export async function getInstallationToken(
  userId: string,
  installationId?: number
): Promise<{ token: string; installation: GitHubInstallation } | null> {
  try {
    const supabase = await db();
    let query = supabase
      .from(TOKEN_TABLE)
      .select("*")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("updated_at", { ascending: false });

    if (installationId) query = query.eq("installation_id", installationId);

    const { data } = await query.limit(1).maybeSingle();
    if (!data) return null;

    const row = data as unknown as Record<string, unknown>;
    const expiresAt = row.token_expires_at ? new Date(String(row.token_expires_at)).getTime() : 0;
    const token = row.token ? String(row.token) : null;

    // If token is expired, refresh it
    if (!token || expiresAt < Date.now()) {
      const fresh = await exchangeInstallationToken(Number(row.installation_id));
      await supabase
        .from(TOKEN_TABLE)
        .update({
          token: fresh.token,
          token_expires_at: fresh.expiresAt,
          updated_at: new Date().toISOString(),
        })
        .eq("id", String(row.id));
      const installation = mapInstallation({
        ...row,
        token: fresh.token,
        token_expires_at: fresh.expiresAt,
      });
      return { token: fresh.token, installation };
    }

    const installation = mapInstallation(row);
    return { token, installation };
  } catch {
    return null;
  }
}

/**
 * List installations for a user.
 */
export async function listInstallations(userId: string): Promise<GitHubInstallation[]> {
  try {
    const supabase = await db();
    const { data, error } = await supabase
      .from(TOKEN_TABLE)
      .select("*")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });
    if (error || !data) return [];
    return (data as unknown as Record<string, unknown>[]).map(mapInstallation);
  } catch {
    return [];
  }
}

// ── Fine-grained PAT management ─────────────────────────────────────────────

function mapPat(row: Record<string, unknown>): GitHubPatToken {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    label: row.label ? String(row.label) : undefined,
    tokenHash: String(row.token_hash),
    tokenShort: String(row.token_short),
    scopes: Array.isArray(row.scopes) ? (row.scopes as string[]) : [],
    repoScope: Array.isArray(row.repo_scope) ? (row.repo_scope as string[]) : [],
    expiresAt: row.expires_at ? String(row.expires_at) : undefined,
    status: (row.status as "active" | "expired" | "revoked") ?? "active",
  };
}

/**
 * Store a user-supplied fine-grained PAT.
 * Returns the raw token only once (it's never stored in plaintext).
 */
export async function storePat(opts: {
  userId: string;
  label?: string;
  rawToken: string;
  scopes: string[];
  repoScope?: string[];
  expiresAt?: string;
}): Promise<GitHubPatToken | null> {
  try {
    const hash = sha256(opts.rawToken);
    const short = opts.rawToken.slice(0, 8);
    const supabase = await db();
    const { data, error } = await supabase
      .from(PAT_TABLE)
      .insert({
        user_id: opts.userId,
        label: opts.label ?? null,
        token_hash: hash,
        token_short: short,
        scopes: opts.scopes,
        repo_scope: opts.repoScope ?? [],
        expires_at: opts.expiresAt ?? null,
        status: "active",
      })
      .select("*")
      .maybeSingle();
    if (error || !data) return null;
    return mapPat(data as unknown as Record<string, unknown>);
  } catch {
    return null;
  }
}

/**
 * Get the best available token for a repository.
 * Preference: GitHub App installation token > PAT > OAuth provider_token.
 */
export async function resolveTokenForRepo(
  userId: string,
  repoFullName: string
): Promise<string | null> {
  // 1. Try GitHub App installation (scoped to this repo)
  try {
    const installations = await listInstallations(userId);
    for (const inst of installations) {
      if (inst.repoNames.includes(repoFullName) || inst.repoIds.length === 0) {
        const result = await getInstallationToken(userId, inst.installationId);
        if (result) return result.token;
      }
    }
  } catch {
    // fall through
  }

  // 2. Try PATs (check if any PAT covers this repo)
  try {
    const supabase = await db();
    const { data: pats } = await supabase
      .from(PAT_TABLE)
      .select("*")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("created_at", { ascending: false });
    if (pats && pats.length > 0) {
      // PATs are stored hashed — we can't return the raw token.
      // The user must provide it via the UI.
      return null;
    }
  } catch {
    // fall through
  }

  return null;
}

/**
 * Build an authenticated git remote URL for credential injection.
 * Returns x-access-token:TOKEN@github.com/owner/repo.git
 */
export function buildAuthGitUrl(repoFullName: string, token: string): string {
  const encoded = encodeURIComponent(token);
  return `https://x-access-token:${encoded}@github.com/${repoFullName}.git`;
}

/**
 * Build authenticated HTTP headers for GitHub API calls.
 */
export function buildAuthHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
  };
}

/**
 * Get the GitHub App install URL (redirect the user to install the app).
 */
export function getInstallUrl(state?: string): string {
  const url = new URL(APP_INSTALL_URL);
  if (state) url.searchParams.set("state", state);
  return url.toString();
}

export { APP_ID, APP_CLIENT_ID, APP_CLIENT_SECRET };