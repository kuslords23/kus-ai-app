import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return NextResponse.json({ success: false, error: "Auth required" }, { status: 401 });

    const body = (await request.json()) as { repoUrl?: string };
    if (!body.repoUrl) return NextResponse.json({ success: false, error: "Missing repoUrl" }, { status: 400 });

    const match = body.repoUrl.match(/^https?:\/\/github\.com\/([a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+?)(?:\.git)?$/);
    if (!match) return NextResponse.json({ success: false, error: "Only GitHub HTTPS URLs supported" }, { status: 400 });

    const repoPath = match[1];
    const token = session.provider_token;
    if (!token) return NextResponse.json({ success: false, error: "GitHub auth token required" }, { status: 401 });

    const repoRes = await fetch("https://api.github.com/repos/" + repoPath, {
      headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github.v3+json" },
    });
    if (!repoRes.ok) {
      return NextResponse.json({ success: false, error: "Repo not found or not accessible" }, { status: repoRes.status });
    }
    const repoData = await repoRes.json();

    const treeRes = await fetch(
      "https://api.github.com/repos/" + repoPath + "/git/trees/" + (repoData.default_branch ?? "main") + "?recursive=1",
      { headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github.v3+json" } }
    );
    if (!treeRes.ok) return NextResponse.json({ success: false, error: "Failed to fetch repo tree" }, { status: 502 });

    const treeData = await treeRes.json();
    const codeExts = new Set(["ts","tsx","js","jsx","py","rs","go","css","html","json","md","sql","yaml","yml","prisma"]);
    const entries = (treeData.tree ?? [])
      .filter((e: any) => e.type === "blob" && codeExts.has(e.path.split(".").pop() ?? ""))
      .slice(0, 200);

    // Fetch README
    let readme = "";
    try {
      const rRes = await fetch("https://api.github.com/repos/" + repoPath + "/readme", {
        headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github.v3.raw" },
      });
      if (rRes.ok) readme = await rRes.text();
    } catch { /* readme not found */ }

    // Fetch file contents in batches of 50
    const files: Array<{ path: string; language: string; size: number; content?: string }> = [];
    for (let i = 0; i < entries.length; i += 50) {
      const batch = entries.slice(i, i + 50);
      const results = await Promise.allSettled(
        batch.map(async (entry: any) => {
          try {
            const cRes = await fetch(
              "https://api.github.com/repos/" + repoPath + "/contents/" + encodeURIComponent(entry.path),
              { headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github.v3.raw" } }
            );
            if (!cRes.ok) return null;
            const content = await cRes.text();
            return {
              path: entry.path,
              language: entry.path.split(".").pop() ?? "text",
              size: entry.size ?? content.length,
              content,
            };
          } catch { return null; }
        })
      );
      for (const r of results) {
        if (r.status === "fulfilled" && r.value) files.push(r.value);
      }
    }

    // Tech stack detection
    const techStack = new Set<string>();
    for (const f of files) {
      const p = f.path.toLowerCase();
      if (p.includes("package.json")) techStack.add("node");
      if (p.endsWith(".ts") || p.endsWith(".tsx")) techStack.add("typescript");
      if (p.endsWith(".py")) techStack.add("python");
      if (p.includes("next.config")) techStack.add("nextjs");
      if (p.includes("prisma")) techStack.add("prisma");
      if (p.includes("Dockerfile")) techStack.add("docker");
    }

    return NextResponse.json({
      success: true,
      files,
      techStack: [...techStack],
      readme,
      repoName: repoData.full_name ?? repoPath,
      description: repoData.description ?? "",
      defaultBranch: repoData.default_branch ?? "main",
      stars: repoData.stargazers_count ?? 0,
    });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}