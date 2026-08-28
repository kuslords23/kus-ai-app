import { createBrowserClient } from "@supabase/ssr";

/**
 * Derive a unique storage key for this specific app environment so the
 * Supabase session doesn't collide with other apps (hub, sports, etc.)
 * that share the same domain. Uses the Supabase project ref from the URL
 * to create an isolated namespace.
 */
function makeStorageKey(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  let ref = "kus-lords";
  try {
    if (url) {
      // Extract the subdomain from the Supabase URL (e.g. "abc123" from "https://abc123.supabase.co")
      const hostname = new URL(url).hostname;
      const parts = hostname.split(".");
      if (parts.length >= 2) {
        ref = parts[0];
      }
    }
  } catch {
    // fall through to default
  }
  return `kus-ai-auth:${ref}`;
}

let AUTH_STORAGE_KEY: string | null = null;

function getStorageKey(): string {
  if (!AUTH_STORAGE_KEY) {
    AUTH_STORAGE_KEY = makeStorageKey();
  }
  return AUTH_STORAGE_KEY;
}

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY"
    );
  }

  return createBrowserClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: "pkce",
      storageKey: getStorageKey(),
    },
  });
}
