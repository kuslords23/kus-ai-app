-- Kus Intelligence / Training Plane (shared by Hub + Royal companion + training-worker)
-- Run once on the kingdom Supabase project.

create extension if not exists vector;

-- ---------------------------------------------------------------------------
-- Event bus: Hub and companion both write; training-worker consumes
-- ---------------------------------------------------------------------------
create table if not exists learning_events (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('hub', 'kus-ai-app', 'training-worker')),
  event_type text not null,
  user_id uuid references auth.users (id) on delete set null,
  session_id text,
  payload jsonb not null default '{}',
  processed_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists learning_events_unprocessed_idx
  on learning_events (created_at)
  where processed_at is null;

create index if not exists learning_events_type_idx
  on learning_events (event_type, created_at desc);

-- ---------------------------------------------------------------------------
-- Ingestion pipeline
-- ---------------------------------------------------------------------------
create table if not exists ingestion_jobs (
  id uuid primary key default gen_random_uuid(),
  agent text not null default 'data-harvester',
  source_type text not null,
  source_url text,
  status text not null default 'queued',
  raw_storage_path text,
  markdown_storage_path text,
  error text,
  metadata jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists ingestion_jobs_status_idx on ingestion_jobs (status, created_at);

-- ---------------------------------------------------------------------------
-- Gatekeeper outputs
-- ---------------------------------------------------------------------------
create table if not exists knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  content text not null,
  content_hash text unique,
  source_url text,
  source_job_id uuid references ingestion_jobs (id) on delete set null,
  domain text,
  style_profile jsonb,
  verification_status text not null,
  confidence float not null check (confidence >= 0 and confidence <= 1),
  token_count int,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists golden_qa_pairs (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  answer text not null,
  style_tags text[] default '{}',
  source_job_id uuid references ingestion_jobs (id) on delete set null,
  verification_status text not null,
  confidence float not null,
  domain text,
  created_at timestamptz default now()
);

create table if not exists quarantine_chunks (
  id uuid primary key default gen_random_uuid(),
  content text not null,
  reason text,
  source_job_id uuid references ingestion_jobs (id) on delete set null,
  payload jsonb default '{}',
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- Embeddings (pgvector) — dims match OpenAI text-embedding-3-small (1536)
-- ---------------------------------------------------------------------------
create table if not exists knowledge_embeddings (
  chunk_id uuid primary key references knowledge_chunks (id) on delete cascade,
  embedding vector(1536),
  model text not null,
  created_at timestamptz default now()
);

create index if not exists knowledge_embeddings_ivfflat_idx
  on knowledge_embeddings using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

create table if not exists golden_qa_embeddings (
  qa_id uuid primary key references golden_qa_pairs (id) on delete cascade,
  embedding vector(1536),
  model text not null,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- Auto search scout audit
-- ---------------------------------------------------------------------------
create table if not exists scout_runs (
  id uuid primary key default gen_random_uuid(),
  trigger_query text not null,
  user_id uuid,
  session_id text,
  source text,
  urls_fetched text[] default '{}',
  chunks_created int default 0,
  served_in_reply boolean default false,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- Self-correction loop
-- ---------------------------------------------------------------------------
create table if not exists correction_events (
  id uuid primary key default gen_random_uuid(),
  learning_event_id uuid references learning_events (id) on delete set null,
  user_id uuid,
  session_id text,
  user_query text,
  assistant_reply text,
  correction_note text,
  source text not null,
  resolved_at timestamptz,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- RLS: users insert own learning events; read via service role in workers
-- ---------------------------------------------------------------------------
alter table learning_events enable row level security;
alter table correction_events enable row level security;

create policy learning_events_insert_own on learning_events
  for insert to authenticated
  with check (auth.uid() = user_id or user_id is null);

create policy correction_events_insert_own on correction_events
  for insert to authenticated
  with check (auth.uid() = user_id or user_id is null);

-- Storage buckets (create in Supabase dashboard or API):
-- knowledge-raw, knowledge-normalized
