-- Jyinx Creator Platform: blog CMS, hosting, and semantic-cache tables.
-- Run in the Supabase SQL editor or via `supabase db push`.

create extension if not exists "vector";

-- ============================================================================
-- Semantic cache (used by src/services/semanticCache.ts)
-- ============================================================================
create table if not exists jyinx_semantic_cache (
  id uuid primary key default gen_random_uuid(),
  query_hash text not null unique,
  query text not null,
  system text,
  response text not null,
  model text not null,
  embedding vector(1024),
  created_at timestamptz default now()
);

create index if not exists jyinx_semantic_cache_query_idx
  on jyinx_semantic_cache (query_hash);

create index if not exists jyinx_semantic_embedding_idx
  on jyinx_semantic_cache using hnsw (embedding vector_cosine_ops);

alter table jyinx_semantic_cache enable row level security;

create policy "semantic cache read"
  on jyinx_semantic_cache for select using (true);

create policy "semantic cache write"
  on jyinx_semantic_cache for insert with check (true);

-- Distillation log for training-data export.
create table if not exists jyinx_distill_logs (
  id uuid primary key default gen_random_uuid(),
  instruction text not null,
  input text,
  output text not null,
  model text,
  source text,
  created_at timestamptz default now()
);

alter table jyinx_distill_logs enable row level security;
create policy "distill read" on jyinx_distill_logs for select using (true);
create policy "distill write" on jyinx_distill_logs for insert with check (true);

-- ============================================================================
-- Blog engine & headless CMS (src/lib/jyinx/blog-engine.ts)
-- ============================================================================
create table if not exists jyinx_blog_posts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  excerpt text,
  cover text,
  body text not null,
  tags text[] not null default '{}',
  status text not null default 'draft' check (status in ('draft', 'published')),
  author text,
  published_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists jyinx_blog_posts_status_idx
  on jyinx_blog_posts (status, updated_at desc);

alter table jyinx_blog_posts enable row level security;
create policy "blog read" on jyinx_blog_posts for select using (true);
create policy "blog write" on jyinx_blog_posts for insert with check (true);
create policy "blog update" on jyinx_blog_posts for update using (true);
create policy "blog delete" on jyinx_blog_posts for delete using (true);

-- ============================================================================
-- Instant hosting & deployment (src/lib/jyinx/hosting-engine.ts)
-- ============================================================================
create table if not exists jyinx_sites (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  html text not null,
  stack text not null default 'html',
  status text not null default 'draft' check (status in ('draft', 'deploying', 'live', 'error')),
  deploy_url text,
  deploy_log text,
  owner text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists jyinx_sites_slug_idx on jyinx_sites (slug);
create index if not exists jyinx_sites_owner_idx on jyinx_sites (owner, updated_at desc);

alter table jyinx_sites enable row level security;
create policy "sites read" on jyinx_sites for select using (true);
create policy "sites write" on jyinx_sites for insert with check (true);
create policy "sites update" on jyinx_sites for update using (true);
create policy "sites delete" on jyinx_sites for delete using (true);