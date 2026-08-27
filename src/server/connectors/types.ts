/**
 * Connector registry types & catalog.
 *
 * Describes every external tool Jyinx can integrate with, grouped by category,
 * with per-connector auth style, capability flags, and a health-check
 * specification. This is the source of truth rendered by the Connectors Hub UI
 * and consumed by the backend connector registry.
 */

export type ConnectorCategory = "version-control" | "hosting" | "database" | "cache-search" | "monitoring";

export type ConnectorStatus = "connected" | "disconnected" | "error";

export type ConnectorCapability = "clone" | "push" | "deploy" | "migrate" | "env" | "monitor";

export type ConnectorAuthType = "oauth" | "token" | "connection-string";

export interface ConnectorSpec {
  id: string;
  name: string;
  icon: string;
  category: ConnectorCategory;
  /** Short pitch shown under the name. */
  description: string;
  authType: ConnectorAuthType;
  capabilities: ConnectorCapability[];
  /** Where to learn more / get credentials. */
  docsUrl: string;
  /** Backing credential label (token field vs connection string). */
  fieldLabel?: string;
  /** CTA text ("Connect", "Add token", "Enter connection string"). */
  connectLabel?: string;
  /** True for tools that need a repo/app binding to be useful. */
  bindsApp?: boolean;
}

export interface ConnectorEdgeState {
  status: ConnectorStatus;
  lastChecked: string | null;
  label?: string;
  scopes?: string[];
}

/** Builds a ConnectorSpec with default credential labels derived from auth type. */
export function makeSpec(input: Omit<ConnectorSpec, "fieldLabel" | "connectLabel">): ConnectorSpec {
  const auth = input.authType;
  return {
    ...input,
    ...(auth === "connection-string"
      ? { fieldLabel: "Connection string", connectLabel: "Enter connection string" }
      : auth === "oauth"
        ? { fieldLabel: "OAuth", connectLabel: "Connect" }
        : { fieldLabel: "API token", connectLabel: "Add token" }),
  };
}

