# Kus-lords AI Companion — Integration Guide

How the standalone **Kus AI** companion connects to the main Kus-lords ecosystem.

## Architecture

```
Kus AI App (kus-ai-app.vercel.app)
  ├── UI: Grok-style chat, agents, attachments, voice
  ├── Auth: Supabase (same project as Hub)
  ├── Memory: local Royal memory + cloud chat sync
  └── Brain: POST /api/ai/rag → Hub /api/ai/rag (no duplicate bot)
```

The companion does **not** run its own LLM pipeline. All intelligence flows through the Hub RAG API with a compatible request body.

## RAG request contract

```json
{
  "query": "user message",
  "stream": true,
  "userContext": {
    "user": { "id", "name", "email" },
    "navigation": { "activeTab", "source": "kus-ai-app" },
    "retrieval": {
      "strategy": "hub-first",
      "webFallback": true,
      "matchAttachmentsToSearch": true
    },
    "persona": { "name": "Royal", "systemPrompt", "silentMode", "energyLevel" },
    "agent": { "agentId", "agentName", "skills", "persona", "speed" },
    "companionMemory": { "emotionalHistory", "recentDecisions", "regrettedPatterns", "..." }
  },
  "history": [{ "role": "user"|"assistant", "content": "..." }],
  "attachments": [{ "kind", "name", "mimeType", "url", "hubFirst": true }]
}
```

Hub returns `sources`, `recommendations`, `usedWebSearch`, `dataSource`, and optional `videos`/`music`/`articles`. The companion renders **hub items first**, then web fallbacks, with linked summaries and embedded video/music previews when URLs are present.

## RAG context fields (reference)
    "companion": { "id": "ai", "name": "Kus AI", "surface": "standalone" },
    "persona": { "name": "Royal", "systemPrompt", "silentMode", "energyLevel" },
    "agent": { "agentId", "agentName", "skills", "persona", "speed" },
    "companionMemory": { "emotionalHistory", "recentDecisions", "regrettedPatterns", ... }
  },
  "history": [{ "role": "user"|"assistant", "content": "..." }],
  "attachments": [{ "kind", "name", "mimeType", "url", "size" }]
}
```

## Actions & automation

When Hub returns `actionTaken: true` with an `action` object:

| Risk | Examples | Companion behavior |
|------|----------|-------------------|
| Low | Navigate to tab | Open companion URL immediately |
| Medium | Marketplace, post | Confirmation modal |
| High | Wallet, betting, Dream | Confirmation + regret warning if pattern matches |

Action deep links use `src/lib/companions/registry.ts` and `src/lib/actions/executor.ts`.

## Memory layers

| Layer | Storage | Purpose |
|-------|---------|---------|
| Royal memory | `localStorage` `kus_royal_memory:{userId}` | Emotions, decisions, regrets, pinned/fading topics |
| Companion memory | `localStorage` `kus_companion_memory:{userId}` | Legacy hub-compatible summary fields |
| Chat threads | `localStorage` + Supabase `ai_chat_messages` | Conversation history cross-app sync |
| Action log | `localStorage` `kus_ai_action_log:{userId}` | Recent confirmed actions |

## Companion apps registry

Extend `src/lib/companions/registry.ts` when new apps ship. Set env vars:

- `NEXT_PUBLIC_HUB_URL`
- `NEXT_PUBLIC_SPORTS_COMPANION_URL`
- `NEXT_PUBLIC_LIVE_COMPANION_URL`
- `NEXT_PUBLIC_MUSIC_COMPANION_URL`
- `NEXT_PUBLIC_MARKET_COMPANION_URL`
- `NEXT_PUBLIC_CHAT_COMPANION_URL`

## Permissions & safety

1. **Confirmation required** for money, posting, deleting, following, betting
2. **Regret prevention** checks action summary against stored regret patterns
3. **Silent mode** suppresses TTS unless response is a warning or user is stuck
4. **Memory decay** user-controlled: `keep-all` | `balanced` | `minimal`

## Hub return button

When opening Hub from Royal, URLs include `?companion=kus-ai&returnTo=<ai-app-url>`.

Add this script to Hub layout for the floating **← Royal** button:

```html
<script src="https://kus-ai-app.vercel.app/hub-return-badge.js" defer></script>
```

## Push notifications

Requires Supabase table:

```sql
create table if not exists push_subscriptions (
  user_id uuid references auth.users not null,
  endpoint text not null,
  p256dh text,
  auth text,
  updated_at timestamptz default now(),
  primary key (user_id, endpoint)
);
```

Set VAPID keys in env (`npx web-push generate-vapid-keys`).

## Future: server-side Royal memory

For cross-device memory sync, add a Supabase table `royal_companion_memory` mirroring `RoyalMemory` and sync on login — same pattern as `ai_chat_messages`.

## Agents

Specialist agents in `src/lib/agents/registry.ts` layer persona hints on top of Royal. The hub can route by `userContext.agent.agentId` and `sourceType`.
