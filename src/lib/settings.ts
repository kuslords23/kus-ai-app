export type ThemeMode = "dark" | "light" | "system";

export type AppSettings = {
  voiceModeDefault: boolean;
  voiceReplies: boolean;
  mode: "royal" | "fast";
  theme: ThemeMode;
  activeAgentId: string;
  silentMode: boolean;
  energyLevel: "auto" | "low" | "medium" | "high";
  dailyBriefings: boolean;
  memoryDecay: "balanced" | "keep-all" | "minimal";
  creativeConstraints: string;
  skillShadowing: boolean;
};

const KEY = "kus_ai_settings";

const DEFAULTS: AppSettings = {
  voiceModeDefault: false,
  voiceReplies: false,
  mode: "royal",
  theme: "dark",
  activeAgentId: "auto",
  silentMode: false,
  energyLevel: "auto",
  dailyBriefings: true,
  memoryDecay: "balanced",
  creativeConstraints: "",
  skillShadowing: true,
};

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(patch: Partial<AppSettings>) {
  const next = { ...loadSettings(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  return next;
}

export function resolveTheme(theme: ThemeMode): "dark" | "light" {
  if (theme === "system" && typeof window !== "undefined") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return theme === "light" ? "light" : "dark";
}

export function applyTheme(theme: ThemeMode) {
  if (typeof document === "undefined") return;
  const resolved = resolveTheme(theme);
  document.documentElement.setAttribute("data-theme", resolved);
  document.documentElement.style.colorScheme = resolved;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute(
      "content",
      resolved === "light" ? "#f8f6fc" : "#0b0814"
    );
  }
}