export const CONNECTOR_CATALOG: Record<ConnectorCategory, ConnectorSpec[]> = {
  "version-control": [
    makeSpec({ id: "github", name: "GitHub", icon: "🐙", category: "version-control", description: "Repos, branching, PRs, push", authType: "oauth", capabilities: ["clone", "push", "deploy"], docsUrl: "https://github.com", bindsApp: true }),
    makeSpec({ id: "gitlab", name: "GitLab", icon: "🦊", category: "version-control", description: "Repos, MRs, push", authType: "token", capabilities: ["clone", "push", "deploy"], docsUrl: "https://gitlab.com", bindsApp: true }),
    makeSpec({ id: "bitbucket", name: "Bitbucket", icon: "🌀", category: "version-control", description: "Repos, branches, PRs", authType: "token", capabilities: ["clone", "push", "deploy"], docsUrl: "https://bitbucket.org", bindsApp: true }),
    makeSpec({ id: "azure-devops", name: "Azure DevOps", icon: "🔷", category: "version-control", description: "Repos, pipelines, push", authType: "token", capabilities: ["clone", "push", "deploy"], docsUrl: "https://azure.microsoft.com", bindsApp: true }),
    makeSpec({ id: "codeberg", name: "Codeberg", icon: "🟧", category: "version-control", description: "Repos, PRs, push", authType: "token", capabilities: ["clone", "push"], docsUrl: "https://codeberg.org", bindsApp: true }),
    makeSpec({ id: "gitea", name: "Gitea", icon: "🍵", category: "version-control", description: "Self-hosted repos", authType: "token", capabilities: ["clone", "push"], docsUrl: "https://gitea.com", bindsApp: true }),
    makeSpec({ id: "gogs", name: "Gogs", icon: "🐉", category: "version-control", description: "Lightweight self-hosted git", authType: "token", capabilities: ["clone", "push"], docsUrl: "https://gogs.io", bindsApp: true }),
    makeSpec({ id: "sourcehut", name: "Sourcehut", icon: "🟥", category: "version-control", description: "Repos, patches, push", authType: "token", capabilities: ["clone", "push"], docsUrl: "https://sr.ht", bindsApp: true }),
    makeSpec({ id: "phabricator", name: "Phabricator", icon: "🔬", category: "version-control", description: "Code reviews, diffs", authType: "token", capabilities: ["clone", "push"], docsUrl: "https://phacility.com" }),
    makeSpec({ id: "aws-codecommit", name: "AWS CodeCommit", icon: "🧊", category: "version-control", description: "Managed AWS git repos", authType: "token", capabilities: ["clone", "push"], docsUrl: "https://aws.amazon.com/codecommit", bindsApp: true }),
    makeSpec({ id: "codeberg-alt", name: "Codeberg + Forgejo", icon: "🍵", category: "version-control", description: "Forgejo/Fediverse git", authType: "token", capabilities: ["clone", "push"], docsUrl: "https://forgejo.org", bindsApp: true }),
  ],
  hosting: [
    makeSpec({ id: "vercel", name: "Vercel", icon: "▲", category: "hosting", description: "Deploy, env vars, builds", authType: "oauth", capabilities: ["deploy", "env"], docsUrl: "https://vercel.com", bindsApp: true }),
    makeSpec({ id: "netlify", name: "Netlify", icon: "🚀", category: "hosting", description: "Deploy, env vars, logs", authType: "oauth", capabilities: ["deploy", "env"], docsUrl: "https://netlify.com", bindsApp: true }),
    makeSpec({ id: "aws", name: "AWS", icon: "☁️", category: "hosting", description: "S3, Lambda, deploy", authType: "token", capabilities: ["deploy", "env"], docsUrl: "https://aws.amazon.com", bindsApp: true }),
    makeSpec({ id: "gcp", name: "Google Cloud", icon: "☁️", category: "hosting", description: "Cloud Run, GCS, deploy", authType: "token", capabilities: ["deploy", "env"], docsUrl: "https://cloud.google.com", bindsApp: true }),
    makeSpec({ id: "digitalocean", name: "DigitalOcean", icon: "🫧", category: "hosting", description: "Droplets, App Platform", authType: "token", capabilities: ["deploy", "env"], docsUrl: "https://digitalocean.com", bindsApp: true }),
    makeSpec({ id: "render", name: "Render", icon: "🌀", category: "hosting", description: "Web services, deploy", authType: "token", capabilities: ["deploy", "env"], docsUrl: "https://render.com", bindsApp: true }),
    makeSpec({ id: "fly", name: "Fly.io", icon: "🐉", category: "hosting", description: "Global apps, deploy", authType: "token", capabilities: ["deploy", "env"], docsUrl: "https://fly.io", bindsApp: true }),
    makeSpec({ id: "railway", name: "Railway", icon: "🛤️", category: "hosting", description: "Fast deploys, env", authType: "token", capabilities: ["deploy", "env"], docsUrl: "https://railway.app", bindsApp: true }),
    makeSpec({ id: "cloudflare", name: "Cloudflare", icon: "🌩️", category: "hosting", description: "Pages, Workers, deploy", authType: "token", capabilities: ["deploy", "env"], docsUrl: "https://cloudflare.com", bindsApp: true }),
    makeSpec({ id: "deno", name: "Deno Deploy", icon: "🦕", category: "hosting", description: "Edge deploy", authType: "token", capabilities: ["deploy"], docsUrl: "https://deno.com", bindsApp: true }),
    makeSpec({ id: "supabase-host", name: "Supabase Edge", icon: "⚡", category: "hosting", description: "Edge functions deploy", authType: "token", capabilities: ["deploy"], docsUrl: "https://supabase.com", bindsApp: true }),
    makeSpec({ id: "azure-static", name: "Azure Static Web", icon: "🔷", category: "hosting", description: "Static sites deploy", authType: "token", capabilities: ["deploy"], docsUrl: "https://azure.microsoft.com", bindsApp: true }),
  ],
  database: [
    makeSpec({ id: "supabase", name: "Supabase", icon: "⚡", category: "database", description: "Postgres, SQL migrations, buckets", authType: "token", capabilities: ["migrate", "env", "clone"], docsUrl: "https://supabase.com", bindsApp: true }),
    makeSpec({ id: "firebase", name: "Firebase", icon: "🔥", category: "database", description: "Firestore, auth, deploy", authType: "token", capabilities: ["migrate", "env"], docsUrl: "https://firebase.google.com", bindsApp: true }),
    makeSpec({ id: "mongodb", name: "MongoDB Atlas", icon: "🍃", category: "database", description: "Atlas clusters, schemas", authType: "connection-string", capabilities: ["migrate"], docsUrl: "https://www.mongodb.com", bindsApp: true }),
    makeSpec({ id: "planetscale", name: "PlanetScale", icon: "🪐", category: "database", description: "MySQL serverless branches", authType: "token", capabilities: ["migrate"], docsUrl: "https://planetscale.com", bindsApp: true }),
    makeSpec({ id: "postgres", name: "PostgreSQL", icon: "🐘", category: "database", description: "Raw Postgres, migrations", authType: "connection-string", capabilities: ["migrate"], docsUrl: "https://www.postgresql.org", bindsApp: true }),
    makeSpec({ id: "mysql", name: "MySQL", icon: "🐬", category: "database", description: "Relational migrations", authType: "connection-string", capabilities: ["migrate"], docsUrl: "https://www.mysql.com", bindsApp: true }),
    makeSpec({ id: "neon", name: "Neon", icon: "⚡", category: "database", description: "Serverless Postgres", authType: "connection-string", capabilities: ["migrate"], docsUrl: "https://neon.tech", bindsApp: true }),
    makeSpec({ id: "sqlite", name: "SQLite", icon: "🗄️", category: "database", description: "Local embedded DB", authType: "connection-string", capabilities: ["migrate"], docsUrl: "https://sqlite.org" }),
    makeSpec({ id: "redis", name: "Redis", icon: "🔴", category: "database", description: "Cache / queues", authType: "connection-string", capabilities: ["migrate"], docsUrl: "https://redis.io" }),
    makeSpec({ id: "couchbase", name: "Couchbase", icon: "🛋️", category: "database", description: "Document store", authType: "connection-string", capabilities: ["migrate"], docsUrl: "https://www.couchbase.com" }),
    makeSpec({ id: "dynamodb", name: "AWS DynamoDB", icon: "📀", category: "database", description: "NoSQL tables", authType: "token", capabilities: ["migrate"], docsUrl: "https://aws.amazon.com", bindsApp: true }),
    makeSpec({ id: "cockroach", name: "CockroachDB", icon: "🪳", category: "database", description: "Distributed SQL", authType: "connection-string", capabilities: ["migrate"], docsUrl: "https://www.cockroachlabs.com" }),
  ],
  "cache-search": [
    makeSpec({ id: "redis-cache", name: "Redis", icon: "🔴", category: "cache-search", description: "Cache, sessions, queues", authType: "connection-string", capabilities: ["migrate", "env"], docsUrl: "https://redis.io" }),
    makeSpec({ id: "upstash", name: "Upstash Redis", icon: "⚡", category: "cache-search", description: "Serverless Redis", authType: "token", capabilities: ["migrate", "env"], docsUrl: "https://upstash.com" }),
    makeSpec({ id: "meilisearch", name: "Meilisearch", icon: "🔎", category: "cache-search", description: "Typo-tolerant search", authType: "token", capabilities: ["monitor"], docsUrl: "https://www.meilisearch.com" }),
    makeSpec({ id: "typesense", name: "Typesense", icon: "🔎", category: "cache-search", description: "Instant search", authType: "token", capabilities: ["monitor"], docsUrl: "https://typesense.org" }),
    makeSpec({ id: "elastic", name: "Elasticsearch", icon: "🧿", category: "cache-search", description: "Full-text search", authType: "connection-string", capabilities: ["monitor"], docsUrl: "https://www.elastic.co" }),
    makeSpec({ id: "algolia", name: "Algolia", icon: "🔷", category: "cache-search", description: "Search-as-service", authType: "token", capabilities: ["monitor"], docsUrl: "https://www.algolia.com" }),
    makeSpec({ id: "cloudflare-kv", name: "Cloudflare KV", icon: "🌩️", category: "cache-search", description: "Edge cache", authType: "token", capabilities: ["env"], docsUrl: "https://cloudflare.com" }),
    makeSpec({ id: "memcached", name: "Memcached", icon: "🧠", category: "cache-search", description: "Distributed cache", authType: "connection-string", capabilities: ["migrate"], docsUrl: "https://memcached.org" }),
    makeSpec({ id: "chainbase", name: "Chainbase", icon: "⛓️", category: "cache-search", description: "Web3 data/search", authType: "token", capabilities: ["monitor"], docsUrl: "https://chainbase.com" }),
    makeSpec({ id: "pinecone", name: "Pinecone", icon: "🌲", category: "cache-search", description: "Vector search", authType: "token", capabilities: ["monitor"], docsUrl: "https://www.pinecone.io" }),
    makeSpec({ id: "qdrant", name: "Qdrant", icon: "🟦", category: "cache-search", description: "Vector DB", authType: "token", capabilities: ["monitor"], docsUrl: "https://qdrant.tech" }),
  ],
  monitoring: [
    makeSpec({ id: "datadog", name: "Datadog", icon: "🐶", category: "monitoring", description: "Metrics, logs, APM", authType: "token", capabilities: ["monitor"], docsUrl: "https://www.datadoghq.com" }),
    makeSpec({ id: "sentry", name: "Sentry", icon: "🟠", category: "monitoring", description: "Error tracking", authType: "token", capabilities: ["monitor"], docsUrl: "https://sentry.io" }),
    makeSpec({ id: "grafana", name: "Grafana", icon: "📈", category: "monitoring", description: "Dashboards", authType: "token", capabilities: ["monitor"], docsUrl: "https://grafana.com" }),
    makeSpec({ id: "newrelic", name: "New Relic", icon: "📊", category: "monitoring", description: "APM, alerts", authType: "token", capabilities: ["monitor"], docsUrl: "https://newrelic.com" }),
    makeSpec({ id: "prometheus", name: "Prometheus", icon: "🔥", category: "monitoring", description: "Time-series metrics", authType: "token", capabilities: ["monitor"], docsUrl: "https://prometheus.io" }),
    makeSpec({ id: "logtail", name: "Better Stack (Logtail)", icon: "🥞", category: "monitoring", description: "Log management", authType: "token", capabilities: ["monitor"], docsUrl: "https://betterstack.com" }),
    makeSpec({ id: "cloudflare-mon", name: "Cloudflare Analytics", icon: "🌩️", category: "monitoring", description: "Traffic, errors", authType: "token", capabilities: ["monitor"], docsUrl: "https://cloudflare.com" }),
    makeSpec({ id: "uptime", name: "UptimeRobot", icon: "🤖", category: "monitoring", description: "Uptime checks", authType: "token", capabilities: ["monitor"], docsUrl: "https://uptimerobot.com" }),
    makeSpec({ id: "papertrail", name: "Papertrail", icon: "📄", category: "monitoring", description: "Log search", authType: "connection-string", capabilities: ["monitor"], docsUrl: "https://papertrail.com" }),
    makeSpec({ id: "statuspage", name: "Statuspage", icon: "📋", category: "monitoring", description: "Public status", authType: "token", capabilities: ["monitor"], docsUrl: "https://statuspage.io" }),
    makeSpec({ id: "loki", name: "Loki", icon: "🦦", category: "monitoring", description: "Log aggregation", authType: "connection-string", capabilities: ["monitor"], docsUrl: "https://grafana.com" }),
  ],
};

export function connectorById(id: string): ConnectorSpec | null {
  for (const category of Object.values(CONNECTOR_CATALOG)) {
    const hit = category.find((c) => c.id === id);
    if (hit) return hit;
  }
  return null;
}

export function allSpecs(): ConnectorSpec[] {
  return Object.values(CONNECTOR_CATALOG).flat();
}