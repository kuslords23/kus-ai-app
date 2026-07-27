-- Kus-lords: upgrade Hub golden_qa / knowledge tables + insert MoMo
-- Paste ALL of this into Supabase SQL Editor → Run

-- ---------------------------------------------------------------------------
-- 1) Create tables ONLY if Hub never created them
-- ---------------------------------------------------------------------------
create table if not exists public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  content text not null,
  content_hash text unique,
  source_url text,
  domain text,
  department_id text,
  verification_status text not null default 'verified',
  confidence double precision not null default 0.9,
  token_count int,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.golden_qa_pairs (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  answer text not null,
  style_tags text[] default '{}',
  verification_status text not null default 'verified',
  confidence double precision not null default 0.9,
  domain text,
  department_id text,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- 2) Upgrade EXISTING Hub tables (safe if columns already exist)
-- ---------------------------------------------------------------------------
alter table public.golden_qa_pairs add column if not exists question text;
alter table public.golden_qa_pairs add column if not exists answer text;
alter table public.golden_qa_pairs add column if not exists domain text;
alter table public.golden_qa_pairs add column if not exists department_id text;
alter table public.golden_qa_pairs add column if not exists style_tags text[] default '{}';
alter table public.golden_qa_pairs add column if not exists verification_status text;
alter table public.golden_qa_pairs add column if not exists confidence double precision;

alter table public.knowledge_chunks add column if not exists content text;
alter table public.knowledge_chunks add column if not exists content_hash text;
alter table public.knowledge_chunks add column if not exists source_url text;
alter table public.knowledge_chunks add column if not exists domain text;
alter table public.knowledge_chunks add column if not exists department_id text;
alter table public.knowledge_chunks add column if not exists verification_status text;
alter table public.knowledge_chunks add column if not exists confidence double precision;
alter table public.knowledge_chunks add column if not exists token_count int;

-- ---------------------------------------------------------------------------
-- 3) Insert MoMo once (skips if already there)
-- ---------------------------------------------------------------------------
insert into public.golden_qa_pairs (
  question,
  answer,
  domain,
  department_id,
  style_tags,
  verification_status,
  confidence
)
select
  'Explain MoMo in Ghana',
  'MoMo (Mobile Money) in Ghana is electronic money stored on your phone number. You send, receive, pay bills, and buy airtime without a bank account. Major providers include MTN MoMo, Telecel Cash (formerly Vodafone Cash), and AT Money. Protect your PIN and confirm the recipient name before sending.',
  'finance',
  'finance',
  array['starter','verified']::text[],
  'verified',
  0.95
where not exists (
  select 1
  from public.golden_qa_pairs g
  where g.question ilike 'Explain MoMo in Ghana'
);

-- ---------------------------------------------------------------------------
-- 4) Prove it worked
-- ---------------------------------------------------------------------------
select id, question, domain, department_id, confidence
from public.golden_qa_pairs
where question ilike '%momo%';
