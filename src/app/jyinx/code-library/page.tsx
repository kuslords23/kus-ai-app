import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export const metadata: Metadata = {
  title: "Code Library | Jyinx",
  description: "Your curated code vault — search, clone, and reuse battle-tested snippets.",
};

export default function CodeLibraryPage() {
  return (
    <div className="flex h-screen bg-background">
      <div className="flex flex-1 flex-col">
        <header className="shrink-0 border-b border-border bg-background/90 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold text-gold">Code Library</h1>
              <p className="text-xs text-muted">Your curated code vault — search, clone, and reuse battle-tested snippets.</p>
            </div>
            <Link href="/jyinx/search" className="rounded-xl border border-gold/30 bg-gold/10 px-4 py-2 text-sm text-gold hover:bg-gold/15">
              🔎 Search online
            </Link>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-4xl space-y-6">
            <section className="rounded-2xl border border-border bg-surface/60 p-6">
              <h2 className="text-sm font-semibold text-gold">What is the Code Library?</h2>
              <p className="mt-2 text-xs text-muted leading-relaxed">
                The Code Library is your personal, auto-categorized collection of battle-tested public
                repositories and code snippets. Jyinx automatically clones public GitHub repos,
                indexes them locally via AST/regex parsing (no expensive LLM token calls), and
                categorizes them into departments: <strong>Frontend</strong>, <strong>Backend</strong>,
                <strong>Database</strong>, <strong>AI/Agents</strong>, and <strong>Infrastructure</strong>.
              </p>
              <p className="mt-2 text-xs text-muted leading-relaxed">
                The AI acts as the intelligent &ldquo;glue&rdquo; that matches interfaces, handles
                dependency injection, and connects these ready-to-use modules to your project.
              </p>
            </section>

            <section className="rounded-2xl border border-border bg-surface/60 p-6">
              <h2 className="text-sm font-semibold text-gold">How to use it</h2>
              <ol className="mt-3 space-y-2 text-xs text-muted list-decimal pl-5">
                <li><strong>Search online</strong> — Use the 🔎 Search button to find public codebases, docs, and snippets.</li>
                <li><strong>Clone &amp; Glue</strong> — When you find a snippet you like, click &ldquo;Clone &amp; Glue to Vault&rdquo; to auto-ingest it into your library.</li>
                <li><strong>Peer chat</strong> — Discuss snippets with other developers in the Sports Clan Nexus chat bridge.</li>
                <li><strong>Open in Jyinx</strong> — Pass any snippet into the Jyinx agent chat for instant integration.</li>
              </ol>
            </section>

            <section className="rounded-2xl border border-gold/25 bg-gold/5 p-6">
              <h2 className="text-sm font-semibold text-gold">Quick actions</h2>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Link href="/jyinx/search" className="rounded-xl border border-gold/30 bg-background/40 px-4 py-3 text-sm text-gold hover:bg-gold/10">
                  🔎 Search public code
                </Link>
                <Link href="/jyinx/peer-chat" className="rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-sm text-blue-400 hover:bg-blue-500/20">
                  👥 Peer chat
                </Link>
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-surface/60 p-6">
              <h2 className="text-sm font-semibold text-gold">Departments</h2>
              <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                {[
                  { icon: "🎨", name: "Frontend", sub: "React, Vue, HTML/CSS" },
                  { icon: "⚙️", name: "Backend", sub: "Node, Python, Go" },
                  { icon: "💾", name: "Database", sub: "SQL, Migrations" },
                  { icon: "🤖", name: "AI / Agents", sub: "LLM, Pipelines" },
                  { icon: "🚀", name: "Infrastructure", sub: "DevOps, Docker" },
                ].map((d) => (
                  <div key={d.name} className="rounded-lg border border-border bg-background/40 p-3">
                    <p className="font-medium">{d.icon} {d.name}</p>
                    <p className="text-[10px] text-muted">{d.sub}</p>
                  </div>
                ))}
              </div>
            </section>

            <p className="text-center text-xs text-muted pt-4">
              Your code vault is empty. Search online or clone a public repo to get started.
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}