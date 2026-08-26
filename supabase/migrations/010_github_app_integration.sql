-- GitHub App installation tracking for Jyinx autonomous agent.
-- Run in the Supabase SQL editor or via `supabase db push`.

-- ============================================================================
-- GitHub App installations (user → installation → repo scoping)
-- ============================================================================
create table if not exists github_app_installations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,                       -- Supabase user who owns this
  installation_id bigint not null,             -- GitHub App installation id
  account_login text not null,                 -- owner/org login
  account_type text not null default 'user',   -- User | Organization
  repo_ids bigint[] not null default '{}',     -- repos this installation covers
  repo_names text[] not null default '{}',     -- e.g. {"owner/repo"}
  token text,                                  -- current installation access token
  token_expires_at timestamptz,                -- when the token expires
  permissions jsonb,                           -- granted permissions object
  status text not null default 'active' check (status in ('active', 'suspended', 'removed')),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, installation_id)
);

create index if not exists github_app_install_user_idx
  on github_app_installations (user_id, updated_at desc);

create index if not exists github_app_install_install_idx
  on github_app_installations (installation_id);

alter table github_app_installations enable row level security;

-- Users can read/update their own installations
create policy "github_app_install owner read"
  on github_app_installations for select
  using (auth.uid() = user_id);

create policy "github_app_install insert"
  on github_app_installations for insert with check (true);

create policy "github_app_install update"
  on github_app_installations for update using (true);

-- ============================================================================
-- Fine-grained PAT tokens (alternative to GitHub App)
-- ============================================================================
create table if not exists github_pat_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  label text,
  token_hash text not null,                    -- sha256 of the raw token
  token_short text not null,                   -- first 8 chars for display
  scopes text[] not null default '{}',         -- e.g. {"repo", "workflow"}
  repo_scope text[] not null default '{}',     -- specific repos if fine-grained
  expires_at timestamptz,
  status text not null default 'active' check (status in ('active', 'expired', 'revoked')),
  last_used_at timestamptz,
  created_at timestamptz default now(),
  unique (user_id, token_hash)
);

create index if not exists github_pat_user_idx
  on github_pat_tokens (user_id, status, created_at desc);

alter table github_pat_tokens enable row level security;

create policy "github_pat owner read"
  on github_pat_tokens for select
  using (auth.uid() = user_id);

create policy "github_pat insert"
  on github_pat_tokens for insert with check (true);

create policy "github_pat update"
  on github_pat_tokens for update using (true);