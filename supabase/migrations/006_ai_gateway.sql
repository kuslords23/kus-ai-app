-- Kus-AI gateway guardrails: response cache + fair-use rate limiting.
-- Run in the Supabase SQL editor or via `supabase db push`.

-- Exact-match response cache (also serves highly similar queries via the
-- semantic cache already shipped in jyinx_semantic_cache). Keyed by sha256 of
-- normalized prompt + model so identical requests return instantly at $0 cost.
create table if not exists ai_cache (
  id uuid primary key default gen_random_uuid(),
  cache_key text not null unique,
  prompt text not null,
  system text,
  model text not null,
  response text not null,
  usage jsonb,
  created_at timestamptz default now()
);

create index if not exists ai_cache_key_idx on ai_cache (cache_key);
create index if not exists ai_cache_created_idx on ai_cache (created_at desc);

alter table ai_cache enable row level security;

-- Anyone authenticated/anon can read and write the shared response cache; the
-- data is non-sensitive generated content.
create policy "ai_cache read"
  on ai_cache for select using (true);

create policy "ai_cache write"
  on ai_cache for insert with check (true);

create policy "ai_cache update"
  on ai_cache for update using (true);

-- Daily usage ledger per user/IP for fair-use enforcement.
create table if not exists ai_usage_logs (
  id uuid primary key default gen_random_uuid(),
  scope text not null default 'ip',
  subject text not null,
  day date not null default current_date,
  request_count int not null default 0,
  token_count bigint not null default 0,
  model text,
  last_request_at timestamptz default now(),
  unique (scope, subject, day)
);

create index if not exists ai_usage_subject_idx on ai_usage_logs (scope, subject, day);

alter table ai_usage_logs enable row level security;

-- Anyone can insert/update usage rows (best-effort fair-use, not a hard auth gate).
create policy "ai_usage read"
  on ai_usage_logs for select using (true);

create policy "ai_usage write"
  on ai_usage_logs for insert with check (true);

create policy "ai_usage update"
  on ai_usage_logs for update using (true);

-- Atomic helper: bump a (scope, subject, day) counter (inserts row if missing).
create or replace function public.increment_usage_count(
  p_scope text,
  p_subject text,
  p_day date,
  p_tokens bigint,
  p_model text default null
) returns void
language plpgsql
security invoker
as $$
begin
  insert into ai_usage_logs (scope, subject, day, request_count, token_count, model, last_request_at)
  values (p_scope, p_subject, p_day, 1, p_tokens, p_model, now())
  on conflict (scope, subject, day)
  do update set
    request_count = ai_usage_logs.request_count + 1,
    token_count = ai_usage_logs.token_count + p_tokens,
    model = coalesce(p_model, ai_usage_logs.model),
    last_request_at = now();
end;
$$;