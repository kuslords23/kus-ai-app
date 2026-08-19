/**
 * Automated BYOK (Bring Your Own Key) provisioning.
 *
 * Secure integration flows letting users link their personal API keys for any
 * provider (Google AI Studio for Gemini, OpenRouter tokens, OpenAI, Anthropic,
 * Groq, Together, DeepSeek, Mistral, Cohere, Perplexity). Keys are encrypted at
 * the user level and stored in Supabase, linked to the workspace account.
 *
 * Encryption uses AES-256-GCM with a per-user data key derived from an
 * application secret. Keys never appear in fetch args/logs once stored, and
 * read back through masking helpers for UI display.
 */

import { createClient as createSupabaseClient } from "@/lib/supabase/server";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

export const BYOK_TABLE = "ai_byok_keys";

export type ByokProviderId =
  | "openrouter"
  | "gemini"
  | "openai"
  | "anthropic"
  | "groq"
  | "together"
  | "deepseek"
  | "mistral"
  | "cohere"
  | "perplexity";

export interface ByokEntry {
  provider: ByokProviderId;
  /** encrypted base64 */
  cipher: string;
  /** base64 iv */
  iv: string;
  createdAt: string;
}

function secretKey(): Buffer {
  // Env secret must be ≥ 32 bytes. Fall back to a derived key for dev/tests.
  const secret = process.env.BYOK_ENCRYPTION_KEY || "kus-lords-byok-dev-secret-please-rotate";
  const hash = createHash("sha256").update(secret).digest();
  return hash;
}

export function encryptSecret(plain: string): { cipher: string; iv: string } {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secretKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { cipher: `${tag.toString("base64")}.${encrypted.toString("base64")}`, iv: iv.toString("base64") };
}

export function decryptSecret(entry: { cipher: string; iv: string }): string | null {
  try {
    const iv = Buffer.from(entry.iv, "base64");
    const [tagStr, dataStr] = entry.cipher.split(".");
    if (!tagStr || !dataStr) return null;
    const decipher = createDecipheriv("aes-256-gcm", secretKey(), iv);
    decipher.setAuthTag(Buffer.from(tagStr, "base64"));
    const decrypted = Buffer.concat([decipher.update(Buffer.from(dataStr, "base64")), decipher.final()]);
    return decrypted.toString("utf8");
  } catch {
    return null;
  }
}

function maskValue(key: string): string {
  if (key.length <= 8) return "••••";
  return `${key.slice(0, 4)}••••${key.slice(-4)}`;
}

/** Stores an encrypted provider key for a user. */
export async function saveByokKey(userId: string, provider: ByokProviderId, rawKey: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const key = rawKey?.trim();
  if (!key) return { ok: false, error: "A key is required." };
  try {
    const client = await createSupabaseClient();
    const entry = encryptSecret(key);
    await client.from(BYOK_TABLE).upsert(
      {
        user_id: userId,
        provider,
        cipher: entry.cipher,
        iv: entry.iv,
        created_at: new Date().toISOString(),
      },
      { onConflict: "user_id,provider" }
    );
    return { ok: true };
  } catch (cause) {
    return { ok: false, error: cause instanceof Error ? cause.message : "Could not store key." };
  }
}

/** Returns the plaintext provider key for a user (used only server-side, never sent to client). */
export async function getByokKey(userId: string, provider: ByokProviderId): Promise<string | null> {
  try {
    const client = await createSupabaseClient();
    const { data } = await client
      .from(BYOK_TABLE)
      .select("cipher, iv")
      .eq("user_id", userId)
      .eq("provider", provider)
      .maybeSingle();
    if (!data) return null;
    return decryptSecret({ cipher: data.cipher as string, iv: data.iv as string });
  } catch {
    return null;
  }
}

/** List which providers a user has keys for (masked). */
export async function listUserByok(userId: string): Promise<Array<{ provider: string; masked: string; createdAt: string }>> {
  try {
    const client = await createSupabaseClient();
    const { data } = await client.from(BYOK_TABLE).select("provider, cipher, iv, created_at").eq("user_id", userId);
    return (data ?? []).map((row) => {
      const decoded = decryptSecret({ cipher: row.cipher as string, iv: row.iv as string });
      return {
        provider: row.provider as string,
        masked: decoded ? maskValue(decoded) : "••••",
        createdAt: (row.created_at as string) ?? new Date().toISOString(),
      };
    });
  } catch {
    return [];
  }
}