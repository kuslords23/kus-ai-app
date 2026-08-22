/**
 * Live Scout Agent
 *
 * Intercepts external context needs (API docs, GitHub code, web pages)
 * and performs live scouting so agents are not limited to parametric memory.
 */

export type ScoutSource = "web" | "github" | "docs" | "repo-local";

export type ScoutRequest = {
  query: string;
  sources?: ScoutSource[];
  repository?: string;
  /** Optional GitHub provider token for private repo scouting */
  providerToken?: string;
  maxResults?: number;
};

export type ScoutHit = {
  source: ScoutSource;
  title: string;
  url?: string;
  snippet: string;
  score: number;
};

export type ScoutReport = {
  id: string;
  query: string;
  hits: ScoutHit[];
  summary: string;
  fetchedAt: Date;
};

function scoreSnippet(query: string, text: string): number {
  const q = query.toLowerCase().split(/\s+/).filter(Boolean);
  const t = text.toLowerCase();
  if (!q.length) return 0;
  const hits = q.filter((term) => t.includes(term)).length;
  return hits / q.length;
}

async function scoutGithub(req: ScoutRequest): Promise<ScoutHit[]> {
  if (!req.repository || !req.providerToken) return [];
  const [owner, repo] = req.repository.split("/");
  if (!owner || !repo) return [];

  try {
    const url = `https://api.github.com/search/code?q=${encodeURIComponent(`${req.query} repo:${owner}/${repo}`)}`;
    const res = await fetch(url, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${req.providerToken}`,
        "User-Agent": "kus-ai-jyinx-scout",
      },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      items?: Array<{ name: string; path: string; html_url: string; repository?: { full_name: string } }>;
    };
    return (data.items ?? []).slice(0, req.maxResults ?? 5).map((item) => ({
      source: "github" as const,
      title: `${item.path}`,
      url: item.html_url,
      snippet: `GitHub match in ${item.repository?.full_name ?? req.repository}: ${item.name}`,
      score: 0.8,
    }));
  } catch {
    return [];
  }
}

async function scoutWeb(req: ScoutRequest): Promise<ScoutHit[]> {
  // Lightweight docs-oriented scout via DuckDuckGo Instant Answer (no API key).
  try {
    const res = await fetch(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(req.query)}&format=json&no_html=1&skip_disambig=1`,
      { headers: { Accept: "application/json" } }
    );
    if (!res.ok) return [];
    const data = (await res.json()) as {
      AbstractText?: string;
      AbstractURL?: string;
      Heading?: string;
      RelatedTopics?: Array<{ Text?: string; FirstURL?: string }>;
    };
    const hits: ScoutHit[] = [];
    if (data.AbstractText) {
      hits.push({
        source: "web",
        title: data.Heading || req.query,
        url: data.AbstractURL,
        snippet: data.AbstractText.slice(0, 500),
        score: scoreSnippet(req.query, data.AbstractText),
      });
    }
    for (const topic of data.RelatedTopics ?? []) {
      if (!topic.Text) continue;
      hits.push({
        source: "docs",
        title: topic.Text.slice(0, 80),
        url: topic.FirstURL,
        snippet: topic.Text.slice(0, 400),
        score: scoreSnippet(req.query, topic.Text),
      });
      if (hits.length >= (req.maxResults ?? 5)) break;
    }
    return hits;
  } catch {
    return [];
  }
}

function scoutLocalHints(req: ScoutRequest): ScoutHit[] {
  // Placeholder local index — callers can merge repo file tree snippets.
  return [
    {
      source: "repo-local",
      title: "Local workspace context",
      snippet: `Scout prepared for query "${req.query}"${req.repository ? ` in ${req.repository}` : ""}. Inject file-tree / open-buffer context from the IDE.`,
      score: 0.4,
    },
  ];
}

export class ScoutAgent {
  async scout(req: ScoutRequest): Promise<ScoutReport> {
    const sources = req.sources ?? ["web", "github", "repo-local"];
    const jobs: Promise<ScoutHit[]>[] = [];

    if (sources.includes("web") || sources.includes("docs")) jobs.push(scoutWeb(req));
    if (sources.includes("github")) jobs.push(scoutGithub(req));
    if (sources.includes("repo-local")) jobs.push(Promise.resolve(scoutLocalHints(req)));

    const batches = await Promise.all(jobs);
    const hits = batches
      .flat()
      .sort((a, b) => b.score - a.score)
      .slice(0, req.maxResults ?? 8);

    const summary =
      hits.length === 0
        ? `No live scout hits for "${req.query}". Falling back to parametric knowledge.`
        : `Scout found ${hits.length} live references for "${req.query}". Top: ${hits[0]?.title ?? "n/a"}.`;

    return {
      id: `scout_${Date.now().toString(36)}`,
      query: req.query,
      hits,
      summary,
      fetchedAt: new Date(),
    };
  }

  /** Format scout hits for injection into Coder / Auditor prompts. */
  formatForPrompt(report: ScoutReport): string {
    const lines = [`## Live Scout Report`, report.summary, ""];
    for (const hit of report.hits) {
      lines.push(`- [${hit.source}] ${hit.title}${hit.url ? ` (${hit.url})` : ""}`);
      lines.push(`  ${hit.snippet}`);
    }
    return lines.join("\n");
  }
}

export const scoutAgent = new ScoutAgent();
