"use client";

import { useMemo, useState, type ReactNode } from "react";

export type EcosystemTab = "royal" | "jyinx" | "builder" | "marketplace";

type ToolBinding = {
  id: string;
  label: string;
  description: string;
};

const TAB_TOOLS: Record<EcosystemTab, ToolBinding[]> = {
  royal: [
    { id: "memory", label: "Memory", description: "Long-term companion memory" },
    { id: "web", label: "Web", description: "General web lookup" },
  ],
  jyinx: [
    { id: "scout", label: "Scout", description: "Live repo/web scouting" },
    { id: "coder", label: "Coder", description: "Code generation blocks" },
    { id: "stack", label: "Stacking Box", description: "Block validation + rewind" },
    { id: "redteam", label: "Auditor", description: "Defensive security audit" },
  ],
  builder: [
    { id: "layout", label: "Layout", description: "Section/layout agents" },
    { id: "style", label: "Style", description: "Theme and typography" },
    { id: "preview", label: "Preview", description: "Live canvas sync" },
  ],
  marketplace: [
    { id: "hire", label: "Hire", description: "Rent agents/models" },
    { id: "proxy", label: "P2P Proxy", description: "Share without exposing keys" },
  ],
};

type UnifiedEcosystemShellProps = {
  tab: EcosystemTab;
  onTabChange: (tab: EcosystemTab) => void;
  rail: ReactNode;
  chat: ReactNode;
  canvas: ReactNode;
};

/**
 * Shared layout shell: left context rail, central Kus command stream, right live canvas.
 */
export function UnifiedEcosystemShell({ tab, onTabChange, rail, chat, canvas }: UnifiedEcosystemShellProps) {
  const tools = useMemo(() => TAB_TOOLS[tab], [tab]);
  const [toolId, setToolId] = useState(tools[0]?.id ?? "");

  const activeTools = tools;
  const activeTool = activeTools.find((t) => t.id === toolId) ?? activeTools[0];

  return (
    <div className="flex h-[100dvh] min-h-0 w-full flex-col bg-[radial-gradient(1200px_600px_at_10%_-10%,rgba(212,175,55,0.12),transparent),linear-gradient(180deg,#0c0d10,#12141a)] text-foreground">
      <header className="flex items-center gap-2 border-b border-border/80 px-3 py-2">
        <p className="mr-2 text-sm font-semibold tracking-wide text-gold">KUS</p>
        {(
          [
            ["royal", "Royal"],
            ["jyinx", "Jyinx IDE"],
            ["builder", "Builder"],
            ["marketplace", "Market"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              onTabChange(id);
              setToolId(TAB_TOOLS[id][0]?.id ?? "");
            }}
            className={`rounded-md px-3 py-1.5 text-xs ${
              tab === id ? "bg-gold/20 text-gold" : "text-muted hover:bg-white/5"
            }`}
          >
            {label}
          </button>
        ))}
        <div className="ml-auto hidden items-center gap-1 md:flex">
          {activeTools.map((t) => (
            <button
              key={t.id}
              type="button"
              title={t.description}
              onClick={() => setToolId(t.id)}
              className={`rounded-md border px-2 py-1 text-[11px] ${
                activeTool?.id === t.id ? "border-gold/50 text-gold" : "border-border text-muted"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)_minmax(280px,0.9fr)]">
        <aside className="hidden min-h-0 overflow-y-auto border-r border-border/70 p-3 lg:block">{rail}</aside>

        <main className="flex min-h-0 flex-col">
          <div className="border-b border-border/50 px-3 py-2 text-[11px] text-muted">
            Context tools: <span className="text-foreground">{activeTool?.label}</span> — {activeTool?.description}
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">{chat}</div>
        </main>

        <section className="hidden min-h-0 overflow-hidden border-l border-border/70 lg:block">{canvas}</section>
      </div>
    </div>
  );
}

export function getToolsForTab(tab: EcosystemTab): ToolBinding[] {
  return TAB_TOOLS[tab];
}
