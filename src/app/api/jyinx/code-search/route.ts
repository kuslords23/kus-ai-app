import { NextResponse } from "next/server";

/**
 * Online Code Search API
 *
 * Searches public code repositories, documentation, and snippets from the web.
 * Uses multiple free-tier sources: GitHub public repos, Stack Overflow, npm,
 * and devdocs-style documentation. Returns structured results with metadata
 * for the OnlineCodeSearch component.
 */

const GITHUB_API = "https://api.github.com";
const STACKOVERFLOW_API = "https://api.stackexchange.com/2.3";
const NPM_REGISTRY = "https://registry.npmjs.org/-/v1/search";

interface CodeSearchSource {
  id: string;
  title: string;
  description?: string;
  language: string;
  snippet: string;
  stars?: number;
  author?: string;
  source: "github" | "stackoverflow" | "docs" | "npm" | "paste";
  url?: string;
  repo?: string;
}

async function searchGitHub(query: string, limit = 6): Promise<CodeSearchSource[]> {
  try {
    const res = await fetch(
      `${GITHUB_API}/search/code?q=${encodeURIComponent(query)}+in:file&per_page=${limit}&sort=indexed`,
      {
        headers: {
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "KusAI-Jyinx/1.0",
          ...(process.env.GITHUB_TOKEN
            ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
            : {}),
        },
        cache: "no-store",
      }
    );
    if (!res.ok) return [];
    const data = (await res.json()) as {
      items?: Array<{
        name: string;
        path: string;
        html_url: string;
        repository: { full_name: string; stargazers_count: number; owner: { login: string } };
        score: number;
      }>;
    };
    // Fetch snippets for top results
    const results: CodeSearchSource[] = [];
    const snippetPromises = (data.items ?? []).slice(0, limit).map(async (item) => {
      try {
        const rawRes = await fetch(
          `https://raw.githubusercontent.com/${item.repository.full_name}/main/${item.path}`,
          { cache: "no-store" }
        );
        const snippet = rawRes.ok ? (await rawRes.text()).slice(0, 1500) : "// Content unavailable";
        const ext = item.name.split(".").pop() ?? "";
        const langMap: Record<string, string> = {
          ts: "typescript", tsx: "tsx", js: "javascript", jsx: "jsx",
          py: "python", rs: "rust", go: "go", rs: "rust",
          css: "css", html: "html", json: "json", yaml: "yaml",
          sql: "sql", md: "markdown", sh: "shell", dockerfile: "dockerfile",
        };
        const language = langMap[ext] ?? ext;
        return {
          id: `gh-${item.repository.full_name.replace("/", "-")}-${item.path.replace(/[/.]/g, "-")}`,
          title: item.path.split("/").pop() ?? item.name,
          description: `From ${item.repository.full_name} — ${item.path}`,
          language,
          snippet,
          stars: item.repository.stargazers_count,
          author: item.repository.owner.login,
          source: "github" as const,
          url: item.html_url,
          repo: `https://github.com/${item.repository.full_name}`,
        };
      } catch {
        return null;
      }
    });
    const snippets = await Promise.all(snippetPromises);
    return snippets.filter((s): s is CodeSearchSource => s !== null);
  } catch {
    return [];
  }
}

async function searchStackOverflow(query: string, limit = 4): Promise<CodeSearchSource[]> {
  try {
    const res = await fetch(
      `${STACKOVERFLOW_API}/search/advanced?order=desc&sort=relevance&q=${encodeURIComponent(query)}&site=stackoverflow&pagesize=${limit}&filter=withbody`,
      { cache: "no-store" }
    );
    if (!res.ok) return [];
    const data = (await res.json()) as {
      items?: Array<{
        question_id: number;
        title: string;
        tags: string[];
        owner?: { display_name?: string };
        link: string;
        body?: string;
        score: number;
      }>;
    };
    return (data.items ?? []).map((item) => {
      const body = item.body ?? "";
      // Extract first code block
      const codeMatch = body.match(/<pre><code>([\s\S]*?)<\/code><\/pre>/);
      const snippet = codeMatch
        ? codeMatch[1].replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
        : body.replace(/<[^>]+>/g, "").slice(0, 800);
      const snippetLang = (item.tags ?? []).find((t) =>
        ["javascript", "typescript", "python", "react", "node", "html", "css", "sql", "go", "rust"].includes(t)
      ) ?? "text";
      return {
        id: `so-${item.question_id}`,
        title: item.title,
        description: `Score: ${item.score} — ${item.owner?.display_name ?? "anonymous"}`,
        language: snippetLang,
        snippet: snippet.slice(0, 1500),
        author: item.owner?.display_name,
        source: "stackoverflow",
        url: item.link,
      };
    });
  } catch {
    return [];
  }
}

