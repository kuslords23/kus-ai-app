"use strict";

/**
 * Zero-Host Scratch Application Provisioner.
 *
 * Creates a new project from scratch directly inside the sandbox filesystem
 * without requiring a hosting provider selection upfront. All default config
 * files and template structures are initialized immediately so the user can
 * start coding, then optionally connect and deploy to hosting later.
 */

import { promises as fs } from "fs";
import path from "path";
import os from "os";
import { randomUUID } from "crypto";

// ── Types ────────────────────────────────────────────────

export type ScratchProjectKind =
  | "nextjs"
  | "vite-react"
  | "vite-vue"
  | "node-api"
  | "static-html"
  | "python-fastapi"
  | "rust-actix";

export interface ScratchProjectConfig {
  /** Human-readable project name. */
  name: string;
  kind: ScratchProjectKind;
  /** Optional description written into README + package.json. */
  description?: string;
  /** Force a specific workspace directory; defaults to a temp dir. */
  workDir?: string;
  /** Optional language override (otherwise inferred from kind). */
  language?: "typescript" | "javascript" | "python" | "rust";
}

export interface ScratchProject {
  ok: boolean;
  id: string;
  name: string;
  kind: ScratchProjectKind;
  language: string;
  workDir: string;
  files: string[];
  error?: string;
}

// ── Template definitions ────────────────────────────────

interface FileTemplate {
  relativePath: string;
  content: string | ((cfg: ScratchProjectConfig) => string);
}

const TEMPLATES: Record<ScratchProjectKind, FileTemplate[]> = {
  nextjs: [
    { relativePath: "package.json", content: (c) => `{
  "name": "${slugify(c.name)}",
  "version": "0.1.0",
  "private": true,
  "scripts": { "dev": "next dev", "build": "next build", "start": "next start", "lint": "next lint" },
  "dependencies": { "next": "^14", "react": "^18", "react-dom": "^18" },
  "devDependencies": { "typescript": "^5", "@types/react": "^18", "@types/node": "^20" }
}` },
    { relativePath: "tsconfig.json", content: `{
  "compilerOptions": { "target": "ES2017", "lib": ["dom","dom.iterable","esnext"], "allowJs": true,
    "skipLibCheck": true, "strict": true, "noEmit": true, "esModuleInterop": true,
    "module": "esnext", "moduleResolution": "bundler", "resolveJsonModule": true,
    "isolatedModules": true, "jsx": "preserve", "incremental": true,
    "plugins": [{ "name": "next" }], "paths": { "@/*": ["./src/*"] }
  }, "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx"], "exclude": ["node_modules"]
}` },
    { relativePath: "next.config.js", content: `/** @type {import('next').NextConfig} */\nconst nextConfig = {};\nmodule.exports = nextConfig;` },
    { relativePath: "src/app/layout.tsx", content: (c) => `export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="en"><body>{children}</body></html>; }` },
    { relativePath: "src/app/page.tsx", content: (c) => `export default function Home() { return <main><h1>${c.name}</h1><p>${c.description ?? "A new Jyinx Scratch project."}</p></main>; }` },
  ],

  "vite-react": [
    { relativePath: "package.json", content: (c) => `{
  "name": "${slugify(c.name)}", "private": true, "version": "0.0.0",
  "scripts": { "dev": "vite", "build": "tsc && vite build", "preview": "vite preview" },
  "dependencies": { "react": "^18", "react-dom": "^18" },
  "devDependencies": { "@types/react": "^18", "@types/react-dom": "^18", "@vitejs/plugin-react": "^4", "typescript": "^5", "vite": "^5" }
}` },
    { relativePath: "tsconfig.json", content: `{ "compilerOptions": { "target":"ES2020","useDefineForClassFields":true,"lib":["ES2020","DOM","DOM.Iterable"],"module":"ESNext","skipLibCheck":true,"moduleResolution":"bundler","allowImportingTsExtensions":true,"resolveJsonModule":true,"isolatedModules":true,"noEmit":true,"jsx":"react-jsx","strict":true } }` },
    { relativePath: "vite.config.ts", content: `import { defineConfig } from "vite"; import react from "@vitejs/plugin-react"; export default defineConfig({ plugins: [react()] });` },
    { relativePath: "index.html", content: `<!doctype html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>${(c: ScratchProjectConfig) => c.name}</title></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>` },
    { relativePath: "src/main.tsx", content: `import React from "react"; import ReactDOM from "react-dom/client"; import App from "./App"; ReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);` },
    { relativePath: "src/App.tsx", content: (c) => `export default function App() { return <div><h1>${c.name}</h1><p>${c.description ?? "Scratch Vite + React + TS project."}</p></div>; }` },
  ],

  "vite-vue": [
    { relativePath: "package.json", content: (c) => `{ "name": "${slugify(c.name)}", "private": true, "version": "0.0.0", "scripts": { "dev": "vite", "build": "vue-tsc && vite build", "preview": "vite preview" }, "dependencies": { "vue": "^3" }, "devDependencies": { "@vitejs/plugin-vue": "^5", "typescript": "^5", "vite": "^5", "vue-tsc": "^2" } }` },
    { relativePath: "vite.config.ts", content: `import { defineConfig } from "vite"; import vue from "@vitejs/plugin-vue"; export default defineConfig({ plugins: [vue()] });` },
    { relativePath: "index.html", content: (c) => `<!doctype html><html lang="en"><head><meta charset="UTF-8" /><title>${c.name}</title></head><body><div id="app"></div><script type="module" src="/src/main.ts"></script></body></html>` },
    { relativePath: "src/main.ts", content: `import { createApp } from "vue"; import App from "./App.vue"; createApp(App).mount("#app");` },
    { relativePath: "src/App.vue", content: (c) => `<template><div><h1>${c.name}</h1></div></template><script setup lang="ts"></script>` },
  ],

  "node-api": [
    { relativePath: "package.json", content: (c) => `{ "name": "${slugify(c.name)}", "version": "0.1.0", "scripts": { "start": "tsx src/index.ts", "dev": "tsx watch src/index.ts" }, "dependencies": { "express": "^4" }, "devDependencies": { "@types/express": "^4", "@types/node": "^20", "tsx": "^4", "typescript": "^5" } }` },
    { relativePath: "tsconfig.json", content: `{ "compilerOptions": { "target":"ES2022","module":"commonjs","outDir":"./dist","rootDir":"./src","strict":true,"esModuleInterop":true } }` },
    { relativePath: "src/index.ts", content: (c) => `import express from "express"; const app = express(); const port = process.env.PORT ?? 3000; app.get("/", (_req, res) => res.json({ name: "${c.name}", status: "ok" })); app.listen(port, () => console.log("Server running on port", port));` },
  ],

  "static-html": [
    { relativePath: "index.html", content: (c) => `<!doctype html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>${c.name}</title><style>body { font-family: system-ui; max-width: 720px; margin: 2rem auto; padding: 0 1rem; }</style></head><body><h1>${c.name}</h1><p>${c.description ?? "A Jyinx Scratch static site."}</p></body></html>` },
  ],

  "python-fastapi": [
    { relativePath: "requirements.txt", content: "fastapi\nuvicorn[standard]\n" },
    { relativePath: "main.py", content: (c) => `from fastapi import FastAPI\napp = FastAPI(title="${c.name}")\n\n@app.get("/")\ndef root():\n    return {"name": "${c.name}", "status": "ok"}` },
  ],

  "rust-actix": [
    { relativePath: "Cargo.toml", content: (c) => `[package]\nname = "${slugify(c.name)}"\nversion = "0.1.0"\nedition = "2021"\n\n[dependencies]\nactix-web = "4"\ntokio = { version = "1", features = ["full"] }` },
    { relativePath: "src/main.rs", content: `use actix_web::{web, App, HttpServer, Responder};\n\nasync fn index() -> impl Responder { "Jyinx Scratch Rust Project" }\n\n#[actix_web::main]\nasync fn main() -> std::io::Result<()> {\n    HttpServer::new(|| App::new().route("/", web::get().to(index)))\n        .bind("127.0.0.1:8080")?\n        .run()\n        .await\n}` },
  ],
};

