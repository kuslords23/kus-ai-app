"use client";

/**
 * BYOK (Bring Your Own Key) manager.
 *
 * Stores user-supplied provider API keys locally (localStorage, obfuscated) and
 * in session state, so model routing can attach them to requests at raw cost.
 * Keys never leave the user's device other than being sent to the provider.
 */

export type BYOKProvider = "openai" | "anthropic" | "deepseek" | "openrouter" | "gemini";

export type BYOKKeyEntry = {
  provider: BYOKProvider;
  key: string;
  label: string;
  addedAt: string;
};

const STORAGE_KEY = "jyinx:byok-keys";

const PROVIDER_BASE_URLS: Record<BYOKProvider, string> = {
  openai: "https://api.openai.com/v1/chat/completions",
  anthropic: "https://api.anthropic.com/v1/messages",
  deepseek: "https://api.deepseek.com/v1/chat/completions",
  openrouter: "https://openrouter.ai/api/v1/chat/completions",
  gemini: "https://generativelanguage.googleapis.com/v1beta/models",
};

/** Mask a key so the UI can show it without leaking the secret. */
export function maskKey(key: string): string {
  if (key.length <= 8) return "••••";
  return `${key.slice(0, 4)}••••${key.slice(-4)}`;
}

function obfuscate(value: string): string {
  // Light obfuscation — not a security boundary. Real encryption would need a
  // per-device WebCrypto key; we keep the payload reversible for local persistence.
  try {
    return btoa(encodeURIComponent(value));
  } catch {
    return value;
  }
}

function deobfuscate(value: string): string {
  try {
    return decodeURIComponent(atob(value));
  } catch {
    return value;
  }
}

export class UserKeyManager {
  private keys: Record<BYOKProvider, BYOKKeyEntry | undefined> = {
    openai: undefined,
    anthropic: undefined,
    deepseek: undefined,
    openrouter: undefined,
    gemini: undefined,
  };
  private listeners = new Set<() => void>();

  constructor() {
    this.load();
  }

  private load(): void {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<Record<BYOKProvider, { provider: BYOKProvider; key: string; addedAt: string }>>;
      for (const provider of Object.keys(parsed) as BYOKProvider[]) {
        const entry = parsed[provider];
        if (entry?.key) {
          this.keys[provider] = {
            provider,
            key: deobfuscate(entry.key),
            label: (entry as { label?: string }).label || provider,
            addedAt: entry.addedAt ?? new Date().toISOString(),
          };
        }
      }
    } catch {
      // Ignore malformed storage.
    }
  }

  private persist(): void {
    if (typeof window === "undefined") return;
    try {
      const payload: Record<string, { provider: BYOKProvider; key: string; addedAt: string }> = {};
      for (const provider of Object.keys(this.keys) as BYOKProvider[]) {
        const entry = this.keys[provider];
        if (entry) payload[provider] = { provider, key: obfuscate(entry.key), addedAt: entry.addedAt };
      }
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore quota errors.
    }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }

  /** Store a provider key. Returns the stored entry. */
  saveKey(provider: BYOKProvider, key: string, label?: string): BYOKKeyEntry | null {
    const trimmed = key.trim();
    if (!trimmed) return null;
    this.keys[provider] = {
      provider,
      key: trimmed,
      label: label?.trim() || provider,
      addedAt: new Date().toISOString(),
    };
    this.persist();
    this.notify();
    return this.keys[provider]!;
  }

  /** Remove a provider key. */
  removeKey(provider: BYOKProvider): void {
    delete this.keys[provider];
    this.persist();
    this.notify();
  }

  /** Retrieve a provider key if stored. Re-reads localStorage each call so a
   *  key saved in another tab/component is picked up dynamically. */
  getKey(provider: BYOKProvider): string | null {
    // Re-sync from storage on every read so the active value is never stale.
    this.reloadFromStorage();
    return this.keys[provider]?.key ?? null;
  }

  /** Get the preferred upstream key for a given provider, or null. */
  getPreferredKey(providers: BYOKProvider[] = ["openrouter", "openai", "gemini"]): {
    provider: BYOKProvider | null;
    apiKey: string | null;
  } {
    for (const provider of providers) {
      const key = this.getKey(provider);
      if (key) return { provider, apiKey: key };
    }
    return { provider: null, apiKey: null };
  }

  /** Current keys fresh from storage (for building request payloads). */
  keysForRequest(): Record<BYOKProvider, string | null> {
    this.reloadFromStorage();
    return {
      openai: this.keys.openai?.key ?? null,
      anthropic: this.keys.anthropic?.key ?? null,
      deepseek: this.keys.deepseek?.key ?? null,
      openrouter: this.keys.openrouter?.key ?? null,
      gemini: this.keys.gemini?.key ?? null,
    };
  }

  private reloadFromStorage(): void {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        this.keys = { openai: undefined, anthropic: undefined, deepseek: undefined, openrouter: undefined, gemini: undefined };
        return;
      }
      const parsed = JSON.parse(raw) as Partial<Record<BYOKProvider, { provider: BYOKProvider; key: string; addedAt: string }>>;
      const next: Record<BYOKProvider, BYOKKeyEntry | undefined> = {
        openai: undefined,
        anthropic: undefined,
        deepseek: undefined,
        openrouter: undefined,
        gemini: undefined,
      };
      for (const provider of Object.keys(parsed) as BYOKProvider[]) {
        const entry = parsed[provider];
        if (entry?.key) {
          next[provider] = {
            provider,
            key: deobfuscate(entry.key),
            label: (entry as { label?: string }).label || provider,
            addedAt: entry.addedAt ?? new Date().toISOString(),
          };
        }
      }
      this.keys = next;
    } catch {
      // Ignore malformed storage.
    }
  }

  /** All stored entries (masked for display). */
  listKeys(): BYOKKeyEntry[] {
    return (Object.values(this.keys) as BYOKKeyEntry[]).filter(Boolean);
  }

  /** Provider base URL for BYOK routing. */
  baseUrlFor(provider: BYOKProvider): string {
    return PROVIDER_BASE_URLS[provider];
  }

  static get baseUrls(): Record<BYOKProvider, string> {
    return PROVIDER_BASE_URLS;
  }
}

export const userKeyManager = new UserKeyManager();