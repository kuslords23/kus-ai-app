const HUB_URL =
  process.env.NEXT_PUBLIC_HUB_URL || "https://sport-clan-nexus.vercel.app";

export function companionSiteUrl(): string {
  const site =
    process.env.NEXT_PUBLIC_SITE_URL || "https://kus-ai-app.vercel.app";
  return site.replace(/\/$/, "");
}

/** Hub URL with companion return params so hub can show “Back to Royal”. */
export function hubUrl(
  path = "",
  extraParams?: Record<string, string>
): string {
  const base = path.startsWith("http")
    ? path
    : `${HUB_URL.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
  const url = new URL(base);
  url.searchParams.set("companion", "kus-ai");
  url.searchParams.set("returnTo", companionSiteUrl());
  if (extraParams) {
    for (const [key, value] of Object.entries(extraParams)) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

export function hubLoginUrl(): string {
  const returnUrl = `${companionSiteUrl()}/auth/callback?next=/`;
  return hubUrl("/login", { redirect: returnUrl });
}

export function appendHubReturnParams(targetUrl: string): string {
  try {
    const url = new URL(targetUrl);
    url.searchParams.set("companion", "kus-ai");
    url.searchParams.set("returnTo", companionSiteUrl());
    return url.toString();
  } catch {
    return targetUrl;
  }
}

export function openHub(path = "", newTab = true): void {
  const url = hubUrl(path);
  if (typeof window !== "undefined") {
    sessionStorage.setItem("kus_hub_opened", "1");
  }
  if (newTab) {
    window.open(url, "_blank", "noopener,noreferrer");
  } else {
    window.location.href = url;
  }
}

export function openCompanionUrl(url: string): void {
  const withReturn = appendHubReturnParams(url);
  sessionStorage.setItem("kus_hub_opened", "1");
  window.open(withReturn, "_blank", "noopener,noreferrer");
}

export function hubReturnBadgeScriptUrl(): string {
  return `${companionSiteUrl()}/hub-return-badge.js`;
}