async function searchNpm(query: string, limit = 4): Promise<CodeSearchSource[]> {
  try {
    const res = await fetch(
      `${NPM_REGISTRY}?text=${encodeURIComponent(query)}&size=${limit}`,
      { cache: "no-store" }
    );
    if (!res.ok) return [];
    const data = (await res.json()) as {
      objects?: Array<{
        package: {
          name: string;
          description?: string;
          version: string;
          links: { npm?: string; repository?: string };
          publisher?: { username: string };
        };
        score: { final: number };
      }>;
    };
    return (data.objects ?? []).map((pkg) => ({
      id: `npm-${pkg.package.name}`,
      title: pkg.package.name,
      description: pkg.package.description ?? `${pkg.package.version} — ${pkg.package.publisher?.username ?? "unknown"}`,
      language: "javascript",
      snippet: `// Package: ${pkg.package.name} v${pkg.package.version}\n// ${pkg.package.description ?? "No description"}\n// Install: npm install ${pkg.package.name}`,
      stars: Math.round(pkg.score.final * 1000),
      author: pkg.package.publisher?.username,
      source: "npm",
      url: pkg.package.links.npm ?? pkg.package.links.repository,
    }));
  } catch {
    return [];
  }
}

async function searchDocs(query: string, limit = 3): Promise<CodeSearchSource[]> {
  // In-memory documentation snippets for common tech
  const docs: Record<string, Array<{ title: string; snippet: string; url: string }>> = {
    "react hooks": [
      { title: "useState", snippet: "const [state, setState] = useState(initialState);", url: "https://react.dev/reference/react/useState" },
      { title: "useEffect", snippet: "useEffect(() => { /* effect */ return () => { /* cleanup */ }; }, [deps]);", url: "https://react.dev/reference/react/useEffect" },
      { title: "useRef", snippet: "const ref = useRef(initialValue);", url: "https://react.dev/reference/react/useRef" },
    ],
    "supabase": [
      { title: "Supabase Client", snippet: "import { createClient } from '@supabase/supabase-js';\nconst supabase = createClient(url, key);", url: "https://supabase.com/docs/reference/javascript/initializing" },
      { title: "Query", snippet: "const { data, error } = await supabase.from('table').select('*');", url: "https://supabase.com/docs/reference/javascript/select" },
    ],
    "next.js": [
      { title: "App Router", snippet: "// app/page.tsx\nexport default function Page() { return <div>Hello</div>; }", url: "https://nextjs.org/docs/app" },
      { title: "Route Handlers", snippet: "// app/api/route.ts\nexport async function GET() { return Response.json({ ok: true }); }", url: "https://nextjs.org/docs/app/building-your-application/routing/route-handlers" },
    ],
    "tailwind": [
      { title: "Flex Center", snippet: '<div className="flex items-center justify-center">Centered</div>', url: "https://tailwindcss.com/docs/flex" },
      { title: "Grid", snippet: '<div className="grid grid-cols-3 gap-4">...</div>', url: "https://tailwindcss.com/docs/grid-template-columns" },
    ],
  };

  const queryLower = query.toLowerCase();
  const results: CodeSearchSource[] = [];

  for (const [key, entries] of Object.entries(docs)) {
    if (key.includes(queryLower) || queryLower.includes(key) || key.split(" ").some((w) => queryLower.includes(w))) {
      for (const entry of entries) {
        results.push({
          id: `docs-${entry.title.toLowerCase().replace(/\s+/g, "-")}`,
          title: entry.title,
          description: `Documentation snippet — ${key}`,
          language: "typescript",
          snippet: entry.snippet,
          source: "docs",
          url: entry.url,
        });
        if (results.length >= limit) return results;
      }
    }
  }

  return results;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim();

  if (!query) {
    return NextResponse.json({ results: [] });
  }

  if (query.length > 200) {
    return NextResponse.json({ error: "Query too long" }, { status: 400 });
  }

  try {
    // Run all searches in parallel
    const [github, stackoverflow, npm, docs] = await Promise.all([
      searchGitHub(query),
      searchStackOverflow(query),
      searchNpm(query),
      searchDocs(query),
    ]);

    // Merge and sort results by relevance (stars/score), deduplicate
    const allResults = [...github, ...stackoverflow, ...npm, ...docs];
    const seen = new Set<string>();
    const deduped = allResults.filter((r) => {
      const key = r.title.toLowerCase().trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Sort: GitHub results first (most relevant), then Stack Overflow, then docs, then npm
    const sourceOrder: Record<string, number> = { github: 0, stackoverflow: 1, docs: 2, npm: 3 };
    deduped.sort((a, b) => {
      const orderA = sourceOrder[a.source] ?? 99;
      const orderB = sourceOrder[b.source] ?? 99;
      if (orderA !== orderB) return orderA - orderB;
      return (b.stars ?? 0) - (a.stars ?? 0);
    });

    return NextResponse.json({ results: deduped.slice(0, 20) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Search failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}