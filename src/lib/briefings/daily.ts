import { askRag } from "@/lib/rag/client";
import type { RoyalMemory } from "@/lib/memory/royalMemory";
import { markBriefingShown } from "@/lib/memory/royalMemory";

const BRIEFING_PROMPT =
  "Give me a short daily briefing for today: sports scores or fixtures I care about, wallet or market reminders if relevant, and one actionable tip for Kus-lords. Keep it under 120 words, royal tone.";

export async function fetchDailyBriefing(
  userId: string,
  memory: RoyalMemory
): Promise<string> {
  try {
    const result = await askRag(BRIEFING_PROMPT, {
      userContext: {
        companionMemory: {
          recentTopics: memory.recentTopics,
          preferenceSummary: memory.preferenceSummary,
        },
        companion: { name: "Royal", id: "ai" },
      },
    });
    markBriefingShown(memory);
    return (
      result.answer?.trim() ||
      "Good morning — check Sports for live scores and your Wallet for balance. Ask me anything when you're ready."
    );
  } catch {
    return "Your daily briefing is ready — tap below to catch up on sports, wallet, and what's new.";
  }
}

/** Whether TTS should run under silent mode. */
export function shouldSpeakInSilentMode(text: string, actionTaken?: boolean): boolean {
  const t = text.toLowerCase();
  if (actionTaken) return true;
  if (t.includes("⚠") || t.includes("warning") || t.includes("careful")) return true;
  if (/\b(stuck|mistake|regret|cannot|can't|won't work|failed)\b/.test(t)) return true;
  return false;
}
