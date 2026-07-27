-- Kingdom Sub-Agent Swarm (~10k headless scraper agents)
-- Run after 001_training_plane.sql

-- ---------------------------------------------------------------------------
-- Departments (kingdom domains)
-- ---------------------------------------------------------------------------
create table if not exists kingdom_departments (
  id text primary key,
  name text not null,
  description text,
  icon text default '📚',
  priority int default 50,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- Sub-agents: headless scrapers — NEVER shown in user agent picker
-- ---------------------------------------------------------------------------
create table if not exists kingdom_sub_agents (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  department_id text not null references kingdom_departments (id),
  topic text not null,
  variant text default 'general',
  display_name text not null,
  search_seeds text[] not null default '{}',
  source_hints text[] default '{}',
  status text not null default 'active' check (status in ('active', 'paused', 'retired')),
  visibility text not null default 'system' check (visibility = 'system'),
  tasks_completed int default 0,
  chunks_produced int default 0,
  last_run_at timestamptz,
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

create index if not exists kingdom_sub_agents_dept_idx on kingdom_sub_agents (department_id);
create index if not exists kingdom_sub_agents_status_idx on kingdom_sub_agents (status) where status = 'active';
create index if not exists kingdom_sub_agents_slug_idx on kingdom_sub_agents (slug);

-- ---------------------------------------------------------------------------
-- Scrape task queue (parallel swarm workers)
-- ---------------------------------------------------------------------------
create table if not exists scrape_tasks (
  id uuid primary key default gen_random_uuid(),
  sub_agent_id uuid references kingdom_sub_agents (id) on delete set null,
  department_id text,
  query text not null,
  search_seeds text[] default '{}',
  status text not null default 'queued' check (
    status in ('queued', 'running', 'extracted', 'gated', 'embedded', 'failed')
  ),
  priority int default 50,
  urls_found text[] default '{}',
  markdown_preview text,
  chunk_ids uuid[] default '{}',
  error text,
  metadata jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists scrape_tasks_queue_idx
  on scrape_tasks (priority desc, created_at)
  where status = 'queued';

create index if not exists scrape_tasks_agent_idx on scrape_tasks (sub_agent_id, status);

-- Link knowledge back to sub-agent
alter table knowledge_chunks
  add column if not exists sub_agent_id uuid references kingdom_sub_agents (id) on delete set null;

alter table knowledge_chunks
  add column if not exists department_id text;

create index if not exists knowledge_chunks_dept_idx on knowledge_chunks (department_id);
create index if not exists knowledge_chunks_sub_agent_idx on knowledge_chunks (sub_agent_id);

alter table golden_qa_pairs
  add column if not exists sub_agent_id uuid references kingdom_sub_agents (id) on delete set null;

alter table golden_qa_pairs
  add column if not exists department_id text;

-- Kingdom knowledge query audit
create table if not exists kingdom_knowledge_queries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  query text not null,
  departments text[] default '{}',
  sub_agents_used uuid[] default '{}',
  chunk_count int default 0,
  source text default 'kus-ai-app',
  created_at timestamptz default now()
);

-- RLS: kingdom tables are service-role only for writes; authenticated read on chunks via API
alter table kingdom_knowledge_queries enable row level security;

create policy kingdom_queries_insert_own on kingdom_knowledge_queries
  for insert to authenticated
  with check (auth.uid() = user_id or user_id is null);
