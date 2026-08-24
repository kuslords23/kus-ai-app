-- Kus AI Gateway: per-request telemetry + virtual/sub-key management.
-- Drive by src/server/ai-gateway/*. Run in the Supabase SQL editor or via
-- `supabase db push`.

-- ============================================================================
-- Per-request usage telemetry (src/server/ai-gateway/telemetry.ts)
-- Every request through the gateway logs tokens, cost, latency, TTFT, and the
-- responding model for usage auditing + user billing.
-- ============================================================================
create table if not exists ai_usage_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  ip text,
  gateway text not null,                    -- openrouter | vercel | litellm | portkey | braintrust | direct
  provider text not null,                   -- resolved provider id
  model text not null,                      -- model that actually responded
  request_model text,                       -- originally requested model
  status text not null default 'ok' check (status in ('ok','fallback','error')),
  prompt_tokens int not null default 0,
  completion_tokens int not null default 0,
  total_tokens int not null default 0,
  cost numeric(14,8) not null default 0,    -- calculated USD estimate
  latency_ms int,
  ttft_ms int,
  retries int not null default 0,
  error text,
  metadata jsonb,
  created_at timestamptz default now()
);

create index if not exists ai_usage_req_user_idx
  on ai_usage_requests (user_id, created_at desc);

create index if not exists ai_usage_req_model_idx
  on ai_usage_requests (model, created_at desc);

create index if not exists ai_usage_req_gateway_idx
  on ai_usage_requests (gateway, created_at desc);

alter table ai_usage_requests enable row level security;

-- Owner read (their own usage; service role writes via server code).
create policy "ai usage owner read"
  on ai_usage_requests for select
  using (auth.uid() = user_id);

create policy "ai usage insert"
  on ai_usage_requests for insert with check (true);

-- ============================================================================
-- Virtual / sub-keys (src/server/ai-gateway/virtual-keys.ts)
-- Spending-capped tokens per user. Raw key is returned once at creation;
-- key_token is stored ONLY for locally-enforced keys (not OpenRouter sub-keys).
-- ============================================================================
create table if not exists ai_virtual_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  provider text not null default 'openrouter',
  label text,
  key_hash text not null unique,            -- sha256(raw) or OpenRouter external hash
  key_token text,                           -- raw key for locally-enforced keys only
  budget_usd numeric(14,4),                 -- spending ceiling (USD)
  used_usd numeric(14,4) not null default 0,
  expires_at timestamptz,
  status text not null default 'active' check (status in ('active','exhausted','expired','revoked')),
  created_at timestamptz default now()
);

create index if not exists ai_vk_user_idx
  on ai_virtual_keys (user_id, provider, status, created_at desc);

alter table ai_virtual_keys enable row level security;

create policy "virtual key owner read"
  on ai_virtual_keys for select
  using (auth.uid() = user_id);

create policy "virtual key insert"
  on ai_virtual_keys for insert with check (true);

create policy "virtual key update"
  on ai_virtual_keys for update using (true);

-- Atomic helper: record spend against a key, flipping it to 'exhausted' when
-- the budget ceiling is crossed (server-side enforcement for local keys).
create or replace function public.record_virtual_key_usage(
  p_key_hash text,
  p_cost_usd numeric
) returns void
language plpgsql
security invoker
as $$
begin
  update ai_virtual_keys
  set
    used_usd = coalesce(used_usd, 0) + p_cost_usd,
    status = case
      when (coalesce(used_usd, 0) + p_cost_usd) >= budget_usd then 'exhausted'
      else status
    end
  where key_hash = p_key_hash;
end;
$$;