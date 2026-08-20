"use client";

/**
 * Deferred Hosting Deployment Selector.
 *
 * An optional "Push to Host" toolbar + wizard that remains dormant until the
 * user explicitly decides to connect and deploy to external hosting services.
 * Hosting is NOT required during project creation — users can code freely
 * and deploy later with one click.
 */

import { useState } from "react";
import { toast } from "sonner";

export interface HostingProvider {
  id: string;
  label: string;
  icon: string;
  status: "not-connected" | "connecting" | "connected" | "deployed";
  deployUrl?: string;
  features: string[];
}

const HOSTING_OPTIONS: HostingProvider[] = [
  {
    id: "vercel", label: "Vercel", icon: "▲",
    status: "not-connected",
    features: ["Preview deployments", "Edge Functions", "Analytics", "Serverless"],
  },
  {
    id: "netlify", label: "Netlify", icon: "🔷",
    status: "not-connected",
    features: ["Git-based deploys", "Forms", "Edge Functions", "Split testing"],
  },
  {
    id: "aws", label: "AWS Amplify", icon: "☁️",
    status: "not-connected",
    features: ["Full-stack CI/CD", "Backend resources", "GraphQL", "CloudFront CDN"],
  },
  {
    id: "cloudflare", label: "Cloudflare Pages", icon: "⚡",
    status: "not-connected",
    features: ["Global edge network", "Workers", "D1 Database", "R2 Storage"],
  },
  {
    id: "digitalocean", label: "DigitalOcean", icon: "🐳",
    status: "not-connected",
    features: ["App Platform", "Managed DB", "Spaces CDN", "Droplets"],
  },
];

interface HostingSelectorProps {
  /** The current scratch project's workDir — used for deployment. */
  projectName?: string;
  projectId?: string;
  onDeploy?: (provider: string) => void;
  compact?: boolean;
}

export function HostingSelector({
  projectName,
  projectId,
  onDeploy,
  compact = false,
}: HostingSelectorProps) {
  const [open, setOpen] = useState(false);
  const [providers, setProviders] = useState(HOSTING_OPTIONS);
  const [deploying, setDeploying] = useState<string | null>(null);

  async function connectAndDeploy(provider: HostingProvider) {
    setDeploying(provider.id);
    setProviders((prev) => prev.map((p) => (p.id === provider.id ? { ...p, status: "connecting" as const } : p)));

    try {
      // In production, this calls the connector backend to link the host.
      const res = await fetch("/api/connectors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ op: "dispatch", action: "hosting_deploy", connectorId: provider.id, projectId }),
      });

      if (!res.ok) throw new Error("Deploy request failed");

      setProviders((prev) =>
        prev.map((p) =>
          p.id === provider.id
            ? { ...p, status: "deployed" as const, deployUrl: `https://${projectName ?? "app"}.${provider.id === "vercel" ? "vercel.app" : "netlify.app"}` }
            : p
        )
      );

      toast.success(`${provider.label} deployment initiated!`);
      onDeploy?.(provider.id);
    } catch (cause) {
      setProviders((prev) => prev.map((p) => (p.id === provider.id ? { ...p, status: "not-connected" as const } : p)));
      toast.error(cause instanceof Error ? cause.message : "Deploy failed.");
    } finally {
      setDeploying(null);
    }
  }

  const connectedCount = providers.filter((p) => p.status === "connected" || p.status === "deployed").length;

  return (
    <div className="relative">
      {/* Dormant trigger */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] border transition-colors ${
          connectedCount > 0
            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
            : "border-border bg-background/60 text-muted hover:border-gold/40 hover:text-gold"
        }`}
      >
        <span>{connectedCount > 0 ? "🚀" : "☁️"}</span>
        <span>{connectedCount > 0 ? `${connectedCount} host${connectedCount > 1 ? "s" : ""}` : "Deploy"}</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-50" onClick={() => setOpen(false)} />
          <div className="absolute top-full right-0 mt-1.5 z-[60] w-80 rounded-2xl border border-border bg-background/95 backdrop-blur-xl shadow-2xl p-3">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-gold">Push to Host</p>
              <span className="text-[10px] text-muted">
                {projectName && `Project: ${projectName}`}
              </span>
            </div>

            <div className="space-y-1.5">
              {providers.map((p) => (
                <div key={p.id} className="rounded-xl border border-border bg-background/40 overflow-hidden">
                  <div className="flex items-center gap-3 px-3 py-2.5">
                    <span className="text-lg">{p.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium">{p.label}</p>
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {p.features.slice(0, 2).map((f) => (
                          <span key={f} className="text-[8px] text-muted bg-background/60 px-1 rounded">{f}</span>
                        ))}
                      </div>
                    </div>
                    <button
                      onClick={() => void connectAndDeploy(p)}
                      disabled={deploying !== null || p.status === "deployed"}
                      className={`shrink-0 px-3 py-1.5 rounded-lg text-[10px] font-medium border transition-colors ${
                        p.status === "deployed"
                          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400 cursor-default"
                          : p.status === "connecting"
                            ? "border-gold/40 bg-gold/15 text-gold animate-pulse"
                            : "border-gold/40 bg-gold/20 text-gold hover:bg-gold/30"
                      }`}
                    >
                      {p.status === "deployed" ? "Live" : p.status === "connecting" ? "…" : "Deploy"}
                    </button>
                  </div>

                  {p.status === "deployed" && p.deployUrl && (
                    <div className="px-3 pb-2">
                      <a
                        href={p.deployUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] text-gold underline underline-offset-2 hover:opacity-80"
                      >
                        → {p.deployUrl}
                      </a>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <p className="mt-3 text-[9px] text-muted text-center">
              Hosting is optional — deploy when you&apos;re ready.
            </p>
          </div>
        </>
      )}
    </div>
  );
}