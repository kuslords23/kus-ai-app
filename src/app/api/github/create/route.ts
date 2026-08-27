import { NextRequest, NextResponse } from "next/server";
import { commitFiles } from "@/services/githubCommit";

export const runtime = "nodejs";

const GITHUB_API = "https://api.github.com";

type ProjectTemplate = {
  id: string;
  language: string;
  files: Array<{ path: string; content: string }>;
  description: string;
};

const LANGUAGE_LABELS: Record<string, string> = {
  typescript: "TypeScript",
  javascript: "JavaScript",
  python: "Python",
  rust: "Rust",
  go: "Go",
};

// Minimal scaffolding per language so the repo initializes with a working tree.
const TEMPLATES: Record<string, ProjectTemplate> = {
  typescript: {
    id: "typescript",
    language: "typescript",
    description: "FindMyMom TypeScript starter",
    files: [
      { path: "package.json", content: JSON.stringify({ name: "starter", version: "0.1.0", private: true, scripts: { build: "tsc", start: "node dist/index.js", dev: "tsc -w", test: "echo \"no tests\"" }, devDependencies: { typescript: "^5" } }, null, 2) + "\n" },
      { path: "tsconfig.json", content: JSON.stringify({ compilerOptions: { target: "ES2020", module: "commonjs", strict: true, esModuleInterop: true, outDir: "dist", rootDir: "src" } }, null, 2) + "\n" },
      { path: "src/index.ts", content: "export function hello(name: string): string {\n  return `Hello, ${name}!`;\n}\n\nconsole.log(hello(\"Jyinx\"));\n" },
      { path: "README.md", content: "# TypeScript starter\n\nScaffolded by Jyinx.\n" },
    ],
  },
  javascript: {
    id: "javascript",
    language: "javascript",
    description: "JavaScript starter",
    files: [
      { path: "package.json", content: JSON.stringify({ name: "starter", version: "0.1.0", private: true, main: "src/index.js", scripts: { start: "node src/index.js", test: "echo \\\"no tests\\\"" } }, null, 2) + "\n" },
      { path: "src/index.js", content: "function hello(name) {\n  return `Hello, ${name}!`;\n}\n\nconsole.log(hello('Jyinx'));\n" },
      { path: "README.md", content: "# JavaScript starter\n\nScaffolded by Jyinx.\n" },
    ],
  },
  python: {
    id: "python",
    language: "python",
    description: "Python starter",
    files: [
      { path: "pyproject.toml", content: "[tool.pytest.ini_options]\ntestpaths = [\"tests\"]\n\n[project]\nname = \"starter\"\nversion = \"0.1.0\"\nrequires-python = \">=3.11\"\n" },
      { path: "src/main.py", content: "def hello(name: str) -> str:\n    return f\"Hello, {name}!\"\n\n\nif __name__ == \"__main__\":\n    print(hello(\"Jyinx\"))\n" },
      { path: "tests/test_main.py", content: "def test_hello():\n    from src.main import hello\n    assert hello(\"Jyinx\") == \"Hello, Jyinx!\"\n" },
      { path: "README.md", content: "# Python starter\n\nScaffolded by Jyinx.\n" },
    ],
  },
  rust: {
    id: "rust",
    language: "rust",
    description: "Rust starter",
    files: [
      { path: "Cargo.toml", content: "[package]\nname = \"starter\"\nversion = \"0.1.0\"\nedition = \"2021\"\n\n[dependencies]\n" },
      { path: "src/main.rs", content: "fn hello(name: &str) -> String {\n    format!(\"Hello, {}!\", name)\n}\n\nfn main() {\n    println!(\"{}\", hello(\"Jyinx\"));\n}\n\n#[cfg(test)]\nmod tests {\n    use super::*;\n\n    #[test]\n    fn greets() {\n        assert_eq!(hello(\"Jyinx\"), \"Hello, Jyinx!\");\n    }\n}\n" },
      { path: "README.md", content: "# Rust starter\n\nScaffolded by Jyinx.\n" },
    ],
  },
  go: {
    id: "go",
    language: "go",
    description: "Go starter",
    files: [
      { path: "go.mod", content: "module starter\n\ngo 1.22\n" },
      { path: "main.go", content: "package main\n\nimport \"fmt\"\n\nfunc hello(name string) string {\n\treturn fmt.Sprintf(\"Hello, %s!\", name)\n}\n\nfunc main() {\n\tfmt.Println(hello(\"Jyinx\"))\n}\n" },
      { path: "README.md", content: "# Go starter\n\nScaffolded by Jyinx.\n" },
    ],
  },
};

type CreateBody = { name?: unknown; language?: unknown; description?: unknown; private?: unknown };

const NAME_RE = /^[a-zA-Z0-9_.-]+$/;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Connect GitHub to create a project." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as CreateBody | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const language = typeof body?.language === "string" && body.language in TEMPLATES ? body.language : "typescript";
  const description = typeof body?.description === "string" ? body.description : (TEMPLATES[language]?.description ?? "Created with Jyinx");
  const isPrivate = body?.private === true;

  if (!name) return NextResponse.json({ error: "A project name is required." }, { status: 400 });
  if (name.length > 100) return NextResponse.json({ error: "Project name is too long (max 100)." }, { status: 400 });
  if (!NAME_RE.test(name)) return NextResponse.json({ error: "Project name may only contain letters, numbers, dashes, underscores, and dots." }, { status: 400 });

  const token = authorization.slice("Bearer ".length).trim();
  const template = TEMPLATES[language];

  try {
    // 1. Create the repository on GitHub.
    const createRes = await fetch(`${GITHUB_API}/user/repos`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        description,
        private: isPrivate,
        auto_init: true,
      }),
      cache: "no-store",
    });

    const created = (await createRes.json().catch(() => null)) as
      | { full_name?: string; default_branch?: string; html_url?: string; clone_url?: string; message?: string }
      | null;

    if (!createRes.ok) {
      const message = created?.message;
      return NextResponse.json(
        { error: typeof message === "string" ? message : "GitHub could not create the repository." },
        { status: createRes.status }
      );
    }

    const fullName = created?.full_name ?? `user/${name}`;
    const branch = created?.default_branch ?? "main";

    // 2. Push the language template via the commit engine (needs a non-empty tree).
    let commitUrl: string | undefined;
    try {
      const commit = await commitFiles({
        repository: fullName,
        baseBranch: branch,
        message: `Scaffold ${LANGUAGE_LABELS[language] ?? language} template`,
        files: template.files,
        token,
      });
      commitUrl = commit.commitUrl;
    } catch {
      // Template push is best-effort; the repo itself was created.
    }

    return NextResponse.json({
      repository: {
        fullName,
        name,
        defaultBranch: branch,
        url: created?.html_url,
        language: LANGUAGE_LABELS[language] ?? language,
        commitUrl,
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Unable to reach GitHub." },
      { status: 502 }
    );
  }
}