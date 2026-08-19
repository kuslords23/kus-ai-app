/**
 * Jyinx Agent Tool Interfacing.
 *
 * Exposes active operational capabilities as structured tools to the Jyinx
 * autonomous agent. Each tool describes its name, description, JSON schema for
 * arguments, and the connector/action it dispatches to. Jyinx can then decide
 * at runtime whether to push code, open a PR, trigger a Vercel build, or verify
 * a database — all within a single workflow.
 */

import type { ConnectorAction } from "@/server/connectors/actions/dispatcher";

export interface ToolArgument {
  name: string;
  type: "string" | "number" | "boolean" | "object";
  required?: boolean;
  description: string;
}

export interface JyinxTool {
  name: string;
  description: string;
  /** capability the connector must expose to run this tool. */
  capability: "clone" | "push" | "deploy" | "migrate" | "env" | "monitor";
  /** default connector family this tool runs against. */
  connectorId: string;
  action: ConnectorAction;
  destructive?: boolean;
  arguments: ToolArgument[];
}

/** Env vars a connected tool/µapp binds into the project's secure config. */
export interface EnvInject {
  key: string;
  source: "connector" | "user" | "generated";
  hint: string;
}

export const JYINX_TOOLS: JyinxTool[] = [
  {
    name: "git_create_pr",
    description: "Open a pull/merge request with the current branch as head against a base branch.",
    connectorId: "github",
    capability: "push",
    action: "git_create_pr",
    destructive: false,
    arguments: [
      { name: "repo", description: "Owner/repo, e.g. acme/web.", required: true, type: "string" },
      { name: "title", description: "PR title.", required: true, type: "string" },
      { name: "head", description: "Source branch.", required: true, type: "string" },
      { name: "base", description: "Target branch (default main).", type: "string" },
      { name: "body", description: "PR description.", type: "string" },
    ],
  },
  {
    name: "git_create_repo",
    description: "Create a new Git repository on the connected account.",
    connectorId: "github",
    capability: "push",
    action: "git_create_repo",
    destructive: false,
    arguments: [
      { name: "name", description: "Repository name.", required: true, type: "string" },
      { name: "description", description: "Short description.", type: "string" },
      { name: "private", description: "Whether the repo is private.", type: "boolean" },
    ],
  },
  {
    name: "vercel_deploy",
    description: "Trigger a new production/preview deployment for a Vercel project.",
    connectorId: "vercel",
    capability: "deploy",
    action: "vercel_deploy",
    destructive: true,
    arguments: [
      { name: "project", description: "Vercel project name.", required: true, type: "string" },
      { name: "gitUrl", description: "Git repository URL to deploy.", required: true, type: "string" },
      { name: "ref", description: "Branch/ref to deploy (default main).", type: "string" },
      { name: "target", description: "preview or production (default production).", type: "string" },
    ],
  },
  {
    name: "vercel_set_env",
    description: "Create or update an encrypted environment variable on a Vercel project.",
    connectorId: "vercel",
    capability: "env",
    action: "vercel_set_env",
    destructive: false,
    arguments: [
      { name: "projectId", description: "Vercel project id.", required: true, type: "string" },
      { name: "key", description: "Environment variable key.", required: true, type: "string" },
      { name: "value", description: "Environment variable value.", required: true, type: "string" },
      { name: "target", description: "preview | production | development.", type: "string" },
    ],
  },
  {
    name: "database_run_migration",
    description: "Execute a SQL migration against a connected Supabase/project (destructive).",
    connectorId: "supabase",
    capability: "migrate",
    action: "database_run_migration",
    destructive: true,
    arguments: [
      { name: "sql", description: "SQL statements to run.", required: true, type: "string" },
      { name: "endpoint", description: "Supabase project REST/management endpoint.", required: true, type: "string" },
    ],
  },
  {
    name: "database_test_connection",
    description: "Ping a database connection (e.g. Supabase project) to verify it's live.",
    connectorId: "supabase",
    capability: "migrate",
    action: "database_create_connection",
    destructive: false,
    arguments: [{ name: "endpoint", description: "Endpooint to test connectivity to.", required: true, type: "string" }],
  },
  {
    name: "env_sync",
    description: "Bulk-sync a set of environment variables into a Vercel project.",
    connectorId: "vercel",
    capability: "env",
    action: "env_sync",
    destructive: false,
    arguments: [
      { name: "target", description: "Vercel project id to sync into.", required: true, type: "string" },
      { name: "vars", description: "Object of key -> value pairs to inject.", required: true, type: "object" },
    ],
  },
];

/** Deterministic env schema a connector contributes when binding an app. */
export const CONNECTOR_ENV_VARS: Record<string, EnvInject[]> = {
  supabase: [
    { key: "SUPABASE_URL", source: "connector", hint: "Project REST URL" },
    { key: "SUPABASE_ANON_KEY", source: "connector", hint: "Anon public key" },
    { key: "SUPABASE_SERVICE_ROLE_KEY", source: "connector", hint: "Service-role key" },
  ],
  vercel: [
    { key: "VERCEL_PROJECT_ID", source: "connector", hint: "Vercel project identifier" },
    { key: "VERCEL_TOKEN", source: "connector", hint: "Deployment token" },
  ],
  mongodb: [{ key: "MONGODB_URI", source: "connector", hint: "Atlas connection string" }],
  // ... more providers resolved dynamically in the "1-Click Full Stack Scaffold".
};

/** Full-stack scaffold "1-Click": repo + hosting + DB automatically configured. */
export const SCAFFOLD_TEMPLATE = {
  name: "Kus Full-Stack Starter",
  description: "Next.js + TypeScript + Tailwind, wired to a chosen git repo, hosting provider, and database.",
  files: {
    ".env.example": "NEXT_PUBLIC_APP_NAME=----\nDATABASE_URL=----\n",
  },
  bind: ["github", "vercel", "supabase"],
} as const;