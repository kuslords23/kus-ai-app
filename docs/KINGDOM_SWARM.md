# Kingdom Sub-Agent Swarm (~10,000 agents)

Headless scraper army that harvests public knowledge across **every department** — sports, marketing, business, finance, tech, programming/code, religion, health, education, legal, entertainment, and more. This layer is **separate from user-facing Royal agents** and is injected into RAG as **Kingdom Knowledge**.

## Architecture

```mermaid
flowchart TB
  USER[User question] --> CHAT[ChatThread]
  CHAT -->|POST| KK[/api/kingdom-knowledge/query]
  KK --> CHUNKS[(knowledge_chunks)]
  KK --> QA[(golden_qa_pairs)]
  CHAT -->|userContext.kingdomKnowledge| RAG[Hub /api/ai/rag]
  MISS[retrieval_miss event] --> ORCH[Orchestrator]
  ORCH --> DISPATCH[dispatchSwarmForQuery]
  CRON[/api/cron/swarm-tick] --> SWARM[runSwarmTick]
  SWARM --> TASKS[(scrape_tasks)]
  TASKS --> AGENTS[(kingdom_sub_agents)]
  AGENTS --> CHUNKS
```

## What is NOT in the agent picker

- `kingdom_sub_agents` — ~10k headless scrapers (`visibility: system`)
- `KINGDOM_KNOWLEDGE_MODEL` — fetchable memory layer (`src/lib/kingdom/model.ts`)

User-facing agents (Auto, Royal, Sports, etc.) are unchanged.

## Departments (24)

Sports · Marketing · Business · Finance · Technology · Programming · Religion · Health · Education · Legal · Entertainment · Music · Science · Travel · Food · Fashion · Real Estate · Politics · Philosophy · Agriculture · Automotive · Parenting · Career · News

Each department has topic templates × variants → ~10,000 unique sub-agent slugs.

## Setup

### 1. Run migrations

```bash
# After 001_training_plane.sql
# supabase/migrations/002_sub_agent_swarm.sql
```

### 2. Seed sub-agents

```bash
NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-sub-agents.mjs
```

### 3. Env (Vercel)

```
SUPABASE_SERVICE_ROLE_KEY=   # cron + seed + swarm
CRON_SECRET=                 # cron auth
KINGDOM_SCOUT_ENABLED=true   # optional — when Hub /api/ai/scout is live
```

### 4. Crons

| Path | Schedule | Role |
|------|----------|------|
| `/api/cron/training-tick` | every 30m | learning events + ingestion + swarm |
| `/api/cron/swarm-tick` | every 15m | dispatch + process scrape tasks |

## API

### `POST /api/kingdom-knowledge/query`

Fetch kingdom memory for a user question (authenticated optional).

```json
{ "query": "How does MoMo work in Ghana?", "limit": 8 }
```

Response includes `hits`, `goldenQa`, `departments`, and `context` (markdown for RAG injection).

## Chat integration

Before each Hub RAG call, `ChatThread` fetches kingdom knowledge and passes it via:

```ts
userContext.kingdomKnowledge = {
  modelId: "kingdom-knowledge",
  memory: "## Kingdom Knowledge ...",
}
```

## Retrieval miss → faster scraping

When chat detects a weak RAG answer and `contributeToLearning` is on:

1. `retrieval_miss` learning event is emitted
2. Orchestrator queues ingestion job **and** dispatches 8 sub-agents matching query departments
3. Swarm cron processes tasks → `knowledge_chunks`

## Hub wiring (companion side left)

Hub exposes `POST /api/ai/harvest` (auth required). Companion calls it from both Training Plane jobs and the Kingdom swarm.

On Vercel (companion):

```
HUB_HARVEST_ENABLED=true
HUB_HARVEST_SECRET=<Hub harvest bearer secret>
KINGDOM_SCOUT_ENABLED=true
SUPABASE_SERVICE_ROLE_KEY=
CRON_SECRET=
```

Then: merge PR #20 → run migration `002` → `npm run seed:sub-agents`.
