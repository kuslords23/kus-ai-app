import type { RagAction } from "@/lib/rag/client";
import { companionDeepLink } from "@/lib/companions/registry";

export type ActionRisk = "low" | "medium" | "high";

export type PendingAction = {
  id: string;
  title: string;
  summary: string;
  risk: ActionRisk;
  action: RagAction;
  regretWarning?: string;
};

const HIGH_RISK_TABS = new Set(["wallet", "betting", "dream"]);
const MEDIUM_RISK_TABS = new Set(["marketplace", "messages", "post", "create"]);

export function classifyAction(action?: RagAction): ActionRisk {
  if (!action) return "low";
  const tab = String(action.tab || "").toLowerCase();
  if (HIGH_RISK_TABS.has(tab) || tab.includes("wallet") || tab.includes("bet"))
    return "high";
  if (MEDIUM_RISK_TABS.has(tab)) return "medium";
  return "low";
}

export function describeAction(action: RagAction): string {
  if (action.url) return `Open ${action.url}`;
  const parts = [action.tab, action.sportsSubTab, action.marketSubTab]
    .filter(Boolean)
    .join(" → ");
  return parts ? `Open ${parts} in companion app` : "Open companion feature";
}

export function buildPendingAction(
  action: RagAction,
  regretWarning?: string
): PendingAction {
  return {
    id: `act_${Date.now()}`,
    title: regretWarning ? "Regret warning" : "Confirm action",
    summary: regretWarning
      ? `${regretWarning}\n\n${describeAction(action)}`
      : describeAction(action),
    risk: classifyAction(action),
    action,
    regretWarning,
  };
}

export function executeAction(action: RagAction): boolean {
  if (action.url) {
    window.open(String(action.url), "_blank");
    return true;
  }

  const tab = action.tab;
  if (tab === "leagues" || tab === "sports" || action.sportsSubTab) {
    const sub = action.sportsSubTab ? `?tab=${action.sportsSubTab}` : "";
    const url = companionDeepLink("sports", sub);
    if (url) {
      window.open(url, "_blank");
      return true;
    }
  }

  if (tab === "marketplace" || tab === "wallet" || action.marketSubTab) {
    const sub = action.marketSubTab
      ? `?tab=marketplace&sub=${action.marketSubTab}`
      : "?tab=marketplace";
    const url = companionDeepLink("hub", sub);
    if (url) {
      window.open(url, "_blank");
      return true;
    }
  }

  if (tab === "messages") {
    const url = companionDeepLink("chat");
    if (url) {
      window.open(url, "_blank");
      return true;
    }
  }

  const hub = companionDeepLink("hub");
  if (hub) {
    window.open(hub, "_blank");
    return true;
  }
  return false;
}

export function logAction(userId: string | undefined, summary: string) {
  if (!userId) return;
  try {
    const key = `kus_ai_action_log:${userId}`;
    const raw = localStorage.getItem(key);
    const list = raw ? JSON.parse(raw) : [];
    list.push({ summary, at: new Date().toISOString() });
    localStorage.setItem(key, JSON.stringify(list.slice(-50)));
  } catch {
    // ignore
  }
}
