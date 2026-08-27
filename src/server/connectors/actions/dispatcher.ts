/**
 * Unified Action Dispatcher for Jyinx connectors.
 *
 * Service adapters wrapping the connected tools' APIs (GitHub PR/repo, Vercel
 * deploy/env, Supabase SQL/buckets). Every action:
 *   1. Checks the user is authorized (credential exists / connector configured).
 *   2. Validates the requested operation against the connector's capability
 *      flags.
 *   3. Handles destructive operations that require an explicit `confirmed` flag.
 *   4. Persists an audit-trail row so the user can review what changed.
 */

import { resolveConnector } from "@/server/connectors/registry";
import type { BaseConnector } from "@/server/connectors/base";
import type { ConnectorCapability } from "@/server/connectors/types";

export type ConnectorAction =
  | "git_create_pr"
  | "git_create_repo"
  | "vercel_deploy"
  | "vercel_set_env"
  | "database_create_connection"
  | "database_run_migration"
  | "env_sync";

export interface ActionRequest {
  userId: string;
  connectorId: string;
  action: ConnectorAction;
  confirmed?: boolean;
  payload: Record<string, unknown>;
}

export interface ActionResult {
  ok: boolean;
  error?: string;
  requiresConfirmation?: boolean;
  result?: Record<string, unknown>;
}

/** Capability required per action; undefined → any connector may run it. */
const ACTION_CAPABILITY: Partial<Record<ConnectorAction, ConnectorCapability>> = {
  git_create_pr: "push",
  git_create_repo: "push",
  vercel_deploy: "deploy",
  vercel_set_env: "env",
  database_run_migration: "migrate",
  env_sync: "env",
};

/** Destructive actions require explicit `confirmed: true`. */
const DESTRUCTIVE: ConnectorAction[] = ["vercel_deploy", "database_run_migration"];

async function appendAudit(entry: { userId: string; connectorId: string; action: string; ok: boolean; detail?: string }): Promise<void> {
  try {
    const { createClient } = await import("@/lib/supabase/server");
    const client = await createClient();
    await client.from("jyinx_audit_trail").insert({
      user_id: entry.userId,
      connector_id: entry.connectorId,
      action: entry.action,
      ok: entry.ok,
      detail: entry.detail ?? null,
      created_at: new Date().toISOString(),
    });
  } catch {
    // best-effort
  }
}

// ------------------------------------------------------------ GitHub --------
async function createGitPr(connector: BaseConnector, payload: Record<string, unknown>, userId: string): Promise<ActionResult> {
  const repo = String(payload.repo ?? "");
  const title = String(payload.title ?? "");
  const head = String(payload.head ?? "");
  const base = String(payload.base ?? "main");
  const body = String(payload.body ?? "");
  if (!repo || !title || !head) return { ok: false, error: "repo, title, and head are required." };

  const r = await connector.call<{ number?: number; html_url?: string }>(`https://api.github.com/repos/${repo}/pulls`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, head, base, body }),
  });
  await appendAudit({ connectorId: connector.id, userId, action: "git_create_pr", ok: Boolean(r.data), detail: r.data ? `PR on ${repo}` : r.error });
  if (!r.data) return { ok: false, error: r.error || "Could not open PR." };
  return { ok: true, result: { prNumber: r.data.number, url: r.data.html_url } };
}

async function createGitRepo(connector: BaseConnector, payload: Record<string, unknown>, userId: string): Promise<ActionResult> {
  const name = String(payload.name ?? "");
  const description = String(payload.description ?? "");
  if (!name) return { ok: false, error: "A repository name is required." };
  const res = await connector.call<{ html_url?: string }>("https://api.github.com/user/repos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, description, private: payload.private === true, auto_init: true }),
  });
  await appendAudit({ connectorId: connector.id, userId, action: "git_create_repo", ok: Boolean(res.data), detail: name });
  if (!res.data) return { ok: false, error: res.error || "Could not create repository." };
  return { ok: true, result: { repo: name, url: res.data.html_url } };
}

// -------------------------------------------------------------- Vercel -----
async function deployToVercel(connector: BaseConnector, payload: Record<string, unknown>, userId: string): Promise<ActionResult> {
  const project = String(payload.project ?? "");
  const target = String(payload.target ?? "production");
  if (!project) return { ok: false, error: "A project is required." };
  if (!payload.gitUrl) return { ok: false, error: "A git URL is required to create a deployment." };

  const res = await connector.call<{ id?: string; url?: string }>("https://api.vercel.com/v13/deployments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: project,
      project,
      target,
      gitSource: { type: "github", ref: payload.ref ?? "main", repo: payload.gitUrl },
    }),
  });
  await appendAudit({ connectorId: connector.id, userId, action: "vercel_deploy", ok: Boolean(res.data), detail: project });
  if (!res.data) return { ok: false, error: res.error || "Deployment failed." };
  return { ok: true, result: { deploymentId: res.data.id, url: res.data.url } };
}

