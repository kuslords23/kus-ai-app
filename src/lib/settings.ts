export type AppSettings = {
  voiceModeDefault: boolean;
  voiceReplies: boolean;
  mode: "royal" | "fast";
};

const KEY = "kus_ai_settings";

const DEFAULTS: AppSettings = {
  voiceModeDefault: false,
  voiceReplies: false,
  mode: "royal",
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
