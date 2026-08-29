-- Marketplace listings with full app HTML content for user-built apps.
-- Run in the Supabase SQL editor or via `supabase db push`.

create table if not exists marketplace_listings (
  id text primary key,
  asset_class text not null check (asset_class in ('app', 'agent', 'model', 'skill')),
  name text not null,
  description text not null default '',
  creator_id uuid not null,
  price_credits int not null default 0,
  department text,
  tags text[] not null default '{}',
  rating numeric(3,1) not null default 0,
  installs int not null default 0,
  is_active boolean not null default true,
  html_content text,
  stack text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists mkpl_creator_idx on marketplace_listings (creator_id, created_at desc);
create index if not exists mkpl_class_idx on marketplace_listings (asset_class, created_at desc);
create index if not exists mkpl_active_idx on marketplace_listings (is_active, created_at desc);

alter table marketplace_listings enable row level security;

-- Everyone can read active listings
create policy "marketplace read active"
  on marketplace_listings for select
  using (is_active = true);

-- Authenticated users can create listings
create policy "marketplace insert"
  on marketplace_listings for insert
  with check (auth.uid() = creator_id);

-- Creators can update their own listings
create policy "marketplace update own"
  on marketplace_listings for update
  using (auth.uid() = creator_id);

-- Creators can delete their own listings
create policy "marketplace delete own"
  on marketplace_listings for delete
  using (auth.uid() = creator_id);

-- Increment installs counter (used when someone hires/buys)
create or replace function public.increment_marketplace_installs(p_listing_id text)
returns void
language plpgsql
security invoker
as $$
begin
  update marketplace_listings
  set installs = installs + 1, updated_at = now()
  where id = p_listing_id;
end;
$$;