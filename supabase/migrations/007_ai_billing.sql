-- Kus-AI credit billing: wallet balances, transactions, and atomic deduction.
-- Run in the Supabase SQL editor or via `supabase db push`.

-- Per-user credit balance wallet.
create table if not exists ai_credit_balances (
  user_id uuid primary key,
  balance numeric(14,4) not null default 0,
  currency text not null default 'usd',
  updated_at timestamptz default now()
);

-- Transaction ledger (credits + and debits -).
create table if not exists ai_credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  amount numeric(14,4) not null,
  kind text not null check (kind in ('credit','debit')),
  source text not null,           -- stripe-checkout | ai-call | tool-call | manual
  reference text,                 -- tx id / route / session id
  metadata jsonb,
  created_at timestamptz default now()
);

create index if not exists ai_credit_bal_user_idx on ai_credit_balances (user_id);
create index if not exists ai_credit_tx_user_idx on ai_credit_transactions (user_id, created_at desc);

alter table ai_credit_balances enable row level security;
alter table ai_credit_transactions enable row level security;

-- Users only ever see their own wallet + ledger.
create policy "credit balance owner read"
  on ai_credit_balances for select
  using (auth.uid() = user_id);

create policy "credit balance owner update"
  on ai_credit_balances for update
  using (auth.uid() = user_id);

create policy "credit tx owner read"
  on ai_credit_transactions for select
  using (auth.uid() = user_id);

create policy "credit tx owner insert"
  on ai_credit_transactions for insert
  with check (auth.uid() = user_id);

-- Atomic helper: adjust a user's balance (positive = credit, negative = debit)
-- and record a ledger row. Returns the new balance; debits that would push the
-- wallet below zero are rejected.
create or replace function public.adjust_credit_balance(
  p_user_id uuid,
  p_delta numeric,
  p_kind text,
  p_source text,
  p_reference text default null,
  p_metadata jsonb default null
) returns numeric
language plpgsql
security invoker
as $$
declare
  v_balance numeric;
begin
  select balance into v_balance
  from ai_credit_balances
  where user_id = p_user_id
  for update;

  v_balance := coalesce(v_balance, 0) + p_delta;
  if v_balance < 0 then
    raise exception 'insufficient_credits';
  end if;

  insert into ai_credit_balances (user_id, balance, updated_at)
  values (p_user_id, v_balance, now())
  on conflict (user_id)
  do update set balance = v_balance, updated_at = now();

  insert into ai_credit_transactions (user_id, amount, kind, source, reference, metadata)
  values (p_user_id, p_delta, p_kind, p_source, p_reference, coalesce(p_metadata, '{}'::jsonb));

  return v_balance;
end;
$$;