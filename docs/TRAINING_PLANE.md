# Kus Training Plane

Continuous learning **without fine-tuning base model weights**. Hub and Royal companion share one Supabase memory layer; a background orchestrator turns signals into verified vector chunks.

## Three layers

| Layer | Repo | Role |
|-------|------|------|
| **Presentation** | `kus-ai-app`, Hub UI | Chat, agents picker (user-facing only) |
| **Inference** | Hub `sport-clan-nexus` | `/api/ai/rag` + retrieval from pgvector |
| **Learning** | This repo + Hub workers | Harvest → gate → embed → store |

## Data flow

```mermaid
flowchart LR
  ROYAL[Royal companion] -->|learning_events| SB[(Supabase)]
  HUB[Hub client] -->|learning_events| SB
  CRON[training-tick cron] --> ORCH[Orchestrator]
  ORCH --> SB
  ORCH --> JOBS[ingestion_jobs]
  JOBS --> VEC[knowledge_embeddings]
  HUBRAG[Hub /api/ai/rag] --> VEC
  ROYAL -->|proxy| HUBRAG
```

## Companion (this repo) — implemented

- `POST /api/learning/event` — authenticated event ingest
- `GET /api/cron/training-tick` — processes batch (Vercel cron every 30m)
- `GET /api/cron/swarm-tick` — sub-agent swarm dispatch + scrape (every 15m)
- `POST /api/kingdom-knowledge/query` — fetch Kingdom Knowledge for RAG
- Chat 👍/👎 → `correction` / `helpful` events
- Retrieval miss heuristic after weak RAG answers → also dispatches sub-agent swarm
- RAG errors → `rag_error` events
- Settings → **Help improve Royal** toggle (`contributeToLearning`)

See also: [KINGDOM_SWARM.md](./KINGDOM_SWARM.md)

## Supabase setup

Run migrations:

```bash
# supabase/migrations/001_training_plane.sql
# supabase/migrations/002_sub_agent_swarm.sql
```

Seed ~10k sub-agents:

```bash
node scripts/seed-sub-agents.mjs
```

Create storage buckets: `knowledge-raw`, `knowledge-normalized`.

Required env:

```
SUPABASE_SERVICE_ROLE_KEY=   # cron + worker only (never client)
CRON_SECRET=                 # Vercel cron auth
KINGDOM_SCOUT_ENABLED=false  # set true when Hub /api/ai/scout is live
```

## Hub — to implement next

1. Emit `learning_events` with `source: 'hub'` on retrieval miss
2. Query `knowledge_embeddings` + `golden_qa_pairs` in `/api/ai/rag`
3. Full harvester/scout/gatekeeper/embedder (replace orchestrator stubs)
4. Do **not** expose internal agents in user agent picker

## Event types

| Type | Source | Orchestrator action |
|------|--------|---------------------|
| `retrieval_miss` | Both | Queue `auto-search-scout` job + dispatch sub-agent swarm |
| `correction` | User 👎 | Queue `fact-checker-style` job |
| `helpful` | User 👍 | Insert `golden_qa_pairs` |
| `rag_error` | Companion | Logged (monitoring) |
| `harvest_request` | Admin/ad-hoc | Queue `data-harvester` job |

## Self-correction

`correction_events` links user feedback → gatekeeper re-processes → downrank or quarantine bad chunks (Hub worker).

## Why no weight training

Updating pgvector + golden Q&A gives instant knowledge and style without model collapse. Optional future: per-domain LoRA adapters stored in Supabase, loaded at Hub inference time.

## Two deepen setups (companion)

| Setup | Status | What it does |
|-------|--------|--------------|
| **1. Training Plane** | Merged (PR #19) | Learning events → ingestion jobs → Hub harvest |
| **2. Kingdom Swarm** | PR #20 | ~10k sub-agents → scrape_tasks → knowledge_chunks |

Both call Hub `POST /api/ai/harvest` when enabled.

```
HUB_HARVEST_ENABLED=true
HUB_HARVEST_SECRET=<same secret Hub expects on /api/ai/harvest>
# or reuse CRON_SECRET if Hub accepts it
KINGDOM_SCOUT_ENABLED=true   # also enables Hub harvest for swarm
```
