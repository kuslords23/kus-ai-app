# Kus-lords AI

A dedicated AI companion app for the Kus-lords ecosystem. ChatGPT-level chat UX with a royal dark/gold theme, mobile-first design.

## Architecture

- **Brain stays on hub** — all RAG requests proxy through `/api/ai/rag` to the hub's API
- **Face lives here** — chat UI, auth, theme, companion awareness
- **Shared identity** — same Supabase project + `kus-lords-auth` storage key
- **Sign-in inside this app** — never redirects to hub for auth

## Getting Started

```bash
cp .env.example .env.local
# Fill in your Supabase and hub URLs
npm install
npm run dev
```

## Environment Variables

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (same as hub) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (same as hub) |
| `NEXT_PUBLIC_HUB_URL` | Hub app URL |
| `NEXT_PUBLIC_SPORTS_COMPANION_URL` | Sports companion URL |
| `NEXT_PUBLIC_SITE_URL` | This app's deployed URL |

## Tech Stack

- Next.js 16 (App Router)
- React 19
- Tailwind CSS 4
- Framer Motion
- Sonner (toasts)
- Supabase Auth (SSR)
