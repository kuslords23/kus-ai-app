-- Jyinx push-to-host deployment tracking.
-- Used by src/server/deploy/pushHost.ts. Run in the Supabase SQL editor or via `supabase db push`.

create table if not exists jyinx_deployments (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,            -- repository#branch#host (one deployment per host + branch)
  repository text not null,
  branch text not null,
  host text not null,
  commit_sha text,
  commit_message text,
  status text not null default 'queued' check (status in ('queued', 'deploying', 'live', 'failed')),
  deploy_url text,
  log text,
  owner text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists jyinx_deployments_owner_idx
  on jyinx_deployments (owner, updated_at desc);

create index if not exists jyinx_deployments_repo_idx
  on jyinx_deployments (repository, updated_at desc);

alter table jyinx_deployments enable row level security;

create policy "deployments read"
  on jyinx_deployments for select using (true);

create policy "deployments write"
  on jyinx_deployments for insert with check (true);

create policy "deployments update"
  on jyinx_deployments for update using (true);

create policy "deployments delete"
  on jyinx_deployments for delete using (true);