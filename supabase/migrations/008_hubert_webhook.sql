-- Migration - Hubtel integration
create table if not exists hubtel_webhooks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  amount numeric not null,
  description text,
  reference text,
  transaction_reference text,
  created_at timestamptz default now(),
  hubtel_response jsonb
);

alter table hubtel_webhooks enable row level security;

create policy "hubtel-webhook-insert" on hubtel_webhooks for insert with check (auth.uid() = user_id);
alter table hubtel_webhooks enable row level security;
alter policy "hubtel-webhook-insert" on hubtel_webhooks for select using (true);
alter policy "hubtel-webhook-select" on hubtel_webhooks for select using (true);