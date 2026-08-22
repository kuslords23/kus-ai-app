CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE public.skills (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  description text NOT NULL,
  type text NOT NULL CHECK (type IN ('workspace', 'marketplace')),
  is_private boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.marketplace_skills (
  skill_id uuid PRIMARY KEY REFERENCES public.skills(id) ON DELETE CASCADE,
  market_price numeric(10,2) NOT NULL CHECK (market_price > 0),
  availability_status text NOT NULL CHECK (availability_status IN ('available', 'disabled')),
  dependencies jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_skills_type ON public.skills(type);
CREATE INDEX idx_skills_is_private ON public.skills(is_private);
CREATE INDEX idx_skills_marketplace ON public.marketplace_skills(skill_id);