-- Kus-AI file attachments (server-side ingest so Royal/Jyinx can fetch bytes).
-- Run in the Supabase SQL editor or via `supabase db push`.

create table if not exists jyinx_attachments (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  name text not null,
  mime_type text not null,
  size int not null default 0,
  kind text not null default 'file' check (kind in ('image', 'file', 'video')),
  data text not null,
  user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz default now()
);

create index if not exists jyinx_attachments_token_idx on jyinx_attachments (token);
create index if not exists jyinx_attachments_user_idx on jyinx_attachments (user_id, created_at desc);

alter table jyinx_attachments enable row level security;

-- Read is public (via token), matching the anonymous-friendly patterns in this
-- project so the downstream hub/LLM can fetch attachments without a session.
create policy "attachments read"
  on jyinx_attachments for select using (true);

-- Anyone can insert; optional auth.user_id is recorded when a session exists.
create policy "attachments write"
  on jyinx_attachments for insert with check (
    auth.uid() = user_id or user_id is null
  );