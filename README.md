# Kus-lords AI

Standalone AI companion for the Kus-lords kingdom.

## Correct architecture

- **Brain stays on hub** — `POST ${HUB}/api/ai/rag` with hub body `{ query, stream, userContext, history }`
- **Face lives here** — full-screen chat, in-app sign-in (`kus-lords-auth`), Sports/Hub deep-links
- **Same assistant soul as hub** — same streaming client path, chips, history, welcome

Do **not** invent a new bot or send `{ messages }` (that returns `Missing query` / 400).

## Env

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_HUB_URL=https://sport-clan-nexus.vercel.app
NEXT_PUBLIC_SPORTS_COMPANION_URL=https://kus-sports.vercel.app
NEXT_PUBLIC_SITE_URL=https://kus-ai-app.vercel.app
```

## Dev

```bash
npm install
npm run dev
```