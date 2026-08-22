CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Dual-scope skill registry
CREATE TABLE IF NOT EXISTS public.workspace_skills (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id uuid NOT NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  embedding vector(1536),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.marketplace_skills (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  creator_id uuid NOT NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  price_credits numeric(10,2) NOT NULL CHECK (price_credits > 0),
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  -- content intentionally omitted from public table: runtime retrieval only via authorized RPC
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Unified storefront (apps, agents, models, skill listings)
CREATE TABLE IF NOT EXISTS public.marketplace_listings (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  asset_class text NOT NULL CHECK (asset_class IN ('app', 'agent', 'model', 'skill')),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  creator_id uuid NOT NULL,
  price_credits integer NOT NULL CHECK (price_credits > 0),
  department text,
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  rating numeric(3,2) NOT NULL DEFAULT 0,
  installs integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.marketplace_purchases (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  listing_id uuid NOT NULL REFERENCES public.marketplace_listings(id),
  buyer_id uuid NOT NULL,
  credits_charged integer NOT NULL,
  creator_share integer NOT NULL,
  platform_share integer NOT NULL,
  payment_rail text NOT NULL DEFAULT 'credits' CHECK (payment_rail IN ('credits', 'hubtel', 'stripe')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.proxy_sessions (
  id text PRIMARY KEY,
  owner_id uuid NOT NULL,
  renter_id uuid NOT NULL,
  listing_id text NOT NULL,
  expires_at timestamptz NOT NULL,
  credits_budget integer NOT NULL,
  credits_spent integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workspace_skills_owner ON public.workspace_skills(owner_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_listings_class ON public.marketplace_listings(asset_class);
CREATE INDEX IF NOT EXISTS idx_proxy_sessions_renter ON public.proxy_sessions(renter_id);