// ── Public API ──────────────────────────────────────────

/**
 * Provisions a new scratch project with zero hosting requirements.
 * All files are written to a temporary directory (or `cfg.workDir`)
 * and ready for immediate coding.
 */
export async function createScratchProject(cfg: ScratchProjectConfig): Promise<ScratchProject> {
  const id = randomUUID();
  const workDir = cfg.workDir ?? path.join(os.tmpdir(), `jyinx-scratch-${id}`);
  const templates = TEMPLATES[cfg.kind];
  const language = cfg.language ?? inferLanguage(cfg.kind);

  try {
    await fs.mkdir(workDir, { recursive: true });

    const written: string[] = [];
    for (const tpl of templates) {
      const filePath = path.join(workDir, tpl.relativePath);
      const dir = path.dirname(filePath);
      await fs.mkdir(dir, { recursive: true });
      const content = typeof tpl.content === "function" ? tpl.content(cfg) : tpl.content;
      await fs.writeFile(filePath, content, "utf-8");
      written.push(tpl.relativePath);
    }

    // Write a .jyinx.json manifest so the IDE knows this is a managed scratch project.
    const manifest = {
      id,
      name: cfg.name,
      kind: cfg.kind,
      language,
      createdAt: new Date().toISOString(),
      hosting: null, // unset until user explicitly connects
    };
    await fs.writeFile(path.join(workDir, ".jyinx.json"), JSON.stringify(manifest, null, 2), "utf-8");

    return { ok: true, id, name: cfg.name, kind: cfg.kind, language, workDir, files: written };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Failed to create scratch project.";
    return { ok: false, id, name: cfg.name, kind: cfg.kind, language, workDir, files: [], error: message };
  }
}

/**
 * Creates a scratch project from a curated template index.
 * Templates include: blog, landing-page, api-server, ecommerce-starter, etc.
 */
export async function createFromTemplate(
  templateId: string,
  overrides: Partial<ScratchProjectConfig>
): Promise<ScratchProject> {
  const preset = CURATED_TEMPLATES[templateId];
  const merged: ScratchProjectConfig = {
    ...preset,
    ...overrides,
    name: overrides.name ?? preset?.name ?? templateId,
    kind: overrides.kind ?? preset?.kind ?? "nextjs",
  };
  return createScratchProject(merged);
}

// ── Curated templates ──────────────────────────────────

const CURATED_TEMPLATES: Record<string, ScratchProjectConfig> = {
  blog: { name: "my-blog", kind: "nextjs", description: "A markdown blog built with Next.js." },
  landing: { name: "landing-page", kind: "vite-react", description: "A single-page landing site." },
  api: { name: "api-server", kind: "node-api", description: "Express REST API with TypeScript." },
  ml: { name: "ml-service", kind: "python-fastapi", description: "FastAPI ML inference service." },
  portfolio: { name: "portfolio", kind: "static-html", description: "A static HTML portfolio." },
};

// ── Helpers ──────────────────────────────────────────────

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function inferLanguage(kind: ScratchProjectKind): string {
  switch (kind) {
    case "python-fastapi": return "python";
    case "rust-actix": return "rust";
    default: return "typescript";
  }
}

export { CURATED_TEMPLATES };