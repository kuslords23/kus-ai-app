# Kus Training Worker

Background processor for the **Training Plane** — harvests, gates, embeds, and feeds shared pgvector memory consumed by Hub RAG and the Royal companion.

## Architecture

```
Royal companion / Hub UI
        │ learning_events (Supabase)
        ▼
  training-tick cron (/api/cron/training-tick on kus-ai-app)
        │ orchestrator
        ▼
  ingestion_jobs → gatekeeper → knowledge_chunks → embeddings
        ▲
        └── Hub /api/ai/rag retrieves (no weight fine-tuning)
```

## Run locally

```bash
# From repo root — requires service role key
export NEXT_PUBLIC_SUPABASE_URL=...
export SUPABASE_SERVICE_ROLE_KEY=...
npx tsx training-worker/run.ts
```

## Deploy

1. Apply `supabase/migrations/001_training_plane.sql` on kingdom Supabase.
2. Set env on **kus-ai-app** (or dedicated worker):
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `CRON_SECRET` (for Vercel cron auth)
   - `OPENAI_API_KEY` (when embedder is enabled on Hub)
3. Vercel cron runs every 30 minutes via `vercel.json`.

## Hub integration (next)

Hub should mirror:
- `POST` learning events with `source: 'hub'`
- Wire `/api/ai/rag` to query `knowledge_embeddings` before LLM
- Trigger scout on retrieval miss (same `learning_events` table)

## Internal agents (not user-facing)

| Agent | Role |
|-------|------|
| `data-harvester` | Cron bulk ingest |
| `fact-checker-style` | Gatekeeper + style distill |
| `auto-search-scout` | On-demand web from retrieval_miss |
| `embedder` | Write pgvector |

See `docs/TRAINING_PLANE.md` for full blueprint.
