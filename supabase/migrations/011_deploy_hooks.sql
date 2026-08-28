-- Deploy hook configuration storage for Jyinx push-to-host.
-- Users configure their Vercel/Netlify/Railway/custom deploy hooks
-- directly from the Jyinx Connectors Hub UI — no env vars needed.
-- Run in the Supabase SQL editor or via `supabase db push`.

create table if not exists deploy_hooks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  host text not null,                     -- vercel | netlify | railway | custom
  label text,                             -- e.g. "My Vercel Production"
  hook_url text not null,                 -- the deploy hook URL
  repo_scope text[],                      -- optional: restrict to specific repos
  is_active boolean not null default true,
  last_used_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, host, label)
);

create index if not exists deploy_hooks_user_idx
  on deploy_hooks (user_id, is_active, updated_at desc);

alter table deploy_hooks enable row level security;

create policy "deploy hooks owner read"
  on deploy_hooks for select
  using (auth.uid() = user_id);

create policy "deploy hooks insert"
  on deploy_hooks for insert
  with check (auth.uid() = user_id);

create policy "deploy hooks update"
  on deploy_hooks for update
  using (auth.uid() = user_id);

create policy "deploy hooks delete"
  on deploy_hooks for delete
  using (auth.uid() = user_id);