async function setVercelEnv(connector: BaseConnector, payload: Record<string, unknown>, userId: string): Promise<ActionResult> {
  const projectId = String(payload.projectId ?? "");
  const key = String(payload.key ?? "");
  const value = String(payload.value ?? "");
  const target = String(payload.target ?? "preview");
  if (!projectId || !key) return { ok: false, error: "projectId and key are required." };
  const res = await connector.call(`https://api.vercel.com/v9/projects/${encodeURIComponent(projectId)}/env`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, value, targets: [target], type: "encrypted" }),
  });
  await appendAudit({ connectorId: connector.id, userId, action: "vercel_set_env", ok: Boolean(res.data), detail: `${key} → ${projectId}` });
  if (!res.data) return { ok: false, error: res.error || "Could not set environment variable." };
  return { ok: true, result: { key, target } };
}

// ------------------------------------------------------------- Supabase ----
async function runMigration(connector: BaseConnector, payload: Record<string, unknown>, userId: string): Promise<ActionResult> {
  const sql = String(payload.sql ?? "");
  const endpoint = String(payload.endpoint ?? "");
  if (!sql) return { ok: false, error: "A SQL statement is required." };
  if (!endpoint) return { ok: false, error: "A Supabase project endpoint is required." };

  const res = await connector.call(`${endpoint}/rest/v1/rpc/exec`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: (connector.authHeaders()["Authorization"] ?? "").replace(/^Bearer\s+/i, "") },
    body: JSON.stringify({ query: sql }),
  });
  await appendAudit({ connectorId: connector.id, userId, action: "database_run_migration", ok: Boolean(res.data), detail: `${sql.slice(0, 60)}…` });
  if (!res.data) return { ok: false, error: res.error || "Migration failed." };
  return { ok: true, result: { migrated: true } };
}

async function testDbConnection(connector: BaseConnector, payload: Record<string, unknown>, userId: string): Promise<ActionResult> {
  const endpoint = String(payload.endpoint ?? "");
  if (!endpoint) return { ok: false, error: "An endpoint is required." };
  const res = await connector.call(`${endpoint}/rest/v1/`, {});
  await appendAudit({ connectorId: connector.id, userId, action: "database_create_connection", ok: res.status === 200, detail: endpoint });
  return { ok: res.status === 200, result: res.status === 200 ? { live: true } : undefined, error: res.status === 200 ? undefined : `HTTP ${res.status}` };
}

async function syncEnv(connector: BaseConnector, payload: Record<string, unknown>, userId: string): Promise<ActionResult> {
  const target = String(payload.target ?? "");
  const vars = (payload.vars ?? {}) as Record<string, string>;
  if (!target) return { ok: false, error: "target is required." };
  const synced: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(vars)) {
    const res = await connector.call(`https://api.vercel.com/v9/projects/${encodeURIComponent(target)}/env`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value, targets: ["preview", "production"], type: "encrypted" }),
    });
    synced[key] = Boolean(res.data);
  }
  await appendAudit({ connectorId: connector.id, userId, action: "env_sync", ok: true, detail: `${Object.keys(synced).length} var(s) → ${target}` });
  return { ok: true, result: { synced } };
}

// -------------------------------------------------------- dispatcher ------
export async function dispatchAction(input: {
  userId: string;
  connectorId: string;
  action: ConnectorAction;
  confirmed?: boolean;
  payload: Record<string, unknown>;
}): Promise<ActionResult> {
  const connector = await resolveConnector(input.userId, input.connectorId);
  if (!connector) return { ok: false, error: "Unknown connector." };
  if (!connector.isConfigured) return { ok: false, error: "This connector is not connected." };

  const capability = ACTION_CAPABILITY[input.action];
  if (capability && !connector.hasCapability(capability)) {
    return { ok: false, error: `This connector does not support ${input.action} (missing ${capability}).` };
  }

  if (DESTRUCTIVE.includes(input.action) && input.confirmed !== true) {
    return { ok: false, error: "This is a destructive action and requires explicit confirmation.", requiresConfirmation: true };
  }

  switch (input.action) {
    case "git_create_pr":
      return createGitPr(connector, input.payload, input.userId);
    case "git_create_repo":
      return createGitRepo(connector, input.payload, input.userId);
    case "vercel_deploy":
      return deployToVercel(connector, input.payload, input.userId);
    case "vercel_set_env":
      return setVercelEnv(connector, input.payload, input.userId);
    case "database_run_migration":
      return runMigration(connector, input.payload, input.userId);
    case "database_create_connection":
      return testDbConnection(connector, input.payload, input.userId);
    case "env_sync":
      return syncEnv(connector, input.payload, input.userId);
    default:
      return { ok: false, error: "Unknown action." };
  }
}